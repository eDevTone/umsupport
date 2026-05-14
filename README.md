# UMSupport Scraper API

REST API built with FastAPI that exposes a Playwright-based scraper for the OneCard Integrador portal. Designed to be consumed by an Astro frontend (chat UI) living in `web/`.

## Prerequisites

- Python `>=3.11`
- Node `>=22.12` and `pnpm` (for the frontend)
- Chromium (downloaded automatically by Playwright)

## Setup

```bash
# 1) Create a virtualenv and install Python deps
python3 -m venv .venv
.venv/bin/pip install -e .

# 2) Install the Chromium build Playwright needs
.venv/bin/playwright install chromium

# 3) Fill in real credentials
cp .env.example .env
```

Required variables in `.env`:

| Variable          | Description                                            |
|-------------------|--------------------------------------------------------|
| `SITE_URL`        | Base URL of the OneCard Integrador portal              |
| `SITE_USER`       | Account email for the portal                           |
| `SITE_PASS`       | Account password                                       |
| `HEADLESS`        | `true` for production, `false` to watch the browser    |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (Astro dev: `4321`)       |
| `LOG_LEVEL`       | `INFO`, `DEBUG`, `WARNING`…                            |

## Run in development

Two terminals — backend and frontend run in parallel.

**Terminal 1 — backend:**

```bash
.venv/bin/uvicorn app.main:app --port 8000 --reload
```

| URL                              | Purpose                            |
|----------------------------------|------------------------------------|
| http://localhost:8000            | API root                           |
| http://localhost:8000/health     | Health check                       |
| http://localhost:8000/docs       | Interactive Swagger UI             |

**Terminal 2 — frontend** (see `web/README.md` for details):

```bash
cd web && pnpm dev
```

Open http://localhost:4321 and start pasting cards.

## Endpoints

### `GET /health`

Returns `{"status": "ok"}`. Use it for liveness checks.

### `POST /api/scrape`

Batch mode — runs all cards and returns when the last one finishes.

Request:

```json
{ "items": [{ "card": "5062990506414370" }, { "card": "..." }] }
```

Response:

```json
{
  "success": true,
  "results": [
    {
      "index": 0,
      "card": "5062990506414370",
      "status": "success",
      "data": { "vcCard": "...", "vcCardStatus": "ACTIVA", "biAccount": 2684148, ... },
      "error_code": null,
      "message": null,
      "duration_ms": 7023
    }
  ],
  "total_duration_ms": 7023
}
```

### `POST /api/scrape/stream`

Same request body. Response is `text/event-stream`: one `data: <ScrapeItemResult>` frame per card, ending with `event: done\ndata: {}`. This is what the chat UI uses.

### Error codes

When `status` is `"error"`, `error_code` is one of:

| Code           | Meaning                                                 |
|----------------|---------------------------------------------------------|
| `LOGIN_FAILED` | Portal rejected the credentials in `.env`               |
| `NOT_FOUND`    | The card has no matching record in the report          |
| `TIMEOUT`      | The site took too long to respond                       |
| `UNKNOWN`      | Anything else; check the server logs                    |

`message` carries a Spanish-friendly description for the UI.

## Layout

```
UMSupport/
├── app/
│   ├── main.py             # FastAPI app, CORS, /health
│   ├── config.py           # typed .env loader (pydantic-settings)
│   ├── models/             # Pydantic request/response schemas
│   ├── routers/scraper.py  # POST /api/scrape, /api/scrape/stream
│   ├── services/           # scraper orchestration + per-card error mapping
│   └── scraper/
│       ├── browser.py      # async Playwright context manager
│       ├── login.py        # OneCard login flow
│       ├── steps.py        # navigation + XHR capture (fetch_card_report)
│       └── extractors.py   # reserved for future DOM parsing
├── scripts/                # one-off inspection helpers (login, sections, XHR)
├── web/                    # Astro frontend (pnpm — see web/README.md)
├── docs/plans/             # design docs
├── pyproject.toml
└── .env.example
```

## How the scraper works

```
launch headless Chromium
  → goto /Account/Login → fill #Email & #Password → submit
    → goto /Home/Reportes?iType=1
      → click #REPORTEEMPLEADOTARJETA
        → fill #biCard → submit #frm-GetInfoEmployees2
          → capture XHR /_GetInfoEmployees2 (JSON)
            → return first record
```

Each request opens a fresh browser and logs in from scratch (~7s per card). This trade simplicity for speed; if throughput becomes a problem we can persist sessions via `storage_state`.

## Inspection scripts

`scripts/` contains one-off helpers used while building the scraper. Outputs land in `scripts/_artifacts/` (gitignored).

| Script                                  | What it does                                                 |
|-----------------------------------------|--------------------------------------------------------------|
| `inspect_login.py`                      | Dump the login page HTML + screenshot                        |
| `test_login.py`                         | Smoke-test the `login()` flow end to end                     |
| `inspect_sidebar.py`                    | List every clickable element after login                     |
| `inspect_section.py <path>`             | Inspect any post-login section (forms, tables, buttons)      |
| `inspect_report_empleado_tarjeta.py`    | Open the Empleado-Tarjeta report and dump its controls       |
| `inspect_report_result.py`              | Submit a real card and capture the rendered table            |
| `inspect_report_xhr.py`                 | Capture the raw JSON returned by the bootstrap-table XHR     |

Run any of them with `.venv/bin/python scripts/<name>.py`.

## Design notes

Full design and decision log: `docs/plans/2026-05-13-scraper-api-design.md`.

## Frontend (Astro chat)

Located in `web/`. Uses pnpm, Tailwind v4, React 19 and shadcn/ui. See `web/README.md` for setup and scripts.

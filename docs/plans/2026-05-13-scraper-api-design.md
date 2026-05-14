# Design: UMSupport Scraper API

**Date:** 2026-05-13 (updated 2026-05-14)
**Status:** Approved, in implementation

## Goal

Expose a REST API in Python that runs a web scraper against an external site (with login), consumed from an Astro frontend acting as a chat. An AI layer will be added on top of the scraper later.

## Key decisions

| Topic | Decision | Reason |
|---|---|---|
| Backend | FastAPI | Async, typed, automatic docs, plays well with AI later |
| Scraper | Playwright (async) | External site is unknown — Playwright handles JS, login and dynamic content |
| Flow | Fixed, hand-coded | User provides the steps; not an interactive agent |
| Session | Login on every request | Simple, no shared state, reliable |
| Frontend | Astro + Tailwind + shadcn/ui | Modern stack, chat UI built with React islands |
| Frontend pkg manager | pnpm | User preference |
| Codebase language | English | Identifiers, comments, UI strings — all English |

## Architecture

```
Astro (chat UI)  ──HTTP/JSON──►  FastAPI (localhost:8000)
                                      │
                                      ▼
                                 Playwright (Chromium)
                                      │
                                      ▼
                                 External site
```

Request flow:
1. Astro sends `POST /api/scrape/stream` with `{ items: [{ card, user }, ...] }`
2. FastAPI validates with Pydantic
3. For each item, Playwright spins up a browser, logs in, runs fixed steps
4. Each result is yielded as an SSE event (`data: {...}`)
5. After the last item, a `event: done` frame closes the stream

## File layout

```
UMSupport/
├── .env / .env.example / .gitignore
├── pyproject.toml / README.md
├── app/
│   ├── main.py            # FastAPI app, CORS, /health
│   ├── config.py          # pydantic-settings
│   ├── models/            # ScrapeRequest, ScrapeResponse, ErrorResponse
│   ├── routers/scraper.py # POST /api/scrape, POST /api/scrape/stream
│   ├── services/          # orchestrates login → steps → extract
│   └── scraper/
│       ├── browser.py     # async Playwright context manager
│       ├── login.py       # login step (pending)
│       ├── steps.py       # navigation steps (pending)
│       └── extractors.py  # DOM parsing (pending)
└── web/                   # Astro frontend (pnpm)
    └── src/
        ├── components/Chat.tsx
        ├── lib/{api,parseInput}.ts
        ├── layouts/Layout.astro
        ├── pages/index.astro
        └── styles/global.css
```

## API contract

**`POST /api/scrape`** (batch, returns all results at the end)

Request:
```json
{ "items": [{ "card": "string", "user": "string" }] }
```

Response success:
```json
{ "success": true, "results": [...], "total_duration_ms": 1234 }
```

**`POST /api/scrape/stream`** (Server-Sent Events)

Same request body. Response is `text/event-stream` with one `data: {...}` frame per item (the JSON is a `ScrapeItemResult`), followed by a final `event: done\ndata: {}` frame.

Item result shape:
```json
{
  "index": 0,
  "card": "...",
  "user": "...",
  "status": "success" | "error",
  "data": { ... } | null,
  "error_code": "LOGIN_FAILED" | "NOT_FOUND" | "TIMEOUT" | "UNKNOWN" | null,
  "message": "..." | null,
  "duration_ms": 1234
}
```

HTTP codes: `200` (ok), `400` (invalid input), `401` (login failed), `404` (not found), `504` (timeout), `500` (unexpected).

Auxiliary endpoints: `GET /health`, `GET /docs` (auto-generated Swagger).

## Error handling

- `login.py` raises `LoginFailedError` → HTTP 401
- `steps.py` raises `NotFoundError` → HTTP 404
- `PlaywrightTimeoutError` → HTTP 504
- Any other exception → HTTP 500

Standard Python logging. In debug mode, screenshots are saved on failure.

## Environment variables

```
SITE_URL, SITE_USER, SITE_PASS    # external site credentials
HEADLESS                          # true/false
ALLOWED_ORIGINS                   # CORS (Astro dev by default)
LOG_LEVEL
```

Frontend uses `PUBLIC_API_URL` (defaults to `http://localhost:8000`).

## Implementation plan

1. **Skeleton** — folder structure, FastAPI with `/health`, CORS, scraper module stubs ✅
2. **Frontend chat** — Astro + Tailwind + shadcn/ui, paste-list UI, SSE streaming ✅
3. **English + pnpm migration** — rename API fields (`tarjeta`→`card`, `usuario`→`user`), switch to pnpm ✅
4. **Real scraper** — user provides URL, credentials and steps → implement `login.py`, `steps.py`, `extractors.py`
5. **AI layer** — add an LLM endpoint on top of the scraper later

## Out of scope

- Automated tests (not included by explicit preference)
- Production deploy (decided later)

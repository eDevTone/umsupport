# Deployment Guide: Cloudflare Pages + Render

Step-by-step guide to deploy:

- **Frontend** (`web/`) → Cloudflare Pages
- **Backend** (`app/`) → Render Web Service

Estimated time end-to-end: ~45 min if you follow the steps in order.

---

## 0 · Architecture

```
  user  ─────►  Cloudflare Pages (static Astro)
                       │
                       │  HTTPS / SSE
                       ▼
                 Render Web Service (FastAPI + Playwright)
                       │
                       ▼
              onecardservicios.mx (target site)
```

Both services pull from the same GitHub repo; CF Pages reads `web/`, Render reads the repo root.

---

## 1 · Prerequisites

- Code pushed to a GitHub repository (Render and CF Pages both pull from GitHub).
- A [GitHub](https://github.com) account.
- A [Cloudflare](https://dash.cloudflare.com/) account (free).
- A [Render](https://dashboard.render.com/) account.
- (Optional) A custom domain — both providers offer free `*.pages.dev` and `*.onrender.com` subdomains.

> ⚠️ **About Playwright on Render**
> Playwright needs Chromium (≈500 MB RAM during a scrape) and ≈7 s per card.
> - **Free**: 512 MB RAM, **service sleeps after 15 min idle** (next request takes ~30 s to wake up). Works for demos.
> - **Starter** ($7/mo): 512 MB RAM, **no sleep**. Tight but workable.
> - **Standard** ($25/mo): 2 GB RAM. Recommended for steady use.

---

## 2 · Backend on Render

### 2.1 · Add a Dockerfile to the repo root

Render builds your service from a Dockerfile that includes Chromium. Create `Dockerfile` at the repo root:

```dockerfile
# Playwright's official Python image already bundles Chromium + system libs
FROM mcr.microsoft.com/playwright/python:v1.59.0-jammy

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install project deps first to leverage Docker layer cache
COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install .

COPY app/ ./app/

# Render injects $PORT at runtime. Default to 8000 locally.
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
```

Build it locally before pushing to catch issues early:

```bash
docker build -t umsupport-api .
docker run --rm -p 8000:8000 \
  -e SITE_URL=https://www.onecardservicios.mx/Extranet/Integrador \
  -e SITE_USER=... -e SITE_PASS=... -e HEADLESS=true \
  umsupport-api
curl http://localhost:8000/health
```

### 2.2 · (Optional) `render.yaml` for one-click setup

Add this at the repo root if you want Render to auto-create the service from the dashboard ("New → Blueprint"):

```yaml
services:
  - type: web
    name: umsupport-api
    runtime: docker
    plan: starter        # free | starter | standard
    region: oregon       # or frankfurt, singapore, ohio
    dockerfilePath: ./Dockerfile
    healthCheckPath: /health
    autoDeploy: true
    envVars:
      - key: HEADLESS
        value: "true"
      - key: LOG_LEVEL
        value: INFO
      - key: ALLOWED_ORIGINS
        sync: false      # set manually after frontend is deployed
      - key: SITE_URL
        sync: false
      - key: SITE_USER
        sync: false
      - key: SITE_PASS
        sync: false
```

`sync: false` keeps secrets out of git — you set the value in the Render UI.

### 2.3 · Create the service on Render

1. Push the new `Dockerfile` (and `render.yaml` if you added it) to GitHub.
2. Go to https://dashboard.render.com/ → **New +** → **Web Service**.
3. Connect the repository.
4. Render auto-detects the Dockerfile. Fill in:
   - **Name**: `umsupport-api`
   - **Region**: closest to you (Oregon, Ohio, Frankfurt, Singapore)
   - **Plan**: `Free` to test / `Starter` for real use
   - **Docker Build Context Directory**: `.` (repo root)
   - **Dockerfile Path**: `./Dockerfile`
   - **Health Check Path**: `/health`
5. Click **Create Web Service**. First build takes ~5–8 min (Playwright image is ~1.5 GB).

### 2.4 · Environment variables on Render

Once the service exists, go to its **Environment** tab and add:

| Key              | Value                                                              |
|------------------|--------------------------------------------------------------------|
| `SITE_URL`       | `https://www.onecardservicios.mx/Extranet/Integrador`              |
| `SITE_USER`      | `(your portal email)` — mark **Secret**                            |
| `SITE_PASS`      | `(your portal password)` — mark **Secret**                         |
| `HEADLESS`       | `true`                                                             |
| `LOG_LEVEL`      | `INFO`                                                             |
| `ALLOWED_ORIGINS`| `(leave blank for now — set after CF Pages is deployed)`           |

Save → Render redeploys automatically.

### 2.5 · Verify the backend

```bash
curl https://umsupport-api.onrender.com/health
# → {"status":"ok"}

curl -s -N -X POST https://umsupport-api.onrender.com/api/scrape/stream \
  -H "Content-Type: application/json" \
  -d '{"items":[{"card":"5062990506414370"}]}'
# → data: {"index":0,"card":"5062990506414370","status":"success",...}
# → event: done
```

Write down the URL (e.g. `https://umsupport-api.onrender.com`) — you'll need it for the frontend.

---

## 3 · Frontend on Cloudflare Pages

The Astro chat is **fully static** (React islands hydrate client-side). No Cloudflare adapter needed — CF Pages serves it from `dist/`.

### 3.1 · Add `.env.production` (or use CF env vars)

The frontend reads `PUBLIC_API_URL` at build time. You can either:

- Commit a `web/.env.production` with `PUBLIC_API_URL=https://umsupport-api.onrender.com` (visible in repo), **or**
- Set it as an env var in the CF Pages dashboard (recommended for cleanliness).

We use the second approach.

### 3.2 · Connect the repo to CF Pages

1. Go to https://dash.cloudflare.com/ → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Pick the repository, branch `main`.
3. Build settings:

   | Field                    | Value                                |
   |--------------------------|--------------------------------------|
   | Framework preset         | `Astro`                              |
   | Build command            | `pnpm install && pnpm build`         |
   | Build output directory   | `dist`                               |
   | Root directory           | `web`                                |
   | Production branch        | `main`                               |

4. **Environment variables** (Production):

   | Key              | Value                                       |
   |------------------|---------------------------------------------|
   | `NODE_VERSION`   | `22`                                        |
   | `PUBLIC_API_URL` | `https://umsupport-api.onrender.com`        |
   | `PNPM_VERSION`   | `10`                                        |

5. **Save and Deploy**. First build takes ~2 min.

After it completes, CF gives you a URL like `https://umsupport-xyz.pages.dev`.

### 3.3 · (Important) Wire CORS

Go back to Render → `umsupport-api` → **Environment** → set:

```
ALLOWED_ORIGINS=https://umsupport-xyz.pages.dev
```

(Or include multiple origins separated by commas: `https://umsupport-xyz.pages.dev,https://yourdomain.com`.)

Save → wait for the redeploy.

### 3.4 · Verify end-to-end

Open `https://umsupport-xyz.pages.dev`, paste:

```
5062990506414370
```

and click **Procesar**. A green bubble should appear in ~7 s with the full JSON. If you see a CORS error, double-check `ALLOWED_ORIGINS` matches exactly (no trailing slash).

---

## 4 · Custom domains (optional)

### Cloudflare Pages

1. Pages project → **Custom domains** → **Set up a custom domain**.
2. Add `chat.example.com`. CF auto-provisions SSL.

### Render

1. Service → **Settings** → **Custom Domains** → add `api.example.com`.
2. Add the CNAME Render shows you in your DNS provider.
3. **Important**: update `ALLOWED_ORIGINS` on Render to use the new frontend domain.
4. Update `PUBLIC_API_URL` on CF Pages to use the new backend domain → trigger a redeploy.

---

## 5 · Operations

### Logs

- **Render**: dashboard → service → **Logs** (live tail). Includes uvicorn output and any `logger.exception` traces.
- **CF Pages**: deployments page shows build logs. For runtime logs, only Functions/Workers have logging — static builds don't generate runtime logs.

### Redeploys

- Push to `main` → both providers redeploy automatically (`autoDeploy: true` on Render, default on CF Pages).
- Manual redeploy: dashboard buttons on either provider.

### Rolling back

- **CF Pages**: every deployment has a unique preview URL. Promote any past deployment as the new production from the **Deployments** tab.
- **Render**: **Events** tab → **Rollback** to a previous deploy.

### Sleeping on Render Free

If you keep the Free plan, the service sleeps after 15 min of inactivity. First request after sleep takes ~30 s to wake the container. To keep it warm, either:

- Upgrade to **Starter** ($7/mo) — the simplest fix.
- Set up an external pinger (cron-job.org, UptimeRobot) hitting `/health` every 10 min — keeps it awake but feels hacky.

### Cost summary

| Component              | Plan         | Monthly cost   |
|------------------------|--------------|----------------|
| Cloudflare Pages       | Free         | $0             |
| Render backend (Free)  | Free         | $0 (sleeps)    |
| Render backend (Starter) | Starter    | $7             |
| Render backend (Standard) | Standard  | $25            |

---

## 6 · Troubleshooting

| Symptom                                      | Likely cause                                                | Fix                                                              |
|----------------------------------------------|-------------------------------------------------------------|------------------------------------------------------------------|
| CORS error in browser console                | `ALLOWED_ORIGINS` missing or wrong                          | Set it to the exact CF Pages URL, no trailing slash              |
| `502 Bad Gateway` on every request           | Container OOM (Playwright > RAM)                            | Upgrade Render plan or run cards one at a time (already serial)  |
| First request after idle takes 30 s          | Render Free sleep                                           | Upgrade to Starter, or use a pinger                              |
| `LOGIN_FAILED` on every card                 | Wrong credentials or site changed login form                | Re-run `scripts/test_login.py` locally with the same `.env`      |
| `NOT_FOUND` on every card                    | Site changed XHR path / table id                            | Re-run `scripts/inspect_report_xhr.py` to re-discover selectors  |
| Build fails on CF: "Cannot find package…"    | `pnpm-lock.yaml` missing or out of date                     | Run `pnpm install` locally and commit the lockfile               |
| Build fails on Render: image > 4 GB          | Caching issue with Playwright image                         | Add `.dockerignore` (see below) and rebuild                       |

### `.dockerignore`

To keep the Docker context small and the build fast:

```
.git
.venv
node_modules
web
scripts/_artifacts
dist
*.log
.env
```

---

## 7 · Going further

- **Keep credentials safer**: rotate `SITE_PASS` if you ever pasted it in chat or a draft commit.
- **Rate limiting**: add `slowapi` to the FastAPI app to cap requests per IP — the site you scrape may flag heavy traffic.
- **Observability**: pipe logs to Logtail or Better Stack (both have free tiers).
- **CI**: add a GitHub Actions workflow that runs `astro check` and `pnpm build` on PRs.

# UMSupport Chat (Astro)

Astro frontend that consumes the FastAPI scraper at `../app`. The chat lets the user paste a list of `card,user` pairs (one per line) and streams the scrape results in real time via Server-Sent Events.

Stack: Astro 6 · Tailwind v4 · React 19 · shadcn/ui (Nova preset). Package manager: pnpm.

## Setup

```bash
pnpm install
cp .env.example .env          # optional — defaults to PUBLIC_API_URL=http://localhost:8000
```

## Run in development

```bash
pnpm dev
```

Then open http://localhost:4321. Make sure the backend is running on port 8000 (see root `README.md`).

## Useful scripts

| Command         | Description                          |
|-----------------|--------------------------------------|
| `pnpm dev`      | Start Astro dev server (port 4321)   |
| `pnpm build`    | Build the static site to `dist/`     |
| `pnpm preview`  | Preview the built site               |
| `pnpm check`    | Type-check with `astro check`        |

## Layout

```
src/
├── components/
│   ├── ui/            # shadcn/ui primitives
│   └── Chat.tsx       # main chat component (React)
├── layouts/
│   └── Layout.astro
├── lib/
│   ├── api.ts         # SSE client to the FastAPI backend
│   └── parseInput.ts  # parses pasted multi-line input
├── pages/
│   └── index.astro
└── styles/global.css
```

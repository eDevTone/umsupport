# UMSupport Chat (Astro)

Astro frontend that consumes the FastAPI scraper at `../app`. The chat lets the user paste a list of `card,username` pairs (one per line; the username is optional) and streams the scrape results in real time via Server-Sent Events.

Each result can be viewed and copied as the raw JSON record or as the activation SQL (`UPDATE cards …`) with the values substituted from the scrape (`biAccount` → `external_id`/`external_process_id`, `vcEmployee` → `user_id_for_card`, the card number → `card_id`) and from the typed username (`username` and the 3-letter alias prefix). The header toggle switches the view; "Copiar todas" copies a JSON array and "Copiar queries" copies every statement in one script. The mapping lives in `src/lib/activationQuery.ts`.

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

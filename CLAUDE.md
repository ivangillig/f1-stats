# F1 Dashboard — CLAUDE.md

Real-time F1 telemetry dashboard. Frontend in Next.js 14, backend proxy in Node.js that bridges F1 data sources to the frontend via SSE.

## Architecture

```
Browser (Next.js 14)
  └─ useF1DataSSE.ts (EventSource → /api/sse)
       └─ Next.js rewrite → proxy:4000
            └─ proxy/server.js (Node.js)
                 ├─ f1dash-client.js  (SSE from f1-dash.com)
                 ├─ openf1-client.js  (OpenF1 WebSocket)
                 ├─ mqtt-client.js    (OpenF1 MQTT)
                 ├─ live-polling.js   (OpenF1 REST polling)
                 └─ replay.js         (local test data)
```

The proxy normalizes all sources into a single SSE stream. The frontend never talks directly to F1 APIs.

## Dev Setup

```bash
# Frontend (port 3000)
npm run dev

# Proxy (port 4000) — run from proxy/
npm run dev

# Both via Docker
docker-compose up
```

Copy `.env.example` → `.env` (frontend) and `proxy/.env.example` → `proxy/.env` (backend) before first run.

## Key Files

| File | Role |
|---|---|
| `src/hooks/useF1DataSSE.ts` | Main data hook — SSE connection, state, reconnect logic |
| `proxy/server.js` | Proxy entry point — picks mode, starts SSE server |
| `src/lib/constants.ts` | Team colors, tire types, track status mappings |
| `src/types/f1.ts` | All TypeScript interfaces for F1 data |
| `src/app/page.tsx` | Dashboard root — assembles all components |
| `next.config.js` | SSE rewrite rule (`/api/proxy/*` → proxy) |

## Proxy Modes

Set `PROXY_MODE` in `proxy/.env`:

| Mode | Source | Needs credentials? |
|---|---|---|
| `f1dash` | f1-dash.com SSE (default) | No |
| `live-polling` | OpenF1 REST API | No |
| `mqtt` | OpenF1 MQTT | Yes (`OPENF1_USERNAME/PASSWORD`) |
| `replay` | Local recorded data | No |
| `auto` | Auto-selects by credentials | Depends |

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion
- **Backend**: Node.js 20, `ws` (WebSocket), `mqtt`
- **Fonts**: Official F1 Display (Regular, Bold, Wide) — in `public/fonts/`
- **Path alias**: `@/*` → `src/*`
- **Dark mode**: Tailwind `class`-based

## Tailwind Theme Tokens

```
f1.red / f1.black / f1.gray / f1.darkgray
sector.purple / sector.green / sector.yellow / sector.white
tire.soft / tire.medium / tire.hard / tire.inter / tire.wet
```

## i18n

`LanguageContext.tsx` provides EN/ES translations. Toggle via `LanguageToggle` component. All user-facing strings should use the context hook.

## Conventions

- Components go in `src/components/`. Simple UI primitives go in `src/components/ui/` (shadcn/ui pattern).
- Business logic in hooks (`src/hooks/`), not components.
- No tests yet — verify by running the app.
- TypeScript strict mode is on. Don't use `any`.

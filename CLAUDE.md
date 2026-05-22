# F1 Dashboard — CLAUDE.md

Real-time F1 telemetry dashboard. Frontend in Next.js 14, backend proxy in Node.js that bridges F1 data sources to the frontend via SSE.

## Architecture

```
Browser (Next.js 14)
  └─ useF1DataSSE.ts (EventSource → /api/sse)
       └─ Next.js rewrite → proxy:4000
            └─ proxy/server.js (Node.js)
                 ├─ f1dash-client.js  (SSE from f1-dash.com)
                 ├─ mqtt-client.js    (OpenF1 MQTT — paid tier, primary live source)
                 ├─ live-polling.js   (OpenF1 REST polling — free, fallback)
                 └─ replay.js         (OpenF1 historical data replay)
```

`openf1-client.js` was deleted — it was a broken placeholder. `mqtt-client.js` is the correct OpenF1 paid client.

The proxy normalizes all sources into a single SSE stream. The frontend never talks directly to F1 APIs.

## Dev Setup

```bash
# Frontend (port 3000)
npm run dev

# Proxy (port 4000) — run from proxy/ — nodemon watches for file changes
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
| `proxy/mqtt-client.js` | OpenF1 paid tier — OAuth2 + MQTT broker `mqtt.openf1.org:8883` |
| `proxy/replay.js` | Historical replay — polls OpenF1 REST, auth-aware rate limits |
| `src/lib/constants.ts` | Team colors, tire types, track status mappings |
| `src/types/f1.ts` | All TypeScript interfaces for F1 data |
| `src/app/page.tsx` | Dashboard root — assembles all components |
| `next.config.js` | SSE rewrite rule (`/api/proxy/*` → proxy) |

## Proxy Modes

Set `PROXY_MODE` in `proxy/.env`:

| Mode | Source | Needs credentials? |
|---|---|---|
| `mqtt` / `openf1` | OpenF1 MQTT (paid, real-time push) | Yes (`OPENF1_USERNAME/PASSWORD`) |
| `f1dash` | f1-dash.com SSE | No |
| `live-polling` | OpenF1 REST API | No |
| `replay` | OpenF1 historical data (Baku 2024) | No |
| `auto` | MQTT → f1dash → live-polling → replay | Depends |

**Auto mode fallback chain**: checks for MQTT credentials first; if none, tries f1dash for 20s, then live-polling, then replay.

**No active session**: when `date_end` of the latest session is >30 min in the past, `checkActiveSession()` returns false and the proxy falls back to replay automatically.

## OpenF1 MQTT (paid tier)

- Auth: `POST https://api.openf1.org/token` with `username`/`password` → Bearer token
- Broker: `mqtt.openf1.org:8883` (TLS)
- Topics mirror REST paths: `v1/laps`, `v1/intervals`, `v1/position`, `v1/location`, etc.
- `ensureValidToken()` is exported and used by `replay.js` for authenticated REST calls
- Historical data (laps, intervals, stints, race control, team radio) loaded at startup via REST before MQTT connects
- Rate limits: free = 30 req/min, paid = 60 req/min

## Replay

- Session: Azerbaijan GP 2024, session_key 9598, Baku circuit (key 144)
- With paid credentials: 4s poll interval, 200ms inter-request delay (60 req/min budget)
- Without credentials: 8s poll interval, 1500ms inter-request delay (30 req/min budget)
- `replay.js` imports `ensureValidToken` and `hasMQTTCredentials` from `mqtt-client.js` to auto-select rate

## Frontend — `proxyMode` and Demo Banner

`useF1DataSSE.ts` polls `/health` and reads `data.mode`. When `proxyMode === "replay"`, `page.tsx` shows a yellow banner: **"Modo Demo: Datos en vivo no disponibles. Mostrando sesión grabada."**

`isLive` in `sessionInfo` derives from `SessionInfo.EndDate`: if set and >30 min ago → false. Affects `TrackMap` behavior.

## Log Tags (proxy)

| Tag | Source |
|---|---|
| `[proxy]` | server.js startup/shutdown |
| `[proxy-sse]` | SSE client connect/disconnect |
| `[openf1-mqtt]` | mqtt-client.js |
| `[f1dash]` | f1dash-client.js |
| `[live-polling]` | live-polling.js |
| `[Replay]` | replay.js |
| `[signalr]` | direct F1 SignalR mode |

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion
- **Backend**: Node.js 20, `ws` (WebSocket), `mqtt`, nodemon (dev)
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

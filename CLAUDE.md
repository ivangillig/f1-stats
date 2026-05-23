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

**Session watchdog**: when the proxy falls back to replay, a watchdog timer fires every 60s and calls `checkActiveSession()`. As soon as a live session appears in the OpenF1 API (typically at session start), the watchdog stops replay, clears state, and starts MQTT+SignalR automatically. This prevents the common failure where the proxy starts during a break between sessions and stays in replay for the entire next session.

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

## OpenF1 API Reference

Base URL: `https://api.openf1.org/v1`. All endpoints support generic filtering on any non-array field with `>=`, `<=`, `>`, `<` operators, and `csv=true` for CSV output.

| Endpoint | Description | Key response fields |
|---|---|---|
| `/v1/car_data` | Car telemetry ~3.7 Hz | `brake`, `throttle`, `rpm`, `speed`, `drs`, `n_gear`, `date` |
| `/v1/championship_drivers` | Driver standings (beta, races only) | `driver_number`, `points_current`, `position_current` |
| `/v1/championship_teams` | Team standings (beta, races only) | `team_name`, `points_current`, `position_current` |
| `/v1/drivers` | Driver info for a session | `driver_number`, `name_acronym`, `full_name`, `team_name`, `team_colour`, `headshot_url` |
| `/v1/intervals` | Gap to leader / interval ~4s (races only) | `driver_number`, `gap_to_leader`, `interval`, `date` |
| `/v1/laps` | Per-lap data | `driver_number`, `lap_number`, `lap_duration`, `duration_sector_1/2/3`, `segments_sector_1/2/3`, `is_pit_out_lap`, `date_start` |
| `/v1/location` | Car position on circuit ~3.7 Hz | `driver_number`, `x`, `y`, `z`, `date` |
| `/v1/meetings` | Grand Prix weekend info | `meeting_key`, `meeting_name`, `circuit_key`, `circuit_short_name`, `country_name`, `date_start`, `date_end` |
| `/v1/overtakes` | Overtake events (races only) | `overtaking_driver_number`, `overtaken_driver_number`, `position`, `date` |
| `/v1/pit` | **Pit lane events** | `driver_number`, `lap_number`, `date` (entry time), `lane_duration` (total in pit lane, seconds), `stop_duration` (stationary time, seconds) |
| `/v1/position` | Race position changes | `driver_number`, `position`, `date` |
| `/v1/race_control` | Flags, safety car, incidents | `flag`, `category`, `message`, `scope`, `sector`, `driver_number`, `lap_number`, `date` |
| `/v1/sessions` | Session info | `session_key`, `session_name`, `session_type`, `date_start`, `date_end`, `circuit_key`, `location` |
| `/v1/session_result` | Final standings (available minutes after) | `driver_number`, `position`, `gap_to_leader`, `number_of_laps` |
| `/v1/starting_grid` | Race starting grid (available minutes after) | `driver_number`, `position`, `lap_duration` |
| `/v1/stints` | Stint/tire info | `driver_number`, `stint_number`, `compound`, `lap_start`, `lap_end`, `tyre_age_at_start` |
| `/v1/team_radio` | Team radio recordings | `driver_number`, `recording_url`, `date` |
| `/v1/weather` | Track weather (per minute) | `air_temperature`, `track_temperature`, `rainfall`, `humidity`, `wind_speed`, `wind_direction` |

**Pit detection pattern**: A driver is in the pit lane between `/v1/pit`'s `date` and `date + lane_duration * 1000ms`. The `is_pit_out_lap` field in `/v1/laps` only marks the **outlap** (lap after exit) — it does NOT indicate the driver is currently in the pit lane.

**MQTT topics** mirror REST paths: `v1/laps`, `v1/pit`, `v1/position`, etc.

## Principio rector: tiempo real ante todo

El objetivo central del dashboard es mostrar telemetría **lo más en vivo posible**. Ante cualquier decisión de diseño, preguntarse: ¿esto le llega al usuario cuando pasa, o varios segundos/vueltas después?

**Regla de fuentes de datos:**

| Dato | Fuente correcta | Por qué |
|------|-----------------|---------|
| Mini-sectores (segmentos) | SignalR | OpenF1 los entrega solo al completar la vuelta — llegan tarde |
| Tiempos de sector en curso | SignalR | Ídem |
| Bandera de pista (SC, roja, etc.) | SignalR | ~200ms vs varios segundos con polling |
| InPit / PitOut en tiempo real | SignalR | OpenF1 MQTT/REST solo confirma el stop cuando ya terminó |
| KnockedOut en clasificación | SignalR | No existe en OpenF1 |
| Tiempo restante de sesión | SignalR | OpenF1 no lo provee |
| Posición en carrera | SignalR (prioritaria) | Más confiable y más rápida que MQTT |
| Location x/y para track map | OpenF1 MQTT | SignalR no lo tiene |
| Neumáticos / stints | OpenF1 MQTT | SignalR no lo tiene |
| Team radio | OpenF1 MQTT | SignalR no lo tiene |
| Clima | OpenF1 MQTT | SignalR no lo tiene |
| Car data (RPM, velocidad) | OpenF1 MQTT | SignalR no lo tiene |

**SignalR** = `livetiming.formula1.com` — feed oficial de la F1, gratuito, WebSocket, datos por evento (no polling).
**OpenF1 MQTT** = paid tier, push-based, rico en datos pero segmentos/sectores solo llegan al completar la vuelta.

En modo live, ambos corren en paralelo. SignalR no puede ser sobreescrito por datos de OpenF1 para los campos que gestiona (segmentos, sectores, track_status, clock, in_pit).

## Conventions

- Components go in `src/components/`. Simple UI primitives go in `src/components/ui/` (shadcn/ui pattern).
- Business logic in hooks (`src/hooks/`), not components.
- No tests yet — verify by running the app.
- TypeScript strict mode is on. Don't use `any`.

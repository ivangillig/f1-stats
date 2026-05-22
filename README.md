# F1 Live Dashboard

Dashboard en tiempo real para telemetría de Fórmula 1, construido con Next.js y Node.js. Consume datos de [OpenF1](https://openf1.org) vía MQTT (tier pago) o REST polling (tier gratuito), con modo replay para cuando no hay sesión activa.

![F1 Dashboard](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38B2AC?style=flat-square&logo=tailwind-css)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=node.js)

## Características

- 🏎️ **Clasificación en vivo** — posiciones actualizadas en tiempo real
- ⏱️ **Tiempos de sector** — con indicadores de colores (púrpura = mejor general, verde = mejor personal, amarillo = en progreso)
- 🔴 **Estado de neumáticos** — compuesto y edad con indicadores visuales
- 🏁 **Estado de pista** — verde, amarilla, safety car, VSC, red flag, etc.
- 📊 **Info de sesión** — tiempo restante, vuelta actual, tipo de sesión
- 🗺️ **Mapa de circuito** — posiciones de pilotos en tiempo real sobre el trazado
- 📻 **Radio de equipos** — capturas de audio de comunicaciones
- 🚨 **Race Control** — mensajes oficiales de dirección de carrera con banner animado
- ⚠️ **Track Violations** — límites de pista y penalizaciones
- 🌡️ **Datos meteorológicos** — temperatura de pista/aire, humedad, viento
- 👁️ **Contador de espectadores** — visitantes en vivo deduplicados por sesión de browser

## Arquitectura

```
Browser (Next.js 14)
  └─ useF1DataSSE.ts (EventSource → /api/sse)
       └─ Next.js rewrite → proxy:4000
            └─ proxy/server.js (Node.js)
                 ├─ mqtt-client.js    (OpenF1 MQTT — tier pago, fuente primaria)
                 ├─ live-polling.js   (OpenF1 REST polling — tier gratuito, fallback)
                 └─ replay.js         (OpenF1 datos históricos — cuando no hay sesión activa)
```

El proxy normaliza todas las fuentes en un único stream SSE. El frontend nunca habla directamente con las APIs de F1.

## Inicio Rápido

### Opción 1: Desarrollo Local

```bash
# Copiar variables de entorno
cp .env.example .env
cp proxy/.env.example proxy/.env

# Terminal 1 — Proxy (puerto 4000)
cd proxy
npm install
npm run dev

# Terminal 2 — Frontend (puerto 3000)
npm install
npm run dev

# Abrir http://localhost:3000
```

### Opción 2: Docker Compose

```bash
docker-compose up
# Abrir http://localhost:3000
```

## Modos del Proxy

Configurar `PROXY_MODE` en `proxy/.env`:

| Modo | Fuente | Credenciales |
|---|---|---|
| `mqtt` | OpenF1 MQTT — push en tiempo real (tier pago) | Sí (`OPENF1_USERNAME` / `OPENF1_PASSWORD`) |
| `live-polling` | OpenF1 REST API — polling cada 4–8s (tier gratuito) | No |
| `replay` | Datos históricos OpenF1 (GP de Azerbaiyán 2024) | No |
| `auto` | MQTT → live-polling → replay (fallback automático) | Depende |

Con `auto`, el proxy detecta si hay credenciales MQTT y si hay una sesión activa; si no, cae automáticamente a replay.

## Variables de Entorno

### Frontend (`.env`)

```env
# URL del proxy (opcional, por defecto usa el rewrite de Next.js)
NEXT_PUBLIC_PROXY_URL=http://localhost:4000
```

### Proxy (`proxy/.env`)

```env
PROXY_MODE=auto

# Solo necesario para MQTT (OpenF1 tier pago)
OPENF1_USERNAME=tu_usuario
OPENF1_PASSWORD=tu_contraseña
```

## Scripts

### Frontend

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilar para producción |
| `npm run start` | Servidor de producción |
| `npm run lint` | Linter |

### Proxy (`proxy/`)

| Comando | Descripción |
|---|---|
| `npm run dev` | Proxy con nodemon (recarga automática) |
| `npm start` | Proxy en producción |

## Tecnologías

### Frontend

- **Next.js 14** — App Router, React 18
- **TypeScript** — tipado estricto
- **Tailwind CSS** — utilidades CSS con tokens de tema F1
- **shadcn/ui** — componentes UI
- **Framer Motion** — animaciones
- **Formula1 Display** — fuentes tipográficas oficiales

### Backend (proxy)

- **Node.js 20**
- **mqtt** — cliente MQTT para OpenF1 broker (`mqtt.openf1.org:8883`, TLS)
- **ws** — WebSocket
- **nodemon** — recarga en desarrollo

## Fuente de Datos

[OpenF1](https://openf1.org) es una API pública de telemetría de F1:

- **Tier gratuito** — REST API, ~30 req/min. Suficiente para live-polling y replay.
- **Tier pago** — acceso MQTT para push en tiempo real y mayor rate limit (60 req/min).

Los datos en vivo solo están disponibles durante sesiones oficiales (prácticas, clasificación, carrera). Fuera de sesión, el proxy sirve automáticamente una sesión grabada del GP de Azerbaiyán 2024.

## Contribuir

1. Fork el proyecto
2. Crea una rama (`git checkout -b feature/mi-feature`)
3. Commit los cambios (`git commit -m 'feat: descripción'`)
4. Push (`git push origin feature/mi-feature`)
5. Abre un Pull Request

## Disclaimer

Este proyecto no está afiliado, asociado, autorizado ni respaldado por Formula 1, FIA, o cualquiera de sus subsidiarias. Todos los nombres, marcas y logotipos son propiedad de sus respectivos dueños. Proyecto educativo y de código abierto.

## Licencia

MIT

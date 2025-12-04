# F1 Live Dashboard

Un dashboard en tiempo real para ver la telemetría de F1, inspirado en [f1-dash.com](https://f1-dash.com).

![F1 Dashboard](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38B2AC?style=flat-square&logo=tailwind-css)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=node.js)

## Características

- 🏎️ **Clasificación en vivo** - Posiciones actualizadas en tiempo real
- ⏱️ **Tiempos de sector** - Con indicadores de colores (púrpura = mejor general, verde = mejor personal, amarillo = mejor en este sector)
- 🔴 **Estado de neumáticos** - Compuesto y edad de los neumáticos con indicadores visuales
- 🏁 **Estado de pista** - Bandera verde, amarilla, safety car, red flag, etc.
- 📊 **Info de sesión** - Tiempo restante, vuelta actual, tipo de sesión, clima
- 🗺️ **Mapa de circuito** - Visualización de posiciones de pilotos en el circuito
- 📻 **Radio de equipos** - Capturas de audio de comunicaciones
- 🚨 **Race Control** - Mensajes oficiales de dirección de carrera
- ⚠️ **Track Violations** - Límites de pista y penalizaciones
- 🌡️ **Datos meteorológicos** - Temperatura de pista/aire, humedad, viento
- 🎙️ **Banner de Race Control** - Notificaciones animadas de mensajes importantes (estilo FIA oficial)

## Arquitectura

Este proyecto consta de dos componentes:

### Frontend (Next.js 14)

- Dashboard interactivo con componentes React
- Conexión SSE (Server-Sent Events) para actualizaciones en tiempo real
- Diseño responsive con Tailwind CSS
- Fuentes oficiales Formula1 Display

### Backend Proxy (Node.js)

- Servidor proxy que se conecta a la API SignalR de F1 Live Timing
- Convierte WebSocket a SSE para compatibilidad con navegadores
- Maneja la negociación y subscripción a los streams de datos
- Puerto: 4000

## Inicio Rápido

### Opción 1: Desarrollo Local

```bash
# Terminal 1 - Backend Proxy
cd proxy
npm install
npm start

# Terminal 2 - Frontend
npm install
npm run dev

# Abrir http://localhost:3000
```

### Opción 2: Docker Compose

```bash
docker-compose up
# Abrir http://localhost:3000
```

## Scripts Disponibles

### Frontend

| Comando         | Descripción                      |
| --------------- | -------------------------------- |
| `npm run dev`   | Inicia el servidor de desarrollo |
| `npm run build` | Compila para producción          |
| `npm run start` | Inicia el servidor de producción |
| `npm run lint`  | Ejecuta el linter                |

### Backend (proxy/)

| Comando     | Descripción              |
| ----------- | ------------------------ |
| `npm start` | Inicia el servidor proxy |

## Fuente de Datos

Este proyecto utiliza la API oficial de F1 Live Timing que transmite datos en tiempo real durante las sesiones oficiales de F1 a través de SignalR WebSocket.

**Endpoints:**

- Proxy Backend: `http://localhost:4000/api/sse`
- Frontend: `http://localhost:3000`

**Nota:** Los datos en vivo solo están disponibles durante las sesiones oficiales (prácticas, clasificación, carrera). Cuando no hay sesión activa, se muestran datos de demostración.

## Tecnologías

### Frontend

- **Next.js 14** - Framework React con App Router
- **TypeScript** - Tipado estático
- **Tailwind CSS** - Utilidad CSS
- **shadcn/ui** - Componentes UI
- **Formula1 Display** - Fuentes oficiales de F1

### Backend

- **Node.js** - Runtime de JavaScript
- **@microsoft/signalr** - Cliente SignalR para WebSocket
- **Express** - Framework web minimalista
- **cors** - Middleware para CORS

## Variables de Entorno

Crea un archivo `.env.local` en la raíz del proyecto:

```env
# URL del backend proxy (opcional, por defecto http://localhost:4000)
NEXT_PUBLIC_PROXY_URL=http://localhost:4000
```

## Desarrollo

### Agregar nuevos componentes

```bash
npx shadcn-ui@latest add [component]
```

## Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## Créditos

- Inspirado en [f1-dash.com](https://f1-dash.com)
- Datos de [F1 Live Timing API](https://livetiming.formula1.com)
- Mapas de circuito de [MultiViewer API](https://api.multiviewer.app)
- Fuentes Formula1 Display por Formula 1

## Disclaimer

Este proyecto no está afiliado, asociado, autorizado, respaldado por, o de ninguna manera oficialmente conectado con Formula 1, FIA, o cualquiera de sus subsidiarias o afiliados. Todos los nombres, marcas y logotipos son propiedad de sus respectivos dueños.

Este es un proyecto educativo y de código abierto para fines de demostración.

## Licencia

MIT

import "dotenv/config";
import http from "http";
import WebSocket from "ws";
import { startReplay, stopReplay, isReplayRunning } from "./replay.js";
import {
  startMQTT,
  stopMQTT,
  isMQTTRunning,
  hasMQTTCredentials,
  checkActiveSession,
} from "./mqtt-client.js";
import {
  startLivePolling,
  stopLivePolling,
  isLivePollingRunning,
} from "./live-polling.js";
import {
  startF1DashClient,
  stopF1DashClient,
  hasF1DashState,
} from "./f1dash-client.js";

const PORT = process.env.PORT || 4000;
const F1_BASE_URL = "livetiming.formula1.com";

// Mode: "f1dash" | "live-polling" | "mqtt" | "openf1" (alias for mqtt) | "replay" | "signalr"
// Set via environment variable: PROXY_MODE=f1dash
const PROXY_MODE = process.env.PROXY_MODE || "auto";

// Track if f1dash client is running
let isF1DashRunning = false;

// Store current state
let currentState = {};
let sseClients = new Set();

// SignalR subscription message
const SIGNALR_SUBSCRIBE = JSON.stringify({
  H: "Streaming",
  M: "Subscribe",
  A: [
    [
      "Heartbeat",
      "CarData.z",
      "Position.z",
      "ExtrapolatedClock",
      "TopThree",
      "TimingStats",
      "TimingAppData",
      "WeatherData",
      "TrackStatus",
      "SessionStatus",
      "DriverList",
      "RaceControlMessages",
      "SessionInfo",
      "SessionData",
      "LapCount",
      "TimingData",
      "TeamRadio",
      "ChampionshipPrediction",
    ],
  ],
  I: 1,
});

// Negotiate SignalR connection
async function negotiate() {
  const url = `https://${F1_BASE_URL}/signalr/negotiate?clientProtocol=1.5&connectionData=${encodeURIComponent(
    '[{"name":"Streaming"}]',
  )}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "BestHTTP",
      "Accept-Encoding": "gzip, identity",
    },
  });

  if (!response.ok) {
    throw new Error(`Negotiation failed: ${response.status}`);
  }

  const data = await response.json();
  const cookie = response.headers.get("set-cookie") || "";

  return {
    token: data.ConnectionToken,
    cookie,
  };
}

// Connect to F1 WebSocket
async function connectToF1() {
  try {
    console.log("[signalr] Negotiating connection...");
    const { token, cookie } = await negotiate();

    const wsUrl = `wss://${F1_BASE_URL}/signalr/connect?clientProtocol=1.5&transport=webSockets&connectionToken=${encodeURIComponent(
      token,
    )}&connectionData=${encodeURIComponent('[{"name":"Streaming"}]')}`;

    console.log("[signalr] Connecting to WebSocket...");

    const ws = new WebSocket(wsUrl, {
      headers: {
        "User-Agent": "BestHTTP",
        "Accept-Encoding": "gzip, identity",
        Cookie: cookie,
      },
    });

    ws.on("open", () => {
      console.log("[signalr] Connected! Subscribing to data streams...");
      ws.send(SIGNALR_SUBSCRIBE);
    });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        // Handle SignalR messages
        if (message.M && Array.isArray(message.M)) {
          message.M.forEach((msg) => {
            if (msg.A && msg.A.length > 0) {
              const updates = msg.A[0];

              // Merge updates into current state
              Object.entries(updates).forEach(([key, value]) => {
                if (
                  typeof value === "object" &&
                  value !== null &&
                  !Array.isArray(value)
                ) {
                  currentState[key] = deepMerge(currentState[key] || {}, value);
                } else {
                  currentState[key] = value;
                }
              });

              // Broadcast update to SSE clients
              broadcastSSE("update", updates);
            }
          });
        }

        // Handle initial data (R property)
        if (message.R) {
          Object.entries(message.R).forEach(([key, value]) => {
            currentState[key] = value;
          });
          console.log("[signalr] Received initial state");

          // Check if session is live
          const sessionData = currentState.SessionInfo;
          const sessionStatus = currentState.SessionStatus;

          // If session ended or no active session, switch to replay
          if (
            sessionStatus?.Status === "Ends" ||
            sessionStatus?.Status === "Ended" ||
            !sessionData?.Meeting?.Name
          ) {
            console.log(
              "[signalr] No active session detected, switching to replay mode...",
            );
            stopReplay();
            // Start replay BEFORE closing websocket so isReplayRunning() is true
            startReplay(broadcastSSE, currentState);
            ws.close();
            return;
          }
        }
      } catch (err) {
        // Ignore parse errors for heartbeat messages
      }
    });

    ws.on("close", (code, reason) => {
      console.log(`[signalr] Connection closed: ${code} - ${reason}`);

      // Don't reconnect if in replay mode
      if (isReplayRunning()) {
        console.log("[signalr] Replay is running, not reconnecting");
        return;
      }

      // Clear state without reassigning the reference
      Object.keys(currentState).forEach((key) => delete currentState[key]);

      setTimeout(() => {
        console.log("[signalr] Attempting to reconnect...");
        connectToF1();
      }, 5000);
    });

    ws.on("error", (error) => {
      console.error("[signalr] WebSocket error:", error.message);
    });

    return ws;
  } catch (error) {
    console.error("[signalr] Connection error:", error.message);

    // If not already in replay mode, start it
    if (!isReplayRunning()) {
      console.log("[signalr] No live session available, starting replay mode...");
      startReplay(broadcastSSE, currentState);
    }

    // Don't retry if in replay mode
    if (!isReplayRunning()) {
      setTimeout(() => {
        console.log("[signalr] Retrying connection...");
        connectToF1();
      }, 10000);
    }
  }
}

// Deep merge objects
function deepMerge(target, source) {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (
      source[key] instanceof Object &&
      key in target &&
      target[key] instanceof Object
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

// Broadcast to all SSE clients
function broadcastSSE(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  sseClients.forEach((client) => {
    try {
      client.write(message);
    } catch (err) {
      sseClients.delete(client);
    }
  });
}

// Create HTTP server
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.url === "/health") {
    let mode = "unknown";
    if (isF1DashRunning) mode = "f1dash-live";
    else if (isLivePollingRunning()) mode = "live-polling";
    else if (isMQTTRunning()) mode = "mqtt-live";
    else if (isReplayRunning()) mode = "replay";
    else mode = "f1-signalr";

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(
      JSON.stringify({
        status: "ok",
        mode: mode,
        clients: sseClients.size,
        hasState: Object.keys(currentState).length > 0,
        mqttAvailable: hasMQTTCredentials(),
        f1dashHasState: hasF1DashState(),
        mqttRunning: isMQTTRunning(),
      }),
    );
    return;
  }

  // SSE endpoint
  if (req.url === "/api/sse") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    });

    // Send current state as initial (even if empty, so client knows connection is working)
    res.write(`event: initial\ndata: ${JSON.stringify(currentState)}\n\n`);

    // Add client to set
    sseClients.add(res);
    console.log(`[proxy-sse] Client connected. Total: ${sseClients.size}`);

    // Keep alive
    const keepAlive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 15000);

    // Remove client on close
    req.on("close", () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
      console.log(`[proxy-sse] Client disconnected. Total: ${sseClients.size}`);
    });

    return;
  }

  // State endpoint (for debugging)
  if (req.url === "/api/state") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(currentState));
    return;
  }

  // Viewers count endpoint
  if (req.url === "/api/viewers") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ viewers: sseClients.size }));
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// Graceful shutdown — stop all active clients before exiting
function shutdown(signal) {
  console.log(`[proxy] ${signal} received — shutting down`);
  stopF1DashClient();
  stopLivePolling();
  stopMQTT();
  stopReplay();
  server.close(() => process.exit(0));
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Start server
server.listen(PORT, async () => {
  console.log(`[proxy] ─────────────────────────────────────`);
  console.log(`[proxy] F1 Proxy running on port ${PORT}`);
  console.log(`[proxy] Mode: ${PROXY_MODE}`);
  console.log(`[proxy] ─────────────────────────────────────`);

  // Track if we've received initial data (for sending proper event type)
  let hasReceivedInitialData = false;

  // Determine which mode to use
  if (PROXY_MODE === "f1dash") {
    // Use f1-dash.com's processed feed (recommended for live sessions)
    console.log("[proxy] Using f1-dash.com realtime feed...");
    isF1DashRunning = true;
    startF1DashClient((state) => {
      // Merge the state into currentState (preserving reference)
      // The state from f1dash is already in F1 SignalR format
      for (const key of Object.keys(state)) {
        if (
          typeof state[key] === "object" &&
          state[key] !== null &&
          !Array.isArray(state[key])
        ) {
          currentState[key] = deepMerge(currentState[key] || {}, state[key]);
        } else {
          currentState[key] = state[key];
        }
      }
      // On first data with SessionInfo, send as "initial" to ensure all clients get full state
      if (!hasReceivedInitialData && state.SessionInfo) {
        hasReceivedInitialData = true;
        console.log("[proxy] Broadcasting initial state to all clients");
        broadcastSSE("initial", currentState);
      } else {
        // Broadcast incremental updates
        broadcastSSE("update", state);
      }
    });
  } else if (PROXY_MODE === "live-polling") {
    // Force live polling mode (free REST API)
    console.log("[proxy] Using live polling mode (REST API)...");
    const success = await startLivePolling(broadcastSSE, currentState);
    if (!success) {
      console.log("[proxy] No live session, falling back to replay...");
      startReplay(broadcastSSE, currentState);
    }
  } else if (
    PROXY_MODE === "openf1" ||
    (PROXY_MODE === "mqtt" && hasMQTTCredentials())
  ) {
    // OpenF1 paid tier via MQTT ("openf1" and "mqtt" are equivalent)
    console.log("[proxy] Using OpenF1 MQTT client...");
    const sessionLive = await startMQTT(broadcastSSE, currentState);
    if (!sessionLive) {
      console.log("[proxy] No active F1 session — falling back to replay...");
      startReplay(broadcastSSE, currentState);
    }
  } else if (PROXY_MODE === "replay") {
    // Force replay mode
    console.log("[proxy] Using replay mode...");
    startReplay(broadcastSSE, currentState);
  } else if (PROXY_MODE === "signalr") {
    console.log("[proxy] Using direct F1 SignalR connection...");
    connectToF1();
  } else {
    // Auto mode: MQTT → f1dash → live-polling → replay
    if (hasMQTTCredentials()) {
      console.log("[proxy] Auto: MQTT credentials found — using real-time feed...");
      startMQTT(broadcastSSE, currentState);
    } else {
      console.log("[proxy] Auto: trying f1-dash.com feed...");
      isF1DashRunning = true;
      startF1DashClient((state) => {
        for (const key of Object.keys(state)) {
          if (
            typeof state[key] === "object" &&
            state[key] !== null &&
            !Array.isArray(state[key])
          ) {
            currentState[key] = deepMerge(currentState[key] || {}, state[key]);
          } else {
            currentState[key] = state[key];
          }
        }
        if (!hasReceivedInitialData && state.SessionInfo) {
          hasReceivedInitialData = true;
          console.log("[proxy] Broadcasting initial state to all clients");
          broadcastSSE("initial", currentState);
        } else {
          broadcastSSE("update", state);
        }
      });

      // If no data arrived after 20s, f1dash is down — fall back to live-polling → replay
      setTimeout(async () => {
        if (!hasF1DashState()) {
          console.log("[proxy] Auto: f1-dash unavailable, trying live-polling...");
          stopF1DashClient();
          isF1DashRunning = false;
          const success = await startLivePolling(broadcastSSE, currentState);
          if (!success) {
            console.log("[proxy] Auto: no live session found, using replay...");
            startReplay(broadcastSSE, currentState);
          }
        }
      }, 20000);
    }
  }
});

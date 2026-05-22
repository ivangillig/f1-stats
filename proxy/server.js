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
  ensureValidToken,
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

// Track first data received (for initial vs incremental broadcast)
let hasReceivedInitialData = false;

// Store current state
let currentState = {};
// Map<clientId, res> — deduplicates reconnects and StrictMode double-mounts
let sseClients = new Map();

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

// Handle data from f1dash client — merge into state and broadcast
function handleF1DashData(state) {
  for (const key of Object.keys(state)) {
    if (typeof state[key] === "object" && state[key] !== null && !Array.isArray(state[key])) {
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
}

// Start fallback source when there is no live session
// Production → OpenF1 REST replay | Development → f1dash feed
function startFallbackNoLive() {
  if (process.env.NODE_ENV === "production") {
    console.log("[proxy] No live session — production: starting OpenF1 replay...");
    startReplay(broadcastSSE, currentState);
  } else {
    console.log("[proxy] No live session — dev: starting f1dash feed...");
    isF1DashRunning = true;
    hasReceivedInitialData = false;
    startF1DashClient(handleF1DashData);
    // If f1dash produces no data after 20s, fall back to OpenF1 replay
    setTimeout(() => {
      if (!hasF1DashState()) {
        console.log("[proxy] f1dash unavailable — falling back to OpenF1 replay...");
        stopF1DashClient();
        isF1DashRunning = false;
        startReplay(broadcastSSE, currentState);
      }
    }, 20000);
  }
}

// Broadcast to all SSE clients
function broadcastSSE(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  sseClients.forEach((client, clientId) => {
    try {
      client.write(message);
    } catch (err) {
      sseClients.delete(clientId);
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
  const reqUrl = new URL(req.url, "http://localhost");
  if (reqUrl.pathname === "/api/sse") {
    const clientId = reqUrl.searchParams.get("clientId") || `anon-${Date.now()}-${Math.random()}`;

    // Close any existing connection for this clientId (handles reconnects / StrictMode double-mount)
    const existing = sseClients.get(clientId);
    if (existing) {
      try { existing.end(); } catch (_) {}
      sseClients.delete(clientId);
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    });

    // Send current state as initial (even if empty, so client knows connection is working)
    res.write(`event: initial\ndata: ${JSON.stringify(currentState)}\n\n`);

    sseClients.set(clientId, res);
    console.log(`[proxy-sse] Client connected (${clientId}). Unique viewers: ${sseClients.size}`);

    // Keep alive
    const keepAlive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 15000);

    // Remove client on close
    req.on("close", () => {
      clearInterval(keepAlive);
      if (sseClients.get(clientId) === res) sseClients.delete(clientId);
      console.log(`[proxy-sse] Client disconnected (${clientId}). Unique viewers: ${sseClients.size}`);
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

  // Sessions proxy — forwards to OpenF1 with auth credentials when available
  // Avoids 401 that OpenF1 returns to unauthenticated clients during live sessions
  if (req.url.startsWith("/api/sessions")) {
    const reqUrl = new URL(req.url, "http://localhost");
    const queryString = reqUrl.search; // e.g. "?date_start>=2026-05-21"
    const upstreamUrl = `https://api.openf1.org/v1/sessions${queryString}`;
    try {
      const headers = { "Accept": "application/json" };
      if (hasMQTTCredentials()) {
        const token = await ensureValidToken();
        headers["Authorization"] = `Bearer ${token}`;
      }
      const upstreamRes = await fetch(upstreamUrl, { headers });
      const body = await upstreamRes.text();
      res.writeHead(upstreamRes.status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(body);
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "upstream_error", detail: err.message }));
    }
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
  const env = process.env.NODE_ENV === "production" ? "production" : "development";
  console.log(`[proxy] ─────────────────────────────────────`);
  console.log(`[proxy] F1 Proxy running on port ${PORT}`);
  console.log(`[proxy] Environment: ${env}`);
  console.log(`[proxy] Mode override: ${PROXY_MODE}`);
  console.log(`[proxy] ─────────────────────────────────────`);

  // Explicit overrides (for debugging/testing only)
  if (PROXY_MODE === "f1dash") {
    console.log("[proxy] Override: f1dash feed...");
    isF1DashRunning = true;
    startF1DashClient(handleF1DashData);
  } else if (PROXY_MODE === "live-polling") {
    console.log("[proxy] Override: live-polling...");
    const success = await startLivePolling(broadcastSSE, currentState);
    if (!success) startFallbackNoLive();
  } else if (PROXY_MODE === "mqtt" || PROXY_MODE === "openf1") {
    console.log("[proxy] Override: MQTT...");
    const sessionLive = await startMQTT(broadcastSSE, currentState);
    if (!sessionLive) startFallbackNoLive();
  } else if (PROXY_MODE === "replay") {
    console.log("[proxy] Override: replay...");
    startReplay(broadcastSSE, currentState);
  } else if (PROXY_MODE === "signalr") {
    console.log("[proxy] Override: direct F1 SignalR...");
    connectToF1();
  } else {
    // Auto mode — always detect live session first, then pick source by environment
    console.log(`[proxy] Auto mode — checking for live session...`);
    if (hasMQTTCredentials()) {
      // startMQTT internally calls checkActiveSession and returns false if no live session
      const sessionLive = await startMQTT(broadcastSSE, currentState);
      if (!sessionLive) {
        console.log("[proxy] No live session via MQTT — using fallback...");
        startFallbackNoLive();
      }
    } else {
      // No MQTT credentials: check session manually, then route
      const sessionLive = await checkActiveSession();
      if (sessionLive) {
        console.log("[proxy] Live session detected — starting live-polling...");
        const success = await startLivePolling(broadcastSSE, currentState);
        if (!success) startFallbackNoLive();
      } else {
        startFallbackNoLive();
      }
    }
  }
});

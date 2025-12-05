import "dotenv/config";
import http from "http";
import WebSocket from "ws";
import { startReplay, stopReplay, isReplayRunning } from "./replay.js";
import {
  startMQTT,
  stopMQTT,
  isMQTTRunning,
  hasMQTTCredentials,
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

// Mode: "f1dash" | "live-polling" | "mqtt" | "replay" | "signalr"
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
    '[{"name":"Streaming"}]'
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
    console.log("[F1] Negotiating connection...");
    const { token, cookie } = await negotiate();

    const wsUrl = `wss://${F1_BASE_URL}/signalr/connect?clientProtocol=1.5&transport=webSockets&connectionToken=${encodeURIComponent(
      token
    )}&connectionData=${encodeURIComponent('[{"name":"Streaming"}]')}`;

    console.log("[F1] Connecting to WebSocket...");

    const ws = new WebSocket(wsUrl, {
      headers: {
        "User-Agent": "BestHTTP",
        "Accept-Encoding": "gzip, identity",
        Cookie: cookie,
      },
    });

    ws.on("open", () => {
      console.log("[F1] Connected! Subscribing to data streams...");
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
          console.log("[F1] Received initial state");

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
              "[F1] No active session detected, switching to replay mode..."
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
      console.log(`[F1] Connection closed: ${code} - ${reason}`);

      // Don't reconnect if in replay mode
      if (isReplayRunning()) {
        console.log("[F1] Replay is running, not reconnecting");
        return;
      }

      // Clear state without reassigning the reference
      Object.keys(currentState).forEach((key) => delete currentState[key]);

      setTimeout(() => {
        console.log("[F1] Attempting to reconnect...");
        connectToF1();
      }, 5000);
    });

    ws.on("error", (error) => {
      console.error("[F1] WebSocket error:", error.message);
    });

    return ws;
  } catch (error) {
    console.error("[F1] Connection error:", error.message);

    // If not already in replay mode, start it
    if (!isReplayRunning()) {
      console.log("[F1] No live session available, starting replay mode...");
      startReplay(broadcastSSE, currentState);
    }

    // Don't retry if in replay mode
    if (!isReplayRunning()) {
      setTimeout(() => {
        console.log("[F1] Retrying connection...");
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
      })
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

    // Send current state as initial
    if (Object.keys(currentState).length > 0) {
      res.write(`event: initial\ndata: ${JSON.stringify(currentState)}\n\n`);
    }

    // Add client to set
    sseClients.add(res);
    console.log(`[SSE] Client connected. Total: ${sseClients.size}`);

    // Keep alive
    const keepAlive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 15000);

    // Remove client on close
    req.on("close", () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
      console.log(`[SSE] Client disconnected. Total: ${sseClients.size}`);
    });

    return;
  }

  // State endpoint (for debugging)
  if (req.url === "/api/state") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(currentState));
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// Start server
server.listen(PORT, async () => {
  console.log(`[Server] F1 Proxy running on port ${PORT}`);
  console.log(`[Server] SSE endpoint: http://localhost:${PORT}/api/sse`);
  console.log(`[Server] Mode: ${PROXY_MODE}`);

  // Determine which mode to use
  if (PROXY_MODE === "f1dash") {
    // Use f1-dash.com's processed feed (recommended for live sessions)
    console.log("[Server] Using f1-dash.com realtime feed...");
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
      // Broadcast update to SSE clients
      broadcastSSE("update", state);
    });
  } else if (PROXY_MODE === "live-polling") {
    // Force live polling mode (free REST API)
    console.log("[Server] Using live polling mode (REST API)...");
    const success = await startLivePolling(broadcastSSE, currentState);
    if (!success) {
      console.log("[Server] No live session, falling back to replay...");
      startReplay(broadcastSSE, currentState);
    }
  } else if (PROXY_MODE === "mqtt" && hasMQTTCredentials()) {
    // Force MQTT mode
    console.log("[Server] Using MQTT mode...");
    startMQTT(broadcastSSE, currentState);
  } else if (PROXY_MODE === "replay") {
    // Force replay mode
    console.log("[Server] Using replay mode...");
    startReplay(broadcastSSE, currentState);
  } else {
    // Auto mode: try f1dash > MQTT > SignalR > Replay
    console.log("[Server] Auto mode: trying f1-dash.com feed...");
    isF1DashRunning = true;
    startF1DashClient((state) => {
      // Merge the state into currentState
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
      broadcastSSE("update", state);
    });
  }
});

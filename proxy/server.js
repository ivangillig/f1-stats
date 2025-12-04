import http from "http";
import WebSocket from "ws";
import { startReplay, stopReplay, isReplayRunning } from "./replay.js";
import {
  startMQTT,
  stopMQTT,
  isMQTTRunning,
  hasMQTTCredentials,
} from "./mqtt-client.js";

const PORT = process.env.PORT || 4000;
const F1_BASE_URL = "livetiming.formula1.com";

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
    const mode = isMQTTRunning()
      ? "mqtt-live"
      : isReplayRunning()
      ? "replay"
      : "f1-live";
    res.writeHead(200, { "Content-Type": "application/json" });
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
server.listen(PORT, () => {
  console.log(`[Server] F1 Proxy running on port ${PORT}`);
  console.log(`[Server] SSE endpoint: http://localhost:${PORT}/api/sse`);

  // Check for MQTT credentials first (preferred for live data)
  if (hasMQTTCredentials()) {
    console.log("[Server] OpenF1 credentials found, using MQTT for live data");
    startMQTT(broadcastSSE, currentState);
  } else {
    console.log("[Server] No OpenF1 credentials, trying F1 SignalR...");
    // Connect to F1 SignalR (fallback, will switch to replay if no session)
    connectToF1();
  }
});

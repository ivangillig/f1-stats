/**
 * F1-Dash Real-time Client
 * Connects to f1-dash.com's SSE endpoint for real-time F1 data
 * This uses their processed SignalR feed which is public
 *
 * IMPORTANT: This client passes data through AS-IS in F1 SignalR format
 * so the frontend can process it the same way as direct SignalR connection
 */

import https from "https";
import http from "http";
import { EventEmitter } from "events";

// API URL from environment variable
const F1_SSE_HOST = process.env.F1_SSE_HOST;
const F1_SSE_PATH = process.env.F1_SSE_PATH;
const F1_SSE_SECURE = process.env.F1_SSE_SECURE !== "false"; // Default to HTTPS

class F1DashClient extends EventEmitter {
  constructor() {
    super();
    this.request = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
    this.buffer = "";

    // Store raw state in F1 SignalR format
    this.rawState = {};
  }

  connect() {
    console.log(`[F1SSE] Connecting to ${F1_SSE_HOST}${F1_SSE_PATH}...`);

    const options = {
      hostname: F1_SSE_HOST,
      path: F1_SSE_PATH,
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
    };

    const httpModule = F1_SSE_SECURE ? https : http;
    this.request = httpModule.get(options, (res) => {
      if (res.statusCode !== 200) {
        console.error(`[F1Dash] HTTP Error: ${res.statusCode}`);
        this.scheduleReconnect();
        return;
      }

      console.log("[F1Dash] Connected to SSE stream");
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit("connected");

      res.setEncoding("utf8");

      res.on("data", (chunk) => {
        this.buffer += chunk;
        this.processBuffer();
      });

      res.on("end", () => {
        console.log("[F1Dash] Connection ended");
        this.isConnected = false;
        this.scheduleReconnect();
      });

      res.on("error", (err) => {
        console.error("[F1Dash] Response error:", err.message);
        this.isConnected = false;
        this.scheduleReconnect();
      });
    });

    this.request.on("error", (err) => {
      console.error("[F1Dash] Request error:", err.message);
      this.isConnected = false;
      this.scheduleReconnect();
    });

    this.request.on("timeout", () => {
      console.error("[F1Dash] Request timeout");
      this.request.destroy();
      this.isConnected = false;
      this.scheduleReconnect();
    });
  }

  processBuffer() {
    // SSE format: "event: eventName\ndata: jsonData\n\n"
    const events = this.buffer.split("\n\n");

    // Keep the last incomplete event in the buffer
    this.buffer = events.pop() || "";

    for (const event of events) {
      if (!event.trim()) continue;

      const lines = event.split("\n");
      let eventType = "message";
      let data = "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventType = line.substring(6).trim();
        } else if (line.startsWith("data:")) {
          data += line.substring(5).trim();
        }
      }

      if (data) {
        this.handleEvent(eventType, data);
      }
    }
  }

  handleEvent(eventType, data) {
    try {
      const parsed = JSON.parse(data);

      if (eventType === "initial") {
        console.log("[F1Dash] Received initial state");
        this.handleInitialState(parsed);
      } else if (eventType === "update") {
        this.handleUpdate(parsed);
      }
    } catch (err) {
      // Data might be split across chunks, will be handled when complete
    }
  }

  handleInitialState(data) {
    // Store raw state directly - this IS the F1 SignalR format
    this.rawState = { ...data };

    // Log what we got
    if (data.DriverList) {
      console.log(
        `[F1Dash] Loaded ${Object.keys(data.DriverList).length} drivers`
      );
    }
    if (data.SessionInfo) {
      const session = data.SessionInfo;
      console.log(
        `[F1Dash] Session: ${session.Name || session.Type} at ${
          session.Meeting?.Circuit?.ShortName || "Unknown"
        }`
      );
    }
    if (data.RaceControlMessages?.Messages) {
      console.log(
        `[F1Dash] Loaded ${
          Object.keys(data.RaceControlMessages.Messages).length
        } race control messages`
      );
    }
    if (data.TeamRadio?.Captures) {
      console.log(
        `[F1Dash] Loaded ${
          Object.keys(data.TeamRadio.Captures).length
        } team radios`
      );
    }
    // Debug: Log Position data structure
    if (data.Position) {
      console.log(`[F1Dash] Position data keys:`, Object.keys(data.Position));
      const firstEntry = Object.entries(data.Position)[0];
      if (firstEntry) {
        console.log(
          `[F1Dash] Position sample:`,
          JSON.stringify(firstEntry[1]).substring(0, 200)
        );
      }
    }

    // Emit the raw state for the server to broadcast
    this.emit("state", this.rawState);
  }

  handleUpdate(data) {
    // Deep merge the update into raw state
    this.deepMerge(this.rawState, data);

    // Log significant updates
    if (data.RaceControlMessages?.Messages) {
      const newMsgs = Object.values(data.RaceControlMessages.Messages);
      for (const msg of newMsgs) {
        if (msg.Message) {
          console.log(`[F1Dash] Race Control: ${msg.Message}`);
        }
      }
    }
    if (data.TeamRadio?.Captures) {
      const newRadios = Object.values(data.TeamRadio.Captures);
      for (const radio of newRadios) {
        const driverNum = radio.RacingNumber;
        const driverInfo = this.rawState.DriverList?.[driverNum];
        console.log(`[F1Dash] Team Radio: ${driverInfo?.Tla || driverNum}`);
      }
    }

    // Emit the update (not full state) for incremental updates
    this.emit("update", data);
    // Also emit full state for initial sync scenarios
    this.emit("state", this.rawState);
  }

  deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (
        source[key] !== null &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key])
      ) {
        if (!target[key] || typeof target[key] !== "object") {
          target[key] = {};
        }
        this.deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[F1Dash] Max reconnection attempts reached");
      this.emit("disconnected");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);
    console.log(
      `[F1Dash] Reconnecting in ${delay / 1000}s (attempt ${
        this.reconnectAttempts
      }/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect() {
    if (this.request) {
      this.request.destroy();
      this.request = null;
    }
    this.isConnected = false;
    console.log("[F1Dash] Disconnected");
  }

  getState() {
    return this.rawState;
  }

  hasState() {
    return Object.keys(this.rawState).length > 0;
  }
}

// Singleton instance
let client = null;

function startF1DashClient(onState) {
  if (client) {
    client.disconnect();
  }

  client = new F1DashClient();

  client.on("state", (state) => {
    if (onState) onState(state);
  });

  client.on("connected", () => {
    console.log("[F1Dash] Stream connected successfully");
  });

  client.on("disconnected", () => {
    console.log("[F1Dash] Stream disconnected");
  });

  client.connect();

  return client;
}

function stopF1DashClient() {
  if (client) {
    client.disconnect();
    client = null;
  }
}

function getF1DashState() {
  return client ? client.getState() : null;
}

function hasF1DashState() {
  return client ? client.hasState() : false;
}

export {
  F1DashClient,
  startF1DashClient,
  stopF1DashClient,
  getF1DashState,
  hasF1DashState,
};

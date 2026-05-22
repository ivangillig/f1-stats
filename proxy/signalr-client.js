/**
 * F1 SignalR Client — Live Timing (Segments + Sector Times)
 *
 * Connects to the official F1 live timing SignalR endpoint in parallel with
 * MQTT to get real-time per-segment status updates and live sector times.
 *
 * OpenF1 (MQTT/REST) only delivers segments once a lap is COMPLETE.
 * The official F1 SignalR feed pushes each segment as the car crosses it,
 * which is what makes mini-sectors light up live.
 *
 * This client ONLY writes to:
 *   state.timing[num].segments_1 / _2 / _3
 *   state.timing[num].sector_1   / _2 / _3
 *   state.track_status
 *
 * Everything else (position, gaps, tires, pit stops, etc.) stays with MQTT.
 *
 * Log tag: [signalr]
 */

import WebSocket from "ws";
import { ensureTimingEntry } from "./state-utils.js";

const SIGNALR_HOST = "livetiming.formula1.com";
const CONNECTION_DATA = encodeURIComponent(
  JSON.stringify([{ name: "streaming" }]),
);
const NEGOTIATE_URL = `https://${SIGNALR_HOST}/signalr/negotiate?clientProtocol=1.5&connectionData=${CONNECTION_DATA}`;
const WS_BASE = `wss://${SIGNALR_HOST}/signalr/connect`;

// Topics: TimingData for live segments/sector times, TrackStatus and ExtrapolatedClock
// as fast overrides (OpenF1 MQTT doesn't provide either of these live)
const SUBSCRIBE_TOPICS = ["TimingData", "TrackStatus", "ExtrapolatedClock"];

const COMMON_HEADERS = {
  "User-Agent": "BestHTTP",
  "Accept-Encoding": "gzip, identity",
};

let ws = null;
let currentStateRef = null;
let broadcastFn = null;
let isRunning = false;
let reconnectTimeout = null;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse an F1 lap/sector time string ("1:23.456" or "23.456") to seconds.
 * Returns null if the string is empty, zero, or unparseable.
 */
function parseF1Time(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const colon = trimmed.indexOf(":");
  if (colon !== -1) {
    const mins = parseInt(trimmed.slice(0, colon), 10);
    const secs = parseFloat(trimmed.slice(colon + 1));
    if (isNaN(mins) || isNaN(secs)) return null;
    const total = mins * 60 + secs;
    return total > 0 ? total : null;
  }
  const v = parseFloat(trimmed);
  return isNaN(v) || v <= 0 ? null : v;
}

// ── Message handlers ─────────────────────────────────────────────────────────

/**
 * Apply a (possibly sparse/incremental) TimingData update.
 *
 * The SignalR feed sends partial objects — only changed fields are present.
 * We deep-merge each segment and sector value into the existing state entry
 * so that a single-segment update doesn't wipe the rest of the array.
 */
function processTimingData(data) {
  if (!currentStateRef || !data?.Lines) return;

  let changed = false;

  for (const [driverNum, driverData] of Object.entries(data.Lines)) {
    if (!driverData || typeof driverData !== "object") continue;

    const num = String(driverNum);
    const entry = ensureTimingEntry(currentStateRef, num);

    // InPit / PitOut — real-time pit lane detection.
    // This is the only reliable source: OpenF1 REST/MQTT only provides pit data
    // after the stop is complete (lane_duration present), so cars currently in
    // the pit lane (e.g. during a red flag) would never show in_pit=true there.
    if (driverData.InPit === true) {
      entry.in_pit = true;
      changed = true;
    } else if (driverData.InPit === false || driverData.PitOut === true) {
      entry.in_pit = false;
      changed = true;
    }

    const sectors = driverData.Sectors;
    if (!sectors || typeof sectors !== "object") continue;

    for (const [sectorIdxStr, sectorData] of Object.entries(sectors)) {
      if (!sectorData || typeof sectorData !== "object") continue;

      const sIdx = parseInt(sectorIdxStr, 10); // 0, 1, or 2
      if (isNaN(sIdx) || sIdx < 0 || sIdx > 2) continue;

      const segKey = `segments_${sIdx + 1}`; // segments_1 / _2 / _3
      const sectorKey = `sector_${sIdx + 1}`; // sector_1   / _2 / _3

      // Completed sector time (e.g. "25.123") — present when the sector finishes
      if (sectorData.Value !== undefined) {
        const seconds = parseF1Time(sectorData.Value);
        if (seconds != null) {
          entry[sectorKey] = seconds;
          changed = true;
        }
      }

      // Individual segment status updates — sparse, only changed segments present
      const segs = sectorData.Segments;
      if (segs && typeof segs === "object") {
        if (!Array.isArray(entry[segKey])) entry[segKey] = [];

        for (const [segIdxStr, segData] of Object.entries(segs)) {
          const sj = parseInt(segIdxStr, 10);
          if (isNaN(sj)) continue;

          const status = segData?.Status;
          if (status !== undefined) {
            // Grow the array if needed
            while (entry[segKey].length <= sj) entry[segKey].push(0);
            entry[segKey][sj] = status;
            changed = true;
          }
        }
      }
    }
  }

  if (changed && broadcastFn && currentStateRef) {
    broadcastFn("update", currentStateRef);
  }
}

/**
 * Fast track-status override from the official feed.
 * Status codes: "1"=Green, "2"=Yellow, "4"=SC, "5"=Red, "6"=VSC, "7"=Chequered
 */
const STATUS_TO_FLAG = {
  1: "GREEN",
  2: "YELLOW",
  4: "SC",
  5: "RED",
  6: "VSC",
  7: "CHEQUERED",
};

function processTrackStatus(data) {
  if (!currentStateRef || !data) return;
  const flag = STATUS_TO_FLAG[String(data.Status)];
  if (flag) {
    // Mark as set by SignalR so MQTT historical data cannot overwrite it
    currentStateRef._signalrTrackStatusSet = true;
    currentStateRef.track_status = { flag };
    if (broadcastFn) broadcastFn("update", currentStateRef);
  }
}

/**
 * ExtrapolatedClock — provides session remaining time.
 * OpenF1 MQTT has no equivalent; this is the only live source.
 * Format: { Utc: "2026-05-22T14:23:45Z", Remaining: "0:18:32", Extrapolating: true }
 */
function processExtrapolatedClock(data) {
  if (!currentStateRef || !data) return;
  const remaining = data.Remaining ?? data.remaining;
  const utc = data.Utc ?? data.utc;
  if (remaining && utc) {
    currentStateRef.clock = { remaining, utc };
    if (broadcastFn) broadcastFn("update", currentStateRef);
  }
}

function handleFeedMessage(topic, data) {
  if (topic === "TimingData") processTimingData(data);
  else if (topic === "TrackStatus") processTrackStatus(data);
  else if (topic === "ExtrapolatedClock") processExtrapolatedClock(data);
}

// ── Connection ───────────────────────────────────────────────────────────────

async function connect() {
  if (!isRunning) return;

  try {
    // Step 1: Negotiate — get ConnectionToken
    const negRes = await fetch(NEGOTIATE_URL, { headers: COMMON_HEADERS });
    if (!negRes.ok) throw new Error(`Negotiate failed: ${negRes.status}`);
    const neg = await negRes.json();
    const token = neg.ConnectionToken;
    if (!token) throw new Error("No ConnectionToken in negotiate response");

    const tokenEnc = encodeURIComponent(token);

    // Step 2: Open WebSocket
    const wsUrl =
      `${WS_BASE}?clientProtocol=1.5&transport=webSockets` +
      `&connectionToken=${tokenEnc}&connectionData=${CONNECTION_DATA}`;

    ws = new WebSocket(wsUrl, { headers: COMMON_HEADERS });

    ws.on("open", () => {
      console.log("[signalr] Connected to F1 live timing");

      // Subscribe to topics
      ws.send(
        JSON.stringify({
          H: "streaming",
          M: "Subscribe",
          A: [SUBSCRIBE_TOPICS],
          I: 1,
        }),
      );

      // Step 3: HTTP start (required by SignalR protocol)
      const startUrl =
        `https://${SIGNALR_HOST}/signalr/start?clientProtocol=1.5&transport=webSockets` +
        `&connectionToken=${tokenEnc}&connectionData=${CONNECTION_DATA}`;
      fetch(startUrl, { headers: COMMON_HEADERS }).catch(() => {});
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // Subscribe response snapshot: { I: "1", R: { TopicName: {data}, ... } }
        // This is the initial state sent back when we call Subscribe().
        // Must be processed BEFORE live incremental M[] messages arrive.
        if (msg.R && typeof msg.R === "object" && !Array.isArray(msg.R)) {
          for (const [topic, data] of Object.entries(msg.R)) {
            if (data && typeof data === "object") {
              console.log(`[signalr] Snapshot: ${topic}`);
              handleFeedMessage(topic, data);
            }
          }
        }

        // Live broadcast messages: { M: [{ H: "streaming", M: "feed", A: ["Topic", {data}, "ts"] }] }
        if (Array.isArray(msg.M)) {
          for (const item of msg.M) {
            if (
              item.H?.toLowerCase() === "streaming" &&
              item.M === "feed" &&
              Array.isArray(item.A) &&
              item.A.length >= 2
            ) {
              handleFeedMessage(item.A[0], item.A[1]);
            }
          }
        }
      } catch (_) {
        // Ignore malformed messages (keepalives, etc.)
      }
    });

    ws.on("close", (code, reason) => {
      console.log(`[signalr] Disconnected (${code})`);
      ws = null;
      if (isRunning) scheduleReconnect();
    });

    ws.on("error", (err) => {
      console.error("[signalr] WebSocket error:", err.message);
      ws?.close();
    });
  } catch (err) {
    console.error("[signalr] Connection failed:", err.message);
    if (isRunning) scheduleReconnect();
  }
}

function scheduleReconnect(delayMs = 5000) {
  clearTimeout(reconnectTimeout);
  reconnectTimeout = setTimeout(() => {
    if (isRunning) connect();
  }, delayMs);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the SignalR client.
 * Safe to call multiple times — does nothing if already running.
 * @param {Function} broadcast  broadcastSSE(event, data) from server.js
 * @param {Object}   stateRef   the shared currentState object (mutated in place)
 */
export function startSignalR(broadcast, stateRef) {
  if (isRunning) return;
  isRunning = true;
  broadcastFn = broadcast;
  currentStateRef = stateRef;
  console.log(
    "[signalr] Starting F1 live timing client (segments + sector times)...",
  );
  connect();
}

/**
 * Stop the SignalR client and cancel any pending reconnect.
 */
export function stopSignalR() {
  isRunning = false;
  clearTimeout(reconnectTimeout);
  ws?.close();
  ws = null;
  broadcastFn = null;
  currentStateRef = null;
}

/**
 * Returns true if the WebSocket is currently open.
 */
export function isSignalRRunning() {
  return isRunning && ws !== null && ws.readyState === WebSocket.OPEN;
}

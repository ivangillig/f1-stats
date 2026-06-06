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
// SignalR Core (modern ASP.NET Core SignalR). Since ~2025 F1 migrated here and
// gated it behind auth — the old /signalr/ classic endpoint now returns 401 for
// everyone. Access requires a JWT obtained from a formula1.com login, passed as
// the `authToken` query param (see proxy/.env.example for how to get it).
const NEGOTIATE_URL = `https://${SIGNALR_HOST}/signalrcore/negotiate?negotiateVersion=1`;
const WS_BASE = `wss://${SIGNALR_HOST}/signalrcore`;

// SignalR Core's JSON protocol delimits each message with the 0x1e record separator.
const RS = "\x1e";

// Topics: TimingData for live segments/sector times, TimingStats for personal best sectors,
// TrackStatus and ExtrapolatedClock as fast overrides (OpenF1 MQTT doesn't provide these live)
const SUBSCRIBE_TOPICS = [
  "TimingData",
  "TimingStats",
  "TrackStatus",
  "ExtrapolatedClock",
  "LapCount",
];

const COMMON_HEADERS = {
  "User-Agent": "BestHTTP",
  "Accept-Encoding": "gzip, identity",
};

let ws = null;
let currentStateRef = null;
let broadcastFn = null;
let isRunning = false;
let reconnectTimeout = null;
let pingInterval = null;

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
 *
 * @param {Object}  data        TimingData payload from SignalR
 * @param {boolean} isSnapshot  true when this is the full initial snapshot (msg.R),
 *                              false for incremental live-feed messages (msg.M).
 *                              Snapshots are treated as authoritative: an absent InPit
 *                              field means the car is NOT in the pit lane.
 */
function processTimingData(data, isSnapshot = false) {
  if (!currentStateRef || !data?.Lines) return;

  let changed = false;

  // SessionPart — 1=Q1/SQ1, 2=Q2/SQ2, 3=Q3/SQ3
  // SignalR sends this at the top level of TimingData when a new part starts.
  if (data.SessionPart != null && currentStateRef.session) {
    const part = parseInt(data.SessionPart, 10);
    if (!isNaN(part)) {
      const prevPart = currentStateRef.session.qualifying_part ?? 0;
      currentStateRef.session.qualifying_part = part;
      // When advancing to a new qualifying segment, wipe all per-lap timing so
      // stale Q1/Q2 times don't bleed into the new segment's leaderboard.
      if (part > prevPart && currentStateRef.timing) {
        for (const entry of Object.values(currentStateRef.timing)) {
          entry.best_lap = null;
          entry.last_lap = null;
          entry.last_lap_is_pb = false;
          entry.sector_1 = null;
          entry.sector_2 = null;
          entry.sector_3 = null;
          entry.best_sector_1 = null;
          entry.best_sector_2 = null;
          entry.best_sector_3 = null;
          entry.segments_1 = [];
          entry.segments_2 = [];
          entry.segments_3 = [];
          entry.gap_to_leader = null;
          entry.interval = null;
        }
        console.log(
          `[signalr] Qualifying part advanced to Q${part} — timing data cleared`,
        );
      }
      changed = true;
    }
  }

  for (const [driverNum, driverData] of Object.entries(data.Lines)) {
    if (!driverData || typeof driverData !== "object") continue;

    const num = String(driverNum);
    const entry = ensureTimingEntry(currentStateRef, num);

    // Race position — present in every TimingData snapshot and incremental update.
    // More reliable than MQTT v1/position which only fires on position changes.
    if (driverData.Position != null) {
      const pos = parseInt(String(driverData.Position), 10);
      if (!isNaN(pos) && pos > 0) {
        entry.position = pos;
        changed = true;
      }
    }

    // InPit / PitOut — real-time pit lane detection.
    // This is the only reliable source: OpenF1 REST/MQTT only provides pit data
    // after the stop is complete (lane_duration present), so cars currently in
    // the pit lane (e.g. during a red flag) would never show in_pit=true there.
    //
    // Snapshot vs incremental distinction matters here:
    // - Incremental (isSnapshot=false): absent InPit means "no change" — only
    //   update when the field is explicitly present.
    // - Snapshot (isSnapshot=true): the payload is the complete current state.
    //   An absent InPit means the car is NOT in the pit — treat it as false.
    //   This prevents stale in_pit=true values from persisting across reconnects
    //   (e.g. after a red flag where all cars pitted, then the race restarted
    //   but some InPit:false updates were missed during a brief disconnect).
    if (driverData.InPit === true) {
      entry.in_pit = true;
      entry.is_pit_out_lap = false; // entering pit again cancels any prior pit-out state
      changed = true;
    } else if (driverData.InPit === false || driverData.PitOut === true) {
      entry.in_pit = false;
      if (driverData.PitOut === true) {
        // Driver just exited the pit — show OUT badge immediately.
        // MQTT v1/laps will eventually overwrite this when the pit-out lap completes.
        entry.is_pit_out_lap = true;
      }
      changed = true;
    } else if (isSnapshot && entry.in_pit) {
      // Snapshot is authoritative: car not shown as InPit:true → must be on track.
      entry.in_pit = false;
      changed = true;
    }

    // KnockedOut — driver eliminated from qualifying (Q1/Q2 cutoff).
    // SignalR sets this to true once the segment ends and the driver didn't advance.
    if (driverData.KnockedOut === true) {
      entry.knocked_out = true;
      changed = true;
    } else if (driverData.KnockedOut === false) {
      entry.knocked_out = false;
      changed = true;
    }

    // Retired — driver has stopped/retired from the race.
    if (driverData.Retired === true) {
      entry.retired = true;
      changed = true;
    } else if (driverData.Retired === false) {
      entry.retired = false;
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

/**
 * TimingStats — personal best sector times per driver.
 * Lines[num].BestSectors[0/1/2].Value contains the driver's best time for that sector.
 */
function processTimingStats(data) {
  if (!currentStateRef || !data?.Lines) return;

  let changed = false;

  for (const [driverNum, driverData] of Object.entries(data.Lines)) {
    if (!driverData || typeof driverData !== "object") continue;

    const num = String(driverNum);
    const entry = ensureTimingEntry(currentStateRef, num);

    const bestSectors = driverData.BestSectors;
    if (bestSectors && typeof bestSectors === "object") {
      for (const [sectorIdxStr, sectorData] of Object.entries(bestSectors)) {
        if (!sectorData || typeof sectorData !== "object") continue;
        const sIdx = parseInt(sectorIdxStr, 10); // 0, 1, or 2
        if (isNaN(sIdx) || sIdx < 0 || sIdx > 2) continue;
        const key = `best_sector_${sIdx + 1}`; // best_sector_1/2/3
        if (sectorData.Value !== undefined) {
          const seconds = parseF1Time(sectorData.Value);
          if (seconds != null) {
            entry[key] = seconds;
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
 * LapCount — current and total laps for Race/Sprint sessions.
 * Format: { CurrentLap: 24, TotalLaps: 68 }
 */
function processLapCount(data) {
  if (!currentStateRef || !data) return;
  const current = data.CurrentLap ?? data.currentLap;
  const total = data.TotalLaps ?? data.totalLaps;
  if (current != null || total != null) {
    if (!currentStateRef.lap_count)
      currentStateRef.lap_count = { current: 0, total: 0 };
    if (current != null) currentStateRef.lap_count.current = current;
    if (total != null) currentStateRef.lap_count.total = total;
    if (broadcastFn) broadcastFn("update", currentStateRef);
  }
}

function handleFeedMessage(topic, data, isSnapshot = false) {
  if (topic === "TimingData") processTimingData(data, isSnapshot);
  else if (topic === "TimingStats") processTimingStats(data);
  else if (topic === "TrackStatus") processTrackStatus(data);
  else if (topic === "ExtrapolatedClock") processExtrapolatedClock(data);
  else if (topic === "LapCount") processLapCount(data);
}

// ── Connection ───────────────────────────────────────────────────────────────

async function connect() {
  if (!isRunning) return;

  const token = process.env.F1_LIVETIMING_TOKEN;
  if (!token) {
    // No token → nothing to connect to (the classic endpoint is dead). Don't
    // reconnect-spam; the dashboard falls back to MQTT and shows the degraded
    // banner until a token is provided.
    console.warn(
      "[signalr] F1_LIVETIMING_TOKEN not set — F1 live timing unavailable (feed gated by F1 since 2025). Skipping SignalR.",
    );
    return;
  }

  try {
    const authQS = `authToken=${encodeURIComponent(token)}`;

    // Step 1: Negotiate (POST). Returns a connectionToken AND sets AWSALB sticky
    // cookies. The WebSocket MUST send those cookies back, or the load balancer
    // routes it to a different backend that doesn't know our connectionToken → 404.
    const negRes = await fetch(`${NEGOTIATE_URL}&${authQS}`, {
      method: "POST",
      headers: COMMON_HEADERS,
    });
    if (negRes.status === 401) {
      // Token missing/expired. Manual refresh required — back off long instead
      // of hammering every 5s.
      console.error(
        "[signalr] Negotiate 401 — F1_LIVETIMING_TOKEN expired or invalid. Refresh it from your browser (see proxy/.env.example). Backing off 5 min.",
      );
      if (isRunning) scheduleReconnect(300000);
      return;
    }
    if (!negRes.ok) throw new Error(`Negotiate failed: ${negRes.status}`);

    const neg = await negRes.json();
    const connToken = neg.connectionToken;
    if (!connToken) throw new Error("No connectionToken in negotiate response");

    const setCookies = negRes.headers.getSetCookie
      ? negRes.headers.getSetCookie()
      : [negRes.headers.get("set-cookie")].filter(Boolean);
    const stickyCookie = setCookies.map((c) => c.split(";")[0]).join("; ");

    // Step 2: Open WebSocket with the sticky cookie + auth token.
    const wsUrl = `${WS_BASE}?id=${encodeURIComponent(connToken)}&${authQS}`;
    ws = new WebSocket(wsUrl, {
      headers: { ...COMMON_HEADERS, Cookie: stickyCookie },
    });

    ws.on("open", () => {
      // SignalR Core handshake must be the very first frame.
      ws.send(JSON.stringify({ protocol: "json", version: 1 }) + RS);

      // Subscribe to the streaming topics (hub method "Subscribe").
      ws.send(
        JSON.stringify({
          type: 1,
          invocationId: "0",
          target: "Subscribe",
          arguments: [SUBSCRIBE_TOPICS],
        }) + RS,
      );

      console.log("[signalr] Connected to F1 live timing (SignalR Core)");

      // Application-level keepalive: SignalR Core drops the connection if the
      // server receives nothing within its client-timeout window (~30s).
      clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 6 }) + RS);
        }
      }, 15000);
    });

    ws.on("message", (raw) => {
      // A single frame may pack multiple RS-delimited messages.
      for (const part of raw.toString().split(RS)) {
        if (!part) continue;
        let msg;
        try {
          msg = JSON.parse(part);
        } catch {
          continue;
        }

        if (msg.type === 1 && Array.isArray(msg.arguments)) {
          // Invocation = live feed. arguments = [topic, data, timestamp].
          handleFeedMessage(msg.arguments[0], msg.arguments[1]);
        } else if (
          msg.type === 3 &&
          msg.result &&
          typeof msg.result === "object"
        ) {
          // Completion of our Subscribe: result is the full initial snapshot,
          // keyed by topic. Treat as authoritative (isSnapshot=true) so absent
          // InPit clears stale state from a previous connection cycle.
          for (const [topic, data] of Object.entries(msg.result)) {
            if (data && typeof data === "object") {
              console.log(`[signalr] Snapshot: ${topic}`);
              handleFeedMessage(topic, data, true);
            }
          }
        } else if (msg.type === 7) {
          // Server-initiated close.
          console.log(`[signalr] Server close: ${msg.error || "(no reason)"}`);
        } else if (msg.error && msg.type === undefined) {
          // Handshake response is `{}` on success or `{error}` on failure.
          console.error(`[signalr] Handshake error: ${msg.error}`);
        }
        // type 6 (ping) and the empty handshake ack are ignored.
      }
    });

    ws.on("close", (code) => {
      console.log(`[signalr] Disconnected (${code})`);
      clearInterval(pingInterval);
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
  clearInterval(pingInterval);
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

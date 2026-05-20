/**
 * OpenF1 Real-time Client (Paid tier)
 *
 * Connects to OpenF1's WebSocket for live session data.
 * Batches high-frequency location/car_data at 250ms to avoid flooding SSE clients.
 *
 * Environment variables required:
 *   OPENF1_WS_URL   - WebSocket endpoint (e.g. wss://api.openf1.org/v1/stream)
 *   OPENF1_API_KEY  - API key for the paid tier
 *
 * TODO: Update parseMessage() and SUBSCRIBE_MESSAGE once the API docs arrive
 *       with the confirmed WebSocket message format and subscription payload.
 */

import WebSocket from "ws";
import { EventEmitter } from "events";

const WS_URL = process.env.OPENF1_WS_URL;
const API_KEY = process.env.OPENF1_API_KEY;

// How often to flush the batched location/car_data updates to SSE clients
const LOCATION_BATCH_MS = 250;

class OpenF1Client extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 20;
    this.reconnectDelay = 5000;

    // Raw state in our broadcast format (mirrors SignalR shape where compatible)
    this.state = {};

    // Buffer for high-frequency location + car_data updates
    this.locationBuffer = {}; // { driverNumber: { x, y } }
    this.carDataBuffer = {}; // { driverNumber: { speed, drs, n_gear, throttle, brake } }
    this.locationBatchTimer = null;
  }

  connect() {
    if (!WS_URL) {
      console.error("[OpenF1] OPENF1_WS_URL not set — cannot connect");
      return;
    }
    if (!API_KEY) {
      console.warn("[OpenF1] OPENF1_API_KEY not set — connecting without auth");
    }

    console.log(`[OpenF1] Connecting to ${WS_URL}...`);

    this.ws = new WebSocket(WS_URL, {
      headers: {
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
      },
    });

    this.ws.on("open", () => {
      console.log("[OpenF1] Connected");
      this.isConnected = true;
      this.reconnectAttempts = 0;

      // Subscribe to the data streams we need
      // TODO: update this payload to match OpenF1's actual subscription format
      this.ws.send(JSON.stringify(SUBSCRIBE_MESSAGE));
    });

    this.ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.parseMessage(msg);
      } catch {
        // ignore malformed frames
      }
    });

    this.ws.on("close", (code) => {
      console.log(`[OpenF1] Connection closed (${code})`);
      this.isConnected = false;
      this.stopLocationBatch();
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error("[OpenF1] WS error:", err.message);
    });
  }

  // ---------------------------------------------------------------------------
  // TODO: replace the body of this function once we have the API docs.
  // Expected shape (guessing based on REST format):
  //   { type: "location", data: [{driver_number, x, y, z, date}, ...] }
  //   { type: "position", data: [{driver_number, position, date}, ...] }
  //   { type: "intervals", data: [{driver_number, gap_to_leader, interval, date}, ...] }
  //   { type: "laps", data: [{driver_number, lap_number, lap_duration, ...}, ...] }
  //   { type: "stints", data: [{driver_number, compound, tyre_age_at_start, lap_start, ...}, ...] }
  //   { type: "race_control", data: [{message, flag, category, lap_number, date}, ...] }
  //   { type: "team_radio", data: [{driver_number, recording_url, date}, ...] }
  //   { type: "car_data", data: [{driver_number, speed, drs, n_gear, throttle, brake, date}, ...] }
  //   { type: "session", data: {session_name, session_type, ...} }
  //   { type: "drivers", data: [{driver_number, name_acronym, full_name, team_name, team_colour}, ...] }
  // ---------------------------------------------------------------------------
  parseMessage(msg) {
    const { type, data } = msg;
    if (!type || !data) return;

    switch (type) {
      case "location":
        this.handleLocation(data);
        break;
      case "car_data":
        this.handleCarData(data);
        break;
      case "position":
        this.handlePosition(data);
        break;
      case "intervals":
        this.handleIntervals(data);
        break;
      case "laps":
        this.handleLaps(data);
        break;
      case "stints":
        this.handleStints(data);
        break;
      case "race_control":
        this.handleRaceControl(data);
        break;
      case "team_radio":
        this.handleTeamRadio(data);
        break;
      case "session":
        this.handleSession(data);
        break;
      case "drivers":
        this.handleDrivers(data);
        break;
    }
  }

  // High-frequency — buffer and batch
  handleLocation(entries) {
    for (const entry of entries) {
      const num = String(entry.driver_number);
      this.locationBuffer[num] = { x: entry.x, y: entry.y };
    }
    this.ensureLocationBatch();
  }

  // High-frequency — buffer and batch
  handleCarData(entries) {
    for (const entry of entries) {
      const num = String(entry.driver_number);
      this.carDataBuffer[num] = {
        speed: entry.speed,
        drs: entry.drs,
        n_gear: entry.n_gear,
        throttle: entry.throttle,
        brake: entry.brake,
      };
    }
    // Flushed together with location in the batch timer
  }

  ensureLocationBatch() {
    if (this.locationBatchTimer) return;
    this.locationBatchTimer = setTimeout(() => {
      this.flushLocationBatch();
    }, LOCATION_BATCH_MS);
  }

  flushLocationBatch() {
    this.locationBatchTimer = null;

    if (
      Object.keys(this.locationBuffer).length === 0 &&
      Object.keys(this.carDataBuffer).length === 0
    )
      return;

    const update = {};

    if (Object.keys(this.locationBuffer).length > 0) {
      update.CarLocations = { ...this.locationBuffer };
      this.locationBuffer = {};
    }

    if (Object.keys(this.carDataBuffer).length > 0) {
      update.CarData = { ...this.carDataBuffer };
      this.carDataBuffer = {};
    }

    this.mergeState(update);
    this.emit("update", update);
  }

  stopLocationBatch() {
    if (this.locationBatchTimer) {
      clearTimeout(this.locationBatchTimer);
      this.locationBatchTimer = null;
    }
  }

  // Low-frequency updates — emit immediately
  handlePosition(entries) {
    if (!this.state.TimingData) this.state.TimingData = { Lines: {} };

    const lines = {};
    for (const entry of entries) {
      const num = String(entry.driver_number);
      if (!this.state.TimingData.Lines[num])
        this.state.TimingData.Lines[num] = {};
      this.state.TimingData.Lines[num].Line = entry.position;
      this.state.TimingData.Lines[num].Position = String(entry.position);
      lines[num] = { Line: entry.position, Position: String(entry.position) };
    }

    const update = { TimingData: { Lines: lines } };
    this.emit("update", update);
  }

  handleIntervals(entries) {
    if (!this.state.TimingData) this.state.TimingData = { Lines: {} };

    const lines = {};
    for (const entry of entries) {
      const num = String(entry.driver_number);
      const isLeader = entry.gap_to_leader === 0 || entry.gap_to_leader == null;
      const gap = isLeader ? "" : `+${entry.gap_to_leader?.toFixed(3)}`;
      const interval =
        entry.interval != null ? `+${entry.interval.toFixed(3)}` : "";

      if (!this.state.TimingData.Lines[num])
        this.state.TimingData.Lines[num] = {};
      this.state.TimingData.Lines[num].GapToLeader = gap;
      this.state.TimingData.Lines[num].IntervalToPositionAhead = {
        Value: interval,
      };

      lines[num] = {
        GapToLeader: gap,
        IntervalToPositionAhead: { Value: interval },
      };
    }

    const update = { TimingData: { Lines: lines } };
    this.emit("update", update);
  }

  handleLaps(entries) {
    if (!this.state.TimingData) this.state.TimingData = { Lines: {} };

    const lines = {};
    for (const entry of entries) {
      const num = String(entry.driver_number);
      if (!this.state.TimingData.Lines[num])
        this.state.TimingData.Lines[num] = {};

      const lapTime = entry.lap_duration ? formatLapTime(entry.lap_duration) : null;
      const s1 = formatSectorTime(entry.duration_sector_1);
      const s2 = formatSectorTime(entry.duration_sector_2);
      const s3 = formatSectorTime(entry.duration_sector_3);

      if (lapTime) {
        this.state.TimingData.Lines[num].LastLapTime = { Value: lapTime };
      }
      if (entry.lap_number) {
        this.state.TimingData.Lines[num].NumberOfLaps = entry.lap_number;
      }

      lines[num] = {
        ...(lapTime ? { LastLapTime: { Value: lapTime } } : {}),
        ...(entry.lap_number ? { NumberOfLaps: entry.lap_number } : {}),
        Sectors: {
          0: { Value: s1 || "" },
          1: { Value: s2 || "" },
          2: { Value: s3 || "" },
        },
      };
    }

    const update = { TimingData: { Lines: lines } };
    this.emit("update", update);
  }

  handleStints(entries) {
    if (!this.state.TimingAppData) this.state.TimingAppData = { Lines: {} };

    const lines = {};
    for (const entry of entries) {
      const num = String(entry.driver_number);
      if (!this.state.TimingAppData.Lines[num])
        this.state.TimingAppData.Lines[num] = { Stints: [] };

      const stintIndex = (entry.stint_number || 1) - 1;
      const stints = [...(this.state.TimingAppData.Lines[num].Stints || [])];

      stints[stintIndex] = {
        Compound: (entry.compound || "UNKNOWN").toUpperCase(),
        TotalLaps:
          entry.lap_end != null
            ? entry.lap_end - entry.lap_start
            : stints[stintIndex]?.TotalLaps || 0,
        New: entry.tyre_age_at_start === 0 ? "true" : "false",
        StartLaps: entry.tyre_age_at_start || 0,
      };

      this.state.TimingAppData.Lines[num].Stints = stints;
      lines[num] = { Stints: stints };
    }

    const update = { TimingAppData: { Lines: lines } };
    this.emit("update", update);
  }

  handleRaceControl(entries) {
    if (!this.state.RaceControlMessages)
      this.state.RaceControlMessages = { Messages: [] };

    const newMessages = entries
      .filter((m) => m.message)
      .map((m) => ({
        Utc: m.date,
        Message: m.message,
        Category: m.category || "Other",
        Flag: m.flag || "",
        Lap: m.lap_number,
        RacingNumber: m.driver_number ? String(m.driver_number) : undefined,
        Sector: m.sector,
      }));

    if (newMessages.length === 0) return;

    this.state.RaceControlMessages.Messages.push(...newMessages);

    // Update track status from latest flag
    const lastFlagMsg = [...newMessages].reverse().find((m) => m.Flag);
    if (lastFlagMsg) {
      const flag = lastFlagMsg.Flag;
      if (flag === "GREEN") this.state.TrackStatus = { Status: "1", Message: "AllClear" };
      else if (flag === "YELLOW") this.state.TrackStatus = { Status: "2", Message: "Yellow" };
      else if (flag === "RED") this.state.TrackStatus = { Status: "5", Message: "Red" };
      else if (flag === "SC") this.state.TrackStatus = { Status: "4", Message: "SC Deployed" };
      else if (flag === "VSC") this.state.TrackStatus = { Status: "6", Message: "VSC Deployed" };
      else if (flag === "CHEQUERED") this.state.TrackStatus = { Status: "7", Message: "Chequered" };
    }

    const update = {
      RaceControlMessages: { Messages: newMessages },
      ...(lastFlagMsg ? { TrackStatus: this.state.TrackStatus } : {}),
    };
    this.emit("update", update);

    for (const msg of newMessages) {
      console.log(`[OpenF1] Race Control: ${msg.Message}`);
    }
  }

  handleTeamRadio(entries) {
    if (!this.state.TeamRadio) this.state.TeamRadio = { Captures: [] };

    const newCaptures = entries
      .filter((r) => r.recording_url)
      .map((r) => ({
        Utc: r.date,
        RacingNumber: String(r.driver_number),
        Path: r.recording_url,
      }));

    if (newCaptures.length === 0) return;

    this.state.TeamRadio.Captures.push(...newCaptures);

    const update = { TeamRadio: { Captures: newCaptures } };
    this.emit("update", update);
  }

  handleSession(data) {
    const session = Array.isArray(data) ? data[0] : data;
    if (!session) return;

    this.state.SessionInfo = {
      Meeting: {
        Name: session.meeting_name || "Grand Prix",
        Circuit: {
          ShortName: session.circuit_short_name || "",
          Key: session.circuit_key,
        },
        Country: {
          Name: session.country_name || "",
          Code: session.country_code || "",
        },
      },
      Name: session.session_name,
      Type: session.session_type,
      StartDate: session.date_start,
      EndDate: session.date_end,
    };

    const update = { SessionInfo: this.state.SessionInfo };
    this.emit("update", update);
    console.log(`[OpenF1] Session: ${session.session_name} at ${session.circuit_short_name}`);
  }

  handleDrivers(entries) {
    if (!this.state.DriverList) this.state.DriverList = {};

    for (const driver of entries) {
      const num = String(driver.driver_number);
      this.state.DriverList[num] = {
        Tla: driver.name_acronym,
        FullName: driver.full_name,
        TeamName: driver.team_name,
        TeamColour: driver.team_colour || "FFFFFF",
        RacingNumber: num,
      };
    }

    const update = { DriverList: { ...this.state.DriverList } };
    this.emit("update", update);
    console.log(`[OpenF1] Drivers: ${entries.length}`);
  }

  mergeState(update) {
    for (const key of Object.keys(update)) {
      if (
        update[key] !== null &&
        typeof update[key] === "object" &&
        !Array.isArray(update[key])
      ) {
        if (!this.state[key] || typeof this.state[key] !== "object") {
          this.state[key] = {};
        }
        deepMerge(this.state[key], update[key]);
      } else {
        this.state[key] = update[key];
      }
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[OpenF1] Max reconnect attempts reached");
      this.emit("failed");
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 60000);
    console.log(`[OpenF1] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(), delay);
  }

  disconnect() {
    this.stopLocationBatch();
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }
    this.isConnected = false;
  }

  getState() {
    return this.state;
  }
}

// Subscription payload — update when API docs arrive
const SUBSCRIBE_MESSAGE = {
  // TODO: confirm the subscription format with OpenF1 docs
  action: "subscribe",
  streams: [
    "location",
    "car_data",
    "position",
    "intervals",
    "laps",
    "stints",
    "race_control",
    "team_radio",
    "session",
    "drivers",
  ],
};

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      if (!target[key] || typeof target[key] !== "object") {
        target[key] = {};
      }
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}

function formatSectorTime(seconds) {
  if (!seconds || seconds > 60) return null;
  return seconds.toFixed(3);
}

function formatLapTime(seconds) {
  if (!seconds || seconds > 300) return null;
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(3).padStart(6, "0");
  return `${mins}:${secs}`;
}

// Singleton
let client = null;

export function startOpenF1Client(onUpdate) {
  if (client) client.disconnect();

  client = new OpenF1Client();

  client.on("update", (update) => {
    if (onUpdate) onUpdate(update, client.getState());
  });

  client.on("failed", () => {
    console.error("[OpenF1] Client permanently failed — check API key and URL");
  });

  client.connect();
  return client;
}

export function stopOpenF1Client() {
  if (client) {
    client.disconnect();
    client = null;
  }
}

export function getOpenF1State() {
  return client ? client.getState() : {};
}

export function isOpenF1Connected() {
  return client ? client.isConnected : false;
}

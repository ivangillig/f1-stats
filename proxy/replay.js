/**
 * F1 Race Replay Module - Incremental Polling
 *
 * Replays real race data from OpenF1 API using incremental time-based queries.
 * Instead of loading all data upfront, we poll the API every few seconds
 * simulating how a live session would work.
 *
 * Session priority: latest completed race from OpenF1 > REPLAY_SESSION_KEY env var > Baku 2024 (fallback).
 */

import { ensureValidToken, hasMQTTCredentials } from "./mqtt-client.js";
import {
  ensureTimingEntry,
  updateBestLap,
  flagToTrackStatus,
  detectSafetyCar,
} from "./state-utils.js";

// Session key — resolved at startup: latest race from OpenF1 > env var override > Baku 2024
let SESSION_KEY = 0;
const ENV_SESSION_KEY = parseInt(process.env.REPLAY_SESSION_KEY || "0");
let CIRCUIT_KEY = null; // Loaded from API at startup
let TOTAL_LAPS = 70; // Default; updated from lap data as race progresses

// Replay speed multiplier (1x = real-time, 10x = 10 seconds per real second)
const REPLAY_SPEED = 1;

// 6 requests per cycle (pos, intervals, laps, location, race_control, team_radio).
// Uses recursive setTimeout (not setInterval) so cycles never overlap.
// Paid limit: 60 req/min = 1 req/s sustained. To avoid burst 429s we space
//   requests at 800ms each: 6×0.8s = 4.8s for requests + 6s gap = ~10.8s/cycle → ~33 req/min
// Free limit: 30 req/min = 0.5 req/s. 6×1.8s = 10.8s + 4s gap = ~15s/cycle → ~24 req/min
const PAID_POLL_INTERVAL_MS = 6000;
const FREE_POLL_INTERVAL_MS = 4000;
const PAID_REQUEST_DELAY_MS = 800;
const FREE_REQUEST_DELAY_MS = 1800;

// Set at startReplay() based on whether credentials are available
let POLL_INTERVAL_MS = FREE_POLL_INTERVAL_MS;
let REQUEST_DELAY_MS = FREE_REQUEST_DELAY_MS;
let POLL_WINDOW_SECONDS = 8 * REPLAY_SPEED;

// API base URL
const API_BASE = "https://api.openf1.org/v1";

// State
let replayInterval = null;
let broadcastFn = null;
let currentStateRef = null;
let replayStarted = false;
let sessionData = null;
let driversData = [];
let raceStartTime = null; // Actual race start time (UTC)
let replayStartRealTime = null; // When we started the replay (local time)
let lastPollTime = null; // Last race time we polled up to

// Pit stop windows loaded at startup: { "driverNum": [{ entryMs, exitMs }] }
const pitData = {};

// Stint data loaded at startup: { "driverNum": [{ compound, lap_start, lap_end, tyre_age_at_start }] }
const stintsData = {};

// Fetch with error handling and 429 retry backoff
async function fetchJSON(url, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const headers = {};
      if (hasMQTTCredentials()) {
        try {
          const token = await ensureValidToken();
          headers["Authorization"] = `Bearer ${token}`;
        } catch {
          // Fall through to unauthenticated request
        }
      }
      const response = await fetch(url, { headers });
      if (response.status === 429) {
        const delay = 2000 * (attempt + 1);
        console.warn(`[Replay] Rate limited, retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (response.status === 404) {
        return []; // No data in this time range — normal for narrow windows
      }
      if (!response.ok) {
        console.error(`[Replay] API error: ${response.status} for ${url}`);
        return [];
      }
      return await response.json();
    } catch (error) {
      const isLastAttempt = attempt >= retries;
      if (isLastAttempt) {
        console.error(
          `[Replay] Fetch failed after ${retries + 1} attempts: ${error.message} for ${url}`,
        );
        return [];
      }
      const delay = 2000 * (attempt + 1);
      console.warn(
        `[Replay] Transient error (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay / 1000}s: ${error.message}`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return [];
}

async function resolveSessionKey() {
  // 1. Try latest completed Race or Sprint from OpenF1
  try {
    const year = new Date().getFullYear();
    const sessions = await fetchJSON(
      `${API_BASE}/sessions?date_start>=${year - 1}-01-01`,
    );
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const completed = sessions.filter(
      (s) =>
        s.date_end &&
        new Date(s.date_end) < cutoff &&
        (s.session_type === "Race" || s.session_type === "Sprint"),
    );
    if (completed.length > 0) {
      const latest = completed[completed.length - 1];
      SESSION_KEY = latest.session_key;
      console.log(
        `[Replay] Latest ${latest.session_type}: ${latest.location} (session_key ${SESSION_KEY})`,
      );
      return;
    }
    console.warn(`[Replay] No completed Race/Sprint sessions found from OpenF1`);
  } catch (err) {
    console.warn(`[Replay] Could not resolve latest session: ${err.message}`);
  }
  // 2. Fall back to env var if set
  if (ENV_SESSION_KEY > 0) {
    SESSION_KEY = ENV_SESSION_KEY;
    console.log(`[Replay] Using session from env var: ${SESSION_KEY}`);
    return;
  }
  // 3. Hardcoded fallback: Baku 2024
  SESSION_KEY = 9598;
  console.log(`[Replay] Falling back to default session ${SESSION_KEY}`);
}

async function fetchSessionInfo() {
  console.log(`[Replay] Fetching session ${SESSION_KEY} from OpenF1...`);
  const sessions = await fetchJSON(
    `${API_BASE}/sessions?session_key=${SESSION_KEY}`,
  );
  if (!sessions || sessions.length === 0)
    throw new Error(`Session ${SESSION_KEY} not found in OpenF1`);
  const session = sessions[0];
  CIRCUIT_KEY = session.circuit_key;
  console.log(
    `[Replay] Session: ${session.location} — ${session.session_name} (circuit_key: ${CIRCUIT_KEY})`,
  );

  await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  const drivers = await fetchJSON(
    `${API_BASE}/drivers?session_key=${SESSION_KEY}`,
  );
  console.log(`[Replay] Drivers: ${drivers.length}`);

  return {
    session: {
      session_key: SESSION_KEY,
      meeting_key: session.meeting_key,
      session_name: session.session_name,
      session_type: session.session_type,
      location: session.location,
      circuit_short_name: session.circuit_short_name || session.location,
      circuit_key: CIRCUIT_KEY,
      country_name: session.country_name,
      country_code: session.country_code,
      date_start: session.date_start,
      date_end: null,
      meeting_name: session.meeting_name || session.location,
    },
    drivers,
  };
}

async function fetchStartingGrid() {
  const grid = await fetchJSON(
    `${API_BASE}/starting_grid?session_key=${SESSION_KEY}`,
  );
  const result = {};
  grid.forEach((g) => {
    if (g.driver_number && g.position)
      result[String(g.driver_number)] = g.position;
  });
  console.log(`[Replay] Starting grid: ${Object.keys(result).length} drivers`);
  return result;
}

async function findRaceStart(sessionDateStart) {
  // Use the earliest lap 1 date_start across all drivers — that's when lights went out.
  // Falls back to session date_start if no lap data yet.
  const laps = await fetchJSON(
    `${API_BASE}/laps?session_key=${SESSION_KEY}&lap_number=1`,
  );
  if (laps && laps.length > 0) {
    const dates = laps
      .map((l) => l.date_start && new Date(l.date_start).getTime())
      .filter(Boolean);
    if (dates.length > 0) {
      const start = new Date(Math.min(...dates));
      console.log(
        `[Replay] Race start (from lap 1 data): ${start.toISOString()}`,
      );
      return start;
    }
  }
  console.log(
    `[Replay] Race start (fallback to session date_start): ${sessionDateStart}`,
  );
  return new Date(sessionDateStart);
}

async function fetchPitData() {
  console.log(`[Replay] Loading pit stop data...`);
  const pits = await fetchJSON(`${API_BASE}/pit?session_key=${SESSION_KEY}`);
  // Clear before populating (in case of restart)
  Object.keys(pitData).forEach((k) => delete pitData[k]);
  pits.forEach((p) => {
    if (!p.date || !p.lane_duration) return;
    const num = String(p.driver_number);
    if (!pitData[num]) pitData[num] = [];
    pitData[num].push({
      entryMs: new Date(p.date).getTime(),
      exitMs: new Date(p.date).getTime() + p.lane_duration * 1000,
    });
  });
  console.log(
    `[Replay] Loaded ${pits.length} pit stops across ${Object.keys(pitData).length} drivers`,
  );
}

function isDriverInPit(driverNum, currentTime) {
  const stops = pitData[driverNum] || [];
  const now = currentTime.getTime();
  return stops.some((s) => now >= s.entryMs && now <= s.exitMs);
}

async function fetchStintData() {
  console.log(`[Replay] Loading stint/tire data...`);
  const stints = await fetchJSON(
    `${API_BASE}/stints?session_key=${SESSION_KEY}`,
  );
  Object.keys(stintsData).forEach((k) => delete stintsData[k]);
  stints.forEach((s) => {
    const num = String(s.driver_number);
    if (!stintsData[num]) stintsData[num] = [];
    stintsData[num].push({
      compound: s.compound ? s.compound.toUpperCase() : "UNKNOWN",
      lap_start: s.lap_start || 1,
      lap_end: s.lap_end || null,
      tyre_age_at_start: s.tyre_age_at_start || 0,
      stint_number: s.stint_number || 1,
    });
  });
  console.log(
    `[Replay] Loaded stints for ${Object.keys(stintsData).length} drivers`,
  );
}

// All weather records for the session, sorted by date ascending
let weatherRecords = [];

async function fetchAllWeather() {
  console.log(`[Replay] Loading weather data...`);
  const records = await fetchJSON(
    `${API_BASE}/weather?session_key=${SESSION_KEY}`,
  );
  weatherRecords = (records || []).sort(
    (a, b) => new Date(a.date) - new Date(b.date),
  );
  if (weatherRecords.length > 0) {
    const w = weatherRecords[0];
    console.log(
      `[Replay] Weather: ${weatherRecords.length} records. Start: ${w.air_temperature}°C air, ${w.track_temperature}°C track`,
    );
  }
}

function updateWeather(state, currentRaceTime) {
  if (weatherRecords.length === 0) return;
  const now = currentRaceTime.getTime();
  // Find the latest record at or before the current race time
  let latest = weatherRecords[0];
  for (const w of weatherRecords) {
    if (new Date(w.date).getTime() <= now) latest = w;
    else break;
  }
  state.weather = {
    air_temperature: latest.air_temperature,
    track_temperature: latest.track_temperature,
    humidity: latest.humidity,
    pressure: latest.pressure,
    rainfall: latest.rainfall,
    wind_speed: latest.wind_speed,
    wind_direction: latest.wind_direction,
  };
}

function updateActiveStints(state) {
  Object.keys(state.timing).forEach((num) => {
    const driverStints = stintsData[num];
    if (!driverStints || driverStints.length === 0) return;
    const currentLap = state.timing[num].lap_number || 1;
    const active = driverStints.find(
      (s) =>
        currentLap >= s.lap_start && (!s.lap_end || currentLap <= s.lap_end),
    );
    if (active) {
      state.timing[num].compound = active.compound;
      state.timing[num].tyre_age =
        Math.max(0, currentLap - active.lap_start) + active.tyre_age_at_start;
    }
  });
}

// Fetch incremental data for a time window — sequential to respect rate limits.
async function fetchTimeWindow(sessionKey, startTime, endTime) {
  const s = startTime.toISOString();
  const e = endTime.toISOString();
  const delay = () => new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));

  const positions = await fetchJSON(
    `${API_BASE}/position?session_key=${sessionKey}&date>=${s}&date<${e}`,
  );
  await delay();
  const intervals = await fetchJSON(
    `${API_BASE}/intervals?session_key=${sessionKey}&date>=${s}&date<${e}`,
  );
  await delay();
  const laps = await fetchJSON(
    `${API_BASE}/laps?session_key=${sessionKey}&date_start>=${s}&date_start<${e}`,
  );
  await delay();
  const locations = await fetchJSON(
    `${API_BASE}/location?session_key=${sessionKey}&date>=${s}&date<${e}`,
  );
  await delay();
  const raceControl = await fetchJSON(
    `${API_BASE}/race_control?session_key=${sessionKey}&date>=${s}&date<${e}`,
  );
  await delay();
  const teamRadio = await fetchJSON(
    `${API_BASE}/team_radio?session_key=${sessionKey}&date>=${s}&date<${e}`,
  );

  return { positions, intervals, laps, locations, raceControl, teamRadio };
}

// Build initial state structure
function buildInitialState(session, drivers, startingGrid) {
  const state = {
    session: {
      session_key: SESSION_KEY,
      session_name: session.session_name || session.session_type || "Race",
      session_type: session.session_type || "Race",
      circuit_key: session.circuit_key,
      circuit_short_name: session.circuit_short_name || session.location,
      country_name: session.country_name,
      country_code: session.country_code,
      date_start: session.date_start,
      date_end: null,
      location: session.location,
      meeting_name: session.meeting_name || session.location,
    },
    drivers: {},
    timing: {},
    location: {},
    lap_count: { current: 1, total: TOTAL_LAPS },
    track_status: { flag: "GREEN" },
    weather: null,
    race_control_messages: [],
    team_radio: [],
    clock: { remaining: "0:00:00", utc: new Date().toISOString() },
  };

  drivers.forEach((driver) => {
    const num = String(driver.driver_number);
    state.drivers[num] = {
      driver_number: driver.driver_number,
      name_acronym: driver.name_acronym,
      full_name: driver.full_name,
      team_name: driver.team_name,
      team_colour: driver.team_colour || "FFFFFF",
    };
    const entry = ensureTimingEntry(state, num);
    entry.position = startingGrid[num] || Object.keys(state.drivers).length;
  });

  return state;
}

// Process fetched data and update state
function processData(data, state) {
  const { positions, intervals, laps, locations, raceControl, teamRadio } =
    data;

  positions.forEach((pos) => {
    const num = String(pos.driver_number);
    const entry = ensureTimingEntry(state, num);
    entry.position = pos.position;
  });

  intervals.forEach((int) => {
    const num = String(int.driver_number);
    const entry = ensureTimingEntry(state, num);
    const gap = parseFloat(int.gap_to_leader);
    const isLeader = int.gap_to_leader === 0 || int.gap_to_leader == null;
    entry.gap_to_leader = isLeader ? null : !isNaN(gap) ? gap : null;
    if (isLeader) entry.position = 1;
    const ivl = parseFloat(int.interval);
    entry.interval = !isNaN(ivl) && int.interval !== 0 ? ivl : null;
  });

  laps.forEach((lap) => {
    const num = String(lap.driver_number);
    const entry = ensureTimingEntry(state, num);
    if (lap.lap_number > entry.lap_number) {
      entry.lap_number = lap.lap_number;
      if (lap.lap_number > state.lap_count.current) {
        state.lap_count.current = lap.lap_number;
      }
    }
    if (lap.lap_duration && lap.lap_duration < 150) {
      entry.last_lap = lap.lap_duration;
      entry.last_lap_is_pb = updateBestLap(
        entry,
        lap.lap_duration,
        lap.is_pit_out_lap,
      );
    }
    if (lap.duration_sector_1) entry.sector_1 = lap.duration_sector_1;
    if (lap.duration_sector_2) entry.sector_2 = lap.duration_sector_2;
    if (lap.duration_sector_3) entry.sector_3 = lap.duration_sector_3;
    if (lap.segments_sector_1) entry.segments_1 = lap.segments_sector_1;
    if (lap.segments_sector_2) entry.segments_2 = lap.segments_sector_2;
    if (lap.segments_sector_3) entry.segments_3 = lap.segments_sector_3;
    entry.is_pit_out_lap = lap.is_pit_out_lap || false;
  });

  // locations
  const latestLocations = {};
  locations.forEach((loc) => {
    const num = String(loc.driver_number);
    const t = new Date(loc.date).getTime();
    if (!latestLocations[num] || t > latestLocations[num].t) {
      latestLocations[num] = { t, x: loc.x, y: loc.y };
    }
  });
  Object.entries(latestLocations).forEach(([num, loc]) => {
    state.location[num] = { x: loc.x, y: loc.y };
  });

  // race control
  if (raceControl && raceControl.length > 0) {
    raceControl.forEach((msg) => {
      const msgId = `${msg.date}_${msg.message}`;
      const exists = state.race_control_messages.some(
        (m) => `${m.date}_${m.message}` === msgId,
      );
      if (!exists) {
        state.race_control_messages.push({
          date: msg.date,
          message: msg.message,
          flag: msg.flag || null,
          category: msg.category || "Other",
          scope: msg.scope || null,
          sector: msg.sector || null,
          driver_number: msg.driver_number || null,
          lap_number: msg.lap_number || null,
        });
        if (state.race_control_messages.length > 50) {
          state.race_control_messages = state.race_control_messages.slice(-50);
        }
        console.log(`[Replay] Race Control: ${msg.message}`);
      }
    });

    // Update track status from latest track-scope flag
    const lastFlagMsg = [...raceControl]
      .reverse()
      .find((m) => m.flag && m.scope === "Track");
    if (lastFlagMsg) {
      const flagStatus = flagToTrackStatus(lastFlagMsg.flag);
      if (flagStatus) state.track_status.flag = flagStatus;
    }
    // Safety car
    const lastSCMsg = [...raceControl]
      .reverse()
      .find((m) => m.category === "SafetyCar");
    if (lastSCMsg) {
      const sc = detectSafetyCar(lastSCMsg.message);
      if (sc) state.track_status.flag = sc;
    }
  }

  // team radio
  if (teamRadio && teamRadio.length > 0) {
    teamRadio.forEach((radio) => {
      const exists = state.team_radio.some(
        (r) => r.recording_url === radio.recording_url,
      );
      if (!exists) {
        state.team_radio.push({
          date: radio.date,
          driver_number: radio.driver_number,
          recording_url: radio.recording_url,
        });
        if (state.team_radio.length > 30) {
          state.team_radio = state.team_radio.slice(-30);
        }
        const driver = state.drivers[String(radio.driver_number)];
        console.log(
          `[Replay] Team Radio: ${driver?.name_acronym || radio.driver_number}`,
        );
      }
    });
  }

  return state;
}

// Start the replay
export async function startReplay(broadcast, stateRef) {
  if (replayStarted) {
    console.log("[Replay] Already running");
    return true;
  }

  replayStarted = true;
  broadcastFn = broadcast;
  currentStateRef = stateRef;

  // Use paid rate limits if credentials are available
  if (hasMQTTCredentials()) {
    POLL_INTERVAL_MS = PAID_POLL_INTERVAL_MS;
    REQUEST_DELAY_MS = PAID_REQUEST_DELAY_MS;
    POLL_WINDOW_SECONDS = (PAID_POLL_INTERVAL_MS / 1000) * REPLAY_SPEED;
    console.log(
      `[Replay] Paid tier detected — using ${POLL_INTERVAL_MS}ms interval`,
    );
  } else {
    POLL_INTERVAL_MS = FREE_POLL_INTERVAL_MS;
    REQUEST_DELAY_MS = FREE_REQUEST_DELAY_MS;
    POLL_WINDOW_SECONDS = (FREE_POLL_INTERVAL_MS / 1000) * REPLAY_SPEED;
    console.log(`[Replay] Free tier — using ${POLL_INTERVAL_MS}ms interval`);
  }

  const startupDelay = () =>
    new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));

  try {
    // Resolve which session to replay (env override or latest race from OpenF1)
    await resolveSessionKey();
    await startupDelay();

    // Sequential startup fetches with delays to stay within rate limits
    const sessionInfo = await fetchSessionInfo();
    await startupDelay();
    const startingGrid = await fetchStartingGrid();
    await startupDelay();
    await fetchPitData();
    await startupDelay();
    await fetchStintData();
    await startupDelay();
    await fetchAllWeather();
    await startupDelay();

    const { session, drivers } = sessionInfo;
    sessionData = session;
    driversData = drivers;

    raceStartTime = await findRaceStart(session.date_start);

    // Build initial state with starting grid
    const initialState = buildInitialState(session, drivers, startingGrid);
    Object.assign(currentStateRef, initialState);

    // Apply initial tire compounds and weather
    updateActiveStints(currentStateRef);
    updateWeather(currentStateRef, raceStartTime);

    // Broadcast initial state
    broadcastFn("initial", currentStateRef);

    // Start polling
    replayStartRealTime = Date.now();
    lastPollTime = raceStartTime;

    console.log(`[Replay] Starting at ${REPLAY_SPEED}x speed`);
    console.log(
      `[Replay] Polling every ${POLL_INTERVAL_MS}ms for ${POLL_WINDOW_SECONDS}s windows`,
    );

    // Use recursive setTimeout so each cycle only starts after the previous completes,
    // preventing overlapping requests that blow the rate limit.
    const schedulePoll = async () => {
      if (!replayStarted) return;
      await pollAndBroadcast();
      if (replayStarted) {
        replayInterval = setTimeout(schedulePoll, POLL_INTERVAL_MS);
      }
    };

    // Do first poll immediately, then schedule subsequent ones
    await pollAndBroadcast();
    replayInterval = setTimeout(schedulePoll, POLL_INTERVAL_MS);

    console.log("[Replay] Replay started!");
    return true;
  } catch (error) {
    console.error("[Replay] Error starting replay:", error.message);
    replayStarted = false;
    return false;
  }
}

// Poll for new data and broadcast
async function pollAndBroadcast() {
  if (!replayStarted) return;

  // Calculate current race time based on real elapsed time
  const realElapsedMs = Date.now() - replayStartRealTime;
  const raceElapsedMs = realElapsedMs * REPLAY_SPEED;
  const currentRaceTime = new Date(raceStartTime.getTime() + raceElapsedMs);

  // Time window to fetch (from last poll to current)
  const windowStart = lastPollTime;
  const windowEnd = currentRaceTime;

  // Only fetch if we have a meaningful window
  if (windowEnd <= windowStart) return;

  // Fetch data for this time window
  const data = await fetchTimeWindow(SESSION_KEY, windowStart, windowEnd);

  // Log progress
  const raceSeconds = Math.floor(raceElapsedMs / 1000);
  const mins = Math.floor(raceSeconds / 60);
  const secs = raceSeconds % 60;
  const dataCount =
    data.positions.length +
    data.intervals.length +
    data.laps.length +
    data.locations.length +
    (data.raceControl?.length || 0) +
    (data.teamRadio?.length || 0);

  if (dataCount > 0) {
    console.log(
      `[Replay] ${mins}:${String(secs).padStart(2, "0")} - Fetched: ${
        data.positions.length
      } pos, ${data.intervals.length} int, ${data.laps.length} laps, ${
        data.locations.length
      } loc, ${data.raceControl?.length || 0} rc, ${
        data.teamRadio?.length || 0
      } radio`,
    );
  }

  // Process and update state
  processData(data, currentStateRef);

  // Update InPit per driver using /v1/pit time windows
  Object.keys(currentStateRef.timing).forEach((num) => {
    currentStateRef.timing[num].in_pit = isDriverInPit(num, currentRaceTime);
  });

  // Update active tire compound per driver based on current lap
  updateActiveStints(currentStateRef);

  // Update weather based on current race time
  updateWeather(currentStateRef, currentRaceTime);

  // Update clock
  const hours = Math.floor(raceSeconds / 3600);
  const minutes = Math.floor((raceSeconds % 3600) / 60);
  const seconds = raceSeconds % 60;
  currentStateRef.clock = {
    remaining: `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    utc: new Date().toISOString(),
  };

  // Broadcast update
  broadcastFn("update", {
    session: currentStateRef.session,
    drivers: currentStateRef.drivers,
    timing: currentStateRef.timing,
    location: currentStateRef.location,
    lap_count: currentStateRef.lap_count,
    track_status: currentStateRef.track_status,
    race_control_messages: currentStateRef.race_control_messages,
    team_radio: currentStateRef.team_radio,
    clock: currentStateRef.clock,
  });

  // Update last poll time
  lastPollTime = windowEnd;
}

// Stop replay
export function stopReplay() {
  if (replayInterval) {
    clearTimeout(replayInterval);
    replayInterval = null;
  }
  replayStarted = false;
  sessionData = null;
  driversData = [];
  raceStartTime = null;
  replayStartRealTime = null;
  lastPollTime = null;
  Object.keys(pitData).forEach((k) => delete pitData[k]);
  Object.keys(stintsData).forEach((k) => delete stintsData[k]);
  weatherRecords = [];
  console.log("[Replay] Replay stopped");
}

// Check if replay is running
export function isReplayRunning() {
  return replayStarted;
}

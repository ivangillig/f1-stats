/**
 * F1 Race Replay Module - Incremental Polling
 *
 * Replays real race data from OpenF1 API using incremental time-based queries.
 * Instead of loading all data upfront, we poll the API every few seconds
 * simulating how a live session would work.
 *
 * Azerbaijan GP 2024 (15 Sep 2024) - Session Key: 9598
 * Colapinto P8 - 4 points!
 */

import { ensureValidToken, hasMQTTCredentials } from "./mqtt-client.js";
import { ensureTimingEntry, updateBestLap, flagToTrackStatus, detectSafetyCar } from "./state-utils.js";

// Azerbaijan 2024 GP - Session Key (Colapinto P8!)
const SESSION_KEY = 9598;
const CIRCUIT_KEY = 144; // Baku
const TOTAL_LAPS = 51; // Azerbaijan GP has 51 laps

// Replay speed multiplier (1x = real-time, 10x = 10 seconds per real second)
const REPLAY_SPEED = 1;

// Paid tier doubles the rate limit (60 req/min, 6 req/s) vs free (30 req/min, 3 req/s).
// 4 requests per cycle → paid: 4s interval, free: 8s interval.
const PAID_POLL_INTERVAL_MS = 4000;
const FREE_POLL_INTERVAL_MS = 8000;
const PAID_REQUEST_DELAY_MS = 200;
const FREE_REQUEST_DELAY_MS = 1500;

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

// Static session data for Baku 2024 Race (session_key: 9598)
// Hardcoded to avoid hammering the OpenF1 free tier at startup
const STATIC_SESSION = {
  session_key: 9598,
  meeting_key: 1245,
  session_name: "Race",
  session_type: "Race",
  location: "Baku",
  circuit_short_name: "Baku",
  circuit_key: CIRCUIT_KEY,
  country_name: "Azerbaijan",
  country_code: "AZE",
  date_start: "2024-09-15T11:33:23+00:00", // Actual race green flag
};

const STATIC_DRIVERS = [
  {
    driver_number: 1,
    name_acronym: "VER",
    full_name: "Max Verstappen",
    team_name: "Red Bull Racing",
    team_colour: "3671C6",
  },
  {
    driver_number: 11,
    name_acronym: "PER",
    full_name: "Sergio Perez",
    team_name: "Red Bull Racing",
    team_colour: "3671C6",
  },
  {
    driver_number: 16,
    name_acronym: "LEC",
    full_name: "Charles Leclerc",
    team_name: "Ferrari",
    team_colour: "E8002D",
  },
  {
    driver_number: 55,
    name_acronym: "SAI",
    full_name: "Carlos Sainz",
    team_name: "Ferrari",
    team_colour: "E8002D",
  },
  {
    driver_number: 44,
    name_acronym: "HAM",
    full_name: "Lewis Hamilton",
    team_name: "Mercedes",
    team_colour: "27F4D2",
  },
  {
    driver_number: 63,
    name_acronym: "RUS",
    full_name: "George Russell",
    team_name: "Mercedes",
    team_colour: "27F4D2",
  },
  {
    driver_number: 4,
    name_acronym: "NOR",
    full_name: "Lando Norris",
    team_name: "McLaren",
    team_colour: "FF8000",
  },
  {
    driver_number: 81,
    name_acronym: "PIA",
    full_name: "Oscar Piastri",
    team_name: "McLaren",
    team_colour: "FF8000",
  },
  {
    driver_number: 14,
    name_acronym: "ALO",
    full_name: "Fernando Alonso",
    team_name: "Aston Martin",
    team_colour: "229971",
  },
  {
    driver_number: 18,
    name_acronym: "STR",
    full_name: "Lance Stroll",
    team_name: "Aston Martin",
    team_colour: "229971",
  },
  {
    driver_number: 10,
    name_acronym: "GAS",
    full_name: "Pierre Gasly",
    team_name: "Alpine",
    team_colour: "FF87BC",
  },
  {
    driver_number: 31,
    name_acronym: "OCO",
    full_name: "Esteban Ocon",
    team_name: "Alpine",
    team_colour: "FF87BC",
  },
  {
    driver_number: 23,
    name_acronym: "ALB",
    full_name: "Alexander Albon",
    team_name: "Williams",
    team_colour: "64C4FF",
  },
  {
    driver_number: 2,
    name_acronym: "SAR",
    full_name: "Logan Sargeant",
    team_name: "Williams",
    team_colour: "64C4FF",
  },
  {
    driver_number: 77,
    name_acronym: "BOT",
    full_name: "Valtteri Bottas",
    team_name: "Kick Sauber",
    team_colour: "52E252",
  },
  {
    driver_number: 24,
    name_acronym: "ZHO",
    full_name: "Guanyu Zhou",
    team_name: "Kick Sauber",
    team_colour: "52E252",
  },
  {
    driver_number: 20,
    name_acronym: "MAG",
    full_name: "Kevin Magnussen",
    team_name: "Haas F1 Team",
    team_colour: "B6BABD",
  },
  {
    driver_number: 27,
    name_acronym: "HUL",
    full_name: "Nico Hulkenberg",
    team_name: "Haas F1 Team",
    team_colour: "B6BABD",
  },
  {
    driver_number: 3,
    name_acronym: "RIC",
    full_name: "Daniel Ricciardo",
    team_name: "RB",
    team_colour: "6692FF",
  },
  {
    driver_number: 22,
    name_acronym: "TSU",
    full_name: "Yuki Tsunoda",
    team_name: "RB",
    team_colour: "6692FF",
  },
  {
    driver_number: 43,
    name_acronym: "COL",
    full_name: "Franco Colapinto",
    team_name: "Alpine",
    team_colour: "FF87BC",
  },
];

// Starting grid for Baku 2024 Race
const STATIC_STARTING_GRID = {
  16: 1,
  55: 2,
  44: 3,
  63: 4,
  1: 5,
  81: 6,
  4: 7,
  43: 8,
  14: 9,
  18: 10,
  11: 11,
  10: 12,
  31: 13,
  23: 14,
  77: 15,
  24: 16,
  20: 17,
  27: 18,
  3: 19,
  22: 20,
};

function fetchSessionInfo() {
  console.log(
    `[Replay] Using static session data for ${STATIC_SESSION.location}...`,
  );
  console.log(
    `[Replay] Session: ${STATIC_SESSION.location} - ${STATIC_SESSION.session_name}`,
  );
  console.log(`[Replay] Drivers: ${STATIC_DRIVERS.length}`);
  return Promise.resolve({ session: STATIC_SESSION, drivers: STATIC_DRIVERS });
}

function fetchStartingGrid() {
  console.log(
    `[Replay] Using static starting grid: ${Object.keys(STATIC_STARTING_GRID).length} drivers`,
  );
  return Promise.resolve(STATIC_STARTING_GRID);
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

// Fetch incremental data for a time window — sequential to respect rate limits.
// Skips location (not needed for timing board) and team_radio (low priority).
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
  const raceControl = await fetchJSON(
    `${API_BASE}/race_control?session_key=${sessionKey}&date>=${s}&date<${e}`,
  );

  return {
    positions,
    intervals,
    laps,
    locations: [],
    raceControl,
    teamRadio: [],
  };
}

// Build initial state structure
function buildInitialState(session, drivers, startingGrid) {
  const state = {
    session: {
      session_key: SESSION_KEY,
      session_name: session.session_name || session.session_type || "Race",
      session_type: "Race",
      circuit_key: CIRCUIT_KEY,
      circuit_short_name: session.circuit_short_name || session.location || "Baku",
      country_name: session.country_name || "Azerbaijan",
      country_code: session.country_code || "AZE",
      date_start: session.date_start,
      date_end: null,
      location: session.location || "Baku",
      meeting_name: session.meeting_name || "Azerbaijan Grand Prix",
    },
    drivers: {},
    timing: {},
    location: {},
    lap_count: { current: 1, total: TOTAL_LAPS },
    track_status: { flag: "GREEN" },
    weather: {
      air_temperature: 28,
      track_temperature: 35,
      humidity: 45,
      pressure: 1015,
      rainfall: false,
      wind_speed: 4.2,
      wind_direction: 180,
    },
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
    entry.position = startingGrid[num] || (Object.keys(state.drivers).length);
  });

  return state;
}

// Process fetched data and update state
function processData(data, state) {
  const { positions, intervals, laps, locations, raceControl, teamRadio } = data;

  positions.forEach((pos) => {
    const num = String(pos.driver_number);
    const entry = ensureTimingEntry(state, num);
    entry.position = pos.position;
  });

  intervals.forEach((int) => {
    const num = String(int.driver_number);
    const entry = ensureTimingEntry(state, num);
    const gap = parseFloat(int.gap_to_leader);
    entry.gap_to_leader = (int.gap_to_leader === 0 || int.gap_to_leader == null) ? null : (!isNaN(gap) ? gap : null);
    const ivl = parseFloat(int.interval);
    entry.interval = (!isNaN(ivl) && int.interval !== 0) ? ivl : null;
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
      entry.last_lap_is_pb = updateBestLap(entry, lap.lap_duration, lap.is_pit_out_lap);
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
      const exists = state.race_control_messages.some((m) => `${m.date}_${m.message}` === msgId);
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
    const lastFlagMsg = [...raceControl].reverse().find((m) => m.flag && m.scope === "Track");
    if (lastFlagMsg) {
      const flagStatus = flagToTrackStatus(lastFlagMsg.flag);
      if (flagStatus) state.track_status.flag = flagStatus;
    }
    // Safety car
    const lastSCMsg = [...raceControl].reverse().find((m) => m.category === "SafetyCar");
    if (lastSCMsg) {
      const sc = detectSafetyCar(lastSCMsg.message);
      if (sc) state.track_status.flag = sc;
    }
  }

  // team radio
  if (teamRadio && teamRadio.length > 0) {
    teamRadio.forEach((radio) => {
      const exists = state.team_radio.some((r) => r.recording_url === radio.recording_url);
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
        console.log(`[Replay] Team Radio: ${driver?.name_acronym || radio.driver_number}`);
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
    console.log(`[Replay] Paid tier detected — using ${POLL_INTERVAL_MS}ms interval`);
  } else {
    POLL_INTERVAL_MS = FREE_POLL_INTERVAL_MS;
    REQUEST_DELAY_MS = FREE_REQUEST_DELAY_MS;
    POLL_WINDOW_SECONDS = (FREE_POLL_INTERVAL_MS / 1000) * REPLAY_SPEED;
    console.log(`[Replay] Free tier — using ${POLL_INTERVAL_MS}ms interval`);
  }

  try {
    // Sequential fetches to avoid rate limiting (free tier: 3 req/s, 30 req/min)
    const sessionInfo = await fetchSessionInfo();
    const startingGrid = await fetchStartingGrid();
    await fetchPitData();

    const { session, drivers } = sessionInfo;
    sessionData = session;
    driversData = drivers;

    raceStartTime = new Date(session.date_start);
    console.log(`[Replay] Race start: ${raceStartTime.toISOString()}`);

    // Build initial state with starting grid
    const initialState = buildInitialState(session, drivers, startingGrid);
    Object.assign(currentStateRef, initialState);

    // Broadcast initial state
    broadcastFn("initial", currentStateRef);

    // Start polling
    replayStartRealTime = Date.now();
    lastPollTime = raceStartTime;

    console.log(`[Replay] Starting at ${REPLAY_SPEED}x speed`);
    console.log(
      `[Replay] Polling every ${POLL_INTERVAL_MS}ms for ${POLL_WINDOW_SECONDS}s windows`,
    );

    replayInterval = setInterval(async () => {
      await pollAndBroadcast();
    }, POLL_INTERVAL_MS);

    // Do first poll immediately
    await pollAndBroadcast();

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
    clearInterval(replayInterval);
    replayInterval = null;
  }
  replayStarted = false;
  sessionData = null;
  driversData = [];
  raceStartTime = null;
  replayStartRealTime = null;
  lastPollTime = null;
  Object.keys(pitData).forEach((k) => delete pitData[k]);
  console.log("[Replay] Replay stopped");
}

// Check if replay is running
export function isReplayRunning() {
  return replayStarted;
}

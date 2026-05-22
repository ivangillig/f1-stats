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

// Track best laps per driver
const driverBestLaps = {};
const driverBestSectors = {};

// Helper: format sector time
function formatSectorTime(seconds) {
  if (!seconds || seconds > 60) return null;
  return seconds.toFixed(3);
}

// Helper: format lap time (seconds to M:SS.sss)
function formatLapTime(seconds) {
  if (!seconds || seconds > 300) return null;
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(3).padStart(6, "0");
  return `${mins}:${secs}`;
}

// Helper: convert OpenF1 segment value to status
function getSegmentStatus(value) {
  if (value === 2051) return "OverallFastest";
  if (value === 2049) return "PersonalFastest";
  if (value === 2048) return "Completed";
  return null;
}

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
    SessionInfo: {
      Meeting: {
        Name: session.meeting_name || "Grand Prix",
        Circuit: {
          ShortName: session.circuit_short_name || "Baku",
          Key: CIRCUIT_KEY, // Use constant from top of file
        },
        Country: {
          Name: session.country_name || "Azerbaijan",
          Code: session.country_code || "AZE",
        },
      },
      Type: session.session_name,
    },
    LapCount: { CurrentLap: 1, TotalLaps: TOTAL_LAPS },
    TrackStatus: { Status: "1", Message: "AllClear" },
    WeatherData: {
      AirTemp: "28",
      Humidity: "45",
      Pressure: "1015",
      Rainfall: "0",
      TrackTemp: "35",
      WindDirection: "180",
      WindSpeed: "4.2",
    },
    ExtrapolatedClock: { Remaining: "0:00:00", Utc: new Date().toISOString() },
    DriverList: {},
    TimingData: { Lines: {} },
    TimingAppData: { Lines: {} },
    Position: { Position: {} },
    RaceControlMessages: { Messages: [] },
    TeamRadio: { Captures: [] },
  };

  // Initialize drivers with starting grid positions
  drivers.forEach((driver, index) => {
    const num = String(driver.driver_number);

    // Use starting grid position if available, otherwise use index + 1
    const gridPosition = startingGrid[num] || index + 1;

    state.DriverList[num] = {
      Tla: driver.name_acronym,
      FullName: driver.full_name,
      TeamName: driver.team_name,
      TeamColour: driver.team_colour || "FFFFFF",
      RacingNumber: num,
    };

    state.TimingData.Lines[num] = {
      Line: gridPosition,
      Position: String(gridPosition),
      GapToLeader: gridPosition === 1 ? "" : "---",
      IntervalToPositionAhead: { Value: gridPosition === 1 ? "" : "---" },
      LastLapTime: { Value: "" },
      BestLapTime: { Value: "" },
      NumberOfLaps: 0,
      Sectors: {
        0: { Value: "", Segments: [] },
        1: { Value: "", Segments: [] },
        2: { Value: "", Segments: [] },
      },
      InPit: false,
      PitOut: false,
      Retired: false,
    };

    state.TimingAppData.Lines[num] = {
      Stints: [{ Compound: "MEDIUM", TotalLaps: 0, New: "true", StartLaps: 0 }],
    };
  });

  return state;
}

// Process fetched data and update state
function processData(data, state) {
  const { positions, intervals, laps, locations, raceControl, teamRadio } =
    data;

  // Process positions
  positions.forEach((pos) => {
    const num = String(pos.driver_number);
    if (state.TimingData.Lines[num]) {
      state.TimingData.Lines[num].Line = pos.position;
      state.TimingData.Lines[num].Position = String(pos.position);
    }
  });

  // Process intervals
  intervals.forEach((int) => {
    const num = String(int.driver_number);
    if (state.TimingData.Lines[num]) {
      if (int.gap_to_leader === 0 || int.gap_to_leader == null) {
        state.TimingData.Lines[num].GapToLeader = "";
        state.TimingData.Lines[num].IntervalToPositionAhead = { Value: "" };
      } else {
        const gap = parseFloat(int.gap_to_leader);
        state.TimingData.Lines[num].GapToLeader = isNaN(gap) ? "" : `+${gap.toFixed(3)}`;
        const ivl = parseFloat(int.interval);
        state.TimingData.Lines[num].IntervalToPositionAhead = {
          Value: !isNaN(ivl) ? `+${ivl.toFixed(3)}` : "",
        };
      }
    }
  });

  // Process laps
  laps.forEach((lap) => {
    const num = String(lap.driver_number);
    if (!state.TimingData.Lines[num]) return;

    const line = state.TimingData.Lines[num];

    // Update lap count
    if (lap.lap_number > line.NumberOfLaps) {
      line.NumberOfLaps = lap.lap_number;

      // Update global lap count
      if (lap.lap_number > state.LapCount.CurrentLap) {
        state.LapCount.CurrentLap = lap.lap_number;
      }
    }

    // Update lap time
    if (lap.lap_duration && lap.lap_duration < 150) {
      line.LastLapTime = { Value: formatLapTime(lap.lap_duration) };

      // Track best lap
      if (!driverBestLaps[num] || lap.lap_duration < driverBestLaps[num]) {
        driverBestLaps[num] = lap.lap_duration;
        line.BestLapTime = { Value: formatLapTime(lap.lap_duration) };
      }
    }

    // Update sectors
    if (lap.duration_sector_1) {
      line.Sectors["0"] = {
        Value: formatSectorTime(lap.duration_sector_1),
        Segments: (lap.segments_sector_1 || [])
          .map(getSegmentStatus)
          .filter(Boolean),
      };
    }
    if (lap.duration_sector_2) {
      line.Sectors["1"] = {
        Value: formatSectorTime(lap.duration_sector_2),
        Segments: (lap.segments_sector_2 || [])
          .map(getSegmentStatus)
          .filter(Boolean),
      };
    }
    if (lap.duration_sector_3) {
      line.Sectors["2"] = {
        Value: formatSectorTime(lap.duration_sector_3),
        Segments: (lap.segments_sector_3 || [])
          .map(getSegmentStatus)
          .filter(Boolean),
      };
    }

    // Pit status
    line.InPit = lap.is_pit_out_lap || false;
    line.PitOut = lap.is_pit_out_lap || false;
  });

  // Process locations - get latest position per driver
  const latestLocations = {};
  locations.forEach((loc) => {
    const num = String(loc.driver_number);
    const time = new Date(loc.date).getTime();
    if (!latestLocations[num] || time > latestLocations[num].time) {
      latestLocations[num] = { time, x: loc.x, y: loc.y };
    }
  });

  // Update car positions
  Object.entries(latestLocations).forEach(([num, loc]) => {
    state.Position.Position[num] = { X: loc.x, Y: loc.y };
  });

  // Process race control messages
  if (raceControl && raceControl.length > 0) {
    raceControl.forEach((msg) => {
      // Only add messages that haven't been added yet
      const msgId = `${msg.date}_${msg.message}`;
      const exists = state.RaceControlMessages.Messages.some(
        (m) => `${m.Utc}_${m.Message}` === msgId,
      );
      if (!exists) {
        state.RaceControlMessages.Messages.push({
          Utc: msg.date,
          Category: msg.category || "Other",
          Message: msg.message,
          Flag: msg.flag || null,
          Scope: msg.scope || null,
          Sector: msg.sector || null,
          DriverNumber: msg.driver_number || null,
          LapNumber: msg.lap_number || null,
        });
        // Keep only last 50 messages
        if (state.RaceControlMessages.Messages.length > 50) {
          state.RaceControlMessages.Messages =
            state.RaceControlMessages.Messages.slice(-50);
        }
        console.log(`[Replay] Race Control: ${msg.message}`);
      }
    });

    // Update track status based on latest race control flag
    const lastFlagMsg = [...raceControl]
      .reverse()
      .find((m) => m.flag && m.scope === "Track");
    if (lastFlagMsg) {
      const flag = lastFlagMsg.flag.toUpperCase();
      if (flag === "GREEN") {
        state.TrackStatus = { Status: "1", Message: "AllClear" };
      } else if (flag === "YELLOW") {
        state.TrackStatus = { Status: "2", Message: "Yellow" };
      } else if (flag === "DOUBLE YELLOW") {
        state.TrackStatus = { Status: "2", Message: "Yellow" };
      } else if (flag === "RED") {
        state.TrackStatus = { Status: "5", Message: "Red" };
      } else if (flag === "CHEQUERED") {
        state.TrackStatus = { Status: "7", Message: "Chequered" };
      }
    }

    // Check for safety car
    const lastSCMsg = [...raceControl]
      .reverse()
      .find((m) => m.category === "SafetyCar");
    if (lastSCMsg) {
      if (lastSCMsg.message.includes("VIRTUAL SAFETY CAR")) {
        state.TrackStatus = { Status: "6", Message: "VSC Deployed" };
      } else if (lastSCMsg.message.includes("SAFETY CAR")) {
        state.TrackStatus = { Status: "4", Message: "SC Deployed" };
      }
    }
  }

  // Process team radio
  if (teamRadio && teamRadio.length > 0) {
    teamRadio.forEach((radio) => {
      // Only add radios that haven't been added yet
      const radioId = radio.recording_url;
      const exists = state.TeamRadio.Captures.some((r) => r.Path === radioId);
      if (!exists) {
        state.TeamRadio.Captures.push({
          Utc: radio.date,
          RacingNumber: String(radio.driver_number),
          Path: radio.recording_url,
        });
        // Keep only last 30 radios
        if (state.TeamRadio.Captures.length > 30) {
          state.TeamRadio.Captures = state.TeamRadio.Captures.slice(-30);
        }
        const driver = driversData.find(
          (d) => d.driver_number === radio.driver_number,
        );
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
    POLL_WINDOW_SECONDS = PAID_POLL_INTERVAL_MS / 1000 * REPLAY_SPEED;
    console.log(`[Replay] Paid tier detected — using ${POLL_INTERVAL_MS}ms interval`);
  } else {
    POLL_INTERVAL_MS = FREE_POLL_INTERVAL_MS;
    REQUEST_DELAY_MS = FREE_REQUEST_DELAY_MS;
    POLL_WINDOW_SECONDS = FREE_POLL_INTERVAL_MS / 1000 * REPLAY_SPEED;
    console.log(`[Replay] Free tier — using ${POLL_INTERVAL_MS}ms interval`);
  }

  try {
    // Sequential fetches to avoid rate limiting (free tier: 3 req/s, 30 req/min)
    const sessionInfo = await fetchSessionInfo();
    const startingGrid = await fetchStartingGrid();

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

  // Update clock
  const hours = Math.floor(raceSeconds / 3600);
  const minutes = Math.floor((raceSeconds % 3600) / 60);
  const seconds = raceSeconds % 60;
  currentStateRef.ExtrapolatedClock = {
    Remaining: `${hours}:${String(minutes).padStart(2, "0")}:${String(
      seconds,
    ).padStart(2, "0")}`,
    Utc: new Date().toISOString(),
  };

  // Broadcast update — always include DriverList and SessionInfo so clients
  // that reconnect mid-replay get driver info on the next cycle (not just initial)
  broadcastFn("update", {
    DriverList: currentStateRef.DriverList,
    SessionInfo: currentStateRef.SessionInfo,
    ExtrapolatedClock: currentStateRef.ExtrapolatedClock,
    LapCount: currentStateRef.LapCount,
    TrackStatus: currentStateRef.TrackStatus,
    TimingData: currentStateRef.TimingData,
    TimingAppData: currentStateRef.TimingAppData,
    Position: currentStateRef.Position,
    RaceControlMessages: currentStateRef.RaceControlMessages,
    TeamRadio: currentStateRef.TeamRadio,
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
  console.log("[Replay] Replay stopped");
}

// Check if replay is running
export function isReplayRunning() {
  return replayStarted;
}

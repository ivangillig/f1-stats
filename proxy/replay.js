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

// Azerbaijan 2024 GP - Session Key (Colapinto P8!)
const SESSION_KEY = 9598;
const CIRCUIT_KEY = 144; // Baku
const TOTAL_LAPS = 51; // Azerbaijan GP has 51 laps

// Replay speed multiplier (1x = real-time, 10x = 10 seconds per real second)
const REPLAY_SPEED = 1;

// Polling interval in milliseconds (how often we fetch new data)
const POLL_INTERVAL_MS = 1000;

// Time window for each poll (in seconds of race time)
const POLL_WINDOW_SECONDS = REPLAY_SPEED; // Match replay speed

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

// Fetch with error handling
async function fetchJSON(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[Replay] API error: ${response.status} for ${url}`);
      return [];
    }
    return await response.json();
  } catch (error) {
    console.error(`[Replay] Fetch error: ${error.message} for ${url}`);
    return [];
  }
}

// Fetch session and driver info (one-time at start)
async function fetchSessionInfo(sessionKey) {
  console.log(`[Replay] Fetching session info for ${sessionKey}...`);

  const [sessions, drivers] = await Promise.all([
    fetchJSON(`${API_BASE}/sessions?session_key=${sessionKey}`),
    fetchJSON(`${API_BASE}/drivers?session_key=${sessionKey}`),
  ]);

  const session = sessions[0];
  if (!session) {
    throw new Error("Session not found");
  }

  console.log(
    `[Replay] Session: ${session.location} - ${session.session_name}`
  );
  console.log(`[Replay] Drivers: ${drivers.length}`);

  return { session, drivers };
}

// Fetch incremental data for a time window
async function fetchTimeWindow(sessionKey, startTime, endTime) {
  const startISO = startTime.toISOString();
  const endISO = endTime.toISOString();

  // Build URLs with time filters
  const urls = [
    `${API_BASE}/position?session_key=${sessionKey}&date>=${startISO}&date<${endISO}`,
    `${API_BASE}/intervals?session_key=${sessionKey}&date>=${startISO}&date<${endISO}`,
    `${API_BASE}/laps?session_key=${sessionKey}&date_start>=${startISO}&date_start<${endISO}`,
    `${API_BASE}/location?session_key=${sessionKey}&date>=${startISO}&date<${endISO}`,
    `${API_BASE}/race_control?session_key=${sessionKey}&date>=${startISO}&date<${endISO}`,
    `${API_BASE}/team_radio?session_key=${sessionKey}&date>=${startISO}&date<${endISO}`,
  ];

  // Fetch all in parallel
  const [positions, intervals, laps, locations, raceControl, teamRadio] =
    await Promise.all(urls.map(fetchJSON));

  return { positions, intervals, laps, locations, raceControl, teamRadio };
}

// Get race start time (first lap start or first position data)
async function getRaceStartTime(sessionKey) {
  // Get first position entry to find race start
  const positions = await fetchJSON(
    `${API_BASE}/position?session_key=${sessionKey}&position=1`
  );

  if (positions.length > 0) {
    // Sort by date and get the first one
    positions.sort((a, b) => new Date(a.date) - new Date(b.date));
    return new Date(positions[0].date);
  }

  throw new Error("Could not determine race start time");
}

// Fetch starting grid positions
async function fetchStartingGrid(sessionKey) {
  console.log(`[Replay] Fetching starting grid...`);

  // Get all initial positions (up to 20)
  const positions = await fetchJSON(
    `${API_BASE}/position?session_key=${sessionKey}&position<=20`
  );

  if (positions.length === 0) {
    console.log(`[Replay] No starting grid data found`);
    return {};
  }

  // Sort by date to get earliest positions
  positions.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Get the earliest timestamp
  const firstTime = new Date(positions[0].date).getTime();

  // Filter to only positions within first 2 seconds (they all come together)
  const startingPositions = positions.filter(
    (p) => new Date(p.date).getTime() - firstTime < 2000
  );

  // Build map of driver -> position (use first occurrence per driver)
  const grid = {};
  startingPositions.forEach((pos) => {
    const num = String(pos.driver_number);
    if (!grid[num]) {
      grid[num] = pos.position;
    }
  });

  console.log(
    `[Replay] Starting grid loaded: ${Object.keys(grid).length} drivers`
  );
  return grid;
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
        state.TimingData.Lines[num].GapToLeader = `+${int.gap_to_leader.toFixed(
          3
        )}`;
        state.TimingData.Lines[num].IntervalToPositionAhead = {
          Value: int.interval != null ? `+${int.interval.toFixed(3)}` : "",
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
        (m) => `${m.Utc}_${m.Message}` === msgId
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
          (d) => d.driver_number === radio.driver_number
        );
        console.log(
          `[Replay] Team Radio: ${driver?.name_acronym || radio.driver_number}`
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

  try {
    // Fetch session info and starting grid in parallel
    const [sessionInfo, startingGrid] = await Promise.all([
      fetchSessionInfo(SESSION_KEY),
      fetchStartingGrid(SESSION_KEY),
    ]);

    const { session, drivers } = sessionInfo;
    sessionData = session;
    driversData = drivers;

    // Get race start time
    raceStartTime = await getRaceStartTime(SESSION_KEY);
    console.log(`[Replay] Race start: ${raceStartTime.toISOString()}`);

    // Skip the formation lap gap (approximately 55 minutes after first position)
    // The actual green flag is around 55 minutes later
    const FORMATION_LAP_SKIP_MS = 55 * 60 * 1000; // 55 minutes
    raceStartTime = new Date(raceStartTime.getTime() + FORMATION_LAP_SKIP_MS);
    console.log(
      `[Replay] Skipping to green flag: ${raceStartTime.toISOString()}`
    );

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
      `[Replay] Polling every ${POLL_INTERVAL_MS}ms for ${POLL_WINDOW_SECONDS}s windows`
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
      } radio`
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
      seconds
    ).padStart(2, "0")}`,
    Utc: new Date().toISOString(),
  };

  // Broadcast update
  broadcastFn("update", {
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

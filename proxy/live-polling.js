/**
 * Live Polling Mode - Real-time F1 data via REST API
 *
 * Polls OpenF1 REST API for live session data.
 * Free alternative to MQTT, with ~1-2 second latency.
 */

const API_BASE = "https://api.openf1.org/v1";

// Polling configuration
const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds

// State
let isRunning = false;
let pollInterval = null;
let broadcastFn = null;
let currentStateRef = null;
let currentSessionKey = null;
let lastPollTime = null;

// Cache for driver info
const driversCache = {};

/**
 * Fetch JSON with error handling
 */
async function fetchJSON(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error(`[LivePoll] Fetch error: ${error.message}`);
    return [];
  }
}

/**
 * Get the current live session
 */
async function getCurrentSession() {
  console.log("[LivePoll] Looking for live session...");

  // Get latest session
  const sessions = await fetchJSON(`${API_BASE}/sessions?session_key=latest`);

  if (sessions && sessions.length > 0) {
    const session = sessions[0];
    console.log(
      `[LivePoll] Found session: ${session.session_name} at ${session.location}`
    );
    console.log(`[LivePoll] Session key: ${session.session_key}`);
    return session;
  }

  return null;
}

/**
 * Fetch drivers for the session
 */
async function fetchDrivers(sessionKey) {
  const drivers = await fetchJSON(
    `${API_BASE}/drivers?session_key=${sessionKey}`
  );

  drivers.forEach((d) => {
    driversCache[String(d.driver_number)] = {
      name: d.full_name,
      code: d.name_acronym,
      team: d.team_name,
      teamColor: d.team_colour,
    };
  });

  // Update DriverList in state
  if (currentStateRef) {
    currentStateRef.DriverList = {};
    drivers.forEach((d) => {
      const num = String(d.driver_number);
      currentStateRef.DriverList[num] = {
        RacingNumber: num,
        Tla: d.name_acronym,
        FullName: d.full_name,
        TeamName: d.team_name,
        TeamColour: d.team_colour,
      };
    });
  }

  console.log(`[LivePoll] Loaded ${drivers.length} drivers`);
  return drivers;
}

/**
 * Poll for latest data
 */
async function pollData() {
  if (!currentSessionKey || !currentStateRef) return;

  const now = new Date();
  // Look back 3 seconds to catch any delayed data
  const since = new Date(now.getTime() - 3000);
  const sinceISO = since.toISOString();

  // Build URLs for parallel fetch
  const urls = [
    `${API_BASE}/position?session_key=${currentSessionKey}&date>=${sinceISO}`,
    `${API_BASE}/intervals?session_key=${currentSessionKey}&date>=${sinceISO}`,
    `${API_BASE}/laps?session_key=${currentSessionKey}&date_start>=${sinceISO}`,
    `${API_BASE}/location?session_key=${currentSessionKey}&date>=${sinceISO}`,
    `${API_BASE}/race_control?session_key=${currentSessionKey}&date>=${sinceISO}`,
    `${API_BASE}/team_radio?session_key=${currentSessionKey}&date>=${sinceISO}`,
    `${API_BASE}/stints?session_key=${currentSessionKey}`,
  ];

  try {
    const [
      positions,
      intervals,
      laps,
      locations,
      raceControl,
      teamRadio,
      stints,
    ] = await Promise.all(urls.map(fetchJSON));

    // Process positions
    processPositions(positions);

    // Process intervals
    processIntervals(intervals);

    // Process laps
    processLaps(laps);

    // Process locations (for track map)
    processLocations(locations);

    // Process race control
    processRaceControl(raceControl);

    // Process team radio
    processTeamRadio(teamRadio);

    // Process stints (tire info)
    processStints(stints);

    // Broadcast update
    if (broadcastFn) {
      broadcastFn("update", currentStateRef);
    }

    lastPollTime = now;
  } catch (error) {
    console.error("[LivePoll] Error polling data:", error.message);
  }
}

/**
 * Process position data
 */
function processPositions(positions) {
  if (!positions || !currentStateRef) return;

  // Get latest position per driver
  const latestPositions = {};
  positions.forEach((p) => {
    const num = String(p.driver_number);
    const time = new Date(p.date).getTime();
    if (!latestPositions[num] || time > latestPositions[num].time) {
      latestPositions[num] = { time, position: p.position };
    }
  });

  // Update TimingData
  if (!currentStateRef.TimingData) {
    currentStateRef.TimingData = { Lines: {} };
  }

  Object.entries(latestPositions).forEach(([num, data]) => {
    if (!currentStateRef.TimingData.Lines[num]) {
      currentStateRef.TimingData.Lines[num] = {};
    }
    currentStateRef.TimingData.Lines[num].Position = String(data.position);
  });
}

/**
 * Process interval data
 */
function processIntervals(intervals) {
  if (!intervals || !currentStateRef) return;

  // Get latest interval per driver
  const latestIntervals = {};
  intervals.forEach((i) => {
    const num = String(i.driver_number);
    const time = new Date(i.date).getTime();
    if (!latestIntervals[num] || time > latestIntervals[num].time) {
      latestIntervals[num] = {
        time,
        gap: i.gap_to_leader,
        interval: i.interval,
      };
    }
  });

  // Update TimingData
  if (!currentStateRef.TimingData) {
    currentStateRef.TimingData = { Lines: {} };
  }

  Object.entries(latestIntervals).forEach(([num, data]) => {
    if (!currentStateRef.TimingData.Lines[num]) {
      currentStateRef.TimingData.Lines[num] = {};
    }
    currentStateRef.TimingData.Lines[num].GapToLeader =
      data.gap != null ? String(data.gap) : "";
    currentStateRef.TimingData.Lines[num].IntervalToPositionAhead = {
      Value: data.interval != null ? String(data.interval) : "",
    };
  });
}

/**
 * Process lap data
 */
function processLaps(laps) {
  if (!laps || !currentStateRef) return;

  // Get latest lap per driver
  const latestLaps = {};
  laps.forEach((l) => {
    const num = String(l.driver_number);
    if (!latestLaps[num] || l.lap_number > latestLaps[num].lapNumber) {
      latestLaps[num] = {
        lapNumber: l.lap_number,
        lapDuration: l.lap_duration,
        sector1: l.duration_sector_1,
        sector2: l.duration_sector_2,
        sector3: l.duration_sector_3,
        isPitOut: l.is_pit_out_lap,
      };
    }
  });

  // Update TimingData
  if (!currentStateRef.TimingData) {
    currentStateRef.TimingData = { Lines: {} };
  }

  Object.entries(latestLaps).forEach(([num, data]) => {
    if (!currentStateRef.TimingData.Lines[num]) {
      currentStateRef.TimingData.Lines[num] = {};
    }
    const line = currentStateRef.TimingData.Lines[num];

    line.NumberOfLaps = data.lapNumber;
    line.LastLapTime = {
      Value: data.lapDuration ? formatLapTime(data.lapDuration) : "",
    };
    line.Sectors = {
      0: { Value: data.sector1 ? data.sector1.toFixed(3) : "" },
      1: { Value: data.sector2 ? data.sector2.toFixed(3) : "" },
      2: { Value: data.sector3 ? data.sector3.toFixed(3) : "" },
    };
    line.PitOut = data.isPitOut || false;
  });
}

/**
 * Process location data (track map positions)
 */
function processLocations(locations) {
  if (!locations || !currentStateRef) return;

  // Get latest location per driver
  const latestLocations = {};
  locations.forEach((l) => {
    const num = String(l.driver_number);
    const time = new Date(l.date).getTime();
    if (!latestLocations[num] || time > latestLocations[num].time) {
      latestLocations[num] = { time, x: l.x, y: l.y };
    }
  });

  // Update Position
  if (!currentStateRef.Position) {
    currentStateRef.Position = { Position: {} };
  }

  Object.entries(latestLocations).forEach(([num, data]) => {
    currentStateRef.Position.Position[num] = { X: data.x, Y: data.y };
  });
}

/**
 * Process race control messages
 */
function processRaceControl(messages) {
  if (!messages || !currentStateRef) return;

  if (!currentStateRef.RaceControlMessages) {
    currentStateRef.RaceControlMessages = { Messages: [] };
  }

  messages.forEach((msg) => {
    // Check if already exists
    const exists = currentStateRef.RaceControlMessages.Messages.some(
      (m) => m.Utc === msg.date && m.Message === msg.message
    );

    if (!exists) {
      currentStateRef.RaceControlMessages.Messages.push({
        Utc: msg.date,
        Category: msg.category || "Other",
        Message: msg.message,
        Flag: msg.flag || null,
        Scope: msg.scope || null,
        Sector: msg.sector || null,
        DriverNumber: msg.driver_number || null,
        LapNumber: msg.lap_number || null,
      });

      // Keep only last 50
      if (currentStateRef.RaceControlMessages.Messages.length > 50) {
        currentStateRef.RaceControlMessages.Messages =
          currentStateRef.RaceControlMessages.Messages.slice(-50);
      }

      console.log(`[LivePoll] Race Control: ${msg.message}`);

      // Update track status
      if (msg.flag && msg.scope === "Track") {
        updateTrackStatus(msg.flag);
      }
      if (msg.category === "SafetyCar") {
        if (msg.message.includes("VIRTUAL SAFETY CAR")) {
          currentStateRef.TrackStatus = {
            Status: "6",
            Message: "VSC Deployed",
          };
        } else if (msg.message.includes("SAFETY CAR")) {
          currentStateRef.TrackStatus = { Status: "4", Message: "SC Deployed" };
        }
      }
    }
  });
}

/**
 * Process team radio
 */
function processTeamRadio(radios) {
  if (!radios || !currentStateRef) return;

  if (!currentStateRef.TeamRadio) {
    currentStateRef.TeamRadio = { Captures: [] };
  }

  radios.forEach((radio) => {
    // Check if already exists
    const exists = currentStateRef.TeamRadio.Captures.some(
      (r) => r.Path === radio.recording_url
    );

    if (!exists) {
      currentStateRef.TeamRadio.Captures.push({
        Utc: radio.date,
        RacingNumber: String(radio.driver_number),
        Path: radio.recording_url,
      });

      // Keep only last 30
      if (currentStateRef.TeamRadio.Captures.length > 30) {
        currentStateRef.TeamRadio.Captures =
          currentStateRef.TeamRadio.Captures.slice(-30);
      }

      const driver = driversCache[String(radio.driver_number)];
      console.log(
        `[LivePoll] Team Radio: ${driver?.code || radio.driver_number}`
      );
    }
  });
}

/**
 * Process stint data (tires)
 */
function processStints(stints) {
  if (!stints || !currentStateRef) return;

  // Get latest stint per driver
  const latestStints = {};
  stints.forEach((s) => {
    const num = String(s.driver_number);
    if (!latestStints[num] || s.stint_number > latestStints[num].stintNumber) {
      latestStints[num] = {
        stintNumber: s.stint_number,
        compound: s.compound,
        tyreAge: s.tyre_age_at_start,
      };
    }
  });

  // Update TimingData with tire info
  if (!currentStateRef.TimingData) {
    currentStateRef.TimingData = { Lines: {} };
  }

  Object.entries(latestStints).forEach(([num, data]) => {
    if (!currentStateRef.TimingData.Lines[num]) {
      currentStateRef.TimingData.Lines[num] = {};
    }
    currentStateRef.TimingData.Lines[num].Stints = {
      0: {
        Compound: data.compound,
        TotalLaps: data.tyreAge,
      },
    };
    currentStateRef.TimingData.Lines[num].NumberOfPitStops = Math.max(
      0,
      data.stintNumber - 1
    );
  });
}

/**
 * Update track status based on flag
 */
function updateTrackStatus(flag) {
  if (!currentStateRef) return;

  const f = flag.toUpperCase();
  if (f === "GREEN") {
    currentStateRef.TrackStatus = { Status: "1", Message: "AllClear" };
  } else if (f === "YELLOW" || f === "DOUBLE YELLOW") {
    currentStateRef.TrackStatus = { Status: "2", Message: "Yellow" };
  } else if (f === "RED") {
    currentStateRef.TrackStatus = { Status: "5", Message: "Red" };
  } else if (f === "CHEQUERED") {
    currentStateRef.TrackStatus = { Status: "7", Message: "Chequered" };
  }
}

/**
 * Format lap time from seconds
 */
function formatLapTime(seconds) {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(3);
  return mins > 0 ? `${mins}:${secs.padStart(6, "0")}` : secs;
}

/**
 * Fetch historical data for the session
 */
async function fetchHistoricalData(sessionKey) {
  console.log(
    `[LivePoll] Fetching historical data for session ${sessionKey}...`
  );

  try {
    const [raceControl, teamRadio] = await Promise.all([
      fetchJSON(`${API_BASE}/race_control?session_key=${sessionKey}`),
      fetchJSON(`${API_BASE}/team_radio?session_key=${sessionKey}`),
    ]);

    // Process all historical race control
    if (raceControl.length > 0) {
      console.log(
        `[LivePoll] Loaded ${raceControl.length} historical race control messages`
      );
      processRaceControl(raceControl);
    }

    // Process all historical team radio
    if (teamRadio.length > 0) {
      console.log(
        `[LivePoll] Loaded ${teamRadio.length} historical team radios`
      );
      processTeamRadio(teamRadio);
    }
  } catch (error) {
    console.error("[LivePoll] Error fetching historical data:", error.message);
  }
}

/**
 * Start live polling
 */
export async function startLivePolling(broadcast, stateRef) {
  if (isRunning) {
    console.log("[LivePoll] Already running");
    return true;
  }

  broadcastFn = broadcast;
  currentStateRef = stateRef;

  // Initialize state
  if (!currentStateRef.TimingData) currentStateRef.TimingData = { Lines: {} };
  if (!currentStateRef.DriverList) currentStateRef.DriverList = {};
  if (!currentStateRef.Position) currentStateRef.Position = { Position: {} };
  if (!currentStateRef.RaceControlMessages)
    currentStateRef.RaceControlMessages = { Messages: [] };
  if (!currentStateRef.TeamRadio) currentStateRef.TeamRadio = { Captures: [] };
  if (!currentStateRef.TrackStatus)
    currentStateRef.TrackStatus = { Status: "1", Message: "AllClear" };

  // Get current session
  const session = await getCurrentSession();
  if (!session) {
    console.log("[LivePoll] No active session found");
    return false;
  }

  currentSessionKey = session.session_key;

  // Update session info
  currentStateRef.SessionInfo = {
    Meeting: {
      Name: session.meeting_name || session.location,
      Circuit: {
        ShortName: session.circuit_short_name || session.location,
      },
    },
    Name: session.session_name || session.session_type,
  };

  // Fetch drivers
  await fetchDrivers(currentSessionKey);

  // Fetch historical data
  await fetchHistoricalData(currentSessionKey);

  // Start polling
  isRunning = true;
  console.log(`[LivePoll] Starting polling every ${POLL_INTERVAL_MS}ms...`);

  // Initial poll
  await pollData();

  // Start interval
  pollInterval = setInterval(pollData, POLL_INTERVAL_MS);

  return true;
}

/**
 * Stop live polling
 */
export function stopLivePolling() {
  console.log("[LivePoll] Stopping...");
  isRunning = false;

  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  currentSessionKey = null;
  lastPollTime = null;
  Object.keys(driversCache).forEach((k) => delete driversCache[k]);
}

/**
 * Check if live polling is running
 */
export function isLivePollingRunning() {
  return isRunning;
}

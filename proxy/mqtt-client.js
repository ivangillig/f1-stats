/**
 * OpenF1 MQTT Client for Live Data
 *
 * Connects to OpenF1's MQTT broker for real-time F1 telemetry data.
 * Requires authentication via OAuth2 token.
 *
 * Environment variables:
 * - OPENF1_USERNAME: Your OpenF1 username/email
 * - OPENF1_PASSWORD: Your OpenF1 password
 */

import mqtt from "mqtt";

// MQTT Configuration
const MQTT_BROKER = "mqtt.openf1.org";
const MQTT_PORT = 8883;
const TOKEN_URL = "https://api.openf1.org/token";
const API_BASE = "https://api.openf1.org/v1";

// Topics to subscribe (correspond to REST API endpoints)
const TOPICS = [
  "v1/sessions",
  "v1/drivers",
  "v1/position",
  "v1/intervals",
  "v1/laps",
  "v1/location",
  "v1/car_data",
  "v1/race_control",
  "v1/team_radio",
  "v1/weather",
  "v1/stints",
];

// State
let client = null;
let accessToken = null;
let tokenExpiry = null;
let broadcastFn = null;
let currentStateRef = null;
let isRunning = false;
let reconnectTimeout = null;

// Store latest data by driver for aggregation
const driverData = {};
const sessionData = {};

/**
 * Obtain OAuth2 access token from OpenF1
 */
async function getAccessToken() {
  const username = process.env.OPENF1_USERNAME;
  const password = process.env.OPENF1_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "OPENF1_USERNAME and OPENF1_PASSWORD environment variables required"
    );
  }

  console.log("[MQTT] Obtaining access token...");

  const params = new URLSearchParams();
  params.append("username", username);
  params.append("password", password);

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token request failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  // Set expiry 5 minutes before actual expiry for safety
  tokenExpiry = Date.now() + (parseInt(data.expires_in) - 300) * 1000;

  console.log(`[MQTT] Access token obtained, expires in ${data.expires_in}s`);
  return accessToken;
}

/**
 * Check if token is still valid, refresh if needed
 */
async function ensureValidToken() {
  if (!accessToken || !tokenExpiry || Date.now() >= tokenExpiry) {
    await getAccessToken();
  }
  return accessToken;
}

/**
 * Process incoming MQTT message and update state
 */
function processMessage(topic, message) {
  try {
    const data = JSON.parse(message.toString());
    const topicName = topic.replace("v1/", "");

    // Log occasionally (not every message to avoid spam)
    if (Math.random() < 0.01) {
      console.log(`[MQTT] ${topicName}: received data`);
    }

    // Update state based on topic
    switch (topicName) {
      case "sessions":
        handleSession(data);
        break;
      case "drivers":
        handleDriver(data);
        break;
      case "position":
        handlePosition(data);
        break;
      case "intervals":
        handleInterval(data);
        break;
      case "laps":
        handleLap(data);
        break;
      case "location":
        handleLocation(data);
        break;
      case "car_data":
        handleCarData(data);
        break;
      case "race_control":
        handleRaceControl(data);
        break;
      case "team_radio":
        handleTeamRadio(data);
        break;
      case "weather":
        handleWeather(data);
        break;
      case "stints":
        handleStint(data);
        break;
    }

    // Broadcast update to SSE clients
    if (broadcastFn && currentStateRef) {
      broadcastFn("update", currentStateRef);
    }
  } catch (err) {
    console.error(`[MQTT] Error processing message on ${topic}:`, err.message);
  }
}

/**
 * Handle session info
 */
function handleSession(data) {
  sessionData.info = data;
  if (currentStateRef) {
    currentStateRef.SessionInfo = {
      Meeting: {
        Name: data.meeting_name || data.location,
        Circuit: {
          ShortName: data.circuit_short_name || data.location,
        },
      },
      Name: data.session_name || data.session_type,
    };
  }
}

/**
 * Handle driver info
 */
function handleDriver(data) {
  const num = String(data.driver_number);
  if (currentStateRef) {
    if (!currentStateRef.DriverList) {
      currentStateRef.DriverList = {};
    }
    currentStateRef.DriverList[num] = {
      RacingNumber: num,
      Tla: data.name_acronym,
      FullName: data.full_name,
      TeamName: data.team_name,
      TeamColour: data.team_colour,
    };
  }
}

/**
 * Handle position updates
 */
function handlePosition(data) {
  const num = String(data.driver_number);
  if (!driverData[num]) driverData[num] = {};
  driverData[num].position = data.position;
  driverData[num].positionDate = data.date;

  updateTimingData(num);
}

/**
 * Handle interval updates
 */
function handleInterval(data) {
  const num = String(data.driver_number);
  if (!driverData[num]) driverData[num] = {};
  driverData[num].gapToLeader = data.gap_to_leader;
  driverData[num].interval = data.interval;

  updateTimingData(num);
}

/**
 * Handle lap updates
 */
function handleLap(data) {
  const num = String(data.driver_number);
  if (!driverData[num]) driverData[num] = {};

  driverData[num].lapNumber = data.lap_number;
  driverData[num].lapDuration = data.lap_duration;
  driverData[num].sector1 = data.duration_sector_1;
  driverData[num].sector2 = data.duration_sector_2;
  driverData[num].sector3 = data.duration_sector_3;
  driverData[num].isPitOutLap = data.is_pit_out_lap;

  updateTimingData(num);
}

/**
 * Handle location updates (car position on track)
 */
function handleLocation(data) {
  const num = String(data.driver_number);
  if (currentStateRef) {
    if (!currentStateRef.Position) {
      currentStateRef.Position = { Position: {} };
    }
    currentStateRef.Position.Position[num] = {
      X: data.x,
      Y: data.y,
    };
  }
}

/**
 * Handle car telemetry data
 */
function handleCarData(data) {
  const num = String(data.driver_number);
  if (!driverData[num]) driverData[num] = {};

  driverData[num].speed = data.speed;
  driverData[num].rpm = data.rpm;
  driverData[num].gear = data.gear;
  driverData[num].throttle = data.throttle;
  driverData[num].brake = data.brake;
  driverData[num].drs = data.drs;
}

/**
 * Handle race control messages
 */
function handleRaceControl(data) {
  if (currentStateRef) {
    if (!currentStateRef.RaceControlMessages) {
      currentStateRef.RaceControlMessages = { Messages: [] };
    }

    const msg = {
      Utc: data.date,
      Category: data.category || "Other",
      Message: data.message,
      Flag: data.flag || null,
      Scope: data.scope || null,
      Sector: data.sector || null,
      DriverNumber: data.driver_number || null,
      LapNumber: data.lap_number || null,
    };

    // Check if message already exists
    const exists = currentStateRef.RaceControlMessages.Messages.some(
      (m) => m.Utc === msg.Utc && m.Message === msg.Message
    );

    if (!exists) {
      currentStateRef.RaceControlMessages.Messages.push(msg);
      // Keep only last 50 messages
      if (currentStateRef.RaceControlMessages.Messages.length > 50) {
        currentStateRef.RaceControlMessages.Messages =
          currentStateRef.RaceControlMessages.Messages.slice(-50);
      }
      console.log(`[MQTT] Race Control: ${data.message}`);
    }

    // Update track status based on flags
    if (data.flag && data.scope === "Track") {
      const flag = data.flag.toUpperCase();
      if (flag === "GREEN") {
        currentStateRef.TrackStatus = { Status: "1", Message: "AllClear" };
      } else if (flag === "YELLOW" || flag === "DOUBLE YELLOW") {
        currentStateRef.TrackStatus = { Status: "2", Message: "Yellow" };
      } else if (flag === "RED") {
        currentStateRef.TrackStatus = { Status: "5", Message: "Red" };
      } else if (flag === "CHEQUERED") {
        currentStateRef.TrackStatus = { Status: "7", Message: "Chequered" };
      }
    }

    // Check for safety car
    if (data.category === "SafetyCar") {
      if (data.message.includes("VIRTUAL SAFETY CAR")) {
        currentStateRef.TrackStatus = { Status: "6", Message: "VSC Deployed" };
      } else if (data.message.includes("SAFETY CAR")) {
        currentStateRef.TrackStatus = { Status: "4", Message: "SC Deployed" };
      }
    }
  }
}

/**
 * Handle team radio
 */
function handleTeamRadio(data) {
  if (currentStateRef) {
    if (!currentStateRef.TeamRadio) {
      currentStateRef.TeamRadio = { Captures: [] };
    }

    const radio = {
      Utc: data.date,
      RacingNumber: String(data.driver_number),
      Path: data.recording_url,
    };

    // Check if already exists
    const exists = currentStateRef.TeamRadio.Captures.some(
      (r) => r.Path === radio.Path
    );

    if (!exists) {
      currentStateRef.TeamRadio.Captures.push(radio);
      // Keep only last 30 radios
      if (currentStateRef.TeamRadio.Captures.length > 30) {
        currentStateRef.TeamRadio.Captures =
          currentStateRef.TeamRadio.Captures.slice(-30);
      }
      console.log(`[MQTT] Team Radio: Driver ${data.driver_number}`);
    }
  }
}

/**
 * Handle weather data
 */
function handleWeather(data) {
  if (currentStateRef) {
    currentStateRef.WeatherData = {
      AirTemp: String(data.air_temperature),
      Humidity: String(data.humidity),
      Pressure: String(data.pressure),
      Rainfall: data.rainfall ? "1" : "0",
      TrackTemp: String(data.track_temperature),
      WindDirection: String(data.wind_direction),
      WindSpeed: String(data.wind_speed),
    };
  }
}

/**
 * Handle stint data (tire info)
 */
function handleStint(data) {
  const num = String(data.driver_number);
  if (!driverData[num]) driverData[num] = {};

  driverData[num].compound = data.compound;
  driverData[num].tyreAge = data.tyre_age_at_start;
  driverData[num].stintNumber = data.stint_number;

  updateTimingData(num);
}

/**
 * Update TimingData state from aggregated driver data
 */
function updateTimingData(driverNum) {
  if (!currentStateRef) return;

  if (!currentStateRef.TimingData) {
    currentStateRef.TimingData = { Lines: {} };
  }

  const d = driverData[driverNum];
  if (!d) return;

  currentStateRef.TimingData.Lines[driverNum] = {
    Position: String(d.position || ""),
    GapToLeader: d.gapToLeader || "",
    IntervalToPositionAhead: { Value: d.interval || "" },
    LastLapTime: { Value: d.lapDuration ? formatLapTime(d.lapDuration) : "" },
    BestLapTime: { Value: d.bestLap ? formatLapTime(d.bestLap) : "" },
    Sectors: {
      0: { Value: d.sector1 ? d.sector1.toFixed(3) : "" },
      1: { Value: d.sector2 ? d.sector2.toFixed(3) : "" },
      2: { Value: d.sector3 ? d.sector3.toFixed(3) : "" },
    },
    NumberOfLaps: d.lapNumber || 0,
    InPit: d.inPit || false,
    PitOut: d.isPitOutLap || false,
    NumberOfPitStops: d.pitStops || 0,
    Retired: d.retired || false,
  };
}

/**
 * Format lap time from seconds to M:SS.mmm
 */
function formatLapTime(seconds) {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(3);
  return mins > 0 ? `${mins}:${secs.padStart(6, "0")}` : secs;
}

/**
 * Fetch historical data for the current session
 * Called once at startup to fill in data that happened before we connected
 */
async function fetchHistoricalData(sessionKey) {
  if (!sessionKey) {
    console.log("[MQTT] No session key yet, skipping historical fetch");
    return;
  }

  console.log(`[MQTT] Fetching historical data for session ${sessionKey}...`);

  try {
    const token = await ensureValidToken();
    const headers = {
      accept: "application/json",
      Authorization: `Bearer ${token}`,
    };

    // Fetch race_control and team_radio in parallel
    const [raceControlRes, teamRadioRes, driversRes] = await Promise.all([
      fetch(`${API_BASE}/race_control?session_key=${sessionKey}`, { headers }),
      fetch(`${API_BASE}/team_radio?session_key=${sessionKey}`, { headers }),
      fetch(`${API_BASE}/drivers?session_key=${sessionKey}`, { headers }),
    ]);

    // Process race control messages
    if (raceControlRes.ok) {
      const raceControl = await raceControlRes.json();
      console.log(
        `[MQTT] Loaded ${raceControl.length} historical race control messages`
      );

      raceControl.forEach((msg) => {
        // Use the existing handler which filters duplicates
        handleRaceControl(msg);
      });
    }

    // Process team radios
    if (teamRadioRes.ok) {
      const teamRadio = await teamRadioRes.json();
      console.log(`[MQTT] Loaded ${teamRadio.length} historical team radios`);

      teamRadio.forEach((radio) => {
        // Use the existing handler which filters duplicates
        handleTeamRadio(radio);
      });
    }

    // Process drivers (for DriverList)
    if (driversRes.ok) {
      const drivers = await driversRes.json();
      console.log(`[MQTT] Loaded ${drivers.length} drivers`);

      drivers.forEach((driver) => {
        handleDriver(driver);
      });
    }

    console.log("[MQTT] Historical data loaded successfully");
  } catch (error) {
    console.error("[MQTT] Error fetching historical data:", error.message);
  }
}

/**
 * Get current session key from latest data or API
 */
async function getCurrentSessionKey() {
  try {
    const token = await ensureValidToken();
    const headers = {
      accept: "application/json",
      Authorization: `Bearer ${token}`,
    };

    // Get the latest session
    const response = await fetch(`${API_BASE}/sessions?session_key=latest`, {
      headers,
    });

    if (response.ok) {
      const sessions = await response.json();
      if (sessions && sessions.length > 0) {
        const session = sessions[0];
        console.log(
          `[MQTT] Current session: ${session.session_name} at ${session.location}`
        );

        // Also update session info in state
        if (currentStateRef) {
          currentStateRef.SessionInfo = {
            Meeting: {
              Name: session.meeting_name || session.location,
              Circuit: {
                ShortName: session.circuit_short_name || session.location,
              },
            },
            Name: session.session_name || session.session_type,
          };
        }

        return session.session_key;
      }
    }
  } catch (error) {
    console.error("[MQTT] Error getting current session:", error.message);
  }
  return null;
}

/**
 * Connect to OpenF1 MQTT broker
 */
async function connect() {
  try {
    const token = await ensureValidToken();
    const username = process.env.OPENF1_USERNAME;

    console.log(`[MQTT] Connecting to ${MQTT_BROKER}:${MQTT_PORT}...`);

    client = mqtt.connect(`mqtts://${MQTT_BROKER}:${MQTT_PORT}`, {
      username: username,
      password: token,
      rejectUnauthorized: true,
      reconnectPeriod: 0, // We'll handle reconnection manually
    });

    client.on("connect", () => {
      console.log("[MQTT] Connected to OpenF1!");

      // Subscribe to all topics
      TOPICS.forEach((topic) => {
        client.subscribe(topic, (err) => {
          if (err) {
            console.error(
              `[MQTT] Failed to subscribe to ${topic}:`,
              err.message
            );
          } else {
            console.log(`[MQTT] Subscribed to ${topic}`);
          }
        });
      });

      // Fetch historical data for the current session (runs once at startup)
      // This fills in race_control, team_radio, and driver info that happened
      // before we connected to MQTT
      getCurrentSessionKey().then((sessionKey) => {
        if (sessionKey) {
          fetchHistoricalData(sessionKey);
        }
      });
    });

    client.on("message", processMessage);

    client.on("error", (error) => {
      console.error("[MQTT] Connection error:", error.message);
    });

    client.on("close", () => {
      console.log("[MQTT] Connection closed");

      if (isRunning) {
        // Schedule reconnection
        console.log("[MQTT] Will attempt to reconnect in 5 seconds...");
        reconnectTimeout = setTimeout(async () => {
          // Token might have expired, get new one
          accessToken = null;
          connect();
        }, 5000);
      }
    });

    client.on("offline", () => {
      console.log("[MQTT] Client went offline");
    });
  } catch (error) {
    console.error("[MQTT] Failed to connect:", error.message);

    if (isRunning) {
      console.log("[MQTT] Will retry in 10 seconds...");
      reconnectTimeout = setTimeout(connect, 10000);
    }
  }
}

/**
 * Start MQTT live data streaming
 */
export async function startMQTT(broadcast, stateRef) {
  if (isRunning) {
    console.log("[MQTT] Already running");
    return true;
  }

  // Check for credentials
  if (!process.env.OPENF1_USERNAME || !process.env.OPENF1_PASSWORD) {
    console.log("[MQTT] No credentials configured, cannot start live mode");
    return false;
  }

  isRunning = true;
  broadcastFn = broadcast;
  currentStateRef = stateRef;

  // Initialize state structure
  if (!currentStateRef.TimingData) currentStateRef.TimingData = { Lines: {} };
  if (!currentStateRef.DriverList) currentStateRef.DriverList = {};
  if (!currentStateRef.Position) currentStateRef.Position = { Position: {} };
  if (!currentStateRef.RaceControlMessages)
    currentStateRef.RaceControlMessages = { Messages: [] };
  if (!currentStateRef.TeamRadio) currentStateRef.TeamRadio = { Captures: [] };
  if (!currentStateRef.TrackStatus)
    currentStateRef.TrackStatus = { Status: "1", Message: "AllClear" };

  await connect();
  return true;
}

/**
 * Stop MQTT client
 */
export function stopMQTT() {
  console.log("[MQTT] Stopping...");
  isRunning = false;

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (client) {
    client.end(true);
    client = null;
  }

  // Clear data
  Object.keys(driverData).forEach((key) => delete driverData[key]);
  Object.keys(sessionData).forEach((key) => delete sessionData[key]);
  accessToken = null;
  tokenExpiry = null;
}

/**
 * Check if MQTT is running
 */
export function isMQTTRunning() {
  return isRunning;
}

/**
 * Check if MQTT credentials are configured
 */
export function hasMQTTCredentials() {
  return !!(process.env.OPENF1_USERNAME && process.env.OPENF1_PASSWORD);
}

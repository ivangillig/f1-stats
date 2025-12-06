"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Driver,
  SessionInfo,
  TrackStatusInfo,
  SectorStatus,
  TireInfo,
  WeatherData,
  RadioCapture,
  RaceControlMessage,
} from "@/types/f1";
import { DRIVERS, TEAM_COLORS } from "@/lib/constants";

const API_BASE = "https://livetiming.formula1.com/static";
const SIGNALR_BASE = "https://livetiming.formula1.com/signalr";

interface F1DataState {
  drivers: Driver[];
  sessionInfo: SessionInfo;
  trackStatus: TrackStatusInfo;
  weather?: WeatherData;
  teamRadios: RadioCapture[];
  raceControlMessages: RaceControlMessage[];
  isConnected: boolean;
  error: string | null;
}

const defaultSessionInfo: SessionInfo = {
  type: "Unknown",
  name: "No Active Session",
  sessionName: "No Active Session",
  track: "",
  country: "",
  remainingTime: "--:--",
  currentLap: 0,
  totalLaps: 0,
  isLive: false,
};

const defaultTrackStatus: TrackStatusInfo = {
  status: 1,
  message: "",
};

export function useF1Data(): F1DataState {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [sessionInfo, setSessionInfo] =
    useState<SessionInfo>(defaultSessionInfo);
  const [trackStatus, setTrackStatus] =
    useState<TrackStatusInfo>(defaultTrackStatus);
  const [weather, setWeather] = useState<WeatherData | undefined>(undefined);
  const [teamRadios, setTeamRadios] = useState<RadioCapture[]>([]);
  const [raceControlMessages, setRaceControlMessages] = useState<
    RaceControlMessage[]
  >([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  const parseTimingData = useCallback((data: any) => {
    if (!data) return;

    try {
      const timingData = data.TimingData?.Lines || data.Lines || {};
      const timingAppData = data.TimingAppData?.Lines || {};
      const sessionData = data.SessionInfo || {};
      const trackStatusData = data.TrackStatus || {};
      const lapCount = data.LapCount || {};
      const extrapolatedClock = data.ExtrapolatedClock || {};

      // Update session info
      if (sessionData.Meeting || extrapolatedClock.Remaining) {
        setSessionInfo((prev) => ({
          ...prev,
          type: sessionData.Type || prev.type,
          name: sessionData.Meeting?.Name || prev.name,
          track: sessionData.Meeting?.Circuit?.ShortName || prev.track,
          country: sessionData.Meeting?.Country?.Name || prev.country,
          remainingTime: extrapolatedClock.Remaining || prev.remainingTime,
          currentLap: lapCount.CurrentLap || prev.currentLap,
          totalLaps: lapCount.TotalLaps || prev.totalLaps,
          isLive: true,
        }));
      }

      // Update track status
      if (trackStatusData.Status) {
        setTrackStatus({
          status: parseInt(trackStatusData.Status) || 1,
          message: trackStatusData.Message || "",
        });
      }

      // Update weather data
      const weatherData = data.WeatherData;
      if (weatherData) {
        setWeather({
          airTemp: parseFloat(weatherData.AirTemp) || 0,
          humidity: parseFloat(weatherData.Humidity) || 0,
          pressure: parseFloat(weatherData.Pressure) || 0,
          rainfall:
            weatherData.Rainfall === "1" || weatherData.Rainfall === true,
          trackTemp: parseFloat(weatherData.TrackTemp) || 0,
          windDirection: parseFloat(weatherData.WindDirection) || 0,
          windSpeed: parseFloat(weatherData.WindSpeed) || 0,
        });
      }

      // Update team radios
      const teamRadioData = data.TeamRadio;
      if (teamRadioData?.Captures) {
        setTeamRadios((prev) => {
          const newCaptures = teamRadioData.Captures.map((c: any) => ({
            utc: c.Utc,
            racingNumber: c.RacingNumber,
            path: c.Path,
          }));
          // Merge with existing, keeping latest 20
          const allCaptures = [...newCaptures, ...prev];
          const uniqueCaptures = allCaptures.filter(
            (c, i) => allCaptures.findIndex((x) => x.path === c.path) === i
          );
          return uniqueCaptures.slice(0, 20);
        });
      }

      // Update race control messages
      const raceControlData = data.RaceControlMessages;
      if (raceControlData?.Messages) {
        setRaceControlMessages((prev) => {
          const newMessages = Object.values(raceControlData.Messages).map(
            (m: any) => ({
              utc: m.Utc,
              message: m.Message,
              category: m.Category,
              flag: m.Flag,
              lap: m.Lap,
              driverNumber: m.RacingNumber,
            })
          );
          // Merge with existing, keeping latest 30
          const allMessages = [...newMessages, ...prev];
          const uniqueMessages = allMessages.filter(
            (m, i) =>
              allMessages.findIndex(
                (x) => x.utc === m.utc && x.message === m.message
              ) === i
          );
          return uniqueMessages.slice(0, 30);
        });
      }

      // Update drivers
      setDrivers((prev) => {
        const driversMap = new Map(prev.map((d) => [d.driverNumber, d]));

        Object.entries(timingData).forEach(
          ([num, driverData]: [string, any]) => {
            const existing = driversMap.get(num);
            const driverInfo = DRIVERS[num] || {
              name: `Driver ${num}`,
              team: "Unknown",
              code: num,
            };
            const appData = timingAppData[num];

            // Get tire info from stints
            let tireInfo: TireInfo = existing?.tire || {
              compound: "UNKNOWN",
              age: 0,
              isNew: false,
            };
            if (appData?.Stints?.length > 0) {
              const currentStint = appData.Stints[appData.Stints.length - 1];
              tireInfo = {
                compound: currentStint.Compound || "UNKNOWN",
                age: currentStint.TotalLaps || 0,
                isNew: currentStint.New === "true",
              };
            }

            // Parse sector statuses
            const getSectorStatus = (sector: any): SectorStatus => {
              if (!sector) return "none";
              if (sector.OverallFastest) return "purple";
              if (sector.PersonalFastest) return "green";
              if (sector.Value) return "yellow";
              return "none";
            };

            const sectors = driverData.Sectors || {};

            const driver: Driver = {
              position: driverData.Line || existing?.position || 0,
              driverNumber: num,
              code: driverInfo.code,
              name: driverInfo.name,
              team: driverInfo.team,
              gap: driverData.GapToLeader || existing?.gap || "",
              interval:
                driverData.IntervalToPositionAhead?.Value ||
                existing?.interval ||
                "",
              lastLap: driverData.LastLapTime?.Value || existing?.lastLap || "",
              bestLap: driverData.BestLapTime?.Value || existing?.bestLap || "",
              sector1: sectors["0"]?.Value || existing?.sector1 || "",
              sector2: sectors["1"]?.Value || existing?.sector2 || "",
              sector3: sectors["2"]?.Value || existing?.sector3 || "",
              sector1Status:
                getSectorStatus(sectors["0"]) ||
                existing?.sector1Status ||
                "none",
              sector2Status:
                getSectorStatus(sectors["1"]) ||
                existing?.sector2Status ||
                "none",
              sector3Status:
                getSectorStatus(sectors["2"]) ||
                existing?.sector3Status ||
                "none",
              tire: tireInfo,
              inPit: driverData.InPit || existing?.inPit || false,
              pitCount: driverData.NumberOfPitStops || existing?.pitCount || 0,
              retired: driverData.Retired || existing?.retired || false,
              knockedOut:
                driverData.KnockedOut || existing?.knockedOut || false,
            };

            driversMap.set(num, driver);
          }
        );

        return Array.from(driversMap.values())
          .filter((d) => d.position > 0)
          .sort((a, b) => a.position - b.position);
      });
    } catch (err) {
      console.error("Error parsing timing data:", err);
    }
  }, []);

  const fetchInitialData = useCallback(async () => {
    try {
      // Fetch current session path
      const sessionResponse = await fetch(`${API_BASE}/SessionInfo.json`, {
        cache: "no-store",
      });

      if (!sessionResponse.ok) {
        throw new Error("No active session");
      }

      // Fetch timing data
      const timingResponse = await fetch(`${API_BASE}/TimingData.json`, {
        cache: "no-store",
      });

      if (timingResponse.ok) {
        const timingData = await timingResponse.json();
        parseTimingData({ TimingData: timingData });
      }

      // Fetch timing app data (tire info)
      const appDataResponse = await fetch(`${API_BASE}/TimingAppData.json`, {
        cache: "no-store",
      });

      if (appDataResponse.ok) {
        const appData = await appDataResponse.json();
        parseTimingData({ TimingAppData: appData });
      }

      setIsConnected(true);
      setError(null);
      retryCountRef.current = 0;
    } catch (err) {
      console.error("Error fetching initial data:", err);
      setError(
        "No hay sesión activa en este momento. Los datos se actualizarán cuando haya una sesión en vivo."
      );
      setIsConnected(false);

      // Generate demo data when no session is active
      generateDemoData();
    }
  }, [parseTimingData]);

  const generateDemoData = useCallback(() => {
    // Generate random mini sectors (6 per sector = 18 total)
    const generateMiniSectors = (): SectorStatus[] => {
      const statuses: SectorStatus[] = ["purple", "green", "yellow", "none"];
      return Array(18)
        .fill(null)
        .map(() => statuses[Math.floor(Math.random() * 4)]);
    };

    const demoDrivers: Driver[] = Object.entries(DRIVERS).map(
      ([num, info], index) => {
        const sectorStatuses: SectorStatus[] = [
          "purple",
          "green",
          "yellow",
          "none",
        ];
        const s1Status = sectorStatuses[Math.floor(Math.random() * 4)];
        const s2Status = sectorStatuses[Math.floor(Math.random() * 4)];
        const s3Status = sectorStatuses[Math.floor(Math.random() * 4)];

        return {
          position: index + 1,
          driverNumber: num,
          code: info.code,
          name: info.name,
          team: info.team,
          gap:
            index === 0
              ? ""
              : `+${(index * 1.5 + Math.random() * 2).toFixed(3)}`,
          interval:
            index === 0 ? "" : `+${(0.3 + Math.random() * 1.5).toFixed(3)}`,
          lastLap: `1:${(24 + Math.random() * 2).toFixed(3)}`,
          bestLap: `1:${(22 + Math.random() * 1.5).toFixed(3)}`,
          sector1: (30 + Math.random() * 1.5).toFixed(3),
          sector2: (28 + Math.random() * 1.5).toFixed(3),
          sector3: (24 + Math.random() * 1).toFixed(3),
          bestSector1: (29.5 + Math.random() * 0.5).toFixed(3),
          bestSector2: (27.5 + Math.random() * 0.5).toFixed(3),
          bestSector3: (23.5 + Math.random() * 0.5).toFixed(3),
          sector1Status: s1Status,
          sector2Status: s2Status,
          sector3Status: s3Status,
          miniSectors: generateMiniSectors(),
          tire: {
            compound: ["SOFT", "MEDIUM", "HARD"][Math.floor(Math.random() * 3)],
            age: Math.floor(Math.random() * 20) + 1,
            isNew: Math.random() > 0.8,
          },
          inPit: false,
          pitCount: Math.floor(Math.random() * 3),
          retired: false,
          knockedOut: false,
          currentLap: 18 + Math.floor(Math.random() * 8),
          drsEnabled: Math.random() > 0.6,
          positionChange: Math.floor(Math.random() * 7) - 3,
          lastLapPersonalBest: Math.random() > 0.85,
        };
      }
    );

    setDrivers(demoDrivers);
    setSessionInfo({
      type: "Demo",
      name: "Abu Dhabi Grand Prix",
      sessionName: "Demo Race",
      track: "Yas Marina",
      country: "Demo Mode - No Live Session",
      remainingTime: "1:23:45",
      currentLap: 25,
      totalLaps: 58,
      isLive: false,
    });

    // Demo weather data
    setWeather({
      airTemp: 28.5,
      humidity: 52,
      pressure: 1013.5,
      rainfall: false,
      trackTemp: 42.3,
      windDirection: 135,
      windSpeed: 3.2,
    });

    // Demo team radios
    const demoRadios: RadioCapture[] = [
      {
        utc: new Date(Date.now() - 30000).toISOString(),
        racingNumber: "1",
        path: "TeamRadio/1_30.mp3",
      },
      {
        utc: new Date(Date.now() - 60000).toISOString(),
        racingNumber: "16",
        path: "TeamRadio/16_45.mp3",
      },
      {
        utc: new Date(Date.now() - 90000).toISOString(),
        racingNumber: "44",
        path: "TeamRadio/44_25.mp3",
      },
      {
        utc: new Date(Date.now() - 120000).toISOString(),
        racingNumber: "81",
        path: "TeamRadio/81_15.mp3",
      },
      {
        utc: new Date(Date.now() - 150000).toISOString(),
        racingNumber: "4",
        path: "TeamRadio/4_33.mp3",
      },
    ];
    setTeamRadios(demoRadios);

    // Demo race control messages
    const demoRaceControl: RaceControlMessage[] = [
      {
        utc: new Date(Date.now() - 10000).toISOString(),
        message: "TRACK LIMITS - TURN 4",
        category: "TrackLimits",
        driverNumber: "1",
        lap: 25,
      },
      {
        utc: new Date(Date.now() - 45000).toISOString(),
        message: "DRS ENABLED",
        category: "Drs",
        flag: "GREEN",
      },
      {
        utc: new Date(Date.now() - 90000).toISOString(),
        message: "YELLOW FLAG IN SECTOR 2",
        category: "Flag",
        flag: "YELLOW",
      },
      {
        utc: new Date(Date.now() - 120000).toISOString(),
        message: "SAFETY CAR DEPLOYED",
        category: "SafetyCar",
        flag: "YELLOW",
      },
      {
        utc: new Date(Date.now() - 180000).toISOString(),
        message: "PIT LANE ENTRY OPEN",
        category: "Other",
      },
      {
        utc: new Date(Date.now() - 240000).toISOString(),
        message: "TRACK LIMITS - TURN 9",
        category: "TrackLimits",
        driverNumber: "44",
        lap: 23,
      },
      {
        utc: new Date(Date.now() - 300000).toISOString(),
        message: "CAR 16 (LEC) - 5 SECOND TIME PENALTY",
        category: "Penalty",
        driverNumber: "16",
      },
    ];
    setRaceControlMessages(demoRaceControl);
  }, []);

  const connectWebSocket = useCallback(async () => {
    try {
      // First, negotiate to get connection token
      const negotiateUrl = `${SIGNALR_BASE}/negotiate?connectionData=${encodeURIComponent(
        '[{"name":"streaming"}]'
      )}&clientProtocol=1.5`;

      const negotiateResponse = await fetch(negotiateUrl);
      if (!negotiateResponse.ok) {
        throw new Error("Failed to negotiate SignalR connection");
      }

      const negotiateData = await negotiateResponse.json();
      const connectionToken = negotiateData.ConnectionToken;

      // Connect via WebSocket
      const wsUrl = `wss://livetiming.formula1.com/signalr/connect?transport=webSockets&connectionToken=${encodeURIComponent(
        connectionToken
      )}&connectionData=${encodeURIComponent(
        '[{"name":"streaming"}]'
      )}&clientProtocol=1.5`;

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
        setError(null);
        retryCountRef.current = 0;

        // Subscribe to timing data
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const subscribeMessage = {
            H: "streaming",
            M: "Subscribe",
            A: [
              [
                "TimingData",
                "TimingAppData",
                "TrackStatus",
                "SessionInfo",
                "LapCount",
                "ExtrapolatedClock",
                "WeatherData",
                "TeamRadio",
              ],
            ],
            I: 1,
          };
          wsRef.current.send(JSON.stringify(subscribeMessage));
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.M) {
            data.M.forEach((message: any) => {
              if (message.A) {
                parseTimingData(message.A[0]);
              }
            });
          }
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      };

      wsRef.current.onerror = (event) => {
        console.error("WebSocket error:", event);
        setError("Error de conexión WebSocket");
      };

      wsRef.current.onclose = () => {
        console.log("WebSocket closed");
        setIsConnected(false);

        // Retry connection with exponential backoff
        const retryDelay = Math.min(
          1000 * Math.pow(2, retryCountRef.current),
          30000
        );
        retryCountRef.current++;

        retryTimeoutRef.current = setTimeout(() => {
          fetchInitialData();
        }, retryDelay);
      };
    } catch (err) {
      console.error("Error connecting WebSocket:", err);
      // Fall back to polling
      fetchInitialData();
    }
  }, [parseTimingData, fetchInitialData]);

  useEffect(() => {
    fetchInitialData();

    // Set up polling as fallback (every 5 seconds)
    const pollInterval = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        fetchInitialData();
      }
    }, 5000);

    return () => {
      clearInterval(pollInterval);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [fetchInitialData]);

  return {
    drivers,
    sessionInfo,
    trackStatus,
    weather,
    teamRadios,
    raceControlMessages,
    isConnected,
    error,
  };
}

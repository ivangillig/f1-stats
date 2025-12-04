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

// Use environment variable or default to localhost for development
const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL || "http://localhost:4000";

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

export function useF1DataSSE(): F1DataState {
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
  const [isInDemoMode, setIsInDemoMode] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const healthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Store driver list from API (updated in real-time)
  const driverListRef = useRef<
    Record<
      string,
      { name: string; team: string; code: string; teamColor: string }
    >
  >({});

  // Store car track positions from replay
  const carDataRef = useRef<Record<string, { x: number; y: number }>>({});

  // Clear all cached data when switching from demo to live
  const clearAllData = useCallback(() => {
    console.log("[SSE] Clearing all cached data...");
    setDrivers([]);
    setSessionInfo(defaultSessionInfo);
    setTrackStatus(defaultTrackStatus);
    setWeather(undefined);
    setTeamRadios([]);
    setRaceControlMessages([]);
    driverListRef.current = {};
    carDataRef.current = {};
  }, []);

  const processData = useCallback((data: any) => {
    if (!data) return;

    try {
      // Process DriverList first - this has the real driver info from F1 API
      const driverListData = data.DriverList;
      if (driverListData) {
        console.log("[F1 Data] DriverList received:", driverListData);
        Object.entries(driverListData).forEach(
          ([num, driverData]: [string, any]) => {
            if (driverData && typeof driverData === "object") {
              driverListRef.current[num] = {
                name:
                  driverData.FullName ||
                  driverData.BroadcastName ||
                  `Driver ${num}`,
                team: driverData.TeamName || "Unknown",
                code: driverData.Tla || num,
                teamColor: driverData.TeamColour
                  ? `#${driverData.TeamColour}`
                  : "",
              };
              console.log(
                `[F1 Data] Driver ${num}:`,
                driverListRef.current[num]
              );
            }
          }
        );
      }

      // Process TimingData
      const timingData = data.TimingData?.Lines || {};
      const timingAppData = data.TimingAppData?.Lines || {};

      // Log timing data for debugging
      if (Object.keys(timingData).length > 0) {
        console.log("[F1 Data] TimingData drivers:", Object.keys(timingData));
      }

      // Process SessionInfo
      const sessionData = data.SessionInfo || {};
      const lapCount = data.LapCount || {};
      const extrapolatedClock = data.ExtrapolatedClock || {};

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
          circuitKey: sessionData.Meeting?.Circuit?.Key || prev.circuitKey,
          isLive: true,
        }));
      }

      // Process TrackStatus
      const trackStatusData = data.TrackStatus;
      if (trackStatusData?.Status) {
        setTrackStatus({
          status: parseInt(trackStatusData.Status) || 1,
          message: trackStatusData.Message || "",
        });
      }

      // Process WeatherData
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

      // Process TeamRadio
      const teamRadioData = data.TeamRadio;
      if (teamRadioData?.Captures) {
        setTeamRadios((prev) => {
          const newCaptures = Object.values(teamRadioData.Captures).map(
            (c: any) => ({
              utc: c.Utc,
              racingNumber: c.RacingNumber,
              path: c.Path,
            })
          );
          const allCaptures = [...newCaptures, ...prev];
          const uniqueCaptures = allCaptures.filter(
            (c, i) => allCaptures.findIndex((x) => x.path === c.path) === i
          );
          return uniqueCaptures.slice(0, 20);
        });
      }

      // Process RaceControlMessages
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
          const allMessages = [...newMessages, ...prev];
          const uniqueMessages = allMessages.filter(
            (m, i) =>
              allMessages.findIndex(
                (x) => x.utc === m.utc && x.message === m.message
              ) === i
          );
          // Sort by date descending (newest first)
          uniqueMessages.sort(
            (a, b) => new Date(b.utc).getTime() - new Date(a.utc).getTime()
          );
          return uniqueMessages.slice(0, 30);
        });
      }

      // Process Position data (X, Y coordinates from replay)
      const positionData = data.Position?.Position;
      if (positionData) {
        Object.entries(positionData).forEach(
          ([num, posData]: [string, any]) => {
            carDataRef.current[num] = {
              x: posData.X || 0,
              y: posData.Y || 0,
            };
          }
        );
      }

      // Process Drivers
      if (Object.keys(timingData).length > 0) {
        setDrivers((prev) => {
          const driversMap = new Map(prev.map((d) => [d.driverNumber, d]));

          Object.entries(timingData).forEach(
            ([num, driverData]: [string, any]) => {
              const existing = driversMap.get(num);

              // Use API DriverList first, then fallback to hardcoded DRIVERS, then defaults
              const apiDriverInfo = driverListRef.current[num];
              const hardcodedInfo = DRIVERS[num];
              const driverInfo = {
                name:
                  apiDriverInfo?.name || hardcodedInfo?.name || `Driver ${num}`,
                team: apiDriverInfo?.team || hardcodedInfo?.team || "Unknown",
                code: apiDriverInfo?.code || hardcodedInfo?.code || num,
                teamColor: apiDriverInfo?.teamColor || "",
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

              // Parse mini sectors (segments) from each sector
              const getSegmentStatus = (value: string | null): SectorStatus => {
                if (value === "OverallFastest") return "purple";
                if (value === "PersonalFastest") return "green";
                return "yellow";
              };

              const parseMiniSectors = (sectors: any): SectorStatus[] => {
                const allSegments: SectorStatus[] = [];
                // Combine segments from all 3 sectors
                ["0", "1", "2"].forEach((sectorNum) => {
                  const sector = sectors?.[sectorNum];
                  const segments = sector?.Segments || [];
                  segments.forEach((seg: string | null) => {
                    allSegments.push(seg ? getSegmentStatus(seg) : "none");
                  });
                });
                // If no segments, return empty array (will be handled in component)
                return allSegments.length > 0 ? allSegments : [];
              };

              const sectors = driverData.Sectors || {};
              const miniSectors = parseMiniSectors(sectors);

              const driver: Driver = {
                position: driverData.Line || existing?.position || 0,
                driverNumber: num,
                code: driverInfo.code,
                name: driverInfo.name,
                team: driverInfo.team,
                teamColor: driverInfo.teamColor || existing?.teamColor,
                gap: driverData.GapToLeader || existing?.gap || "",
                interval:
                  driverData.IntervalToPositionAhead?.Value ||
                  existing?.interval ||
                  "",
                lastLap:
                  driverData.LastLapTime?.Value || existing?.lastLap || "",
                bestLap:
                  driverData.BestLapTime?.Value || existing?.bestLap || "",
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
                miniSectors:
                  miniSectors.length > 0
                    ? miniSectors
                    : existing?.miniSectors || [],
                tire: tireInfo,
                inPit: driverData.InPit || existing?.inPit || false,
                pitCount:
                  driverData.NumberOfPitStops ?? existing?.pitCount ?? 0,
                retired: driverData.Retired || existing?.retired || false,
                trackX: carDataRef.current[num]?.x ?? existing?.trackX,
                trackY: carDataRef.current[num]?.y ?? existing?.trackY,
              };

              driversMap.set(num, driver);
            }
          );

          // Sort by gap to leader (interval)
          // Leader has empty/null gap, others have "+X.XXX" format
          const parseGap = (gap: string | undefined): number => {
            if (!gap || gap === "" || gap === "---") return 0; // Leader
            // Remove "+" and parse as float
            const numericGap = parseFloat(gap.replace("+", ""));
            return isNaN(numericGap) ? Infinity : numericGap;
          };

          const sortedDrivers = Array.from(driversMap.values())
            .filter((d) => d.gap !== undefined || d.position > 0)
            .sort((a, b) => {
              const gapA = parseGap(a.gap);
              const gapB = parseGap(b.gap);
              return gapA - gapB;
            });

          // Update positions based on sorted order
          return sortedDrivers.map((driver, index) => ({
            ...driver,
            position: index + 1,
          }));
        });
      }
    } catch (err) {
      console.error("Error processing data:", err);
    }
  }, []);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    console.log(`[SSE] Connecting to ${PROXY_URL}/api/sse`);

    const eventSource = new EventSource(`${PROXY_URL}/api/sse`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("[SSE] Connected");
      setIsConnected(true);
      setError(null);
    };

    eventSource.addEventListener("initial", (event) => {
      console.log("[SSE] Received initial state");
      const data = JSON.parse(event.data);
      processData(data);
    });

    eventSource.addEventListener("update", (event) => {
      const data = JSON.parse(event.data);
      processData(data);
    });

    eventSource.onerror = (err) => {
      console.error("[SSE] Error:", err);
      setIsConnected(false);
      setError("Connection lost. Reconnecting...");

      eventSource.close();

      // Reconnect after delay
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 5000);
    };
  }, [processData]);

  // Generate demo data when not connected
  const generateDemoData = useCallback(() => {
    const generateMiniSectors = (): SectorStatus[] => {
      const statuses: SectorStatus[] = ["purple", "green", "yellow", "none"];
      return Array(18)
        .fill(null)
        .map(() => statuses[Math.floor(Math.random() * statuses.length)]);
    };

    const demoDrivers: Driver[] = Object.entries(DRIVERS).map(
      ([num, info], index) => ({
        position: index + 1,
        driverNumber: num,
        code: info.code,
        name: info.name,
        team: info.team,
        gap:
          index === 0 ? "" : `+${(Math.random() * 30 + index * 2).toFixed(3)}`,
        interval: index === 0 ? "" : `+${(Math.random() * 2).toFixed(3)}`,
        lastLap: `1:${(20 + Math.random() * 5).toFixed(3)}`,
        bestLap: `1:${(19 + Math.random() * 3).toFixed(3)}`,
        sector1: `${(28 + Math.random() * 3).toFixed(3)}`,
        sector2: `${(35 + Math.random() * 4).toFixed(3)}`,
        sector3: `${(25 + Math.random() * 3).toFixed(3)}`,
        sector1Status: ["purple", "green", "yellow", "none"][
          Math.floor(Math.random() * 4)
        ] as SectorStatus,
        sector2Status: ["purple", "green", "yellow", "none"][
          Math.floor(Math.random() * 4)
        ] as SectorStatus,
        sector3Status: ["purple", "green", "yellow", "none"][
          Math.floor(Math.random() * 4)
        ] as SectorStatus,
        tire: {
          compound: ["SOFT", "MEDIUM", "HARD"][Math.floor(Math.random() * 3)],
          age: Math.floor(Math.random() * 20),
          isNew: Math.random() > 0.7,
        },
        inPit: Math.random() > 0.95,
        pitCount: Math.floor(Math.random() * 3),
        retired: false,
        miniSectors: generateMiniSectors(),
        bestSector1: `${(28 + Math.random() * 2).toFixed(3)}`,
        bestSector2: `${(35 + Math.random() * 3).toFixed(3)}`,
        bestSector3: `${(25 + Math.random() * 2).toFixed(3)}`,
      })
    );

    setDrivers(demoDrivers.slice(0, 20));
    setSessionInfo({
      type: "Race",
      name: "Demo Grand Prix",
      track: "Circuit de Monaco",
      country: "Monaco",
      remainingTime: "1:23:45",
      currentLap: 25,
      totalLaps: 58,
      isLive: false,
    });
    setWeather({
      airTemp: 28.5,
      humidity: 52,
      pressure: 1013.5,
      rainfall: false,
      trackTemp: 42.3,
      windDirection: 135,
      windSpeed: 3.2,
    });

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
    ];
    setTeamRadios(demoRadios);

    const demoRaceControl: RaceControlMessage[] = [
      {
        utc: new Date(Date.now() - 5000).toISOString(),
        message: "GREEN FLAG",
        category: "Flag",
      },
      {
        utc: new Date(Date.now() - 10000).toISOString(),
        message: "DRS ENABLED",
        category: "Drs",
      },
      {
        utc: new Date(Date.now() - 25000).toISOString(),
        message: "YELLOW FLAG - TURN 5",
        category: "Flag",
      },
      {
        utc: new Date(Date.now() - 45000).toISOString(),
        message: "TRACK LIMITS - CAR 1 (VER)",
        category: "TrackLimits",
        driverNumber: "1",
      },
      {
        utc: new Date(Date.now() - 60000).toISOString(),
        message: "CHEQUERED FLAG",
        category: "Flag",
      },
    ];
    setRaceControlMessages(demoRaceControl);
  }, []);

  // Health check function to detect when proxy comes online
  const checkProxyHealth = useCallback(() => {
    if (isConnected) return; // Already connected, no need to check

    fetch(`${PROXY_URL}/health`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "ok") {
          console.log("[SSE] Proxy is now available, connecting...");
          setIsInDemoMode(false);
          setError(null);
          // Clear health check interval since we're connecting
          if (healthCheckIntervalRef.current) {
            clearInterval(healthCheckIntervalRef.current);
            healthCheckIntervalRef.current = null;
          }
          // Clear all demo data before connecting to real data
          clearAllData();
          connect();
        }
      })
      .catch(() => {
        // Proxy still not available, will check again
      });
  }, [connect, isConnected, clearAllData]);

  useEffect(() => {
    // Try to connect to proxy
    fetch(`${PROXY_URL}/health`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "ok") {
          connect();
        } else {
          throw new Error("Proxy not ready");
        }
      })
      .catch(() => {
        console.log("[SSE] Proxy not available, using demo data");
        setError("DEMO_DATA");
        setIsInDemoMode(true);
        generateDemoData();

        // Start periodic health check every 10 seconds
        healthCheckIntervalRef.current = setInterval(checkProxyHealth, 10000);
      });

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
      }
    };
  }, [connect, generateDemoData, checkProxyHealth]);

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

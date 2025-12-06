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

// In browser: use relative path (goes through Next.js rewrite)
// In development: use localhost
const PROXY_URL =
  typeof window !== "undefined"
    ? "/api/proxy"
    : process.env.INTERNAL_PROXY_URL || "http://localhost:4000";

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
  sessionName: "",
  track: "",
  country: "",
  remainingTime: "--:--",
  currentLap: 0,
  totalLaps: 0,
  circuitKey: undefined,
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
  const clockIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectedRef = useRef(false); // Ref to avoid dependency issues

  // Store extrapolated clock data for local time calculation
  const extrapolatedClockRef = useRef<{
    utc: string;
    remaining: string;
    extrapolating: boolean;
  } | null>(null);

  // Store driver list from API (updated in real-time)
  const driverListRef = useRef<
    Record<
      string,
      { name: string; team: string; code: string; teamColor: string }
    >
  >({});

  // Store car track positions from replay
  const carDataRef = useRef<Record<string, { x: number; y: number }>>({});

  // Store session type for sorting logic
  const sessionTypeRef = useRef<string>("Race");

  // Store session path for building audio URLs
  const sessionPathRef = useRef<string>("");

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
      // Debug: Log Position data structure on first receive
      if (data.Position && Object.keys(carDataRef.current).length === 0) {
        console.log(
          "[F1 Data] Position data structure:",
          Object.keys(data.Position)
        );
        const sample = Object.entries(data.Position)[0];
        if (sample) {
          console.log(
            "[F1 Data] Position sample:",
            sample[0],
            JSON.stringify(sample[1]).substring(0, 300)
          );
        }
      }

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
      const timingStatsData = data.TimingStats?.Lines || {};

      // Log timing data for debugging
      if (Object.keys(timingData).length > 0) {
        console.log("[F1 Data] TimingData drivers:", Object.keys(timingData));
      }

      // Process SessionInfo
      const sessionData = data.SessionInfo || {};
      const lapCount = data.LapCount || {};
      const extrapolatedClock = data.ExtrapolatedClock;

      if (sessionData.Type) {
        sessionTypeRef.current = sessionData.Type;
      }

      // Store extrapolated clock data for local calculation
      if (extrapolatedClock?.Utc && extrapolatedClock?.Remaining) {
        extrapolatedClockRef.current = {
          utc: extrapolatedClock.Utc,
          remaining: extrapolatedClock.Remaining,
          extrapolating: extrapolatedClock.Extrapolating === true,
        };
      }

      if (
        sessionData.Meeting ||
        extrapolatedClock?.Remaining ||
        sessionData.Name
      ) {
        const newCircuitKey = sessionData.Meeting?.Circuit?.Key;
        if (newCircuitKey) {
          console.log("[F1 Data] Circuit Key received:", newCircuitKey);
        }
        // Store session path for building audio URLs
        if (sessionData.Path) {
          sessionPathRef.current = sessionData.Path;
        }
        setSessionInfo((prev) => ({
          ...prev,
          type: sessionData.Type || prev.type,
          name: sessionData.Meeting?.Name || prev.name,
          sessionName: sessionData.Name || prev.sessionName, // "Practice 3", "Qualifying", etc.
          track: sessionData.Meeting?.Circuit?.ShortName || prev.track,
          country: sessionData.Meeting?.Country?.Name || prev.country,
          // Don't set remainingTime here, let the interval handle it
          currentLap: lapCount.CurrentLap || prev.currentLap,
          totalLaps: lapCount.TotalLaps || prev.totalLaps,
          circuitKey: newCircuitKey || prev.circuitKey,
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
        const baseUrl = "https://livetiming.formula1.com/static/";
        const sessionPath = sessionPathRef.current;

        setTeamRadios((prev) => {
          const newCaptures = Object.values(teamRadioData.Captures)
            .filter((c: any) => c !== null && c?.Utc && c?.Path)
            .map((c: any) => ({
              utc: c.Utc,
              racingNumber: c.RacingNumber,
              // Build full URL: baseUrl + sessionPath + relative path
              path: sessionPath ? `${baseUrl}${sessionPath}${c.Path}` : c.Path,
            }));
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

      // Process Position data (X, Y coordinates)
      // Format can vary: Position.Position (entries with driver numbers)
      // or Position with timestamp entries like {"0": {Entries: {"1": {X, Y}, ...}}}
      const positionData = data.Position;
      if (positionData) {
        // Check for direct Position.Position format
        if (positionData.Position) {
          Object.entries(positionData.Position).forEach(
            ([num, posData]: [string, any]) => {
              if (posData?.X !== undefined && posData?.Y !== undefined) {
                carDataRef.current[num] = {
                  x: posData.X,
                  y: posData.Y,
                };
              }
            }
          );
        } else {
          // Check for timestamp-based format: {"0": {Entries: {...}}, "1": {Entries: {...}}}
          // Take the most recent entry
          const timestamps = Object.keys(positionData).filter(
            (k) => !isNaN(Number(k))
          );
          if (timestamps.length > 0) {
            const latestTimestamp = Math.max(...timestamps.map(Number));
            const latestData = positionData[String(latestTimestamp)];
            if (latestData?.Entries) {
              Object.entries(latestData.Entries).forEach(
                ([num, posData]: [string, any]) => {
                  if (posData?.X !== undefined && posData?.Y !== undefined) {
                    carDataRef.current[num] = {
                      x: posData.X,
                      y: posData.Y,
                    };
                  }
                }
              );
            }
          }
        }
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
              // Stints can be object with numeric keys or array
              const stintsData = appData?.Stints;
              if (stintsData) {
                const stintsArray = Array.isArray(stintsData)
                  ? stintsData
                  : Object.values(stintsData);
                if (stintsArray.length > 0) {
                  const currentStint = stintsArray[stintsArray.length - 1];
                  tireInfo = {
                    compound: currentStint.Compound || "UNKNOWN",
                    age: currentStint.TotalLaps || 0,
                    isNew:
                      currentStint.New === "true" || currentStint.New === true,
                  };
                }
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
              // Segments can be object with numeric keys or array
              // Status codes: 2048=yellow, 2049=green, 2051=purple, 2064=blue(pit), 0=none
              const getSegmentStatusFromCode = (
                status: number
              ): SectorStatus => {
                if (status === 2051) return "purple";
                if (status === 2049) return "green";
                if (status === 2064) return "blue"; // Pit lane
                if (status === 2048) return "yellow";
                return "none";
              };

              // Count segments per sector
              const getSegmentCount = (sector: any): number => {
                if (!sector?.Segments) return 0;
                return Array.isArray(sector.Segments)
                  ? sector.Segments.length
                  : Object.keys(sector.Segments).length;
              };

              const parseMiniSectors = (sectors: any): SectorStatus[] => {
                const allSegments: SectorStatus[] = [];
                // Combine segments from all 3 sectors
                ["0", "1", "2"].forEach((sectorNum) => {
                  const sector = sectors?.[sectorNum];
                  const segmentsData = sector?.Segments;
                  if (segmentsData) {
                    // Segments is an object with numeric keys like {"0": {Status: 2049}, "1": {Status: 2048}}
                    const segmentsArray = Array.isArray(segmentsData)
                      ? segmentsData
                      : Object.values(segmentsData);
                    segmentsArray.forEach((seg: any) => {
                      if (seg && typeof seg === "object" && "Status" in seg) {
                        allSegments.push(getSegmentStatusFromCode(seg.Status));
                      } else if (typeof seg === "string") {
                        // Legacy format: string values
                        if (seg === "OverallFastest")
                          allSegments.push("purple");
                        else if (seg === "PersonalFastest")
                          allSegments.push("green");
                        else allSegments.push("yellow");
                      } else {
                        allSegments.push("none");
                      }
                    });
                  }
                });
                // If no segments, return empty array (will be handled in component)
                return allSegments.length > 0 ? allSegments : [];
              };

              // Calculate track progress (0-1) based on completed segments
              const calculateTrackProgress = (sectors: any): number => {
                let completedSegments = 0;
                let totalSegments = 0;

                ["0", "1", "2"].forEach((sectorNum) => {
                  const sector = sectors?.[sectorNum];
                  const segmentsData = sector?.Segments;
                  if (segmentsData) {
                    const segmentsArray = Array.isArray(segmentsData)
                      ? segmentsData
                      : Object.values(segmentsData);
                    totalSegments += segmentsArray.length;
                    segmentsArray.forEach((seg: any) => {
                      // Status != 0 means segment is completed
                      if (seg && typeof seg === "object" && seg.Status !== 0) {
                        completedSegments++;
                      }
                    });
                  }
                });

                if (totalSegments === 0) return 0;
                return completedSegments / totalSegments;
              };

              const sectors = driverData.Sectors || {};
              const miniSectors = parseMiniSectors(sectors);

              // Position can be a number (Line) or string (Position)
              const position = driverData.Position
                ? parseInt(driverData.Position, 10)
                : driverData.Line || existing?.position || 0;

              // Get segment counts for each sector
              const sector1SegmentCount =
                getSegmentCount(sectors["0"]) ||
                existing?.sector1SegmentCount ||
                5;
              const sector2SegmentCount =
                getSegmentCount(sectors["1"]) ||
                existing?.sector2SegmentCount ||
                9;
              const sector3SegmentCount =
                getSegmentCount(sectors["2"]) ||
                existing?.sector3SegmentCount ||
                10;

              // Get best sector times from TimingStats.Lines[num].BestSectors
              const statsData = timingStatsData[num];
              const bestSectors = statsData?.BestSectors || {};
              const bestSector1 =
                bestSectors["0"]?.Value || existing?.bestSector1 || "";
              const bestSector2 =
                bestSectors["1"]?.Value || existing?.bestSector2 || "";
              const bestSector3 =
                bestSectors["2"]?.Value || existing?.bestSector3 || "";

              // Check if this driver has the overall best (record) for each sector
              // Position 1 means this is the fastest sector time of the session
              const hasSector1Record =
                bestSectors["0"]?.Position === 1 ||
                existing?.hasSector1Record ||
                false;
              const hasSector2Record =
                bestSectors["1"]?.Position === 1 ||
                existing?.hasSector2Record ||
                false;
              const hasSector3Record =
                bestSectors["2"]?.Position === 1 ||
                existing?.hasSector3Record ||
                false;

              // Check if last lap was a personal best
              const lastLapPersonalBest =
                driverData.LastLapTime?.PersonalFastest === true ||
                existing?.lastLapPersonalBest ||
                false;

              const driver: Driver = {
                position: position,
                driverNumber: num,
                code: driverInfo.code,
                name: driverInfo.name,
                team: driverInfo.team,
                teamColor: driverInfo.teamColor || existing?.teamColor,
                // Gap can be GapToLeader or TimeDiffToFastest depending on source
                gap:
                  driverData.GapToLeader ||
                  driverData.TimeDiffToFastest ||
                  existing?.gap ||
                  "",
                // Interval can be IntervalToPositionAhead.Value or TimeDiffToPositionAhead
                interval:
                  driverData.IntervalToPositionAhead?.Value ||
                  driverData.TimeDiffToPositionAhead ||
                  existing?.interval ||
                  "",
                lastLap:
                  driverData.LastLapTime?.Value || existing?.lastLap || "",
                lastLapPersonalBest,
                bestLap:
                  driverData.BestLapTime?.Value || existing?.bestLap || "",
                sector1: sectors["0"]?.Value || existing?.sector1 || "",
                sector2: sectors["1"]?.Value || existing?.sector2 || "",
                sector3: sectors["2"]?.Value || existing?.sector3 || "",
                bestSector1,
                bestSector2,
                bestSector3,
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
                sector1SegmentCount,
                sector2SegmentCount,
                sector3SegmentCount,
                hasSector1Record,
                hasSector2Record,
                hasSector3Record,
                tire: tireInfo,
                inPit: driverData.InPit || existing?.inPit || false,
                pitCount:
                  driverData.NumberOfPitStops ?? existing?.pitCount ?? 0,
                retired: driverData.Retired || existing?.retired || false,
                trackProgress: calculateTrackProgress(sectors),
                trackX: carDataRef.current[num]?.x ?? existing?.trackX,
                trackY: carDataRef.current[num]?.y ?? existing?.trackY,
              };

              driversMap.set(num, driver);
            }
          );

          // Parse lap time string to milliseconds for comparison
          const parseLapTime = (lapTime: string | undefined): number => {
            if (!lapTime || lapTime === "" || lapTime === "---")
              return Infinity;
            // Format: "1:23.456" or "1:23:456" or just "23.456"
            const parts = lapTime.split(/[:.]/).map(Number);
            if (parts.length === 3) {
              // M:SS.mmm
              return parts[0] * 60000 + parts[1] * 1000 + parts[2];
            } else if (parts.length === 2) {
              // SS.mmm
              return parts[0] * 1000 + parts[1];
            }
            return Infinity;
          };

          // Parse gap string to number
          const parseGap = (gap: string | undefined): number => {
            if (!gap || gap === "" || gap === "---") return 0; // Leader
            // Remove "+" and parse as float
            const numericGap = parseFloat(gap.replace("+", ""));
            return isNaN(numericGap) ? Infinity : numericGap;
          };

          // Determine sort method based on session type
          const sessionType = sessionTypeRef.current;
          const isPracticeOrQualy =
            sessionType === "Practice" ||
            sessionType === "Qualifying" ||
            sessionType?.includes("Practice") ||
            sessionType?.includes("Qualifying");

          const sortedDrivers = Array.from(driversMap.values())
            .filter((d) => d.driverNumber) // Include all drivers that have a number
            .sort((a, b) => {
              if (isPracticeOrQualy) {
                // In Practice/Qualifying: sort by best lap time (fastest first)
                const timeA = parseLapTime(a.bestLap);
                const timeB = parseLapTime(b.bestLap);

                // If neither has a time, sort by their original position/line
                if (timeA === Infinity && timeB === Infinity) {
                  const posA = a.position || parseInt(a.driverNumber) || 99;
                  const posB = b.position || parseInt(b.driverNumber) || 99;
                  return posA - posB;
                }
                // If only one has a time, that one comes first
                if (timeA === Infinity) return 1;
                if (timeB === Infinity) return -1;

                return timeA - timeB;
              } else {
                // In Race: sort by gap to leader, then by position
                const gapA = parseGap(a.gap);
                const gapB = parseGap(b.gap);

                // If neither has gap data, use position
                if (gapA === Infinity && gapB === Infinity) {
                  const posA = a.position || parseInt(a.driverNumber) || 99;
                  const posB = b.position || parseInt(b.driverNumber) || 99;
                  return posA - posB;
                }

                return gapA - gapB;
              }
            });

          // Update positions and calculate gaps based on sorted order
          // Find the fastest lap time for gap calculation in practice/qualy
          const fastestTime = isPracticeOrQualy
            ? Math.min(...sortedDrivers.map((d) => parseLapTime(d.bestLap)))
            : 0;

          return sortedDrivers.map((driver, index) => {
            let gap = driver.gap;
            let interval = driver.interval;

            if (isPracticeOrQualy && driver.bestLap) {
              const driverTime = parseLapTime(driver.bestLap);
              if (index === 0) {
                gap = "";
                interval = "";
              } else if (driverTime !== Infinity) {
                // Gap to leader (fastest)
                const gapMs = driverTime - fastestTime;
                gap = gapMs > 0 ? `+${(gapMs / 1000).toFixed(3)}` : "";

                // Interval to position ahead
                const prevDriver = sortedDrivers[index - 1];
                const prevTime = parseLapTime(prevDriver?.bestLap);
                if (prevTime !== Infinity) {
                  const intervalMs = driverTime - prevTime;
                  interval =
                    intervalMs > 0 ? `+${(intervalMs / 1000).toFixed(3)}` : "";
                }
              }
            }

            return {
              ...driver,
              position: index + 1,
              gap,
              interval,
            };
          });
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
      isConnectedRef.current = true;
      setError(null);
      // Stop health checks since we're connected
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
        healthCheckIntervalRef.current = null;
      }
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
      isConnectedRef.current = false;
      // Keep last received data - don't clear anything
      // Just show reconnection message
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
      sessionName: "Race",
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
  // Uses refs to avoid recreating the callback and causing effect reruns
  const checkProxyHealth = useCallback(() => {
    // Use ref to check connected status to avoid dependency issues
    if (isConnectedRef.current) return;

    fetch(`${PROXY_URL}/health`)
      .then((res) => res.json())
      .then((data) => {
        // Only connect if proxy has actual data (not just running)
        if (data.status === "ok" && data.hasState && !isConnectedRef.current) {
          console.log("[SSE] Proxy is now available with data, connecting...");
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
  }, [connect, clearAllData]); // Removed isConnected from deps

  // Extrapolated clock interval - update time every second
  useEffect(() => {
    const updateClock = () => {
      const clockData = extrapolatedClockRef.current;
      if (!clockData) return;

      // Parse the remaining time (format: HH:MM:SS or MM:SS)
      const remainingParts = clockData.remaining.split(":").map(Number);
      let totalSeconds: number;

      if (remainingParts.length === 3) {
        // HH:MM:SS
        totalSeconds =
          remainingParts[0] * 3600 + remainingParts[1] * 60 + remainingParts[2];
      } else if (remainingParts.length === 2) {
        // MM:SS
        totalSeconds = remainingParts[0] * 60 + remainingParts[1];
      } else {
        return;
      }

      if (clockData.extrapolating) {
        // Calculate elapsed time since UTC timestamp
        const utcTime = new Date(clockData.utc).getTime();
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - utcTime) / 1000);
        totalSeconds = Math.max(0, totalSeconds - elapsedSeconds);
      }

      // Format the remaining time
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      let formatted: string;
      if (hours > 0) {
        formatted = `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
          .toString()
          .padStart(2, "0")}`;
      } else {
        formatted = `${minutes.toString().padStart(2, "0")}:${seconds
          .toString()
          .padStart(2, "0")}`;
      }

      setSessionInfo((prev) => ({
        ...prev,
        remainingTime: formatted,
      }));
    };

    // Update immediately and then every second
    updateClock();
    clockIntervalRef.current = setInterval(updateClock, 1000);

    return () => {
      if (clockIntervalRef.current) {
        clearInterval(clockIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Try to connect to proxy
    fetch(`${PROXY_URL}/health`)
      .then((res) => res.json())
      .then((data) => {
        // Only connect if proxy has actual data
        if (data.status === "ok" && data.hasState) {
          connect();
        } else {
          throw new Error("Proxy not ready or no data");
        }
      })
      .catch(() => {
        console.log("[SSE] Proxy not available, using demo data");
        setError("DEMO_DATA");
        setIsInDemoMode(true);
        generateDemoData();

        // Start periodic health check every 10 seconds
        // Store interval in ref so cleanup can clear it
        healthCheckIntervalRef.current = setInterval(() => {
          // Inline health check to avoid dependency issues
          if (isConnectedRef.current) return;

          fetch(`${PROXY_URL}/health`)
            .then((res) => res.json())
            .then((data) => {
              if (
                data.status === "ok" &&
                data.hasState &&
                !isConnectedRef.current
              ) {
                console.log(
                  "[SSE] Proxy is now available with data, connecting..."
                );
                if (healthCheckIntervalRef.current) {
                  clearInterval(healthCheckIntervalRef.current);
                  healthCheckIntervalRef.current = null;
                }
                // Will trigger a page reload or we need to call connect
                // For now, just log - user can refresh
                window.location.reload();
              }
            })
            .catch(() => {});
        }, 10000);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount

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

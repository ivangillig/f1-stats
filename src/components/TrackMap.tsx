"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  Driver,
  TrackStatusInfo,
  RaceControlMessage,
  WeatherData,
} from "@/types/f1";
import { TEAM_COLORS } from "@/lib/constants";
import { useLanguage } from "@/contexts/LanguageContext";
import WeatherOverlay from "@/components/WeatherOverlay";

interface MapData {
  x: number[];
  y: number[];
  rotation: number;
  miniSectorsIndexes?: number[];
  corners: {
    number: number;
    angle: number;
    trackPosition: { x: number; y: number };
  }[];
}

interface TrackMapProps {
  drivers: Driver[];
  circuitKey?: number;
  trackStatus?: TrackStatusInfo;
  raceControlMessages?: RaceControlMessage[];
  isSessionActive?: boolean;
  qualifyingPart?: number;
  hoveredDriverNumber?: string | null;
  weather?: WeatherData;
}

const SPACE = 1000;
const ROTATION_FIX = 90;

// Helper functions
const rad = (deg: number) => deg * (Math.PI / 180);

const rotate = (x: number, y: number, a: number, px: number, py: number) => {
  const c = Math.cos(rad(a));
  const s = Math.sin(rad(a));

  x -= px;
  y -= py;

  const newX = x * c - y * s;
  const newY = y * c + x * s;

  return { y: newX + px, x: newY + py };
};

export default function TrackMap({
  drivers,
  circuitKey,
  trackStatus,
  raceControlMessages = [],
  isSessionActive = false,
  qualifyingPart,
  hoveredDriverNumber,
  weather,
}: TrackMapProps) {
  const { t } = useLanguage();
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Don't attempt fetch until we have a real circuit key
    if (!circuitKey) {
      setMapData(null);
      setLoading(false);
      return;
    }

    const fetchMap = async () => {
      console.log("[TrackMap] Fetching map for circuitKey:", circuitKey);
      setLoading(true);
      setError(null);

      // Try years from current down to 2024 — circuit layouts are stable
      // across seasons so an older year is always a valid fallback.
      const currentYear = new Date().getFullYear();
      let data: MapData | null = null;
      for (let year = currentYear; year >= 2024; year--) {
        try {
          const response = await fetch(
            `https://api.multiviewer.app/api/v1/circuits/${circuitKey}/${year}`,
          );
          if (response.ok) {
            data = await response.json();
            break;
          }
        } catch {
          // Network error on this year — try the next
        }
      }

      if (data) {
        setMapData(data);
      } else {
        setError("Circuit map unavailable");
        setMapData(null);
      }
      setLoading(false);
    };

    // Clear animated positions when circuit changes to force recalculation
    animatedPositionsRef.current.clear();
    setAnimatedPositions(new Map());

    fetchMap();
  }, [circuitKey]);

  // Clear animated positions when session changes (Q1→Q2→Q3 or session restart)
  useEffect(() => {
    console.log(
      "[TrackMap] Session change detected, clearing positions. qualifyingPart:",
      qualifyingPart,
      "isSessionActive:",
      isSessionActive,
    );
    animatedPositionsRef.current.clear();
    setAnimatedPositions(new Map());
  }, [qualifyingPart, isSessionActive]);

  const { points, bounds, rotation, centerX, centerY, corners } =
    useMemo(() => {
      if (!mapData)
        return {
          points: null,
          bounds: null,
          rotation: 0,
          centerX: 0,
          centerY: 0,
          corners: [],
        };

      const cx =
        (Math.max(...mapData.x) - Math.min(...mapData.x)) / 2 +
        Math.min(...mapData.x);
      const cy =
        (Math.max(...mapData.y) - Math.min(...mapData.y)) / 2 +
        Math.min(...mapData.y);
      const fixedRotation = (mapData.rotation || 0) + ROTATION_FIX;

      const rotatedPoints = mapData.x.map((x, index) =>
        rotate(x, mapData.y[index], fixedRotation, cx, cy),
      );

      const pointsX = rotatedPoints.map((item) => item.x);
      const pointsY = rotatedPoints.map((item) => item.y);

      const minX = Math.min(...pointsX) - SPACE;
      const minY = Math.min(...pointsY) - SPACE;
      const widthX = Math.max(...pointsX) - minX + SPACE * 2;
      const widthY = Math.max(...pointsY) - minY + SPACE * 2;

      const cornerPositions =
        mapData.corners?.map((corner) => ({
          number: corner.number,
          pos: rotate(
            corner.trackPosition.x,
            corner.trackPosition.y,
            fixedRotation,
            cx,
            cy,
          ),
          labelPos: rotate(
            corner.trackPosition.x + 540 * Math.cos(rad(corner.angle)),
            corner.trackPosition.y + 540 * Math.sin(rad(corner.angle)),
            fixedRotation,
            cx,
            cy,
          ),
        })) || [];

      return {
        points: rotatedPoints,
        bounds: [minX, minY, widthX, widthY],
        rotation: fixedRotation,
        centerX: cx,
        centerY: cy,
        corners: cornerPositions,
      };
    }, [mapData]);

  // Get mini sector boundaries from mapData
  // miniSectorsIndexes tells us where each mini sector ends in the track points array
  const miniSectorBoundaries = useMemo(() => {
    if (!points || points.length === 0 || !mapData?.miniSectorsIndexes)
      return null;

    const indexes = mapData.miniSectorsIndexes;
    const boundaries: { start: number; end: number }[] = [];

    // Each index in miniSectorsIndexes is the END of that mini sector
    // Mini sector 1 goes from 0 to indexes[0]
    // Mini sector 2 goes from indexes[0] to indexes[1], etc.
    for (let i = 0; i < indexes.length; i++) {
      const start = i === 0 ? 0 : indexes[i - 1];
      const end = indexes[i];
      boundaries.push({ start, end });
    }

    // Last mini sector wraps around to start
    if (indexes.length > 0) {
      boundaries.push({
        start: indexes[indexes.length - 1],
        end: points.length,
      });
    }

    console.log(
      "[TrackMap] Mini sector boundaries:",
      boundaries.length,
      "sectors",
    );
    return boundaries;
  }, [points, mapData]);

  // Check track status flags
  const isRedFlag = trackStatus?.status === 5;
  const isYellowFlag = trackStatus?.status === 2;
  const isGreenFlag = trackStatus?.status === 1;

  // Detect yellow flag sectors from race control messages.
  // Uses flag-transition logic (YELLOW → add, CLEAR/GREEN → remove) so it works
  // correctly in both live mode and replay (where message timestamps are historical
  // and a time-based window would incorrectly discard all messages).
  const yellowFlagSectors = useMemo(() => {
    // If green flag is active, no yellow sectors should show
    if (isGreenFlag) return new Set<number>();

    const sectors = new Set<number>();

    // Sort messages by time (oldest first) to replay transitions in order
    const sortedMessages = [...raceControlMessages].sort(
      (a, b) => new Date(a.utc).getTime() - new Date(b.utc).getTime(),
    );

    sortedMessages.forEach((msg) => {
      const isYellow = msg.flag === "YELLOW" || msg.flag === "DOUBLE YELLOW";

      // Check if it's a yellow flag message with sector info
      if (isYellow && msg.sector) {
        sectors.add(msg.sector);
      }

      // Also parse sector from message text (e.g. "YELLOW IN TRACK SECTOR 15")
      if (isYellow && msg.message) {
        const sectorMatch =
          msg.message.match(/YELLOW.*SECTOR\s*(\d+)/i) ||
          msg.message.match(/SECTOR\s*(\d+).*YELLOW/i);
        if (sectorMatch) {
          sectors.add(parseInt(sectorMatch[1]));
        }
      }

      // Clear sector when an explicit CLEAR/GREEN comes for that sector
      if ((msg.flag === "CLEAR" || msg.flag === "GREEN") && msg.sector) {
        sectors.delete(msg.sector);
      }

      // Clear all sectors on a full green / track clear message
      if (
        msg.flag === "GREEN" ||
        msg.message?.includes("GREEN LIGHT") ||
        msg.message?.includes("TRACK CLEAR") ||
        msg.message?.includes("ALL CLEAR")
      ) {
        sectors.clear();
      }
    });

    return sectors;
  }, [raceControlMessages, isGreenFlag]);

  // Animation state - store current position and velocity for smooth movement
  const animatedPositionsRef = useRef<
    Map<string, { currentIndex: number; inPit: boolean; velocity: number }>
  >(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const [animatedPositions, setAnimatedPositions] = useState<
    Map<string, { x: number; y: number; inPit: boolean }>
  >(new Map());
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(new Set());

  // Calculate target positions based on driver data (this is the "goal" for animation)
  const targetPositions = useMemo(() => {
    if (!points || points.length === 0 || !bounds)
      return new Map<string, { targetIndex: number; inPit: boolean }>();

    const pitLaneEndIndex = Math.min(Math.floor(points.length * 0.05), 50);
    const miniSectorIndexes = mapData?.miniSectorsIndexes || [];
    const totalPoints = points.length;

    const targets = new Map<string, { targetIndex: number; inPit: boolean }>();
    let pitIndex = 0;
    const pitDriverCount = Math.max(
      20,
      drivers.filter((d) => d.inPit || (!d.bestLap && !d.lastLap)).length,
    );

    const gpsDrivers = drivers.filter(
      (d) => (d.trackX || d.trackY) && !(d.trackX === 0 && d.trackY === 0),
    ).length;
    if (gpsDrivers > 0) {
      console.log(
        `[TrackMap] GPS positioning: ${gpsDrivers}/${drivers.length} drivers`,
      );
    }

    drivers.forEach((driver) => {
      const hasNoLocationData =
        (!driver.trackX && !driver.trackY) ||
        (driver.trackX === 0 && driver.trackY === 0);

      const hasNoTrackData =
        hasNoLocationData &&
        (driver.trackProgress === undefined || driver.trackProgress === 0);

      const shouldBeInPit =
        !isSessionActive ||
        driver.inPit ||
        (hasNoTrackData && !driver.bestLap && !driver.lastLap);

      if (shouldBeInPit) {
        const trackIdx = Math.floor(
          (pitIndex / pitDriverCount) * pitLaneEndIndex,
        );
        pitIndex++;
        targets.set(driver.driverNumber, {
          targetIndex: trackIdx,
          inPit: true,
        });
        return;
      }

      // Primary: GPS coordinates from OpenF1 MQTT (v1/location), ~3.7 Hz
      if (!hasNoLocationData) {
        const rotated = rotate(
          driver.trackX!,
          driver.trackY!,
          rotation,
          centerX,
          centerY,
        );
        let minDist = Infinity;
        let nearestIdx = 0;
        for (let i = 0; i < totalPoints; i++) {
          const dx = points[i].x - rotated.x;
          const dy = points[i].y - rotated.y;
          const dist = dx * dx + dy * dy;
          if (dist < minDist) {
            minDist = dist;
            nearestIdx = i;
          }
        }
        targets.set(driver.driverNumber, {
          targetIndex: nearestIdx,
          inPit: false,
        });
        return;
      }

      // Fallback: mini-sectors from SignalR (~4s granularity)
      if (
        driver.miniSectors &&
        driver.miniSectors.length > 0 &&
        miniSectorIndexes.length > 0
      ) {
        const completedMiniSectors = driver.miniSectors.filter(
          (s) => s !== "none",
        ).length;

        if (
          completedMiniSectors > 0 &&
          completedMiniSectors <= miniSectorIndexes.length
        ) {
          targets.set(driver.driverNumber, {
            targetIndex: miniSectorIndexes[completedMiniSectors - 1] || 0,
            inPit: false,
          });
          return;
        }
      }

      // No usable data — park in pit lane
      const trackIdx = Math.floor(
        (pitIndex / pitDriverCount) * pitLaneEndIndex,
      );
      pitIndex++;
      targets.set(driver.driverNumber, { targetIndex: trackIdx, inPit: true });
    });

    return targets;
  }, [
    drivers,
    points,
    bounds,
    mapData,
    isSessionActive,
    rotation,
    centerX,
    centerY,
  ]);

  // Helper to interpolate between two track points
  const getInterpolatedPoint = useCallback(
    (index: number) => {
      if (!points || points.length === 0) return { x: 0, y: 0 };

      const totalPoints = points.length;
      const normalizedIndex =
        ((index % totalPoints) + totalPoints) % totalPoints;
      const floorIndex = Math.floor(normalizedIndex);
      const ceilIndex = (floorIndex + 1) % totalPoints;
      const fraction = normalizedIndex - floorIndex;

      const p1 = points[floorIndex];
      const p2 = points[ceilIndex];

      return {
        x: p1.x + (p2.x - p1.x) * fraction,
        y: p1.y + (p2.y - p1.y) * fraction,
      };
    },
    [points],
  );

  // Animation loop for smooth movement along track points
  const animate = useCallback(() => {
    if (!points || points.length === 0) {
      animationFrameRef.current = requestAnimationFrame(animate);
      return;
    }

    const now = performance.now();
    const deltaTime = Math.min((now - lastFrameTimeRef.current) / 1000, 0.1); // seconds, capped at 100ms
    lastFrameTimeRef.current = now;

    const totalPoints = points.length;
    // Base speed: complete a lap in ~85 seconds
    const baseSpeed = totalPoints / 85;

    // Pit lane offset calculation
    const pitOffset = 500;

    const newPositions = new Map<
      string,
      { x: number; y: number; inPit: boolean }
    >();
    let hasChanges = false;

    targetPositions.forEach((target, driverNumber) => {
      let current = animatedPositionsRef.current.get(driverNumber);

      if (!current) {
        // Initialize at target position
        current = {
          currentIndex: target.targetIndex,
          inPit: target.inPit,
          velocity: baseSpeed,
        };
        animatedPositionsRef.current.set(driverNumber, current);
      }

      // Handle pit status change
      if (current.inPit !== target.inPit) {
        current.inPit = target.inPit;
        if (target.inPit) {
          current.currentIndex = target.targetIndex;
        }
      }

      if (!target.inPit) {
        // Calculate distance to target (always moving forward)
        let diff = target.targetIndex - current.currentIndex;

        // Handle wrap-around (crossing start/finish)
        while (diff < 0) diff += totalPoints;
        while (diff > totalPoints) diff -= totalPoints;

        // If target jumped back significantly, it means new lap data - catch up faster
        if (diff > totalPoints * 0.7) {
          // Target is "behind" but actually ahead (new lap)
          diff = totalPoints - diff;
          if (diff < 0) diff += totalPoints;
        }

        // Smooth acceleration/deceleration based on distance to target
        // When far from target, speed up; when close, match target speed
        let targetVelocity = baseSpeed;

        if (diff > totalPoints * 0.1) {
          // Far behind - speed up significantly to catch up
          targetVelocity = baseSpeed * 3;
        } else if (diff > totalPoints * 0.03) {
          // Moderately behind - speed up a bit
          targetVelocity = baseSpeed * 1.5;
        } else if (diff < 2) {
          // Very close - slow down to avoid overshooting
          targetVelocity = baseSpeed * 0.8;
        }

        // Smooth velocity changes (lerp)
        current.velocity +=
          (targetVelocity - current.velocity) * Math.min(deltaTime * 3, 1);

        // Move forward
        if (diff > 0.1) {
          const step = current.velocity * deltaTime;
          current.currentIndex = (current.currentIndex + step) % totalPoints;
          hasChanges = true;
        }
      }

      // Calculate screen position
      const interpolated = getInterpolatedPoint(current.currentIndex);

      let x = interpolated.x;
      let y = interpolated.y;

      if (current.inPit) {
        // Calculate perpendicular offset for pit lane
        const idx = Math.floor(current.currentIndex) % totalPoints;
        const nextIdx = (idx + 1) % totalPoints;
        const point = points[idx];
        const nextPoint = points[nextIdx];
        const dx = nextPoint.x - point.x;
        const dy = nextPoint.y - point.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        x = interpolated.x + (dy / len) * pitOffset;
        y = interpolated.y - (dx / len) * pitOffset;
      }

      newPositions.set(driverNumber, { x, y, inPit: current.inPit });
    });

    // Batch update state only when there are changes
    if (hasChanges || newPositions.size !== animatedPositions.size) {
      setAnimatedPositions(newPositions);
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [points, targetPositions, getInterpolatedPoint, animatedPositions.size]);
  // Start animation loop
  useEffect(() => {
    if (points && points.length > 0) {
      lastFrameTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [animate, points]);

  // Build car positions for rendering from animated state
  const carPositions = useMemo(() => {
    return drivers.map((driver) => {
      const pos = animatedPositions.get(driver.driverNumber);
      if (pos) {
        return { driver, x: pos.x, y: pos.y, inPit: pos.inPit };
      }
      // Fallback if no animated position yet
      const target = targetPositions.get(driver.driverNumber);
      if (target && points && points.length > 0) {
        const point = points[Math.floor(target.targetIndex) % points.length];
        return { driver, x: point.x, y: point.y, inPit: target.inPit };
      }
      return { driver, x: 0, y: 0, inPit: false };
    });
  }, [drivers, animatedPositions, targetPositions, points]);

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="h-full w-full animate-pulse rounded-lg bg-zinc-800" />
      </div>
    );
  }

  if (!points || !bounds) {
    return (
      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
        <p>{t("map.notAvailable")}</p>
      </div>
    );
  }

  const [minX, minY, widthX, widthY] = bounds;

  // Helper to get points for a specific mini sector
  // F1 sector numbers in messages appear to be 1-indexed (sector 1, 2, 3...)
  // but miniSectorsIndexes array is 0-indexed
  const getMiniSectorPath = (sectorNum: number) => {
    if (!miniSectorBoundaries || !points) return "";

    // Try direct index first (if F1 sends 0-indexed)
    let index = sectorNum;
    if (index < 0 || index >= miniSectorBoundaries.length) {
      // If out of bounds, try 1-indexed (sectorNum - 1)
      index = sectorNum - 1;
    }
    if (index < 0 || index >= miniSectorBoundaries.length) return "";

    const boundary = miniSectorBoundaries[index];
    const sectorPoints = points.slice(boundary.start, boundary.end + 1);
    if (sectorPoints.length === 0) return "";

    console.log(
      `[TrackMap] Drawing sector ${sectorNum} (index ${index}): points ${boundary.start}-${boundary.end}`,
    );

    return `M${sectorPoints[0].x},${sectorPoints[0].y} ${sectorPoints
      .map((point) => `L${point.x},${point.y}`)
      .join(" ")}`;
  };

  return (
    <div className="relative h-full w-full flex items-center justify-center py-0 px-1">
      {weather && <WeatherOverlay weather={weather} />}
      <svg
        viewBox={`${minX} ${minY} ${widthX} ${widthY}`}
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Clip paths for driver photos */}
        <defs>
          {carPositions.map(({ driver }) => (
            <clipPath
              key={`cp-${driver.driverNumber}`}
              id={`clip-photo-${driver.driverNumber}`}
            >
              <circle r={112} />
            </clipPath>
          ))}
        </defs>

        {/* Track fill - changes color on red flag */}
        <path
          strokeWidth={0}
          fill={isRedFlag ? "rgba(255, 0, 0, 0.25)" : "transparent"}
          className={isRedFlag ? "red-flag-fill" : ""}
          d={`M${points[0].x},${points[0].y} ${points
            .map((point) => `L${point.x},${point.y}`)
            .join(" ")} Z`}
        />

        {/* Track outline */}
        <path
          stroke={isRedFlag ? "#ff4444" : undefined}
          className={isRedFlag ? "" : "stroke-zinc-700"}
          strokeWidth={300}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="transparent"
          style={{ transition: "stroke 0.5s ease" }}
          d={`M${points[0].x},${points[0].y} ${points
            .map((point) => `L${point.x},${point.y}`)
            .join(" ")} Z`}
        />

        {/* Track surface */}
        <path
          className="stroke-zinc-800"
          strokeWidth={200}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="transparent"
          d={`M${points[0].x},${points[0].y} ${points
            .map((point) => `L${point.x},${point.y}`)
            .join(" ")} Z`}
        />

        {/* Yellow flag mini sectors overlay */}
        {Array.from(yellowFlagSectors).map((sectorNum) => (
          <path
            key={`yellow-sector-${sectorNum}`}
            stroke="#ffb900"
            strokeWidth={220}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="transparent"
            className="yellow-flag-sector"
            d={getMiniSectorPath(sectorNum)}
          />
        ))}

        {/* Full track yellow flag when status is yellow but no specific sector */}
        {isYellowFlag && yellowFlagSectors.size === 0 && (
          <path
            stroke="#ffb900"
            strokeWidth={220}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="transparent"
            opacity={0.5}
            d={`M${points[0].x},${points[0].y} ${points
              .map((point) => `L${point.x},${point.y}`)
              .join(" ")} Z`}
          />
        )}

        {/* Corner numbers */}
        {corners.map((corner) => (
          <text
            key={`corner.${corner.number}`}
            x={corner.labelPos.x}
            y={corner.labelPos.y}
            className="fill-zinc-600"
            fontSize={280}
            fontWeight="semibold"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {corner.number}
          </text>
        ))}

        {/* Car dots — hovered driver rendered last so it appears on top */}
        {[...carPositions]
          .sort((a, b) =>
            a.driver.driverNumber === hoveredDriverNumber
              ? 1
              : b.driver.driverNumber === hoveredDriverNumber
                ? -1
                : 0,
          )
          .map(({ driver, x, y }) => {
            const teamColor =
              driver.teamColor || TEAM_COLORS[driver.team] || "#666666";
            const isHovered = driver.driverNumber === hoveredDriverNumber;
            const hasPhoto = !failedPhotos.has(driver.code);

            return (
              <g
                key={`car.${driver.driverNumber}`}
                transform={`translate(${x}, ${y})`}
              >
                {/* Label outside dot — fuera del scale group para no desplazar el fill-box */}
                <text
                  fontWeight="bold"
                  fontSize={300}
                  fill={teamColor}
                  x={150}
                  y={-120}
                  style={{
                    opacity: isHovered ? 0 : 1,
                    transition: "opacity 0.15s ease",
                  }}
                >
                  {driver.code}
                </text>

                {/* Scale group — solo círculos simétricos, fill-box centrado en (0,0) */}
                <g
                  style={{
                    transform: isHovered ? "scale(7.3)" : "scale(1)",
                    transformBox: "fill-box",
                    transformOrigin: "center",
                    transition: "transform 0.2s ease",
                  }}
                >
                  <circle r={120} fill={teamColor} />
                  <circle
                    r={112}
                    fill="white"
                    style={{
                      opacity: isHovered ? 1 : 0,
                      transition: "opacity 0.15s ease",
                    }}
                  />
                  {hasPhoto ? (
                    <image
                      href={`/drivers/${driver.code}.png`}
                      x={-112}
                      y={-112}
                      width={224}
                      height={224}
                      clipPath={`url(#clip-photo-${driver.driverNumber})`}
                      preserveAspectRatio="xMidYMin slice"
                      onError={() =>
                        setFailedPhotos((prev) => {
                          const s = new Set(prev);
                          s.add(driver.code);
                          return s;
                        })
                      }
                      style={{
                        opacity: isHovered ? 1 : 0,
                        transition: "opacity 0.15s ease",
                      }}
                    />
                  ) : (
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={95}
                      fill={teamColor}
                      fontWeight="bold"
                      style={{
                        opacity: isHovered ? 1 : 0,
                        transition: "opacity 0.15s ease",
                      }}
                    >
                      {driver.code}
                    </text>
                  )}
                </g>
              </g>
            );
          })}
      </svg>
    </div>
  );
}

// Generate a simple oval track for demo mode

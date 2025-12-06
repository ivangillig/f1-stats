"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Driver, TrackStatusInfo, RaceControlMessage } from "@/types/f1";
import { TEAM_COLORS } from "@/lib/constants";
import { useLanguage } from "@/contexts/LanguageContext";

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
  qualifyingPart?: number; // 1=Q1, 2=Q2, 3=Q3 - used to detect session changes
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
  circuitKey = 63,
  trackStatus,
  raceControlMessages = [],
  isSessionActive = false,
  qualifyingPart,
}: TrackMapProps) {
  const { t } = useLanguage();
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMap = async () => {
      console.log("[TrackMap] Fetching map for circuitKey:", circuitKey);
      try {
        setLoading(true);
        const year = new Date().getFullYear();
        const response = await fetch(
          `https://api.multiviewer.app/api/v1/circuits/${circuitKey}/${year}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch map data");
        }

        const data = await response.json();
        setMapData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load map");
        // Use a simple demo map if API fails
        setMapData(generateDemoMap());
      } finally {
        setLoading(false);
      }
    };

    // Clear animated positions when circuit changes to force recalculation
    animatedPositionsRef.current.clear();
    setAnimatedPositions(new Map());

    fetchMap();
  }, [circuitKey]);

  // Clear animated positions when session changes (Q1→Q2→Q3 or session restart)
  useEffect(() => {
    console.log("[TrackMap] Session change detected, clearing positions. qualifyingPart:", qualifyingPart, "isSessionActive:", isSessionActive);
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
        rotate(x, mapData.y[index], fixedRotation, cx, cy)
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
            cy
          ),
          labelPos: rotate(
            corner.trackPosition.x + 540 * Math.cos(rad(corner.angle)),
            corner.trackPosition.y + 540 * Math.sin(rad(corner.angle)),
            fixedRotation,
            cx,
            cy
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
      "sectors"
    );
    return boundaries;
  }, [points, mapData]);

  // Check track status flags
  const isRedFlag = trackStatus?.status === 5;
  const isYellowFlag = trackStatus?.status === 2;
  const isGreenFlag = trackStatus?.status === 1;

  // Detect yellow flag sectors from recent race control messages
  const yellowFlagSectors = useMemo(() => {
    // If green flag is active, no yellow sectors should show
    if (isGreenFlag) return new Set<number>();

    const sectors = new Set<number>();
    const now = Date.now();
    const recentThreshold = 30000; // Consider messages from last 30 seconds

    // Sort messages by time (oldest first) to process in order
    const sortedMessages = [...raceControlMessages].sort(
      (a, b) => new Date(a.utc).getTime() - new Date(b.utc).getTime()
    );

    sortedMessages.forEach((msg) => {
      const msgTime = new Date(msg.utc).getTime();
      const isRecent = now - msgTime < recentThreshold;

      if (!isRecent) return;

      // Check if it's a yellow flag message with sector info
      if (msg.flag === "YELLOW" && msg.sector) {
        sectors.add(msg.sector);
      }

      // Also check message content for sector info (e.g., "YELLOW FLAG IN SECTOR 2")
      if (msg.message) {
        const sectorMatch =
          msg.message.match(/YELLOW.*SECTOR\s*(\d+)/i) ||
          msg.message.match(/SECTOR\s*(\d+).*YELLOW/i);
        if (sectorMatch) {
          sectors.add(parseInt(sectorMatch[1]));
        }
      }

      // Clear sector if green/clear flag in that sector
      if ((msg.flag === "CLEAR" || msg.flag === "GREEN") && msg.sector) {
        sectors.delete(msg.sector);
      }

      // Clear all if track goes green
      if (
        msg.message?.includes("GREEN LIGHT") ||
        msg.message?.includes("TRACK CLEAR")
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

  // Calculate target positions based on driver data (this is the "goal" for animation)
  const targetPositions = useMemo(() => {
    if (!points || points.length === 0 || !bounds)
      return new Map<string, { targetIndex: number; inPit: boolean }>();

    const pitLaneEndIndex = Math.min(Math.floor(points.length * 0.05), 50);
    const miniSectorIndexes = mapData?.miniSectorsIndexes || [];

    const targets = new Map<string, { targetIndex: number; inPit: boolean }>();
    let pitIndex = 0;

    drivers.forEach((driver) => {
      const hasNoTrackData =
        !driver.trackX &&
        !driver.trackY &&
        (driver.trackProgress === undefined || driver.trackProgress === 0);

      // When session is not active (demo/replay), show all drivers in pit lane
      // When session IS active, use normal logic (inPit flag or no track data)
      const shouldBeInPit =
        !isSessionActive ||
        driver.inPit ||
        (hasNoTrackData && !driver.bestLap && !driver.lastLap);

      if (shouldBeInPit) {
        // Position in pit lane
        const pitProgress =
          pitIndex /
          Math.max(
            20,
            drivers.filter((d) => d.inPit || (!d.bestLap && !d.lastLap)).length
          );
        const trackIdx = Math.floor(pitProgress * pitLaneEndIndex);
        pitIndex++;
        targets.set(driver.driverNumber, {
          targetIndex: trackIdx,
          inPit: true,
        });
        return;
      }

      // Calculate position from mini sectors
      if (
        driver.miniSectors &&
        driver.miniSectors.length > 0 &&
        miniSectorIndexes.length > 0
      ) {
        const completedMiniSectors = driver.miniSectors.filter(
          (s) => s !== "none"
        ).length;

        if (
          completedMiniSectors > 0 &&
          completedMiniSectors <= miniSectorIndexes.length
        ) {
          const targetIndex = miniSectorIndexes[completedMiniSectors - 1] || 0;
          targets.set(driver.driverNumber, { targetIndex, inPit: false });
          return;
        }
      }

      // Use trackProgress if available
      if (driver.trackProgress !== undefined && driver.trackProgress > 0) {
        const trackIndex = Math.floor(driver.trackProgress * points.length);
        targets.set(driver.driverNumber, {
          targetIndex: trackIndex,
          inPit: false,
        });
        return;
      }

      // Fallback: use position
      const trackIndex =
        Math.floor(
          ((driver.position - 1) * points.length) / (drivers.length + 5)
        ) % points.length;
      targets.set(driver.driverNumber, {
        targetIndex: trackIndex,
        inPit: false,
      });
    });

    return targets;
  }, [drivers, points, bounds, mapData, isSessionActive]);

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
    [points]
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
      `[TrackMap] Drawing sector ${sectorNum} (index ${index}): points ${boundary.start}-${boundary.end}`
    );

    return `M${sectorPoints[0].x},${sectorPoints[0].y} ${sectorPoints
      .map((point) => `L${point.x},${point.y}`)
      .join(" ")}`;
  };

  return (
    <div className="h-full w-full flex items-center justify-center py-0 px-1">
      <svg
        viewBox={`${minX} ${minY} ${widthX} ${widthY}`}
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
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

        {/* Car dots */}
        {carPositions.map(({ driver, x, y }) => {
          const teamColor = TEAM_COLORS[driver.team] || "#666666";

          return (
            <g
              key={`car.${driver.driverNumber}`}
              transform={`translate(${x}, ${y})`}
            >
              <circle r={120} fill={teamColor} />
              <text
                fontWeight="bold"
                fontSize={300}
                fill={teamColor}
                x={150}
                y={-120}
              >
                {driver.code}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Generate a simple oval track for demo mode
function generateDemoMap(): MapData {
  const points = 100;
  const a = 5000; // Semi-major axis
  const b = 3000; // Semi-minor axis

  const x: number[] = [];
  const y: number[] = [];

  for (let i = 0; i < points; i++) {
    const angle = (2 * Math.PI * i) / points;
    x.push(a * Math.cos(angle));
    y.push(b * Math.sin(angle));
  }

  return {
    x,
    y,
    rotation: 0,
    corners: [
      { number: 1, angle: 0, trackPosition: { x: a, y: 0 } },
      { number: 2, angle: Math.PI / 2, trackPosition: { x: 0, y: b } },
      { number: 3, angle: Math.PI, trackPosition: { x: -a, y: 0 } },
      { number: 4, angle: -Math.PI / 2, trackPosition: { x: 0, y: -b } },
    ],
  };
}

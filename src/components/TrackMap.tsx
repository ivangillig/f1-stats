"use client";

import { useEffect, useState, useMemo } from "react";
import { Driver } from "@/types/f1";
import { TEAM_COLORS } from "@/lib/constants";

interface MapData {
  x: number[];
  y: number[];
  rotation: number;
  corners: {
    number: number;
    angle: number;
    trackPosition: { x: number; y: number };
  }[];
}

interface TrackMapProps {
  drivers: Driver[];
  circuitKey?: number;
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

export default function TrackMap({ drivers, circuitKey = 63 }: TrackMapProps) {
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMap = async () => {
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

    fetchMap();
  }, [circuitKey]);

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

  // Generate simulated car positions on track
  const carPositions = useMemo(() => {
    if (!points || points.length === 0) return [];

    return drivers.map((driver, index) => {
      // Distribute cars along the track based on position
      const trackIndex =
        Math.floor((index * points.length) / (drivers.length + 5)) %
        points.length;
      const pos = points[trackIndex];

      return {
        driver,
        x: pos.x,
        y: pos.y,
      };
    });
  }, [drivers, points]);

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
        <p>Map not available</p>
      </div>
    );
  }

  const [minX, minY, widthX, widthY] = bounds;

  return (
    <div className="h-full w-full flex items-center justify-center p-1">
      <svg
        viewBox={`${minX} ${minY} ${widthX} ${widthY}`}
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Track outline */}
        <path
          className="stroke-zinc-700"
          strokeWidth={300}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="transparent"
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
              style={{
                transition: "all 1s linear",
                transform: `translateX(${x}px) translateY(${y}px)`,
              }}
            >
              <circle r={120} fill={teamColor} />
              <text
                fontWeight="bold"
                fontSize={300}
                fill={teamColor}
                style={{
                  transform: "translateX(150px) translateY(-120px)",
                }}
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

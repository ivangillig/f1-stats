"use client";

import { TEAM_COLORS, TEAM_LOGOS } from "@/lib/constants";

interface DriverTagProps {
  code: string;
  teamColor?: string;
  team?: string;
  name?: string;
  size?: "sm" | "md" | "lg";
  showLogo?: boolean;
}

/**
 * Driver tag component - displays driver code with team color background
 * Similar style to the timing board but without position number
 */
export default function DriverTag({
  code,
  teamColor,
  team,
  name,
  size = "md",
  showLogo = true,
}: DriverTagProps) {
  // Use provided teamColor, or lookup from team name, or fallback to gray
  const color = teamColor || (team ? TEAM_COLORS[team] : null) || "#888";
  const logoSrc = team ? TEAM_LOGOS[team] : null;

  const sizeClasses = {
    sm: {
      container: "h-[36px] rounded-md",
      code: "h-[28px] px-2 text-md rounded-md my-[4px] mx-[4px] gap-1.5",
      logo: "h-5 w-5",
    },
    md: {
      container: "h-[38px] rounded-md",
      code: "h-[30px] px-3 text-md rounded-md my-[4px] mr-[4px] gap-1.5",
      logo: "h-6 w-6",
    },
    lg: {
      container: "h-[40px] rounded-md",
      code: "h-[32px] px-4 text-lg rounded-md my-[4px] mr-[4px] gap-2",
      logo: "h-7 w-7",
    },
  };

  const classes = sizeClasses[size];

  return (
    <div
      className={`flex items-center overflow-hidden ${classes.container}`}
      style={{ backgroundColor: color }}
      title={name || code}
    >
      <div
        className={`flex items-center justify-center font-black font-mono ${classes.code}`}
        style={{ backgroundColor: "white", color: color }}
      >
        {showLogo && logoSrc && (
          <img
            src={logoSrc}
            alt={team || ""}
            className={`${classes.logo} object-contain invert`}
          />
        )}
        {code}
      </div>
    </div>
  );
}

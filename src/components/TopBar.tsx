"use client";

import { useState, useEffect } from "react";
import { SessionInfo, TrackStatusInfo, WeatherData } from "@/types/f1";
import { Badge } from "@/components/ui/badge";
import { TRACK_STATUS } from "@/lib/constants";
import { useLanguage } from "@/contexts/LanguageContext";
import LanguageToggle from "./LanguageToggle";

// Country name to ISO 3166-1 alpha-2 code mapping
const COUNTRY_CODES: Record<string, string> = {
  Australia: "au",
  Austria: "at",
  Azerbaijan: "az",
  Bahrain: "bh",
  Belgium: "be",
  Brazil: "br",
  Canada: "ca",
  China: "cn",
  France: "fr",
  Germany: "de",
  "Great Britain": "gb",
  Hungary: "hu",
  Italy: "it",
  Japan: "jp",
  Mexico: "mx",
  Monaco: "mc",
  Netherlands: "nl",
  Portugal: "pt",
  Qatar: "qa",
  Russia: "ru",
  "Saudi Arabia": "sa",
  Singapore: "sg",
  Spain: "es",
  UAE: "ae",
  "United Arab Emirates": "ae",
  "United States": "us",
  USA: "us",
  "Las Vegas": "us",
  Miami: "us",
};

function getCountryCode(country: string): string {
  return COUNTRY_CODES[country] || "un";
}

// Hook to fetch viewer count
function useViewerCount() {
  const [viewers, setViewers] = useState<number | null>(null);

  useEffect(() => {
    const fetchViewers = async () => {
      try {
        const res = await fetch("/api/proxy/api/viewers");
        if (res.ok) {
          const data = await res.json();
          setViewers(data.viewers);
        }
      } catch {
        // Silently fail - viewers count is not critical
      }
    };

    // Fetch immediately and then every 10 seconds
    fetchViewers();
    const interval = setInterval(fetchViewers, 10000);

    return () => clearInterval(interval);
  }, []);

  return viewers;
}

interface TopBarProps {
  session: SessionInfo;
  trackStatus: TrackStatusInfo;
  weather?: WeatherData;
  latestRaceControlMessage?: { category?: string; message: string };
}

// Temperature gauge with gradient scale (green → yellow → red) and indicator dot
function TemperatureGauge({
  value,
  label,
  min = 0,
  max = 60,
  unit = "°",
}: {
  value: number;
  label: string;
  min?: number;
  max?: number;
  unit?: string;
}) {
  const percentage = Math.min(Math.max((value - min) / (max - min), 0), 1);
  const angle = -135 + percentage * 270; // Arc from -135° to +135° (270° total)
  const radius = 18;
  const cx = 25,
    cy = 25;

  // Calculate indicator position
  const angleRad = (angle * Math.PI) / 180;
  const indicatorX = cx + radius * Math.cos(angleRad);
  const indicatorY = cy + radius * Math.sin(angleRad);

  // Determine color based on percentage
  const getColor = (pct: number) => {
    if (pct < 0.4) return "#22c55e"; // green
    if (pct < 0.7) return "#eab308"; // yellow
    return "#ef4444"; // red
  };

  return (
    <div
      className="relative flex h-[60px] w-[60px] items-center justify-center"
      title={`${label}: ${value}${unit}`}
    >
      <svg className="absolute inset-0" viewBox="0 0 50 50">
        {/* Gradient arc background - green to yellow to red */}
        <defs>
          <linearGradient
            id={`tempGradient-${label}`}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
        {/* Background arc (dark) */}
        <path
          d={`M ${cx + radius * Math.cos((-135 * Math.PI) / 180)} ${
            cy + radius * Math.sin((-135 * Math.PI) / 180)
          } 
              A ${radius} ${radius} 0 1 1 ${
            cx + radius * Math.cos((135 * Math.PI) / 180)
          } ${cy + radius * Math.sin((135 * Math.PI) / 180)}`}
          fill="none"
          stroke="#27272a"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Gradient arc */}
        <path
          d={`M ${cx + radius * Math.cos((-135 * Math.PI) / 180)} ${
            cy + radius * Math.sin((-135 * Math.PI) / 180)
          } 
              A ${radius} ${radius} 0 1 1 ${
            cx + radius * Math.cos((135 * Math.PI) / 180)
          } ${cy + radius * Math.sin((135 * Math.PI) / 180)}`}
          fill="none"
          stroke={`url(#tempGradient-${label})`}
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.4"
        />
        {/* Indicator dot */}
        <circle
          cx={indicatorX}
          cy={indicatorY}
          r="5"
          fill={getColor(percentage)}
          className="drop-shadow-lg"
          style={{ filter: `drop-shadow(0 0 4px ${getColor(percentage)})` }}
        />
      </svg>
      <div className="flex flex-col items-center z-10">
        <span className="text-base font-bold text-white leading-none tabular-nums">
          {value}
          {unit}
        </span>
        <span
          className="text-[9px] font-medium leading-none uppercase"
          style={{ color: getColor(percentage) }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

// Humidity gauge - blue scale
function HumidityGauge({
  value,
  label = "HUM",
}: {
  value: number;
  label?: string;
}) {
  const percentage = Math.min(value / 100, 1);
  const angle = -135 + percentage * 270;
  const radius = 18;
  const cx = 25,
    cy = 25;

  const angleRad = (angle * Math.PI) / 180;
  const indicatorX = cx + radius * Math.cos(angleRad);
  const indicatorY = cy + radius * Math.sin(angleRad);

  return (
    <div
      className="relative flex h-[60px] w-[60px] items-center justify-center"
      title={`Humidity: ${value}%`}
    >
      <svg className="absolute inset-0" viewBox="0 0 50 50">
        {/* Background arc */}
        <path
          d={`M ${cx + radius * Math.cos((-135 * Math.PI) / 180)} ${
            cy + radius * Math.sin((-135 * Math.PI) / 180)
          } 
              A ${radius} ${radius} 0 1 1 ${
            cx + radius * Math.cos((135 * Math.PI) / 180)
          } ${cy + radius * Math.sin((135 * Math.PI) / 180)}`}
          fill="none"
          stroke="#27272a"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Blue arc */}
        <path
          d={`M ${cx + radius * Math.cos((-135 * Math.PI) / 180)} ${
            cy + radius * Math.sin((-135 * Math.PI) / 180)
          } 
              A ${radius} ${radius} 0 1 1 ${
            cx + radius * Math.cos((135 * Math.PI) / 180)
          } ${cy + radius * Math.sin((135 * Math.PI) / 180)}`}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.4"
        />
        {/* Indicator dot */}
        <circle
          cx={indicatorX}
          cy={indicatorY}
          r="5"
          fill="#3b82f6"
          style={{ filter: "drop-shadow(0 0 4px #3b82f6)" }}
        />
      </svg>
      <div className="flex flex-col items-center z-10">
        <span className="text-base font-bold text-white leading-none tabular-nums">
          {value}%
        </span>
        <span className="text-[9px] font-medium leading-none uppercase text-blue-500">
          {label}
        </span>
      </div>
    </div>
  );
}

export default function TopBar({
  session,
  trackStatus,
  weather,
  latestRaceControlMessage,
}: TopBarProps) {
  const statusInfo = TRACK_STATUS[trackStatus.status] || TRACK_STATUS[1];
  const isRace = session.type === "Race";
  const { t } = useLanguage();
  const viewers = useViewerCount();

  // Traducir el mensaje del track status
  const getTrackStatusText = () => {
    if (trackStatus.message) {
      // Traducir mensajes comunes de la API
      const messageUpper = trackStatus.message.toUpperCase().trim();

      // Verificar coincidencias exactas primero
      if (messageUpper === "ALLCLEAR" || messageUpper === "ALL CLEAR") {
        return t("status.allClear");
      }

      // Luego verificar contenidos
      if (messageUpper.includes("GREEN")) {
        return t("status.green");
      }
      if (messageUpper.includes("YELLOW")) {
        return t("status.yellow");
      }
      if (messageUpper.includes("RED")) {
        return t("status.red");
      }
      if (
        messageUpper.includes("SC DEPLOYED") ||
        messageUpper.includes("SAFETY CAR")
      ) {
        return t("status.scDeployed");
      }
      if (messageUpper.includes("VSC DEPLOYED")) {
        return t("status.vscDeployed");
      }
      if (messageUpper.includes("VSC ENDING")) {
        return t("status.vscEnding");
      }
      // Si no hay traducción, devolver el mensaje original
      return trackStatus.message;
    }
    // Traducir los estados estándar basados en el código
    const statusKey = `status.${statusInfo.key}`;
    return t(statusKey);
  };

  return (
    <header className="w-full border-b border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-3 gap-4">
        {/* Left side - Logo, session, and indicators */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2 mr-4">
            <img
              src="/images/logo.png"
              alt="F1 Stats"
              className="h-14 w-auto"
            />
            <span
              className="font-bold tracking-tight text-2xl"
              style={{ fontFamily: "'Formula1 Display', sans-serif" }}
            >
              F1 Stats
            </span>
          </a>

          {/* Session info with country flag */}
          <div className="flex items-center gap-3 text-sm">
            <img
              src={`https://flagcdn.com/w80/${getCountryCode(
                session.country
              )}.png`}
              alt={session.country}
              className="h-10 w-auto rounded-sm shadow-md"
              title={session.country}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <div className="flex flex-col">
              <span className="text-white font-bold text-base">
                {session.name || "No Session"}
              </span>
              <span className="text-zinc-400 text-sm">{session.track}</span>
            </div>
            {session.type && (
              <Badge
                variant="secondary"
                className={`text-sm font-bold ml-2 ${
                  session.type === "Race"
                    ? "bg-red-500/20 text-red-400"
                    : session.type === "Qualifying"
                    ? "bg-purple-500/20 text-purple-400"
                    : session.type === "Practice"
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-zinc-500/20 text-zinc-400"
                }`}
              >
                {/* Use sessionName if available (e.g., "Practice 3"), translate the type part */}
                {session.sessionName
                  ? session.sessionName
                      .replace("Practice", t("session.practice"))
                      .replace("Qualifying", t("session.qualifying"))
                      .replace(
                        "Sprint Qualifying",
                        t("session.sprintQualifying")
                      )
                      .replace("Sprint", t("session.sprint"))
                      .replace("Race", t("session.race"))
                  : session.type === "Practice"
                  ? t("session.practice")
                  : session.type === "Qualifying"
                  ? t("session.qualifying")
                  : session.type === "Race"
                  ? t("session.race")
                  : session.type === "Sprint"
                  ? t("session.sprint")
                  : session.type === "Sprint Qualifying"
                  ? t("session.sprintQualifying")
                  : session.type}
              </Badge>
            )}
          </div>

          {/* Weather indicators after session type */}
          <div className="flex items-center gap-2">
            {weather && (
              <>
                <TemperatureGauge
                  value={Math.round(weather.trackTemp)}
                  label="TRC"
                  min={10}
                  max={60}
                />
                <TemperatureGauge
                  value={Math.round(weather.airTemp)}
                  label="AIR"
                  min={5}
                  max={45}
                />
                <HumidityGauge value={Math.round(weather.humidity)} />
              </>
            )}
          </div>
        </div>

        {/* Center - Race Control Banner */}
        {latestRaceControlMessage && (
          <div className="flex-1 flex items-center justify-center px-4 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="bg-zinc-100 text-black rounded flex items-stretch max-w-3xl  shadow-lg overflow-hidden">
              {/* FIA Logo Section - Blue background block */}
              <div className="flex-shrink-0 bg-[#003063] px-4 flex items-center justify-center">
                <img
                  src="/images/fia-footer-logo.png"
                  alt="FIA"
                  className="h-7 w-auto object-contain brightness-0 invert"
                />
              </div>
              {/* Message Section */}
              <div className="flex items-center flex-1 min-w-0 px-5 py-3">
                <span
                  className="text-sm uppercase tracking-wide truncate"
                  style={{ fontFamily: "'Formula1 Display', sans-serif" }}
                >
                  {latestRaceControlMessage.category && (
                    <span className="font-bold">
                      {latestRaceControlMessage.category}:{" "}
                    </span>
                  )}
                  <span className="font-normal">
                    {latestRaceControlMessage.message}
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Right side - Time, Laps, and Track Status */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {/* Session time and laps */}
          <div className="flex items-center gap-3">
            {session.remainingTime && (
              <div className="font-mono text-4xl font-bold tabular-nums text-white">
                {session.remainingTime}
              </div>
            )}
            {isRace && session.totalLaps > 0 && (
              <span
                className="text-2xl font-extrabold tabular-nums"
                title="Current Lap / Total Laps"
              >
                {session.currentLap} / {session.totalLaps}
              </span>
            )}
          </div>

          {/* Track Status Flag */}
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-lg border-2"
            style={{
              backgroundColor: statusInfo.color,
              borderColor: statusInfo.color,
              boxShadow: `0 0 50px ${statusInfo.color}, 0 0 100px ${statusInfo.color}80, inset 0 0 20px ${statusInfo.color}40`,
            }}
            title={statusInfo.name}
          >
            <span
              className="text-sm font-bold uppercase tracking-wider"
              style={{ color: "white" }}
            >
              {getTrackStatusText()}
            </span>
          </div>

          {/* Language Toggle */}
          <LanguageToggle />

          {/* Viewers count */}
          {viewers !== null && viewers > 0 && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-zinc-800/50 border border-zinc-700"
              title={t("viewers.watching") || "Watching now"}
            >
              {/* Eye icon */}
              <svg
                className="w-4 h-4 text-red-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path
                  fillRule="evenodd"
                  d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm font-medium text-zinc-300 tabular-nums">
                {viewers}
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

"use client";

import { useState, useEffect } from "react";
import { SessionInfo, TrackStatusInfo } from "@/types/f1";
import { Badge } from "@/components/ui/badge";
import { TRACK_STATUS } from "@/lib/constants";
import { useLanguage } from "@/contexts/LanguageContext";
import LanguageToggle from "./LanguageToggle";
import ScrollingText from "./ScrollingText";

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
  // Start at 1 — the current user is already on the dashboard
  const [viewers, setViewers] = useState<number>(1);

  useEffect(() => {
    const fetchViewers = async () => {
      try {
        const proxyUrl = process.env.NEXT_PUBLIC_PROXY_URL || "/api/proxy";
        const res = await fetch(`${proxyUrl}/api/viewers`);
        if (res.ok) {
          const data = await res.json();
          // Always show at least 1 (the current user)
          setViewers(Math.max(1, data.viewers));
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
  latestRaceControlMessage?: { category?: string; message: string };
  onBannerComplete?: () => void;
}

export default function TopBar({
  session,
  trackStatus,
  latestRaceControlMessage,
  onBannerComplete,
}: TopBarProps) {
  const statusInfo = TRACK_STATUS[trackStatus.status] || TRACK_STATUS[1];
  // trackStatus.message is authoritative for the text but the numeric code can lag —
  // use the message to override the color when they disagree
  const effectiveColor = (() => {
    const msg = (trackStatus.message || "").toUpperCase();
    // Chequered takes priority over everything — the race is over
    if (msg === "CHEQUERED") return "#3A3A3A";
    if (msg.includes("RED")) return "#FF0000";
    if (msg.includes("GREEN") || msg === "ALLCLEAR" || msg === "ALL CLEAR")
      return "#00bc7d";
    // Only use race control override for RED FLAG if we're not already past it
    if (latestRaceControlMessage?.message.includes("RED FLAG"))
      return "#FF0000";
    return statusInfo.color;
  })();
  const isRace = session.type === "Race" || session.type === "Sprint";
  const { t } = useLanguage();
  const viewers = useViewerCount();

  // Traducir el mensaje del track status
  const getTrackStatusText = () => {
    if (trackStatus.message) {
      // Traducir mensajes comunes de la API
      const messageUpper = trackStatus.message.toUpperCase().trim();

      // Verificar coincidencias exactas primero
      if (messageUpper === "CHEQUERED") {
        return t("status.chequered");
      }
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
      <div className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 gap-2 sm:gap-4">
        {/* Left side - Logo + session */}
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0 min-w-0">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2 flex-shrink-0">
            <img
              src="/images/logo.png"
              alt="F1 RaceHub"
              className="h-10 sm:h-14 w-auto"
            />
            <span
              className="hidden sm:inline font-bold tracking-tight text-xl"
              style={{ fontFamily: "'Formula1 Display', sans-serif" }}
            >
              F1 RaceHub
            </span>
          </a>

          {/* Vertical divider — mobile only, between logo and flag */}
          <div className="sm:hidden w-px h-7 bg-zinc-700 flex-shrink-0" />

          {/* Session info with country flag */}
          <div className="flex items-center gap-2 sm:gap-3 text-sm min-w-0">
            <img
              src={`https://flagcdn.com/w80/${getCountryCode(session.country)}.png`}
              alt={session.country}
              className="h-7 sm:h-10 w-auto rounded-sm shadow-md flex-shrink-0"
              title={session.country}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <div className="flex flex-col min-w-0">
              <span className="text-white font-bold text-sm sm:text-base truncate">
                {session.name === "No Active Session"
                  ? t("session.noActive")
                  : session.name || t("session.noActive")}
              </span>
              {/* Mobile: lap counter or remaining time stacked below city name */}
              <span className="sm:hidden text-zinc-300 text-xs font-bold tabular-nums">
                {isRace && session.currentLap > 0
                  ? `${t("topbar.laps")} ${session.currentLap}${session.totalLaps > 0 ? ` / ${session.totalLaps}` : ""}`
                  : !isRace && session.remainingTime
                    ? session.remainingTime
                    : null}
              </span>
              <span className="hidden sm:block text-zinc-400 text-sm truncate">
                {session.track || session.country}
              </span>
            </div>
            {session.type && (
              <Badge
                variant="secondary"
                className={`hidden sm:inline-flex text-sm font-bold ml-2 ${
                  session.type === "Race"
                    ? "bg-red-500/20 text-red-400"
                    : session.type === "Qualifying"
                      ? "bg-purple-500/20 text-purple-400"
                      : session.type === "Practice"
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-zinc-500/20 text-zinc-400"
                }`}
              >
                {session.sessionName
                  ? session.sessionName
                      .replace("Practice", t("session.practice"))
                      .replace("Qualifying", t("session.qualifying"))
                      .replace("Sprint Qualifying", t("session.sprintQualifying"))
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
                {session.qualifyingPart && ` · Q${session.qualifyingPart}`}
              </Badge>
            )}
          </div>
        </div>

        {/* Center - Race Control Banner (desktop only) */}
        {latestRaceControlMessage &&
          (() => {
            const bannerText = latestRaceControlMessage.category
              ? `${latestRaceControlMessage.category}: ${latestRaceControlMessage.message}`
              : latestRaceControlMessage.message;
            return (
              <div className="hidden lg:flex flex-1 min-w-0 overflow-hidden items-center justify-center px-4 animate-in fade-in slide-in-from-top-2 duration-500">
                <div className="bg-zinc-100 text-black rounded flex items-stretch max-w-3xl w-full shadow-lg overflow-hidden">
                  <div className="flex-shrink-0 bg-[#003063] px-4 flex items-center justify-center">
                    <img
                      src="/images/fia-footer-logo.png"
                      alt="FIA"
                      className="h-7 w-auto object-contain brightness-0 invert"
                    />
                  </div>
                  <div
                    className="flex items-center flex-1 min-w-0 px-5 py-3"
                    style={{ fontFamily: "'Formula1 Display', sans-serif" }}
                  >
                    <ScrollingText
                      text={bannerText}
                      className="text-sm uppercase tracking-wide w-full"
                      pauseSeconds={3}
                      onComplete={onBannerComplete}
                    />
                  </div>
                </div>
              </div>
            );
          })()}

        {/* Right side - Time/Laps + Track Status */}
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          {/* Session time and laps — hidden on mobile (shown below city name instead) */}
          <div className="hidden sm:flex items-center gap-2 sm:gap-3">
            {!isRace && session.remainingTime && (
              <div className="font-mono text-4xl font-bold tabular-nums text-white">
                {session.remainingTime}
              </div>
            )}
            {isRace && session.currentLap > 0 && (
              <span
                className="text-2xl font-extrabold tabular-nums"
                title="Current Lap / Total Laps"
              >
                {t("topbar.laps")} {session.currentLap}
                {session.totalLaps > 0 && ` / ${session.totalLaps}`}
              </span>
            )}
          </div>

          {/* Track Status */}
          {(trackStatus.message || "").toUpperCase() === "CHEQUERED" ? (
            <div
              className="flex items-center gap-2 px-2 sm:px-4 py-1 sm:py-2 rounded-lg border-2"
              style={{
                background:
                  "repeating-conic-gradient(#111 0% 25%, #e8e8e8 0% 50%) 0 0 / 14px 14px",
                borderColor: "#888",
                boxShadow:
                  "0 0 30px rgba(255,255,255,0.25), 0 0 70px rgba(255,255,255,0.1)",
              }}
              title={statusInfo.name}
            >
              <span
                className="text-xs sm:text-sm font-bold uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded"
                style={{ color: "#fff", backgroundColor: "rgba(0,0,0,0.65)" }}
              >
                {getTrackStatusText()}
              </span>
            </div>
          ) : (
            <div
              className="flex items-center gap-2 px-2 sm:px-4 py-1 sm:py-2 rounded-lg border-2"
              style={{
                backgroundColor: effectiveColor,
                borderColor: effectiveColor,
                boxShadow: `0 0 50px ${effectiveColor}, 0 0 100px ${effectiveColor}80, inset 0 0 20px ${effectiveColor}40`,
              }}
              title={statusInfo.name}
            >
              <span
                className="text-xs sm:text-sm font-bold uppercase tracking-wider"
                style={{ color: "white" }}
              >
                {getTrackStatusText()}
              </span>
            </div>
          )}

          {/* Language Toggle — desktop only */}
          <div className="hidden sm:block">
            <LanguageToggle />
          </div>

          {/* Viewers count — desktop only */}
          {viewers > 0 && (
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-zinc-800/50 border border-zinc-700"
              title={t("viewers.watching") || "Watching now"}
            >
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

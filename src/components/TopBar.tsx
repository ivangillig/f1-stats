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
    if (msg.includes("RED")) return "#FF0000";
    if (msg.includes("GREEN") || msg === "ALLCLEAR" || msg === "ALL CLEAR")
      return "#00bc7d";
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
                session.country,
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
                {session.name === "No Active Session"
                  ? t("session.noActive")
                  : session.name || t("session.noActive")}
              </span>
              <span className="text-zinc-400 text-sm">
                {session.track || session.country}
              </span>
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
                        t("session.sprintQualifying"),
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
        </div>

        {/* Center - Race Control Banner */}
        {latestRaceControlMessage &&
          (() => {
            const bannerText = latestRaceControlMessage.category
              ? `${latestRaceControlMessage.category}: ${latestRaceControlMessage.message}`
              : latestRaceControlMessage.message;
            return (
              <div className="flex-1 min-w-0 overflow-hidden flex items-center justify-center px-4 animate-in fade-in slide-in-from-top-2 duration-500">
                <div className="bg-zinc-100 text-black rounded flex items-stretch max-w-3xl w-full shadow-lg overflow-hidden">
                  {/* FIA Logo Section - Blue background block */}
                  <div className="flex-shrink-0 bg-[#003063] px-4 flex items-center justify-center">
                    <img
                      src="/images/fia-footer-logo.png"
                      alt="FIA"
                      className="h-7 w-auto object-contain brightness-0 invert"
                    />
                  </div>
                  {/* Message Section */}
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

        {/* Right side - Time, Laps, and Track Status */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {/* Session time and laps */}
          <div className="flex items-center gap-3">
            {session.remainingTime && (
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
                {session.totalLaps > 0 && ` ${t("topbar.of")} ${session.totalLaps}`}
              </span>
            )}
          </div>

          {/* Track Status Flag */}
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-lg border-2"
            style={{
              backgroundColor: effectiveColor,
              borderColor: effectiveColor,
              boxShadow: `0 0 50px ${effectiveColor}, 0 0 100px ${effectiveColor}80, inset 0 0 20px ${effectiveColor}40`,
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
          {viewers > 0 && (
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

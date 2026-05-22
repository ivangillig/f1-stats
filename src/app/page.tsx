"use client";

import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import TopBar from "@/components/TopBar";
import TimingBoard from "@/components/TimingBoard";
import TrackMap from "@/components/TrackMap";
import TeamRadios from "@/components/TeamRadios";
import RaceControl from "@/components/RaceControl";
import TrackViolations from "@/components/TrackViolations";
import Footer from "@/components/Footer";
import { useF1DataSSE } from "@/hooks/useF1DataSSE";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Dashboard() {
  const { t } = useLanguage();
  const {
    drivers,
    sessionInfo,
    trackStatus,
    weather,
    teamRadios,
    raceControlMessages,
    error,
    proxyMode,
  } = useF1DataSSE();

  const [activeTab, setActiveTab] = useState<"map" | "control" | "violations" | "radio">("map");
  const [hoveredDriverNumber, setHoveredDriverNumber] = useState<string | null>(
    null,
  );
  const [pinnedDriverNumber, setPinnedDriverNumber] = useState<string | null>(
    null,
  );
  const [latestRaceControlMessage, setLatestRaceControlMessage] = useState<
    { category?: string; message: string } | undefined
  >();
  const lastShownMessageRef = useRef<string | null>(null);
  const bannerTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Detect new race control messages and show banner for 5 seconds
  useEffect(() => {
    if (raceControlMessages.length > 0) {
      // Get the newest message (first in array after sorting by date desc)
      const newestMessage = raceControlMessages[0];

      // Only show banner if this is a NEW message we haven't shown yet
      if (
        newestMessage &&
        newestMessage.message !== lastShownMessageRef.current
      ) {
        // Filter out boring messages like "CLEAR IN TRACK SECTOR X"
        const isInterestingMessage =
          !newestMessage.message.includes("CLEAR IN TRACK SECTOR") &&
          !newestMessage.message.includes("TRACK SURFACE SLIPPERY");

        if (isInterestingMessage) {
          // Mark this message as shown
          lastShownMessageRef.current = newestMessage.message;

          // Clear any existing timer
          if (bannerTimerRef.current) {
            clearTimeout(bannerTimerRef.current);
          }

          setLatestRaceControlMessage({
            category: newestMessage.category,
            message: newestMessage.message,
          });

          // Set new timer to hide banner after 5 seconds
          bannerTimerRef.current = setTimeout(() => {
            setLatestRaceControlMessage(undefined);
            bannerTimerRef.current = null;
          }, 5000);
        }
      }
    }
  }, [raceControlMessages]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
      }
    };
  }, []);

  // Compute latest alert across all three sources for the strip
  const latestAlert = (() => {
    const msg = raceControlMessages[0];
    const radio = teamRadios[0];
    const msgTime = msg ? new Date(msg.utc).getTime() : 0;
    const radioTime = radio ? new Date(radio.utc).getTime() : 0;

    if (!msg && !radio) return null;

    if (radio && radioTime > msgTime) {
      const driver = drivers.find((d) => d.driverNumber === radio.racingNumber);
      return {
        label: "Radio",
        text: driver ? driver.code : `#${radio.racingNumber}`,
        time: radio.utc,
        icon: "📻" as string | null,
        color: "text-purple-400",
      };
    }

    if (!msg) return null;
    const m = msg.message;
    const label = m.includes("RED FLAG") ? "Bandera Roja"
      : m.includes("SAFETY CAR") ? "Safety Car"
      : m.includes("VSC") ? "VSC"
      : m.includes("YELLOW") ? "Bandera"
      : m.includes("GREEN") ? "Bandera"
      : m.includes("TRACK LIMITS") ? "Violación"
      : "Control";
    const color = m.includes("RED FLAG") ? "text-red-400"
      : m.includes("SAFETY CAR") || m.includes("VSC") || m.includes("TRACK LIMITS") ? "text-orange-400"
      : m.includes("YELLOW") ? "text-yellow-400"
      : m.includes("GREEN") ? "text-green-400"
      : "text-zinc-400";
    return {
      label,
      text: msg.message,
      time: msg.utc,
      icon: m.includes("CHEQUERED") ? "🏁"
        : m.includes("BLACK AND WHITE") ? "⚑"
        : m.includes("DOUBLE YELLOW") ? "🟡"
        : m.includes("YELLOW") ? "🟡"
        : m.includes("RED FLAG") ? "🔴"
        : m.includes("GREEN") ? "🟢"
        : m.includes("BLUE FLAG") ? "🔵"
        : m.includes("SAFETY CAR") ? "🚗"
        : m.includes("VSC") ? "🟡"
        : null,
      color,
    };
  })();

  if (error === "OFFLINE") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-10">
        {/* Logo */}
        <Image
          src="/images/logo.png"
          alt="F1 Dashboard"
          width={180}
          height={60}
          className="opacity-90"
          priority
        />

        {/* Línea roja */}
        <div className="w-20 h-0.5 bg-primary" />

        {/* Mensaje */}
        <div className="text-center space-y-3">
          <p
            className="text-foreground text-2xl tracking-widest uppercase"
            style={{
              fontFamily: "'Formula1 Display', sans-serif",
              fontWeight: 700,
            }}
          >
            {t("error.offline")}
          </p>
          <p className="text-muted-foreground text-sm tracking-wide">
            {t("error.retrying")}
          </p>
        </div>

        {/* Indicador animado */}
        <div className="flex items-center gap-2 text-muted-foreground/50 text-xs tracking-widest uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          {t("error.offlineBadge")}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      <TopBar
        session={sessionInfo}
        trackStatus={trackStatus}
        weather={weather}
        latestRaceControlMessage={latestRaceControlMessage}
      />

      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {error === "RECONNECTING" && (
          <div className="bg-yellow-500/10 border-b border-yellow-500/30 text-yellow-200 px-4 py-2 text-sm shrink-0">
            {t("error.reconnecting")}
          </div>
        )}

        {proxyMode === "replay" && (
          <div className="bg-yellow-500/10 border-b border-yellow-500/30 text-yellow-200 px-4 py-2 text-sm flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse shrink-0" />
            <span className="font-semibold">{t("mode.replayLabel")}</span>
            <span className="text-yellow-200/70">{t("mode.replayDesc")}</span>
          </div>
        )}

        {/* Main content: fills viewport, no page scroll */}
        <div className="flex-1 min-h-0 flex gap-2 p-2">
          {/* Column 1 - Timing Board with internal scroll */}
          <div className="flex-none overflow-x-auto min-h-0">
            <TimingBoard
              drivers={drivers}
              sessionName={sessionInfo.sessionName}
              qualifyingPart={sessionInfo.qualifyingPart}
              hoveredDriverNumber={hoveredDriverNumber}
              onDriverHover={setHoveredDriverNumber}
              pinnedDriverNumber={pinnedDriverNumber}
              onDriverPin={setPinnedDriverNumber}
            />
          </div>

          {/* Column 2 - Integrated tabbed panel + alert strip */}
          <div className="flex-1 min-h-0 flex flex-col gap-1" style={{ minWidth: 220 }}>
            {/* Integrated panel: tab bar + content inside one bordered box */}
            <div className="flex-1 min-h-0 border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden flex flex-col">
              {/* Tab bar */}
              <div className="flex shrink-0 border-b border-zinc-800 bg-zinc-950/40">
                {(
                  [
                    { id: "map", label: "Mapa" },
                    { id: "control", label: "Control de Carrera" },
                    { id: "violations", label: "Violaciones" },
                    { id: "radio", label: "Radio" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                      activeTab === tab.id
                        ? "text-zinc-100"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {tab.label}
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                        transition={{ type: "spring", stiffness: 400, damping: 35 }}
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {activeTab === "map" && (
                  <TrackMap
                    drivers={drivers}
                    circuitKey={sessionInfo.circuitKey}
                    trackStatus={trackStatus}
                    raceControlMessages={raceControlMessages}
                    isSessionActive={sessionInfo.isLive}
                    qualifyingPart={sessionInfo.qualifyingPart}
                    hoveredDriverNumber={hoveredDriverNumber ?? pinnedDriverNumber}
                  />
                )}
                {activeTab === "control" && (
                  <RaceControl messages={raceControlMessages} />
                )}
                {activeTab === "violations" && (
                  <TrackViolations
                    messages={raceControlMessages}
                    drivers={drivers}
                  />
                )}
                {activeTab === "radio" && (
                  <TeamRadios radios={teamRadios} drivers={drivers} />
                )}
              </div>
            </div>

            {/* Alert strip — latest event across all sources */}
            {latestAlert && (() => {
              let time = latestAlert.time;
              try { time = new Date(latestAlert.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
              catch { /* keep raw */ }
              return (
                <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border border-zinc-800 rounded-lg bg-zinc-900/50 text-xs">
                  <span className={`px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] uppercase tracking-wide font-medium shrink-0 ${latestAlert.color}`}>
                    {latestAlert.label}
                  </span>
                  {latestAlert.icon && <span>{latestAlert.icon}</span>}
                  <span className="text-zinc-300 truncate">{latestAlert.text}</span>
                  <span className="ml-auto text-zinc-500 shrink-0">{time}</span>
                </div>
              );
            })()}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

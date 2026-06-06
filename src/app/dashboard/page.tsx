"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Map, Flag, AlertTriangle, Radio } from "lucide-react";
import AlertStrip from "@/components/AlertStrip";
import Image from "next/image";
import TopBar from "@/components/TopBar";
import TimingBoard from "@/components/TimingBoard";
import TrackMap from "@/components/TrackMap";
import TeamRadios from "@/components/TeamRadios";
import RaceControl from "@/components/RaceControl";
import TrackViolations from "@/components/TrackViolations";
import CarTelemetry from "@/components/CarTelemetry";
import Footer from "@/components/Footer";
import { useF1DataSSE } from "@/hooks/useF1DataSSE";
import { useLanguage } from "@/contexts/LanguageContext";

export default function DashboardPage() {
  const { t } = useLanguage();
  const {
    drivers,
    sessionInfo,
    trackStatus,
    weather,
    teamRadios,
    raceControlMessages,
    carData,
    error,
    proxyMode,
    signalrDegraded,
  } = useF1DataSSE();

  const [activeTab, setActiveTab] = useState<
    "map" | "control" | "violations" | "radio"
  >("map");
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

  useEffect(() => {
    if (raceControlMessages.length > 0) {
      const newestMessage = raceControlMessages[0];
      if (
        newestMessage &&
        newestMessage.message !== lastShownMessageRef.current
      ) {
        const isInterestingMessage =
          !newestMessage.message.includes("CLEAR IN TRACK SECTOR") &&
          !newestMessage.message.includes("TRACK SURFACE SLIPPERY") &&
          !newestMessage.message.includes("WAVED BLUE FLAG") &&
          !newestMessage.message.includes("BLUE FLAG");
        if (isInterestingMessage) {
          lastShownMessageRef.current = newestMessage.message;
          setLatestRaceControlMessage({
            category: newestMessage.category,
            message: newestMessage.message,
          });
        }
      }
    }
  }, [raceControlMessages]);

  const hideBanner = useCallback(
    () => setLatestRaceControlMessage(undefined),
    [],
  );

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
    const isViolation = m.toUpperCase().includes("TRACK LIMITS");
    return {
      label: isViolation ? "Violaciones" : "Control de Carrera",
      color: isViolation ? "text-orange-400" : "text-zinc-400",
      text: msg.message,
      time: msg.utc,
      icon: m.includes("CHEQUERED")
        ? "🏁"
        : m.includes("BLACK AND WHITE")
          ? "⚑"
          : m.includes("DOUBLE YELLOW")
            ? "🟡"
            : m.includes("YELLOW")
              ? "🟡"
              : m.includes("RED FLAG")
                ? "🔴"
                : m.includes("GREEN")
                  ? "🟢"
                  : m.includes("BLUE FLAG")
                    ? "🔵"
                    : m.includes("SAFETY CAR")
                      ? "🚗"
                      : m.includes("VSC")
                        ? "🟡"
                        : null,
    };
  })();

  if (error === "OFFLINE") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-10">
        <Image
          src="/images/logo.png"
          alt="F1 Dashboard"
          width={180}
          height={60}
          className="opacity-90"
          priority
        />
        <div className="w-20 h-0.5 bg-primary" />
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
        latestRaceControlMessage={latestRaceControlMessage}
        onBannerComplete={hideBanner}
      />

      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {error === "RECONNECTING" && proxyMode !== "replay" && (
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
        {proxyMode === "standby" && (
          <div className="bg-blue-500/10 border-b border-blue-500/30 text-blue-200 px-4 py-2 text-sm flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <span className="font-semibold">{t("mode.standbyLabel")}</span>
            <span className="text-blue-200/70">{t("mode.standbyDesc")}</span>
          </div>
        )}
        {signalrDegraded && (
          <div className="bg-yellow-500/10 border-b border-yellow-500/30 text-yellow-200 px-4 py-2 text-sm flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse shrink-0" />
            <span className="font-semibold">
              {t("mode.signalrDegradedLabel")}
            </span>
            <span className="text-yellow-200/70">
              {t("mode.signalrDegradedDesc")}
            </span>
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-2 p-2">
          <div className="h-[42vh] lg:h-auto flex-none overflow-x-auto min-h-0">
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

          <div
            className="flex-1 min-h-0 flex flex-col gap-1"
            style={{ minWidth: 220 }}
          >
            <div className="relative flex-1 min-h-0 border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden flex flex-col">
              <div className="flex shrink-0 border-b border-zinc-800 bg-zinc-950/40">
                {(
                  [
                    { id: "map", label: "Mapa", icon: Map, color: "#38bdf8" }, // sky
                    {
                      id: "control",
                      label: "Control",
                      icon: Flag,
                      color: "#facc15",
                    }, // yellow
                    {
                      id: "violations",
                      label: "Límites",
                      icon: AlertTriangle,
                      color: "#f97316",
                    }, // orange
                    {
                      id: "radio",
                      label: "Radio",
                      icon: Radio,
                      color: "#a78bfa",
                    }, // violet
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                      activeTab === tab.id
                        ? "text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <tab.icon size={13} style={{ color: tab.color }} />
                    {tab.label}
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5"
                        style={{ backgroundColor: tab.color }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 35,
                        }}
                      />
                    )}
                  </button>
                ))}
              </div>

              <div className="flex-1 min-h-0 overflow-hidden">
                {activeTab === "map" &&
                  (() => {
                    const activeNum = hoveredDriverNumber ?? pinnedDriverNumber;
                    const activeDriver = activeNum
                      ? drivers.find((d) => d.driverNumber === activeNum)
                      : null;
                    const activeTelemetry = activeNum
                      ? carData[activeNum]
                      : null;
                    return (
                      <div className="h-full flex flex-col">
                        <div className="flex-1 min-h-0">
                          <TrackMap
                            drivers={drivers}
                            circuitKey={sessionInfo.circuitKey}
                            trackStatus={trackStatus}
                            raceControlMessages={raceControlMessages}
                            isSessionActive={sessionInfo.isLive}
                            qualifyingPart={sessionInfo.qualifyingPart}
                            hoveredDriverNumber={activeNum}
                            weather={weather}
                          />
                        </div>
                        <AnimatePresence>
                          {activeDriver && activeTelemetry && (
                            <motion.div
                              key="car-telemetry"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 80, opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="shrink-0 overflow-hidden"
                            >
                              <CarTelemetry
                                driver={activeDriver}
                                data={activeTelemetry}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })()}
                {activeTab === "control" && (
                  <RaceControl messages={raceControlMessages} />
                )}
                {activeTab === "violations" && (
                  <TrackViolations
                    messages={raceControlMessages}
                    drivers={drivers}
                    sessionName={sessionInfo.sessionName}
                  />
                )}
                {activeTab === "radio" && (
                  <TeamRadios radios={teamRadios} drivers={drivers} />
                )}
              </div>
            </div>

            {latestAlert && <AlertStrip alert={latestAlert} />}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

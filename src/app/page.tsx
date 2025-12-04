"use client";

import { useRef, useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import TimingBoard from "@/components/TimingBoard";
import TrackMap from "@/components/TrackMap";
import TeamRadios from "@/components/TeamRadios";
import RaceControl from "@/components/RaceControl";
import TrackViolations from "@/components/TrackViolations";
import Footer from "@/components/Footer";
import { useF1DataSSE } from "@/hooks/useF1DataSSE";

export default function Dashboard() {
  const {
    drivers,
    sessionInfo,
    trackStatus,
    weather,
    teamRadios,
    raceControlMessages,
    isConnected,
    error,
  } = useF1DataSSE();

  const timingBoardRef = useRef<HTMLDivElement>(null);
  const [timingBoardHeight, setTimingBoardHeight] = useState<number>(0);
  const [latestRaceControlMessage, setLatestRaceControlMessage] = useState<
    { category?: string; message: string } | undefined
  >();
  const previousMessageCountRef = useRef(0);

  useEffect(() => {
    const updateHeight = () => {
      if (timingBoardRef.current) {
        setTimingBoardHeight(timingBoardRef.current.offsetHeight);
      }
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);

    // Update when drivers change
    const timer = setTimeout(updateHeight, 100);

    return () => {
      window.removeEventListener("resize", updateHeight);
      clearTimeout(timer);
    };
  }, [drivers]);

  // Detect new race control messages and show banner for 5 seconds
  useEffect(() => {
    if (raceControlMessages.length > previousMessageCountRef.current) {
      const newestMessage = raceControlMessages[raceControlMessages.length - 1];
      setLatestRaceControlMessage({
        category: newestMessage.category,
        message: newestMessage.message,
      });

      const timer = setTimeout(() => {
        setLatestRaceControlMessage(undefined);
      }, 5000);

      previousMessageCountRef.current = raceControlMessages.length;

      return () => clearTimeout(timer);
    }
  }, [raceControlMessages]);

  // TEMP: Show test banner on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setLatestRaceControlMessage({
        category: "Stewards",
        message: "TRACK LIMITS - CAR 1 (VER)",
      });
      setTimeout(() => {
        setLatestRaceControlMessage(undefined);
      }, 5000);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopBar
        session={sessionInfo}
        trackStatus={trackStatus}
        weather={weather}
        latestRaceControlMessage={latestRaceControlMessage}
      />

      <main className="flex-1 flex flex-col w-full">
        {error && (
          <div className="bg-yellow-500/10 border-b border-yellow-500/30 text-yellow-200 px-4 py-2 text-sm">
            <span className="font-medium">Demo Mode:</span> {error}
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 flex flex-col w-full gap-2 p-2">
          {/* Main row - Flex with items-start */}
          <div className="flex flex-col lg:flex-row gap-2 items-start">
            {/* Column 1 - Timing Board */}
            <div
              ref={timingBoardRef}
              className="min-w-0 overflow-x-auto lg:w-[55%]"
            >
              <TimingBoard drivers={drivers} />
            </div>

            {/* Column 2 - Map + Race Control stacked - height matches TimingBoard */}
            <div
              className="lg:w-[45%] flex flex-col gap-2"
              style={{
                height:
                  timingBoardHeight > 0 ? `${timingBoardHeight}px` : "auto",
              }}
            >
              {/* Track Map */}
              <div className="flex-[3] min-h-0 border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden">
                <TrackMap drivers={drivers} />
              </div>

              {/* Race Control */}
              <div className="flex-[2] min-h-0 border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden">
                <RaceControl messages={raceControlMessages} />
              </div>
            </div>
          </div>

          {/* Bottom row - Team Radios and Violations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 h-[200px]">
            {/* Team Radios */}
            <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden">
              <TeamRadios radios={teamRadios} drivers={drivers} />
            </div>

            {/* Track Violations */}
            <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden">
              <TrackViolations
                messages={raceControlMessages}
                drivers={drivers}
              />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

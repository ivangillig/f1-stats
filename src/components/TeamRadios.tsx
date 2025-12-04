"use client";

import { RadioCapture, Driver } from "@/types/f1";
import { DRIVERS, TEAM_COLORS } from "@/lib/constants";
import { useState, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface TeamRadiosProps {
  radios: RadioCapture[];
  drivers: Driver[];
}

function formatTimeAgo(utc: string): string {
  const now = new Date();
  const time = new Date(utc);
  const diffMs = now.getTime() - time.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}

export default function TeamRadios({ radios, drivers }: TeamRadiosProps) {
  const { t } = useLanguage();
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = (index: number, path: string) => {
    // In demo mode, just show visual feedback
    if (playingIndex === index) {
      setPlayingIndex(null);
      if (audioRef.current) {
        audioRef.current.pause();
      }
    } else {
      setPlayingIndex(index);
      // Note: Real audio would come from F1 static server
      // For demo, we just simulate the visual state
      setTimeout(() => setPlayingIndex(null), 3000);
    }
  };

  const getDriverInfo = (racingNumber: string) => {
    const driverData = DRIVERS[racingNumber];
    if (!driverData) {
      return { code: racingNumber, team: "Unknown" };
    }
    return driverData;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/80">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          <span>📻</span>
          {t("teamRadios.title")}
        </h3>
      </div>

      {/* Radio list */}
      <div className="flex-1 overflow-y-auto">
        {radios.length > 0 ? (
          radios.map((radio, index) => {
            const driverInfo = getDriverInfo(radio.racingNumber);
            const teamColor = TEAM_COLORS[driverInfo.team] || "#888";
            const isPlaying = playingIndex === index;

            return (
              <div
                key={`${radio.path}-${index}`}
                className={`flex items-center gap-3 px-3 py-2 border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer ${
                  isPlaying ? "bg-zinc-800/50" : ""
                }`}
                onClick={() => handlePlay(index, radio.path)}
              >
                {/* Play button */}
                <button
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    isPlaying
                      ? "bg-red-500 scale-110"
                      : "bg-zinc-700 hover:bg-zinc-600"
                  }`}
                >
                  {isPlaying ? (
                    <span className="text-sm">⏹</span>
                  ) : (
                    <span className="text-sm ml-0.5">▶</span>
                  )}
                </button>

                {/* Driver info */}
                <div
                  className="w-10 h-6 rounded flex items-center justify-center text-xs font-bold"
                  style={{
                    backgroundColor: `${teamColor}30`,
                    color: teamColor,
                  }}
                >
                  {driverInfo.code}
                </div>

                {/* Waveform animation when playing */}
                <div className="flex-1 flex items-center gap-0.5 h-4">
                  {isPlaying ? (
                    Array(20)
                      .fill(0)
                      .map((_, i) => (
                        <div
                          key={i}
                          className="w-1 bg-red-500 rounded-full animate-pulse"
                          style={{
                            height: `${Math.random() * 100}%`,
                            animationDelay: `${i * 50}ms`,
                            animationDuration: "300ms",
                          }}
                        />
                      ))
                  ) : (
                    <div className="w-full h-0.5 bg-zinc-700 rounded-full" />
                  )}
                </div>

                {/* Time ago */}
                <span className="text-[10px] text-zinc-500 tabular-nums min-w-[40px] text-right">
                  {formatTimeAgo(radio.utc)}
                </span>
              </div>
            );
          })
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            {t("teamRadios.noRadios")}
          </div>
        )}
      </div>
    </div>
  );
}

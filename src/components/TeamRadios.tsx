"use client";

import { RadioCapture, Driver } from "@/types/f1";
import { DRIVERS, TEAM_COLORS } from "@/lib/constants";
import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import DriverTag from "./DriverTag";

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
  const [isLoading, setIsLoading] = useState(false);
  const [isActuallyPlaying, setIsActuallyPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handlePlay = async (index: number, path: string) => {
    // If clicking the same one that's playing, stop it
    if (playingIndex === index) {
      setPlayingIndex(null);
      setIsActuallyPlaying(false);
      setProgress(0);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      return;
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setIsLoading(true);
    setIsActuallyPlaying(false);
    setPlayingIndex(index);
    setProgress(0);

    try {
      // Create new audio element with the recording URL
      const audio = new Audio(path);
      audioRef.current = audio;

      // Handle when audio ends
      audio.onended = () => {
        setPlayingIndex(null);
        setIsActuallyPlaying(false);
        setProgress(0);
        audioRef.current = null;
      };

      // Handle errors
      audio.onerror = () => {
        console.error("Error loading audio:", path);
        setPlayingIndex(null);
        setIsLoading(false);
        setIsActuallyPlaying(false);
        setProgress(0);
        audioRef.current = null;
      };

      // Update progress during playback
      audio.ontimeupdate = () => {
        if (audio.duration) {
          setProgress((audio.currentTime / audio.duration) * 100);
        }
      };

      // Handle when audio actually starts playing
      audio.onplaying = () => {
        setIsLoading(false);
        setIsActuallyPlaying(true);
      };

      // Play the audio
      await audio.play();
    } catch (error) {
      console.error("Error playing audio:", error);
      setPlayingIndex(null);
      setIsLoading(false);
      setIsActuallyPlaying(false);
      setProgress(0);
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
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                    isPlaying
                      ? "bg-red-500 scale-105"
                      : "bg-zinc-700 hover:bg-zinc-600"
                  }`}
                >
                  {isPlaying && isLoading ? (
                    <span className="text-xs">⏳</span>
                  ) : isPlaying ? (
                    <span className="text-xs">⏹</span>
                  ) : (
                    <span className="text-xs ml-0.5">▶</span>
                  )}
                </button>

                {/* Driver info */}
                <DriverTag
                  code={driverInfo.code}
                  team={driverInfo.team}
                  size="sm"
                  showLogo={false}
                />

                {/* Progress bar */}
                <div className="flex-1 flex items-center h-4 max-w-[100px]">
                  <div className="w-full h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                    {isPlaying ? (
                      isLoading ? (
                        <div className="h-full bg-zinc-500 animate-pulse w-full" />
                      ) : (
                        <div
                          className="h-full bg-red-500 transition-all duration-200"
                          style={{ width: `${progress}%` }}
                        />
                      )
                    ) : (
                      <div className="h-full bg-zinc-600 w-0" />
                    )}
                  </div>
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

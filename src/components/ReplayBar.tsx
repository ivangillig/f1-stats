"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface ReplayStatus {
  sessionKey: number;
  currentOffsetMs: number;
  totalMs: number;
  dbMode: boolean;
  speed: number;
}

interface ReplayBarProps {
  proxyMode: string | null;
  sessionName?: string;
}

function formatTime(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ReplayBar({ proxyMode, sessionName }: ReplayBarProps) {
  const [status, setStatus] = useState<ReplayStatus | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (seeking) return;
    try {
      const res = await fetch("/api/proxy/replay/status");
      if (!res.ok) return;
      const data: ReplayStatus = await res.json();
      if (data.currentOffsetMs !== undefined) {
        setStatus(data);
        if (!isDragging) setDragValue(data.currentOffsetMs);
      }
    } catch {
      // proxy down — ignore
    }
  }, [isDragging, seeking]);

  useEffect(() => {
    if (proxyMode !== "replay") return;
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [proxyMode, fetchStatus]);

  // Only render in dev + replay mode. The seek endpoint is also blocked
  // server-side in production so no single user can move the clock for everyone.
  if (process.env.NODE_ENV !== "development" || proxyMode !== "replay") {
    return null;
  }

  const total = status?.totalMs || 1;
  const current = isDragging ? dragValue : (status?.currentOffsetMs ?? 0);

  async function handleSeek(targetMs: number) {
    setSeeking(true);
    try {
      await fetch("/api/proxy/replay/seek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMs }),
      });
      // Brief pause before polling again so the proxy has time to rebuild state
      setTimeout(() => {
        setSeeking(false);
        fetchStatus();
      }, 600);
    } catch {
      setSeeking(false);
    }
  }

  const canSeek = status?.dbMode && !seeking;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-3 border-t border-zinc-700/60 bg-zinc-950/95 px-4 py-2 text-xs font-mono backdrop-blur">
      {/* Label */}
      <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-400">
        DEV REPLAY
      </span>

      {/* Session name */}
      {sessionName && (
        <span className="max-w-[180px] shrink-0 truncate text-zinc-400">
          {sessionName}
        </span>
      )}

      {/* Scrubber area */}
      <div className="flex flex-1 items-center gap-2">
        <span className="w-14 shrink-0 text-right tabular-nums text-zinc-300">
          {formatTime(current)}
        </span>

        <input
          type="range"
          min={0}
          max={total}
          value={current}
          disabled={!canSeek}
          className="h-1 flex-1 cursor-pointer accent-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          onChange={(e) => {
            setIsDragging(true);
            setDragValue(Number(e.target.value));
          }}
          onMouseUp={(e) => {
            setIsDragging(false);
            handleSeek(Number((e.target as HTMLInputElement).value));
          }}
          onTouchEnd={(e) => {
            setIsDragging(false);
            handleSeek(Number((e.target as HTMLInputElement).value));
          }}
        />

        <span className="w-14 shrink-0 tabular-nums text-zinc-500">
          {formatTime(total)}
        </span>
      </div>

      {/* Status */}
      {seeking && (
        <span className="shrink-0 animate-pulse text-amber-400">seeking…</span>
      )}
      {status && !status.dbMode && (
        <span className="shrink-0 text-zinc-600" title="Seek requires the session to be in the local SQLite archive">
          seek N/A (REST)
        </span>
      )}
    </div>
  );
}

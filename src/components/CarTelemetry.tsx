"use client";

import { Driver, CarData } from "@/types/f1";

interface Props {
  driver: Driver;
  data: CarData;
}

export default function CarTelemetry({ driver, data }: Props) {
  const teamColor = driver.teamColor || "#666666";
  const drsActive = data.drs >= 10;
  const rpmPercent = Math.min((data.rpm / 14000) * 100, 100);
  const isHighRpm = data.rpm > 11500;

  return (
    <div className="h-20 flex items-stretch bg-zinc-950 border-t border-zinc-800 px-3 gap-3">
      {/* Driver badge */}
      <div
        style={{ borderLeftColor: teamColor }}
        className="border-l-[3px] pl-2 flex flex-col justify-center w-14 shrink-0"
      >
        <span className="text-[10px] text-zinc-500 tabular-nums">
          #{driver.driverNumber}
        </span>
        <span className="text-sm font-bold text-white leading-tight">
          {driver.code}
        </span>
      </div>

      <div className="w-px bg-zinc-800 my-3" />

      {/* Gear */}
      <div className="flex flex-col items-center justify-center w-10 shrink-0">
        <span
          className="text-3xl font-bold tabular-nums leading-none"
          style={{ color: teamColor }}
        >
          {data.n_gear === 0 ? "N" : data.n_gear}
        </span>
        <span className="text-[9px] text-zinc-600 uppercase tracking-wide mt-0.5">
          gear
        </span>
      </div>

      <div className="w-px bg-zinc-800 my-3" />

      {/* Speed */}
      <div className="flex flex-col items-center justify-center w-16 shrink-0">
        <span className="text-3xl font-bold text-white tabular-nums leading-none">
          {data.speed}
        </span>
        <span className="text-[9px] text-zinc-600 uppercase tracking-wide mt-0.5">
          km/h
        </span>
      </div>

      <div className="w-px bg-zinc-800 my-3" />

      {/* Throttle + Brake */}
      <div className="flex-1 flex flex-col justify-center gap-2 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-green-500 w-3 shrink-0">
            T
          </span>
          <div className="flex-1 h-2.5 bg-zinc-800 rounded-sm overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-sm"
              style={{
                width: `${data.throttle}%`,
                transition: "width 100ms linear",
              }}
            />
          </div>
          <span className="text-[10px] text-zinc-400 w-7 text-right tabular-nums">
            {data.throttle}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-red-500 w-3 shrink-0">
            B
          </span>
          <div className="flex-1 h-2.5 bg-zinc-800 rounded-sm overflow-hidden">
            <div
              className="h-full bg-red-500 rounded-sm"
              style={{
                width: `${data.brake}%`,
                transition: "width 100ms linear",
              }}
            />
          </div>
          <span className="text-[10px] text-zinc-400 w-7 text-right tabular-nums">
            {data.brake}%
          </span>
        </div>
      </div>

      <div className="w-px bg-zinc-800 my-3" />

      {/* RPM */}
      <div className="w-32 flex flex-col justify-center gap-1.5 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-zinc-600 uppercase tracking-wide">
            RPM
          </span>
          <span
            className={`text-[10px] font-mono tabular-nums ${isHighRpm ? "text-orange-400" : "text-zinc-400"}`}
          >
            {data.rpm.toLocaleString()}
          </span>
        </div>
        <div className="h-2.5 bg-zinc-800 rounded-sm overflow-hidden">
          <div
            className="h-full rounded-sm"
            style={{
              width: `${rpmPercent}%`,
              transition: "width 100ms linear",
              background: isHighRpm
                ? "linear-gradient(to right, #fb923c, #ef4444)"
                : "linear-gradient(to right, #eab308, #f97316)",
            }}
          />
        </div>
      </div>

      <div className="w-px bg-zinc-800 my-3" />

      {/* DRS */}
      <div className="flex flex-col items-center justify-center w-14 shrink-0">
        <div
          className={`text-[10px] font-bold tracking-widest px-2 py-1 rounded transition-all duration-200 ${
            drsActive
              ? "bg-green-500/20 text-green-400 ring-1 ring-green-500/40"
              : "bg-zinc-800/50 text-zinc-600"
          }`}
        >
          DRS
        </div>
        <span
          className={`text-[9px] mt-1 ${drsActive ? "text-green-500" : "text-zinc-600"}`}
        >
          {drsActive ? "OPEN" : "—"}
        </span>
      </div>
    </div>
  );
}

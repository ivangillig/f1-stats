"use client";

import { Driver, SectorStatus } from "@/types/f1";
import { TEAM_COLORS, TIRE_COMPOUNDS, TEAM_LOGOS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface DriverRowProps {
  driver: Driver;
}

// Mini sector bars - full width with better spacing and rounded corners
function MiniSectors({
  sectors,
  count = 6,
  t,
}: {
  sectors?: SectorStatus[];
  count?: number;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  // Use actual sectors length if available, otherwise use count
  const actualCount = sectors?.length || count;
  const items = sectors || Array(actualCount).fill("none");

  const getTooltip = (status: SectorStatus) => {
    if (status === "purple") return t("driver.miniSectorRecord");
    if (status === "green") return t("driver.miniSectorBest");
    if (status === "yellow") return t("driver.miniSectorSlower");
    if (status === "blue") return t("driver.miniSectorPit");
    return t("driver.miniSectorNoData");
  };

  return (
    <div className="flex gap-1 w-full justify-center">
      {items.map((status, i) => (
        <div
          key={i}
          className={cn(
            "w-[18px] h-[6px] rounded-[2px] cursor-default",
            status === "purple" && "bg-[oklch(.541_.281_293.009)]",
            status === "green" && "bg-[oklch(.696_.17_162.48)]",
            status === "yellow" && "bg-[oklch(.795_.184_86.047)]",
            status === "blue" && "bg-[#2b7fff]",
            status === "none" && "bg-zinc-700"
          )}
          title={getTooltip(status)}
        />
      ))}
    </div>
  );
}

// Tire compound icon using SVG images
function TireCompound({
  compound,
  laps,
  pitCount,
  t,
}: {
  compound: string;
  laps: number;
  pitCount: number;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const getCompoundName = (comp: string): string => {
    const key = comp?.toUpperCase();
    if (key === "SOFT") return t("driver.soft");
    if (key === "MEDIUM") return t("driver.medium");
    if (key === "HARD") return t("driver.hard");
    if (key === "INTERMEDIATE") return t("driver.intermediate");
    if (key === "WET") return t("driver.wet");
    return comp;
  };

  const compoundKey = compound?.toLowerCase() || "medium";
  const compoundName = getCompoundName(compound);

  // Map compound to image file
  const imageMap: Record<string, string> = {
    soft: "/images/tires/soft.svg",
    medium: "/images/tires/medium.svg",
    hard: "/images/tires/hard.svg",
    intermediate: "/images/tires/wet.svg", // Use wet for intermediate if no specific file
    wet: "/images/tires/wet.svg",
  };

  const imageSrc = imageMap[compoundKey] || imageMap.medium;

  return (
    <div
      className="flex items-center gap-1.5"
      title={`${compoundName} - ${t("driver.lapsOld", { laps })}`}
    >
      <img src={imageSrc} alt={compoundName} className="w-[32px] h-[32px]" />
      <div className="flex flex-col leading-none">
        <span className="text-lg text-zinc-300 tabular-nums font-bold font-mono">
          L {laps}
        </span>
        <span className="text-base text-zinc-500 tabular-nums font-mono">
          PIT {pitCount}
        </span>
      </div>
    </div>
  );
}

// DRS/PIT indicator - bordered tag that illuminates when active or shows PIT
function DrsIndicator({
  active,
  inPit,
  t,
}: {
  active?: boolean;
  inPit?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  if (inPit) {
    return (
      <div
        className="text-lg inline-flex h-10 w-full items-center justify-center rounded-md border-[3px] font-mono font-black border-cyan-500 text-cyan-500"
        title={t("driver.inPit")}
      >
        PIT
      </div>
    );
  }
  return (
    <div
      className={cn(
        "text-lg inline-flex h-10 w-full items-center justify-center rounded-md border-2 font-mono font-black",
        active
          ? "border-[oklch(.696_.17_162.48)] text-[oklch(.696_.17_162.48)]"
          : "border-zinc-600 text-zinc-600"
      )}
      title={active ? t("driver.drsActive") : t("driver.drsInactive")}
    >
      DRS
    </div>
  );
}

// Sector cell with mini sectors on top, times below side by side
function SectorCell({
  miniSectors,
  time,
  bestTime,
  status,
  isBestOverall,
  t,
}: {
  miniSectors?: SectorStatus[];
  time?: string;
  bestTime?: string;
  status: SectorStatus;
  isBestOverall?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const getTooltip = (s: SectorStatus) => {
    if (s === "purple") return t("driver.sectorBest");
    if (s === "green") return t("driver.sectorPersonalBest");
    if (s === "yellow") return t("driver.sectorSlower");
    return t("driver.sectorCurrent");
  };

  // Use dynamic count based on actual sectors
  const sectorCount = miniSectors?.length || 6;

  return (
    <div className="flex flex-col gap-1">
      <MiniSectors sectors={miniSectors} count={sectorCount} t={t} />
      <div className="flex items-center justify-center gap-2">
        <span
          className="text-lg tabular-nums font-bold leading-none text-white"
          title={getTooltip(status)}
        >
          {time || "—"}
        </span>
        <span
          className={cn(
            "text-sm tabular-nums leading-none",
            isBestOverall
              ? "text-[oklch(.541_.281_293.009)] font-medium"
              : "text-zinc-500"
          )}
          title={t("driver.bestSectorTime")}
        >
          {bestTime || ""}
        </span>
      </div>
    </div>
  );
}

export default function DriverRow({ driver }: DriverRowProps) {
  const { t } = useLanguage();

  // Use teamColor from API first, then fallback to hardcoded TEAM_COLORS
  const teamColor = driver.teamColor || TEAM_COLORS[driver.team] || "#888";

  // Calculate total segments and proportional widths for sectors
  const s1Count = driver.sector1SegmentCount || 6;
  const s2Count = driver.sector2SegmentCount || 6;
  const s3Count = driver.sector3SegmentCount || 6;
  const totalSegments = s1Count + s2Count + s3Count;

  return (
    <div
      className={cn(
        "grid gap-3 px-3 py-2 items-center",
        "border-b border-border/50 hover:bg-muted/30 transition-colors",
        driver.retired && "opacity-40"
      )}
      style={{
        gridTemplateColumns: `105px 52px 110px 48px 80px 100px ${s1Count}fr ${s2Count}fr ${s3Count}fr`,
      }}
    >
      {/* Position + Driver Tag - combined like f1-dash */}
      <div
        className="flex items-center h-[42px] px-1 rounded-md overflow-hidden"
        style={{ backgroundColor: teamColor }}
        title={driver.name}
      >
        <span className="text-2xl mr-3 font-black font-mono tabular-nums leading-none w-10 text-center text-white">
          {driver.position}
        </span>
        <div
          className="flex items-center justify-center h-[34px] px-3 rounded-sm text-xl font-black font-mono my-[5px]"
          style={{ backgroundColor: "white", color: teamColor }}
        >
          {driver.code}
        </div>
      </div>

      {/* Team Logo - HIDDEN FOR NOW
      <div className="flex items-center justify-center">
        {TEAM_LOGOS[driver.team] && (
          <img
            src={TEAM_LOGOS[driver.team]}
            alt={driver.team}
            className="h-7 w-7 object-contain"
            title={driver.team}
          />
        )}
      </div>
      */}

      {/* DRS/PIT - bordered tag */}
      <DrsIndicator active={driver.drsEnabled} inPit={driver.inPit} t={t} />

      {/* Tire with L and PIT */}
      <TireCompound
        compound={driver.tire.compound}
        laps={driver.tire.age}
        pitCount={driver.pitCount}
        t={t}
      />

      {/* Position change */}
      <span
        className={cn(
          "text-base font-medium tabular-nums leading-none text-center",
          driver.positionChange &&
            driver.positionChange > 0 &&
            "text-[oklch(.696_.17_162.48)]",
          driver.positionChange && driver.positionChange < 0 && "text-red-400",
          !driver.positionChange && "text-zinc-600"
        )}
      >
        {driver.positionChange
          ? driver.positionChange > 0
            ? `+${driver.positionChange}`
            : driver.positionChange
          : "—"}
      </span>

      {/* Gap */}
      <div className="text-right leading-none">
        <div
          className="text-xl text-foreground tabular-nums font-medium leading-none"
          title={t("driver.gapToLeader")}
        >
          {driver.position === 1 ? "—" : driver.gap || "—"}
        </div>
        <div
          className="text-sm text-zinc-500 tabular-nums mt-0.5"
          title={t("driver.intervalToAhead")}
        >
          {driver.interval || ""}
        </div>
      </div>

      {/* Last Lap + Best */}
      <div className="text-right leading-none">
        <div
          className={cn(
            "text-xl tabular-nums font-medium leading-none",
            driver.lastLapPersonalBest
              ? "text-[oklch(.696_.17_162.48)]"
              : "text-foreground"
          )}
          title={
            driver.lastLapPersonalBest
              ? t("driver.lastLapBest")
              : t("driver.bestLap")
          }
        >
          {driver.lastLap || "—"}
        </div>
        <div
          className="text-sm text-zinc-500 tabular-nums mt-0.5"
          title={t("driver.bestLapTime")}
        >
          {driver.bestLap || ""}
        </div>
      </div>

      {/* S1 */}
      <SectorCell
        miniSectors={driver.miniSectors?.slice(
          0,
          driver.sector1SegmentCount || 6
        )}
        time={driver.sector1}
        bestTime={driver.bestSector1}
        status={driver.sector1Status}
        isBestOverall={driver.sector1Status === "purple"}
        t={t}
      />

      {/* S2 */}
      <SectorCell
        miniSectors={driver.miniSectors?.slice(
          driver.sector1SegmentCount || 6,
          (driver.sector1SegmentCount || 6) + (driver.sector2SegmentCount || 6)
        )}
        time={driver.sector2}
        bestTime={driver.bestSector2}
        status={driver.sector2Status}
        isBestOverall={driver.sector2Status === "purple"}
        t={t}
      />

      {/* S3 */}
      <SectorCell
        miniSectors={driver.miniSectors?.slice(
          (driver.sector1SegmentCount || 6) + (driver.sector2SegmentCount || 6)
        )}
        time={driver.sector3}
        bestTime={driver.bestSector3}
        status={driver.sector3Status}
        isBestOverall={driver.sector3Status === "purple"}
        t={t}
      />
    </div>
  );
}

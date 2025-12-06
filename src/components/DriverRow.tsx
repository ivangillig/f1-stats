"use client";

import { Driver, SectorStatus } from "@/types/f1";
import { TEAM_COLORS, TIRE_COMPOUNDS, TEAM_LOGOS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface DriverRowProps {
  driver: Driver;
}

// Empty time format placeholder
const EMPTY_TIME = "--:--.---";
const EMPTY_SECTOR = "--.---";

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
  isActive,
  t,
}: {
  miniSectors?: SectorStatus[];
  time?: string;
  bestTime?: string;
  status: SectorStatus;
  isBestOverall?: boolean;
  isActive?: boolean; // true if this sector is current or just completed
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

  // Determine time color based on status and whether sector has time
  const getTimeColor = () => {
    // If sector has a recorded time, color based on status
    if (time) {
      if (status === "purple") return "text-[oklch(.541_.281_293.009)]"; // Purple for overall best
      if (status === "green") return "text-[oklch(.696_.17_162.48)]"; // Green for personal best
      return "text-white"; // Yellow/normal = white (it's a recorded time this lap)
    }
    // No time recorded yet
    if (isActive) return "text-white"; // Currently in this sector
    return "text-zinc-400"; // Past sector without time (shouldn't happen often)
  };

  return (
    <div className="flex flex-col gap-1.5">
      <MiniSectors sectors={miniSectors} count={sectorCount} t={t} />
      <div className="flex items-center justify-center gap-2">
        <span
          className={cn(
            "text-lg font-f1 font-medium leading-none tracking-tight",
            getTimeColor()
          )}
          title={getTooltip(status)}
        >
          {time || EMPTY_SECTOR}
        </span>
        <span
          className={cn(
            "text-sm font-f1 leading-none tracking-tight",
            isBestOverall
              ? "text-[oklch(.541_.281_293.009)] font-medium"
              : "text-zinc-500"
          )}
          title={t("driver.bestSectorTime")}
        >
          {bestTime || EMPTY_SECTOR}
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

  // Determine which sector the driver is currently in based on minisectors
  // A sector is "active" if it has segments with status != "none" or has a recorded time
  const getCurrentSector = (): number => {
    if (!driver.miniSectors || driver.miniSectors.length === 0) return 1;

    // Check S3 segments (after s1Count + s2Count)
    const s3Start = s1Count + s2Count;
    const s3Segments = driver.miniSectors.slice(s3Start);
    const hasS3Activity = s3Segments.some((s) => s !== "none");
    if (hasS3Activity) return 3;

    // Check S2 segments
    const s2Segments = driver.miniSectors.slice(s1Count, s1Count + s2Count);
    const hasS2Activity = s2Segments.some((s) => s !== "none");
    if (hasS2Activity) return 2;

    // Default to S1
    return 1;
  };

  const currentSector = getCurrentSector();

  // A sector is active if:
  // - It's the current sector OR
  // - It's the sector just before the current one (just completed)
  const isSectorActive = (sectorNum: number): boolean => {
    // If sector has a time, it was just completed - show as active
    if (sectorNum === 1 && driver.sector1) return true;
    if (sectorNum === 2 && driver.sector2) return true;
    if (sectorNum === 3 && driver.sector3) return true;

    // If it's the current sector being driven
    return sectorNum === currentSector;
  };

  return (
    <div
      className={cn(
        "grid gap-3 px-3 py-1 items-center",
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
          className="text-xl text-foreground font-f1 font-medium leading-none tracking-tight"
          title={t("driver.gapToLeader")}
        >
          {driver.position === 1 ? "—" : driver.gap || "—"}
        </div>
        <div
          className="text-sm text-zinc-500 font-f1 mt-0.5 tracking-tight"
          title={t("driver.intervalToAhead")}
        >
          {driver.interval || ""}
        </div>
      </div>

      {/* Last Lap + Best */}
      <div className="text-right leading-none">
        <div
          className={cn(
            "text-xl font-f1 font-medium leading-none tracking-tight",
            driver.lastLapOverallFastest
              ? "text-f1-purple" // Session fastest lap - purple
              : driver.lastLapPersonalBest
              ? "text-[oklch(.696_.17_162.48)]" // Personal best - green
              : "text-foreground"
          )}
          title={
            driver.lastLapOverallFastest
              ? t("driver.sessionFastest")
              : driver.lastLapPersonalBest
              ? t("driver.lastLapBest")
              : t("driver.bestLap")
          }
        >
          {driver.lastLap || EMPTY_TIME}
        </div>
        <div
          className="text-sm text-zinc-500 font-f1 mt-0.5 tracking-tight"
          title={t("driver.bestLapTime")}
        >
          {driver.bestLap || EMPTY_TIME}
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
        isBestOverall={driver.hasSector1Record}
        isActive={isSectorActive(1)}
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
        isBestOverall={driver.hasSector2Record}
        isActive={isSectorActive(2)}
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
        isBestOverall={driver.hasSector3Record}
        isActive={isSectorActive(3)}
        t={t}
      />
    </div>
  );
}

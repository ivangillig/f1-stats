import { Driver, SectorStatus } from "@/types/f1";
import { TEAM_COLORS, TIRE_COMPOUNDS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface DriverRowProps {
  driver: Driver;
}

// Mini sector bars - full width with better spacing and rounded corners
function MiniSectors({
  sectors,
  count = 6,
}: {
  sectors?: SectorStatus[];
  count?: number;
}) {
  const items = sectors?.slice(0, count) || Array(count).fill("none");

  const getTooltip = (status: SectorStatus) => {
    if (status === "purple") return "Mini sector record";
    if (status === "green") return "Personal best mini sector";
    if (status === "yellow") return "Slower than best";
    return "No data";
  };

  return (
    <div className="flex gap-[3px] w-full">
      {items.map((status, i) => (
        <div
          key={i}
          className={cn(
            "flex-1 h-[4px] rounded-sm cursor-default",
            status === "purple" && "bg-[oklch(.541_.281_293.009)]",
            status === "green" && "bg-[oklch(.696_.17_162.48)]",
            status === "yellow" && "bg-[oklch(.795_.184_86.047)]",
            status === "none" && "bg-zinc-700"
          )}
          title={getTooltip(status)}
        />
      ))}
    </div>
  );
}

// Tire compound circle - larger with L and PIT info
function TireCompound({
  compound,
  laps,
  pitCount,
}: {
  compound: string;
  laps: number;
  pitCount: number;
}) {
  const colors: Record<string, string> = {
    SOFT: "#FF3333",
    MEDIUM: "#FFD700",
    HARD: "#FFFFFF",
    INTERMEDIATE: "#43B02A",
    WET: "#0067AD",
  };
  const compoundNames: Record<string, string> = {
    SOFT: "Soft",
    MEDIUM: "Medium",
    HARD: "Hard",
    INTERMEDIATE: "Intermediate",
    WET: "Wet",
  };
  const color = colors[compound?.toUpperCase()] || "#666";
  const compoundName = compoundNames[compound?.toUpperCase()] || compound;

  return (
    <div
      className="flex items-center gap-1.5"
      title={`${compoundName} tire - ${laps} laps old`}
    >
      <div
        className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-sm font-bold"
        style={{
          border: `3px solid ${color}`,
          color: color,
        }}
      >
        {compound?.charAt(0) || "?"}
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-sm text-zinc-300 tabular-nums font-medium">
          L {laps}
        </span>
        <span className="text-xs text-zinc-500 tabular-nums">
          PIT {pitCount}
        </span>
      </div>
    </div>
  );
}

// DRS indicator - bordered tag that illuminates when active
function DrsIndicator({ active }: { active?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center px-2 py-1 rounded text-sm font-bold tracking-wide border transition-all",
        active
          ? "border-[oklch(.696_.17_162.48)] text-[oklch(.696_.17_162.48)] bg-[oklch(.696_.17_162.48)]/10"
          : "border-zinc-600 text-zinc-600"
      )}
      title={active ? "DRS Active" : "DRS Inactive"}
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
}: {
  miniSectors?: SectorStatus[];
  time?: string;
  bestTime?: string;
  status: SectorStatus;
}) {
  const getColor = (s: SectorStatus) => {
    if (s === "purple") return "text-[oklch(.541_.281_293.009)]";
    if (s === "green") return "text-[oklch(.696_.17_162.48)]";
    if (s === "yellow") return "text-[oklch(.795_.184_86.047)]";
    return "text-white"; // Normal times are white
  };

  const getTooltip = (s: SectorStatus) => {
    if (s === "purple") return "Overall best sector";
    if (s === "green") return "Personal best sector";
    if (s === "yellow") return "Slower than personal best";
    return "Current sector time";
  };

  return (
    <div className="flex flex-col gap-1">
      <MiniSectors sectors={miniSectors} count={6} />
      <div className="flex items-center justify-center gap-2">
        <span
          className={cn(
            "text-base tabular-nums font-medium leading-none",
            getColor(status)
          )}
          title={getTooltip(status)}
        >
          {time || "—"}
        </span>
        <span
          className="text-sm text-zinc-500 tabular-nums leading-none"
          title="Best sector time"
        >
          {bestTime || ""}
        </span>
      </div>
    </div>
  );
}

export default function DriverRow({ driver }: DriverRowProps) {
  // Use teamColor from API first, then fallback to hardcoded TEAM_COLORS
  const teamColor = driver.teamColor || TEAM_COLORS[driver.team] || "#888";

  return (
    <div
      className={cn(
        "grid grid-cols-[80px_44px_90px_48px_80px_100px_1fr_1fr_1fr] gap-3 px-3 py-2 items-center",
        "border-b border-border/50 hover:bg-muted/30 transition-colors",
        driver.inPit && "bg-[oklch(.623_.214_259.815)]/10",
        driver.retired && "opacity-40"
      )}
    >
      {/* Position + Driver Tag - combined like f1-dash */}
      <div
        className="flex items-center h-[34px] rounded-md overflow-hidden"
        style={{ backgroundColor: teamColor }}
        title={driver.name}
      >
        <span className="text-base font-bold tabular-nums leading-none w-9 text-center text-white">
          {driver.position}
        </span>
        <div
          className="flex items-center justify-center h-[26px] px-1 rounded-sm text-base font-bold my-[4px] mr-[4px]"
          style={{ backgroundColor: "white", color: teamColor }}
        >
          {driver.code}
        </div>
      </div>

      {/* DRS - bordered tag */}
      <DrsIndicator active={driver.drsEnabled} />

      {/* Tire with L and PIT */}
      <TireCompound
        compound={driver.tire.compound}
        laps={driver.tire.age}
        pitCount={driver.pitCount}
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
          title="Gap to leader"
        >
          {driver.position === 1 ? "—" : driver.gap || "—"}
        </div>
        <div
          className="text-sm text-zinc-500 tabular-nums mt-0.5"
          title="Interval to car ahead"
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
              ? "Last lap (Personal best!)"
              : "Last lap time"
          }
        >
          {driver.lastLap || "—"}
        </div>
        <div
          className="text-sm text-zinc-500 tabular-nums mt-0.5"
          title="Best lap time"
        >
          {driver.bestLap || ""}
        </div>
      </div>

      {/* S1 */}
      <SectorCell
        miniSectors={driver.miniSectors?.slice(0, 6)}
        time={driver.sector1}
        bestTime={driver.bestSector1}
        status={driver.sector1Status}
      />

      {/* S2 */}
      <SectorCell
        miniSectors={driver.miniSectors?.slice(6, 12)}
        time={driver.sector2}
        bestTime={driver.bestSector2}
        status={driver.sector2Status}
      />

      {/* S3 */}
      <SectorCell
        miniSectors={driver.miniSectors?.slice(12, 18)}
        time={driver.sector3}
        bestTime={driver.bestSector3}
        status={driver.sector3Status}
      />
    </div>
  );
}

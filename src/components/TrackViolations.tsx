"use client";

import { RaceControlMessage, Driver } from "@/types/f1";
import { useLanguage } from "@/contexts/LanguageContext";
import DriverTag from "./DriverTag";

interface TrackViolationsProps {
  messages: RaceControlMessage[];
  drivers: Driver[];
}

// Extract driver number from message like "CAR 10 (GAS)" or "CAR 22 (TSU)"
function extractCarNumber(message: string): string | null {
  const match = message.match(/CAR (\d+)/);
  return match ? match[1] : null;
}

export default function TrackViolations({
  messages,
  drivers,
}: TrackViolationsProps) {
  const { t } = useLanguage();

  // Count track limit violations per driver
  const violations: Record<string, number> = {};

  messages.forEach((msg) => {
    if (
      msg.category === "TrackLimits" ||
      msg.message.includes("TRACK LIMITS")
    ) {
      // First try to use driverNumber directly, then try to extract from message
      const carNum = msg.driverNumber || extractCarNumber(msg.message);
      if (carNum) {
        violations[carNum] = (violations[carNum] || 0) + 1;
      }
    }
  });

  // Get drivers with violations sorted by count
  const driversWithViolations = Object.entries(violations)
    .sort(([, a], [, b]) => b - a)
    .map(([carNum, count]) => {
      const driver = drivers.find((d) => d.driverNumber === carNum);
      return {
        carNum,
        count,
        code: driver?.code || carNum,
        team: driver?.team || "",
      };
    });

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/80">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {t("violations.title")}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {driversWithViolations.length > 0 ? (
          driversWithViolations.map(({ carNum, count, code, team }) => {
            return (
              <div
                key={carNum}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
              >
                <DriverTag code={code} team={team} size="sm" showLogo={false} />
                <span className="text-sm text-zinc-300">
                  {count}{" "}
                  {count === 1
                    ? t("violations.violation")
                    : t("violations.violations")}
                </span>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm">
            <p>{t("violations.noViolations")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

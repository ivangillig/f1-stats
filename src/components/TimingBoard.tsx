"use client";

import { Driver } from "@/types/f1";
import { Card } from "@/components/ui/card";
import DriverRow from "./DriverRow";
import { useLanguage } from "@/contexts/LanguageContext";
import { AnimatePresence, motion } from "framer-motion";

interface TimingBoardProps {
  drivers: Driver[];
  sessionName?: string;
  qualifyingPart?: number;
}

export default function TimingBoard({ drivers, sessionName, qualifyingPart }: TimingBoardProps) {
  const { t } = useLanguage();

  // Get segment counts from first driver or use defaults
  const firstDriver = drivers[0];
  const s1Count = firstDriver?.sector1SegmentCount || 6;
  const s2Count = firstDriver?.sector2SegmentCount || 6;
  const s3Count = firstDriver?.sector3SegmentCount || 6;

  return (
    <Card className="overflow-hidden h-fit">
      {/* Header - matches grid from DriverRow */}
      <div
        className="grid gap-3 px-3 py-2 bg-muted/30 text-xs text-muted-foreground uppercase tracking-wider font-medium border-b border-border"
        style={{
          gridTemplateColumns: `105px 52px 110px 48px 80px 100px ${s1Count}fr ${s2Count}fr ${s3Count}fr`,
        }}
      >
        <div>{t("timing.driver")}</div>
        {/* <div></div> Team Logo column - HIDDEN */}
        <div className="text-center">{t("timing.drs")}</div>
        <div>{t("timing.tire")}</div>
        <div className="text-center">{t("timing.position")}</div>
        <div className="text-right">{t("timing.gap")}</div>
        <div className="text-right">{t("timing.last")}</div>
        <div className="text-center">{t("timing.s1")}</div>
        <div className="text-center">{t("timing.s2")}</div>
        <div className="text-center">{t("timing.s3")}</div>
      </div>

      {/* Drivers list with animation */}
      <div className="relative">
        {drivers.length > 0 ? (
          <AnimatePresence mode="popLayout">
            {drivers.map((driver) => (
              <motion.div
                key={driver.driverNumber}
                layout
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{
                  layout: {
                    type: "spring",
                    stiffness: 50, // Reduced stiffness for smoother movement
                    damping: 15, // Increased damping to reduce overshoot
                  },
                  opacity: { duration: 0.3 },
                }}
              >
                <DriverRow driver={driver} sessionName={sessionName} qualifyingPart={qualifyingPart} />
              </motion.div>
            ))}
          </AnimatePresence>
        ) : (
          <div className="px-4 py-12 text-center text-muted-foreground text-sm">
            {t("timing.waiting")}
          </div>
        )}
      </div>
    </Card>
  );
}

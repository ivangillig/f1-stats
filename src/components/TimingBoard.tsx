"use client";

import { Driver } from "@/types/f1";
import { Card } from "@/components/ui/card";
import DriverRow from "./DriverRow";
import { useLanguage } from "@/contexts/LanguageContext";
import { AnimatePresence, motion } from "framer-motion";

interface TimingBoardProps {
  drivers: Driver[];
}

export default function TimingBoard({ drivers }: TimingBoardProps) {
  const { t } = useLanguage();

  return (
    <Card className="overflow-hidden h-fit">
      {/* Header - matches grid from DriverRow */}
      <div className="grid grid-cols-[80px_44px_90px_48px_80px_100px_1fr_1fr_1fr] gap-3 px-3 py-2 bg-muted/30 text-xs text-muted-foreground uppercase tracking-wider font-medium border-b border-border">
        <div>{t("timing.driver")}</div>
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
                <DriverRow driver={driver} />
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

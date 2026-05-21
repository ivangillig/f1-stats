"use client";

import { useRef, useEffect, useState, CSSProperties } from "react";
import { Driver } from "@/types/f1";
import { Card } from "@/components/ui/card";
import DriverRow from "./DriverRow";
import { useLanguage } from "@/contexts/LanguageContext";
import { AnimatePresence, motion } from "framer-motion";

interface TimingBoardProps {
  drivers: Driver[];
  sessionName?: string;
  qualifyingPart?: number;
  hoveredDriverNumber?: string | null;
  onDriverHover?: (driverNumber: string | null) => void;
  pinnedDriverNumber?: string | null;
  onDriverPin?: (driverNumber: string | null) => void;
}

type PinnedPos = "visible" | "above" | "below";

const HEADER_HEIGHT = 40; // timing board header row height in px

export default function TimingBoard({
  drivers,
  sessionName,
  qualifyingPart,
  hoveredDriverNumber,
  onDriverHover,
  pinnedDriverNumber,
  onDriverPin,
}: TimingBoardProps) {
  const { t } = useLanguage();

  const firstDriver = drivers[0];
  const s1Count = firstDriver?.sector1SegmentCount || 6;
  const s2Count = firstDriver?.sector2SegmentCount || 6;
  const s3Count = firstDriver?.sector3SegmentCount || 6;

  const prevPinnedRef = useRef<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const [pinnedPos, setPinnedPos] = useState<PinnedPos>("visible");
  const [cardBounds, setCardBounds] = useState<{
    top: number;
    bottom: number;
    left: number;
    width: number;
  } | null>(null);

  const getPinnedEl = () =>
    document.querySelector<HTMLElement>('[data-pinned-row="true"]');

  // Update pinned row position + card bounds using event-driven observers
  useEffect(() => {
    if (!pinnedDriverNumber) {
      setPinnedPos("visible");
      return;
    }

    let rafId: number | null = null;

    const update = () => {
      if (cardRef.current) {
        const r = cardRef.current.getBoundingClientRect();
        setCardBounds({
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          width: r.width,
        });
      }
      const el = getPinnedEl();
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0) {
        setPinnedPos("above");
      } else if (rect.top > window.innerHeight) {
        setPinnedPos("below");
      } else {
        setPinnedPos("visible");
      }
    };

    // Throttle updates to one per animation frame to avoid forced-layout thrashing
    const scheduleUpdate = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        update();
      });
    };

    // Scroll/resize move the card on screen — cheap passive listeners
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });

    // ResizeObserver fires when the list reorders or data changes cause layout shifts
    let ro: ResizeObserver | null = null;
    if (cardRef.current) {
      ro = new ResizeObserver(scheduleUpdate);
      ro.observe(cardRef.current);
    }

    // Initial measurement
    update();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      ro?.disconnect();
    };
  }, [pinnedDriverNumber]);

  // Scroll newly-pinned driver into view
  useEffect(() => {
    const newPinned = pinnedDriverNumber ?? null;
    if (newPinned && newPinned !== prevPinnedRef.current) {
      setTimeout(() => {
        getPinnedEl()?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 60);
    }
    prevPinnedRef.current = newPinned;
  }, [pinnedDriverNumber]);

  const pinnedDriver = pinnedDriverNumber
    ? drivers.find((d) => d.driverNumber === pinnedDriverNumber)
    : null;

  // Build fixed style for the sticky row
  const getStickyStyle = (): CSSProperties | null => {
    if (pinnedPos === "visible" || !pinnedDriver || !cardBounds) return null;
    const base: CSSProperties = {
      position: "fixed",
      left: cardBounds.left,
      width: cardBounds.width,
      zIndex: 40,
    };
    if (pinnedPos === "above") {
      return { ...base, top: Math.max(0, cardBounds.top + HEADER_HEIGHT) };
    }
    // below
    const cardVisibleBottom = Math.min(window.innerHeight, cardBounds.bottom);
    return {
      ...base,
      bottom: Math.max(0, window.innerHeight - cardVisibleBottom),
    };
  };

  const stickyStyle = getStickyStyle();

  const gridCols = `105px 52px 110px 48px 80px 100px minmax(${s1Count * 22}px, max-content) minmax(${s2Count * 22}px, max-content) minmax(${s3Count * 22}px, max-content)`;

  return (
    <>
      <div ref={cardRef}>
        <Card className="overflow-hidden h-fit">
          {/* Header */}
          <div
            className="grid gap-3 px-3 py-2 bg-muted/30 text-xs text-muted-foreground uppercase tracking-wider font-medium border-b border-border"
            style={{ gridTemplateColumns: gridCols }}
          >
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

          <div className="relative">
            {drivers.length > 0 ? (
              <AnimatePresence mode="popLayout">
                {drivers.map((driver) => {
                  const isPinned = pinnedDriverNumber === driver.driverNumber;
                  return (
                    <motion.div
                      key={driver.driverNumber}
                      layout
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      transition={{
                        layout: { type: "spring", stiffness: 50, damping: 15 },
                        opacity: { duration: 0.3 },
                      }}
                    >
                      <DriverRow
                        driver={driver}
                        sessionName={sessionName}
                        qualifyingPart={qualifyingPart}
                        isHovered={hoveredDriverNumber === driver.driverNumber}
                        onHover={onDriverHover}
                        isPinned={isPinned}
                        onPin={onDriverPin}
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            ) : (
              <div className="px-4 py-12 text-center text-muted-foreground text-sm">
                {t("timing.waiting")}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Sticky frozen row — shown when pinned driver scrolls off-screen */}
      {stickyStyle && pinnedDriver && (
        <div
          style={{
            ...stickyStyle,
            borderTop:
              pinnedPos === "below"
                ? `2px solid ${pinnedDriver.teamColor || "#888"}`
                : undefined,
            borderBottom:
              pinnedPos === "above"
                ? `2px solid ${pinnedDriver.teamColor || "#888"}`
                : undefined,
          }}
          className="bg-background shadow-lg"
        >
          <DriverRow
            driver={pinnedDriver}
            sessionName={sessionName}
            qualifyingPart={qualifyingPart}
            isPinned
            onPin={onDriverPin}
            isHovered={false}
            onHover={() => {}}
          />
        </div>
      )}
    </>
  );
}

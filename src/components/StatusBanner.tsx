"use client";

import { AnimatePresence, motion } from "framer-motion";
import ScrollingText from "./ScrollingText";

export interface BannerConfig {
  id: string;
  bg: string;
  border: string;
  text: string;
  dot: string;
  label: string;
  desc?: string | null;
}

export default function StatusBanner({ banner }: { banner: BannerConfig | null }) {
  return (
    <AnimatePresence mode="wait">
      {banner && (
        <motion.div
          key={banner.id}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className={`${banner.bg} border-b ${banner.border} ${banner.text} px-4 py-1.5 text-sm flex items-center gap-2 shrink-0 overflow-hidden`}
        >
          <span className={`w-2 h-2 rounded-full ${banner.dot} animate-pulse shrink-0`} />

          {/* Mobile: single scrolling line */}
          <div className="sm:hidden flex-1 min-w-0">
            <ScrollingText
              text={banner.desc ? `${banner.label} — ${banner.desc}` : banner.label}
              className="text-sm font-semibold"
              pauseSeconds={2}
              speed={60}
            />
          </div>

          {/* Desktop: label + desc side by side */}
          <span className="hidden sm:inline font-semibold">{banner.label}</span>
          {banner.desc && (
            <span className="hidden sm:inline opacity-70">{banner.desc}</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

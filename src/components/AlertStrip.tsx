"use client";

import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";

export interface AlertData {
  label: string;
  text: string;
  time: string;
  icon: string | null;
  color: string;
}

export default function AlertStrip({ alert }: { alert: AlertData }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    setOverflow(0);
    const measure = () => {
      if (textRef.current && containerRef.current) {
        const amount = textRef.current.scrollWidth - containerRef.current.offsetWidth;
        setOverflow(Math.max(0, amount));
      }
    };
    const t = setTimeout(measure, 50);
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); };
  }, [alert.text]);

  const speed = 80; // pixels per second
  const pauseDuration = 1.5;
  const returnDuration = 0.5;
  const scrollDuration = overflow > 0 ? Math.max(overflow / speed, 1.5) : 0;
  const totalDuration = overflow > 0
    ? pauseDuration + scrollDuration + pauseDuration + returnDuration
    : 0;
  const t1 = overflow > 0 ? pauseDuration / totalDuration : 0;
  const t2 = overflow > 0 ? (pauseDuration + scrollDuration) / totalDuration : 0;
  const t3 = overflow > 0 ? (pauseDuration + scrollDuration + pauseDuration) / totalDuration : 0;

  const time = (() => {
    try {
      return new Date(alert.time).toLocaleTimeString([], {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
    } catch { return alert.time; }
  })();

  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border border-zinc-800 rounded-lg bg-zinc-900/50 text-xs">
      {/* Source label */}
      <span className={`px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] uppercase tracking-wide font-medium shrink-0 ${alert.color}`}>
        {alert.label}
      </span>

      {/* Flag / type icon */}
      {alert.icon && <span className="shrink-0">{alert.icon}</span>}

      {/* Scrolling text */}
      <div ref={containerRef} className="flex-1 min-w-0 overflow-hidden">
        <motion.span
          key={alert.text}
          ref={textRef}
          className="text-zinc-300 whitespace-nowrap inline-block"
          animate={overflow > 0 ? {
            x: [0, 0, -overflow, -overflow, 0],
          } : { x: 0 }}
          transition={overflow > 0 ? {
            duration: totalDuration,
            times: [0, t1, t2, t3, 1],
            ease: "linear",
            repeat: Infinity,
          } : {}}
        >
          {alert.text}
        </motion.span>
      </div>

      {/* Time */}
      <span className="text-zinc-500 shrink-0">{time}</span>
    </div>
  );
}

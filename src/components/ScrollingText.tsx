"use client";

import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";

interface ScrollingTextProps {
  text: string;
  className?: string;
  pauseSeconds?: number;
  speed?: number; // pixels per second
  onComplete?: () => void;
}

export default function ScrollingText({
  text,
  className = "",
  pauseSeconds = 1.5,
  speed = 80,
  onComplete,
}: ScrollingTextProps) {
  const textRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    setOverflow(0);
    const measure = () => {
      if (textRef.current && containerRef.current) {
        setOverflow(Math.max(0, textRef.current.scrollWidth - containerRef.current.offsetWidth));
      }
    };
    const t = setTimeout(measure, 60);
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); };
  }, [text]);

  const scrollDuration = overflow > 0 ? Math.max(overflow / speed, 1.5) : 0;

  // When onComplete is set: play once (pause → scroll → end pause) then call it.
  // If text fits without scrolling, just wait pauseSeconds * 2.
  useEffect(() => {
    if (!onComplete) return;
    const duration = overflow > 0
      ? (pauseSeconds + scrollDuration + pauseSeconds) * 1000
      : pauseSeconds * 2 * 1000;
    const t = setTimeout(onComplete, duration);
    return () => clearTimeout(t);
  }, [overflow, onComplete, pauseSeconds, scrollDuration]);

  const isOneShot = !!onComplete;
  const oneShotTotal = pauseSeconds + scrollDuration + pauseSeconds;
  const t1os = pauseSeconds / oneShotTotal;
  const t2os = (pauseSeconds + scrollDuration) / oneShotTotal;

  const infiniteTotal = pauseSeconds * 2 + scrollDuration * 2;
  const t1 = pauseSeconds / infiniteTotal;
  const t2 = (pauseSeconds + scrollDuration) / infiniteTotal;
  const t3 = (pauseSeconds + scrollDuration + pauseSeconds) / infiniteTotal;

  return (
    <div ref={containerRef} className={`overflow-hidden ${className}`}>
      <motion.span
        key={text}
        ref={textRef}
        className="whitespace-nowrap inline-block"
        animate={overflow > 0 ? {
          x: isOneShot ? [0, 0, -overflow, -overflow] : [0, 0, -overflow, -overflow, 0],
        } : { x: 0 }}
        transition={overflow > 0 ? {
          duration: isOneShot ? oneShotTotal : infiniteTotal,
          times: isOneShot ? [0, t1os, t2os, 1] : [0, t1, t2, t3, 1],
          ease: "linear",
          repeat: isOneShot ? 0 : Infinity,
        } : {}}
      >
        {text}
      </motion.span>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import F1LandingPage from "@/components/F1LandingPage";
import { useNextF1Session } from "@/hooks/useNextF1Session";

const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL || "/api/proxy";

interface ReplaySession {
  meetingName: string;
  sessionName: string;
  circuitName: string;
  location: string;
}

function LoadingSplash() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <Image
          src="/images/logo.png"
          alt="F1 Dashboard"
          width={250}
          height={50}
          priority
        />
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-primary"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { loading, isLive } = useNextF1Session();
  const [replaySession, setReplaySession] = useState<ReplaySession | null>(null);
  const [activeViewers, setActiveViewers] = useState<number | null>(null);
  const clientId = useRef(`landing-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    const poll = () => {
      fetch(`${PROXY_URL}/health?clientId=${clientId.current}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.replaySession) setReplaySession(data.replaySession);
          if (typeof data.clients === "number") setActiveViewers(data.clients);
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, []);

  // When the session start time arrives, poll the proxy health until it confirms
  // live data is flowing (mode !== "replay"), then redirect to the dashboard.
  // This avoids landing on the dashboard showing demo data just because the
  // countdown hit zero — the proxy might not have switched sources yet.
  useEffect(() => {
    if (!isLive) return;

    const check = () => {
      fetch(`${PROXY_URL}/health?clientId=${clientId.current}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.replaySession) setReplaySession(data.replaySession);
          if (typeof data.clients === "number") setActiveViewers(data.clients);
          if (data.status === "ok" && data.mode !== "replay") {
            router.push("/dashboard");
          }
        })
        .catch(() => {});
    };

    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, [isLive, router]);

  if (loading) return <LoadingSplash />;

  return (
    <F1LandingPage
      onEnterDemo={() => router.push("/dashboard")}
      replaySession={replaySession}
      activeViewers={activeViewers}
    />
  );
}

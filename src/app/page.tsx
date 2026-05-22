"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import F1LandingPage from "@/components/F1LandingPage";
import { useNextF1Session } from "@/hooks/useNextF1Session";

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

  useEffect(() => {
    if (!loading && isLive) {
      router.push("/dashboard");
    }
  }, [loading, isLive, router]);

  if (loading) return <LoadingSplash />;

  // isLive redirects via useEffect; while navigating, keep showing splash
  if (isLive) return <LoadingSplash />;

  return <F1LandingPage onEnterDemo={() => router.push("/dashboard")} />;
}

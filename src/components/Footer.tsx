"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import SupportModal from "./SupportModal";

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="w-full border-t border-zinc-800 bg-zinc-950 py-2 px-4 shrink-0">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span className="flex items-center gap-2">
          {t("footer.madeWith")} <span className="text-red-500">♥</span> by{" "}
          <a
            href="https://www.linkedin.com/in/ivangillig/"
            className="text-blue-400 hover:underline"
          >
            Ivan Gillig
          </a>
          <span className="text-zinc-700">•</span>
          <a
            href="https://github.com/ivangillig"
            className="text-blue-400 hover:underline"
          >
            GitHub
          </a>
          <span className="text-zinc-700">•</span>
          <SupportModal />
          <span className="text-zinc-700">•</span>
          v2.0.0
        </span>
        <span className="text-[10px] text-zinc-600">
          {t("footer.disclaimer")}
        </span>
      </div>
    </footer>
  );
}

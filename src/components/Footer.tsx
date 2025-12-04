"use client";

import { useLanguage } from "@/contexts/LanguageContext";

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="w-full border-t border-zinc-800 bg-zinc-950 py-3 px-4">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span>
          {t("footer.madeWith")} <span className="text-red-500">♥</span> by{" "}
          <a
            href="https://github.com"
            className="text-blue-400 hover:underline"
          >
            Developer
          </a>
        </span>
        <span className="text-zinc-700">•</span>
        <a href="https://github.com" className="text-blue-400 hover:underline">
          GitHub
        </a>
        <span className="text-zinc-700">•</span>
        <span>{t("footer.version")}: 1.0.0</span>
      </div>
      <div className="mt-2 text-center text-[10px] text-zinc-600">
        {t("footer.disclaimer")}
      </div>
    </footer>
  );
}

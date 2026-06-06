"use client";

import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function SupportModal() {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-pink-400 hover:text-pink-300 transition-colors text-sm font-bold"
      >
        ♥ {t("footer.support")}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-80 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-white font-bold text-lg mb-1">
              {t("support.title")}
            </h2>
            <p className="text-zinc-400 text-sm mb-5">
              {t("support.desc")}
            </p>

            <div className="flex flex-col gap-3">
              <a
                href="https://github.com/sponsors/ivangillig"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white shrink-0">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <div>
                  <div className="text-white text-sm font-semibold">GitHub Sponsors</div>
                  <div className="text-zinc-400 text-xs">github.com/sponsors/ivangillig</div>
                </div>
              </a>

              <a
                href="https://cafecito.app/ivangillig"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                <span className="text-xl shrink-0">☕</span>
                <div>
                  <div className="text-white text-sm font-semibold">Cafecito</div>
                  <div className="text-zinc-400 text-xs">cafecito.app/ivangillig</div>
                </div>
              </a>

              <a
                href="https://mpago.la/2zPVttH"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                <span className="text-xl shrink-0">💙</span>
                <div>
                  <div className="text-white text-sm font-semibold">MercadoPago</div>
                  <div className="text-zinc-400 text-xs">mpago.la/2zPVttH</div>
                </div>
              </a>
            </div>

            <button
              onClick={() => setOpen(false)}
              className="mt-5 w-full text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
            >
              {t("support.close")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

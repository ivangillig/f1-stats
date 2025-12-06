"use client";

import { RaceControlMessage } from "@/types/f1";
import { useLanguage } from "@/contexts/LanguageContext";

interface RaceControlProps {
  messages: RaceControlMessage[];
}

function getFlagIcon(message: string) {
  // Check most specific patterns first to avoid partial matches
  // CHEQUERED contains "RED" so must be checked before RED FLAG
  if (message.includes("CHEQUERED")) return "🏁";
  if (message.includes("BLACK AND WHITE")) return "⚑";
  if (message.includes("DOUBLE YELLOW")) return "🟡";
  // Now check simpler patterns
  if (message.includes("YELLOW")) return "🟡";
  if (message.includes("RED FLAG")) return "🔴";
  if (message.includes("GREEN")) return "🟢";
  if (message.includes("BLUE FLAG")) return "🔵";
  if (message.includes("BLACK FLAG")) return "⚫";
  return null;
}

function formatTime(utc: string) {
  try {
    const date = new Date(utc);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return utc;
  }
}

// Translate Race Control messages intelligently
function translateMessage(
  message: string,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  let translated = message;

  // Translation patterns - order matters (most specific first)
  const patterns = [
    // Most specific patterns first to avoid partial matches
    { regex: /CHEQUERED FLAG/gi, key: "raceControl.flag.chequered" },
    { regex: /DOUBLE YELLOW FLAG/gi, key: "raceControl.flag.doubleYellow" },
    { regex: /BLACK AND WHITE FLAG/gi, key: "raceControl.flag.blackWhite" },
    { regex: /SAFETY CAR DEPLOYED/gi, key: "raceControl.msg.safetyCarDeployed" },
    { regex: /SAFETY CAR ENDING/gi, key: "raceControl.msg.safetyCarEnding" },
    { regex: /VSC DEPLOYED/gi, key: "raceControl.msg.vscDeployed" },
    { regex: /VSC ENDING/gi, key: "raceControl.msg.vscEnding" },
    { regex: /DRS ENABLED/gi, key: "raceControl.msg.drsEnabled" },
    { regex: /DRS DISABLED/gi, key: "raceControl.msg.drsDisabled" },
    { regex: /TRACK LIMITS/gi, key: "raceControl.msg.trackLimits" },
    { regex: /ALL CLEAR/gi, key: "raceControl.msg.allClear" },
    // Simpler patterns last
    { regex: /YELLOW FLAG/gi, key: "raceControl.flag.yellow" },
    { regex: /GREEN FLAG/gi, key: "raceControl.flag.green" },
    { regex: /RED FLAG/gi, key: "raceControl.flag.red" },
    { regex: /BLUE FLAG/gi, key: "raceControl.flag.blue" },
    { regex: /BLACK FLAG/gi, key: "raceControl.flag.black" },
    { regex: /\bCLEARED\b/gi, key: "raceControl.msg.cleared" },
    { regex: /\bCLEAR\b/gi, key: "raceControl.msg.clear" },
  ];

  patterns.forEach(({ regex, key }) => {
    translated = translated.replace(regex, t(key));
  });

  return translated;
}

export default function RaceControl({ messages }: RaceControlProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/80">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {t("raceControl.title")}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {messages.length > 0 ? (
          messages.slice(0, 20).map((msg, index) => (
            <div
              key={index}
              className="flex flex-col gap-1 p-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
            >
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                {msg.category && (
                  <>
                    <span className="px-1.5 py-0.5 rounded bg-zinc-700/50 text-[10px] uppercase tracking-wide">
                      {t(`raceControl.category.${msg.category}`) !==
                      `raceControl.category.${msg.category}`
                        ? t(`raceControl.category.${msg.category}`)
                        : msg.category}
                    </span>
                    <span>•</span>
                  </>
                )}
                {msg.lap && (
                  <span>{t("raceControl.lap", { lap: msg.lap })}</span>
                )}
                {msg.lap && <span>•</span>}
                <span>{formatTime(msg.utc)}</span>
              </div>
              <div className="flex items-start gap-2">
                {getFlagIcon(msg.message) && (
                  <span className="text-sm">{getFlagIcon(msg.message)}</span>
                )}
                <p className="text-sm text-zinc-200 leading-tight">
                  {translateMessage(msg.message, t)}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm">
            <p>{t("raceControl.noMessages")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

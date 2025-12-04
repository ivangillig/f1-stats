import { RaceControlMessage } from "@/types/f1";

interface RaceControlProps {
  messages: RaceControlMessage[];
}

function getFlagIcon(message: string) {
  if (message.includes("YELLOW") || message.includes("DOUBLE YELLOW"))
    return "🟡";
  if (message.includes("RED FLAG")) return "🔴";
  if (message.includes("GREEN")) return "🟢";
  if (message.includes("BLUE FLAG")) return "🔵";
  if (message.includes("BLACK AND WHITE")) return "⚑";
  if (message.includes("BLACK FLAG")) return "⚫";
  if (message.includes("CHEQUERED")) return "🏁";
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

export default function RaceControl({ messages }: RaceControlProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/80">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Race Control
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
                {msg.lap && <span>Lap {msg.lap}</span>}
                {msg.lap && <span>•</span>}
                <span>{formatTime(msg.utc)}</span>
              </div>
              <div className="flex items-start gap-2">
                {getFlagIcon(msg.message) && (
                  <span className="text-sm">{getFlagIcon(msg.message)}</span>
                )}
                <p className="text-sm text-zinc-200 leading-tight">
                  {msg.message}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm">
            <p>No messages</p>
          </div>
        )}
      </div>
    </div>
  );
}

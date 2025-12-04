import { TrackStatusInfo } from "@/types/f1";
import { TRACK_STATUS } from "@/lib/constants";

interface TrackStatusProps {
  status: TrackStatusInfo;
}

export default function TrackStatus({ status }: TrackStatusProps) {
  const statusInfo = TRACK_STATUS[status.status] || TRACK_STATUS[1];

  return (
    <div
      className="flex items-center justify-center gap-3 py-2 px-4 border-b border-zinc-800"
      style={{
        backgroundColor: `${statusInfo.color}15`,
        boxShadow: `0 0 60px 10px ${statusInfo.color}40`,
      }}
    >
      <div
        className="w-4 h-4 rounded-full"
        style={{
          backgroundColor: statusInfo.color,
          boxShadow: `0 0 20px ${statusInfo.color}`,
          animation:
            status.status !== 1 ? "pulse 1s ease-in-out infinite" : "none",
        }}
      />
      <span
        className="text-lg font-bold uppercase tracking-wider"
        style={{ color: statusInfo.color }}
      >
        {status.message || statusInfo.name}
      </span>
    </div>
  );
}

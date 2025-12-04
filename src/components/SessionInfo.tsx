import { SessionInfo } from "@/types/f1";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface SessionInfoProps {
  session: SessionInfo;
}

export default function SessionInfoComponent({ session }: SessionInfoProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide">
            Session
          </CardTitle>
          {session.isLive && (
            <Badge variant="destructive" className="gap-1.5 text-xs">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              LIVE
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-lg font-semibold text-foreground">
            {session.name || "—"}
          </p>
          <p className="text-sm text-muted-foreground">{session.track}</p>
        </div>

        <Separator />

        <div>
          <p className="text-xs text-muted-foreground uppercase mb-1">
            Remaining
          </p>
          <p className="text-2xl font-mono font-bold text-foreground tabular-nums">
            {session.remainingTime || "--:--:--"}
          </p>
        </div>

        {session.totalLaps > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground uppercase mb-1">
                Lap
              </p>
              <p className="text-lg font-mono font-semibold">
                <span className="text-foreground">{session.currentLap}</span>
                <span className="text-muted-foreground">
                  /{session.totalLaps}
                </span>
              </p>
            </div>
          </>
        )}

        <Separator />

        <div>
          <p className="text-xs text-muted-foreground uppercase mb-1">Type</p>
          <Badge
            variant="secondary"
            className={
              session.type === "Race"
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : session.type === "Qualifying"
                ? "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
                : session.type === "Practice"
                ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                : "bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30"
            }
          >
            {session.type || "—"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

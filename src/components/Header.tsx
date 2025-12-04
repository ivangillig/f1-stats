import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface HeaderProps {
  isConnected: boolean;
}

export default function Header({ isConnected }: HeaderProps) {
  return (
    <header className="bg-card border-b border-border sticky top-0 z-50">
      <div className="container mx-auto px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-primary text-primary-foreground font-black text-lg px-2 py-0.5 rounded">
            F1
          </div>
          <span className="text-foreground font-semibold text-base">
            Live Timing
          </span>
        </div>

        <Badge
          variant={isConnected ? "default" : "destructive"}
          className={cn(
            "gap-1.5",
            isConnected &&
              "bg-green-500/20 text-green-400 hover:bg-green-500/30"
          )}
        >
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              isConnected ? "bg-green-400 animate-pulse" : "bg-red-400"
            )}
          />
          {isConnected ? "LIVE" : "OFFLINE"}
        </Badge>
      </div>
    </header>
  );
}

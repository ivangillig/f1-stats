import { Driver } from "@/types/f1";
import { Card } from "@/components/ui/card";
import DriverRow from "./DriverRow";

interface TimingBoardProps {
  drivers: Driver[];
}

export default function TimingBoard({ drivers }: TimingBoardProps) {
  return (
    <Card className="overflow-hidden h-fit">
      {/* Header - matches grid from DriverRow */}
      <div className="grid grid-cols-[80px_44px_90px_48px_80px_100px_1fr_1fr_1fr] gap-3 px-3 py-2 bg-muted/30 text-xs text-muted-foreground uppercase tracking-wider font-medium border-b border-border">
        <div>Driver</div>
        <div className="text-center">DRS</div>
        <div>Tire</div>
        <div className="text-center">+/-</div>
        <div className="text-right">Gap</div>
        <div className="text-right">Last</div>
        <div className="text-center">S1</div>
        <div className="text-center">S2</div>
        <div className="text-center">S3</div>
      </div>

      {/* Drivers list */}
      <div>
        {drivers.length > 0 ? (
          drivers.map((driver) => (
            <DriverRow key={driver.driverNumber} driver={driver} />
          ))
        ) : (
          <div className="px-4 py-12 text-center text-muted-foreground text-sm">
            Waiting for driver data...
          </div>
        )}
      </div>
    </Card>
  );
}

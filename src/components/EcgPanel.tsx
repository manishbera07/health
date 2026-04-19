import { Activity, Heart, Wind } from "lucide-react";
import { EcgCanvas } from "./EcgCanvas";

interface Props {
  ecg: number | null;
  active: boolean;
  rhythm: string;
}

export const EcgPanel = ({ ecg, active, rhythm }: Props) => {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card-gradient shadow-card">
      <div className="flex items-start justify-between p-6">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            <span className="text-xs font-medium uppercase tracking-wider">Real-time Rhythm</span>
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{rhythm}</h2>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
          <Heart className={`h-3.5 w-3.5 text-accent ${active ? "heartbeat" : ""}`} />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {active ? "Streaming" : "Idle"}
          </span>
        </div>
      </div>
      <div className="relative h-[280px] w-full px-2 pb-2">
        <EcgCanvas
          sample={ecg}
          active={active}
          className="h-full w-full rounded-2xl bg-card"
        />
        {!active && (
          <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-2xl bg-card/40 backdrop-blur-[1px]">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Wind className="h-6 w-6 breathe" />
              <p className="text-sm">Waiting for live ECG data…</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

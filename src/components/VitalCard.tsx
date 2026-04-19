import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sparkline } from "./Sparkline";
import { AnimatedNumber } from "./AnimatedNumber";

interface Props {
  label: string;
  value: number | null;
  unit?: string;
  digits?: number;
  trend: (number | null)[];
  trendColor?: string;
  state?: "ok" | "warn" | "danger" | "idle";
  icon?: ReactNode;
  className?: string;
}

const stateRing: Record<string, string> = {
  ok: "before:bg-success/40",
  warn: "before:bg-warning/50",
  danger: "before:bg-destructive/60 animate-[pulse_2s_ease-in-out_infinite]",
  idle: "before:bg-transparent",
};

export const VitalCard = ({
  label,
  value,
  unit,
  digits = 0,
  trend,
  trendColor = "hsl(var(--primary))",
  state = "idle",
  icon,
  className,
}: Props) => {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-3xl border border-border bg-card-gradient p-6 shadow-card transition-all duration-300 hover:shadow-elevated hover:-translate-y-0.5",
        "before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:rounded-l-3xl before:transition-colors",
        stateRing[state],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon && <span className="opacity-70">{icon}</span>}
          <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        </div>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <AnimatedNumber
          value={value}
          digits={digits}
          className="font-mono-tabular text-5xl font-semibold tracking-tight text-foreground"
        />
        {unit && <span className="text-base font-medium text-muted-foreground">{unit}</span>}
      </div>

      <div className="mt-4 h-12 w-full">
        <Sparkline values={trend} color={trendColor} className="h-full w-full" />
      </div>
    </div>
  );
};

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  state: "ok" | "bad" | "idle";
  className?: string;
}

const map: Record<string, string> = {
  ok: "bg-success/10 text-success border-success/20",
  bad: "bg-destructive/10 text-destructive border-destructive/20",
  idle: "bg-muted text-muted-foreground border-border",
};

export const StatusChip = ({ label, value, state, className }: Props) => (
  <div
    className={cn(
      "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
      map[state],
      className
    )}
  >
    <span
      className={cn(
        "h-1.5 w-1.5 rounded-full",
        state === "ok" && "bg-success pulse-dot",
        state === "bad" && "bg-destructive",
        state === "idle" && "bg-muted-foreground/40"
      )}
    />
    <span className="opacity-70">{label}</span>
    <span className="font-mono-tabular font-semibold">{value}</span>
  </div>
);

import { useState } from "react";
import { Circle, Download, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { SessionState } from "@/hooks/useSession";
import { cn } from "@/lib/utils";

interface Props {
  state: SessionState;
  onStart: (name: string) => void;
  onStop: () => void;
  onExport: () => boolean;
  elapsedMs: number;
}

const fmtElapsed = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

export const SessionControls = ({ state, onStart, onStop, onExport, elapsedMs }: Props) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (state.recording) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 py-1 pl-3 pr-1">
        <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
        <span className="text-xs font-medium text-destructive">REC</span>
        <span className="font-mono-tabular text-xs text-destructive/80">{fmtElapsed(elapsedMs)}</span>
        <span className="text-xs text-muted-foreground">· {state.count} pts</span>
        <Button onClick={onStop} size="sm" variant="destructive" className="ml-2 h-7 gap-1.5 rounded-full">
          <Square className="h-3 w-3 fill-current" /> Stop
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {state.count > 0 && (
        <Button size="sm" variant="outline" className="gap-2 rounded-full" onClick={onExport}>
          <Download className="h-3.5 w-3.5" /> Export ({state.count})
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className={cn("gap-2 rounded-full")}>
            <Circle className="h-3 w-3 fill-destructive text-destructive" /> Record
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Start a recording session</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Session name (optional)</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="morning-baseline"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onStart(name); setOpen(false); setName(""); }}>
              Start recording
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

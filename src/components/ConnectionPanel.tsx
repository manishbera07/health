import { Bluetooth, Cable, PlugZap, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/lib/streamReader";

export type Mode = "serial" | "ble";

interface Props {
  mode: Mode;
  setMode: (m: Mode) => void;
  status: ConnectionStatus;
  detail: string;
  onConnect: () => void;
  onDisconnect: () => void;
}

const statusMap: Record<ConnectionStatus, { dot: string; label: string; pulse: boolean }> = {
  disconnected: { dot: "bg-muted-foreground/50", label: "Disconnected", pulse: false },
  connecting: { dot: "bg-warning", label: "Connecting", pulse: true },
  connected: { dot: "bg-success", label: "Live", pulse: true },
  error: { dot: "bg-destructive", label: "Error", pulse: false },
};

export const ConnectionPanel = ({ mode, setMode, status, detail, onConnect, onDisconnect }: Props) => {
  const isOn = status === "connected" || status === "connecting";
  const s = statusMap[status];
  return (
    <div className="rounded-3xl border border-border bg-card-gradient p-5 shadow-card">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="rounded-full bg-muted/70 p-1">
              <TabsTrigger value="serial" disabled={isOn} className="rounded-full px-4">
                <Cable className="mr-2 h-3.5 w-3.5" /> Web Serial
              </TabsTrigger>
              <TabsTrigger value="ble" disabled={isOn} className="rounded-full px-4">
                <Bluetooth className="mr-2 h-3.5 w-3.5" /> Bluetooth
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5">
            <span className={cn("h-2 w-2 rounded-full", s.dot, s.pulse && "pulse-dot")} />
            <span className="text-sm font-medium">{s.label}</span>
            {detail && (
              <span className="hidden text-xs text-muted-foreground sm:inline">· {detail}</span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {!isOn ? (
            <Button onClick={onConnect} size="lg" className="gap-2 rounded-full px-6">
              <PlugZap className="h-4 w-4" /> Connect
              <kbd className="ml-2 hidden rounded bg-primary-foreground/15 px-1.5 py-0.5 text-[10px] font-mono opacity-80 sm:inline">C</kbd>
            </Button>
          ) : (
            <Button onClick={onDisconnect} size="lg" variant="destructive" className="gap-2 rounded-full px-6">
              <Plug className="h-4 w-4" /> Disconnect
            </Button>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {mode === "serial"
          ? "USB at 115200 baud. Use Chrome or Edge."
          : "BLE via Nordic UART Service (6e400001-…). Chrome/Edge desktop or Android."}
      </p>

      {typeof window !== "undefined" && window.self !== window.top && (
        <div className="mt-3 rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs">
          <p className="font-semibold text-warning">Preview limitation</p>
          <p className="mt-0.5 text-muted-foreground">
            Web Serial & Web Bluetooth are blocked inside the Lovable preview iframe by the browser.
            Open this app in its own tab (the "Open in new tab" button above the preview, or your published URL) to connect to your ESP32.
          </p>
        </div>
      )}
    </div>
  );
};

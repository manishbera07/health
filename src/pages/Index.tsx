import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Bluetooth, Cable, Download, Plug, PlugZap, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { parseLine, recordsToCSV, type HealthRecord } from "@/lib/parser";
import {
  BluetoothStream,
  SerialStream,
  type ConnectionStatus,
} from "@/lib/streamReader";

const MAX_RECORDS = 100;
const RENDER_INTERVAL_MS = 80;

type Mode = "serial" | "ble";

const StatusDot = ({ status }: { status: ConnectionStatus }) => {
  const map: Record<ConnectionStatus, { color: string; label: string; pulse: boolean }> = {
    disconnected: { color: "bg-muted-foreground", label: "Disconnected", pulse: false },
    connecting: { color: "bg-warning", label: "Connecting…", pulse: true },
    connected: { color: "bg-success", label: "Connected", pulse: true },
    error: { color: "bg-destructive", label: "Error", pulse: false },
  };
  const s = map[status];
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${s.color} ${s.pulse ? "pulse-dot" : ""}`} />
      <span className="text-sm font-medium text-foreground">{s.label}</span>
    </div>
  );
};

const Chip = ({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good: boolean | null;
}) => {
  const tone =
    good === null
      ? "bg-muted text-muted-foreground border-border"
      : good
      ? "bg-success/10 text-success border-success/30"
      : "bg-destructive/10 text-destructive border-destructive/30";
  return (
    <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${tone}`}>
      <span className="opacity-70">{label}</span>
      <span className="font-mono-tabular">{value}</span>
    </div>
  );
};

const Metric = ({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) => (
  <Card className="p-5 shadow-sm">
    <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="mt-2 flex items-baseline gap-1.5">
      <span
        className={`font-mono-tabular text-3xl font-semibold tabular-nums ${
          accent ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </span>
      {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
    </div>
  </Card>
);

const fmt = (n: number | null, digits = 0) =>
  n === null || !Number.isFinite(n) ? "—" : digits ? n.toFixed(digits) : String(Math.round(n));

const Index = () => {
  const [mode, setMode] = useState<Mode>("serial");
  const [wsUrl, setWsUrl] = useState("ws://localhost:8080");
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [statusDetail, setStatusDetail] = useState<string>("");
  const [latest, setLatest] = useState<HealthRecord | null>(null);
  const [records, setRecords] = useState<HealthRecord[]>([]);

  const serialRef = useRef<SerialStream | null>(null);
  const wsRef = useRef<WebSocketStream | null>(null);
  const bleRef = useRef<BluetoothStream | null>(null);

  // Debounced render buffer
  const pendingLatest = useRef<HealthRecord | null>(null);
  const pendingRecords = useRef<HealthRecord[]>([]);
  const rafTimer = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafTimer.current = null;
    if (pendingLatest.current) {
      setLatest(pendingLatest.current);
      pendingLatest.current = null;
    }
    if (pendingRecords.current.length) {
      const incoming = pendingRecords.current;
      pendingRecords.current = [];
      setRecords((prev) => {
        const merged = [...incoming.reverse(), ...prev];
        return merged.slice(0, MAX_RECORDS);
      });
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafTimer.current !== null) return;
    rafTimer.current = window.setTimeout(flush, RENDER_INTERVAL_MS);
  }, [flush]);

  const handleLine = useCallback(
    (line: string) => {
      const rec = parseLine(line);
      if (!rec) return;
      pendingLatest.current = rec;
      pendingRecords.current.push(rec);
      if (pendingRecords.current.length > MAX_RECORDS) {
        pendingRecords.current = pendingRecords.current.slice(-MAX_RECORDS);
      }
      scheduleFlush();
    },
    [scheduleFlush]
  );

  const handleStatus = useCallback((s: ConnectionStatus, detail?: string) => {
    setStatus(s);
    setStatusDetail(detail ?? "");
    if (s === "error" && detail) toast.error(detail);
    if (s === "connected") toast.success(`Connected${detail ? ` — ${detail}` : ""}`);
  }, []);

  const connect = useCallback(async () => {
    if (mode === "serial") {
      if (!SerialStream.isSupported()) {
        toast.error("Web Serial isn't supported here. Use Chrome/Edge or switch mode.");
        return;
      }
      const s = new SerialStream({ onLine: handleLine, onStatus: handleStatus });
      serialRef.current = s;
      await s.connect(115200);
    } else if (mode === "ble") {
      if (!BluetoothStream.isSupported()) {
        toast.error("Web Bluetooth isn't supported here. Use Chrome/Edge on desktop or Android.");
        return;
      }
      const b = new BluetoothStream({ onLine: handleLine, onStatus: handleStatus });
      bleRef.current = b;
      await b.connect();
    } else {
      const w = new WebSocketStream({ onLine: handleLine, onStatus: handleStatus });
      wsRef.current = w;
      w.connect(wsUrl);
    }
  }, [mode, wsUrl, handleLine, handleStatus]);

  const disconnect = useCallback(async () => {
    await serialRef.current?.disconnect();
    await bleRef.current?.disconnect();
    wsRef.current?.disconnect();
    serialRef.current = null;
    bleRef.current = null;
    wsRef.current = null;
    setStatus("disconnected");
  }, []);

  useEffect(() => {
    return () => {
      serialRef.current?.disconnect();
      bleRef.current?.disconnect();
      wsRef.current?.disconnect();
      if (rafTimer.current !== null) window.clearTimeout(rafTimer.current);
    };
  }, []);

  const isConnected = status === "connected" || status === "connecting";

  const latestJson = useMemo(() => {
    if (!latest) return "{ }";
    const out = {
      finger_detected: latest.finger_detected,
      lead_on: latest.lead_on,
      ecg: latest.ecg,
      hr: latest.hr,
      spo2: latest.spo2,
      max30103: latest.max30103,
      msg: latest.msg,
      ts: latest.ts,
    };
    return JSON.stringify(out, null, 2);
  }, [latest]);

  const downloadCSV = () => {
    if (!records.length) {
      toast.message("No records to export yet.");
      return;
    }
    const csv = recordsToCSV([...records].reverse());
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `health-monitor-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="container flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">ESP32 Health Monitor</h1>
              <p className="text-xs text-muted-foreground">
                Real-time ECG · SpO₂ · HR stream · firmware-agnostic parser
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <StatusDot status={status} />
            {statusDetail && (
              <span className="hidden text-xs text-muted-foreground md:inline">{statusDetail}</span>
            )}
          </div>
        </div>
      </header>

      <main className="container space-y-6 py-6">
        {/* Connection */}
        <Card className="p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex-1">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Connection
              </div>
              <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <TabsList>
                  <TabsTrigger value="serial" disabled={isConnected}>
                    <Cable className="mr-2 h-4 w-4" /> Web Serial
                  </TabsTrigger>
                  <TabsTrigger value="ble" disabled={isConnected}>
                    <Bluetooth className="mr-2 h-4 w-4" /> Bluetooth (BLE)
                  </TabsTrigger>
                  <TabsTrigger value="ws" disabled={isConnected}>
                    <Wifi className="mr-2 h-4 w-4" /> WebSocket
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="serial" className="mt-3">
                  <p className="text-sm text-muted-foreground">
                    Connect ESP32 via USB at <span className="font-mono-tabular">115200</span> baud.
                    Click Connect, then choose your device.
                  </p>
                </TabsContent>
                <TabsContent value="ble" className="mt-3">
                  <p className="text-sm text-muted-foreground">
                    Connect to ESP32 over BLE using the{" "}
                    <span className="font-mono-tabular">Nordic UART Service</span>{" "}
                    (<span className="font-mono-tabular">6e400001-…</span>). Firmware must advertise
                    NUS and notify on the TX characteristic.
                  </p>
                </TabsContent>
                <TabsContent value="ws" className="mt-3 space-y-2">
                  <label className="text-sm text-muted-foreground">Bridge URL</label>
                  <Input
                    value={wsUrl}
                    onChange={(e) => setWsUrl(e.target.value)}
                    disabled={isConnected}
                    placeholder="ws://localhost:8080"
                    className="font-mono-tabular max-w-md"
                  />
                </TabsContent>
              </Tabs>
            </div>
            <div className="flex gap-2">
              {!isConnected ? (
                <Button onClick={connect} size="lg" className="gap-2">
                  <PlugZap className="h-4 w-4" /> Connect
                </Button>
              ) : (
                <Button onClick={disconnect} size="lg" variant="destructive" className="gap-2">
                  <Plug className="h-4 w-4" /> Disconnect
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Status chips */}
        <div className="flex flex-wrap gap-2">
          <Chip
            label="Finger"
            value={latest?.finger_detected === null || latest === null ? "—" : String(latest.finger_detected)}
            good={latest?.finger_detected === 1 ? true : latest?.finger_detected === 0 ? false : null}
          />
          <Chip
            label="Lead"
            value={latest?.lead_on === null || latest === null ? "—" : latest.lead_on === 1 ? "ON" : "OFF"}
            good={latest?.lead_on === 1 ? true : latest?.lead_on === 0 ? false : null}
          />
          <Chip
            label="MAX30103"
            value={latest?.max30103 === null || latest === null ? "—" : String(latest.max30103)}
            good={latest?.max30103 === 1 ? true : latest?.max30103 === 0 ? false : null}
          />
          <Chip
            label="LEAD_OFF"
            value={latest?.lead_off === null || latest === null ? "—" : String(latest.lead_off)}
            good={latest?.lead_off === 0 ? true : latest?.lead_off === 1 ? false : null}
          />
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Metric label="Finger Detected" value={latest ? fmt(latest.finger_detected) : "—"} />
          <Metric label="Lead On" value={latest ? fmt(latest.lead_on) : "—"} />
          <Metric label="ECG" value={latest ? fmt(latest.ecg) : "—"} accent />
          <Metric label="Heart Rate" value={latest ? fmt(latest.hr, 1) : "—"} unit="bpm" accent />
          <Metric label="SpO₂" value={latest ? fmt(latest.spo2, 1) : "—"} unit="%" accent />
          <Metric label="MAX30103" value={latest ? fmt(latest.max30103) : "—"} />
        </div>

        {/* Message banner */}
        {latest?.msg && (
          <Card className="border-warning/40 bg-warning/5 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm">
              <Radio className="h-4 w-4 text-warning" />
              <span className="font-medium text-warning-foreground/90">Status:</span>
              <span className="text-foreground">{latest.msg}</span>
            </div>
          </Card>
        )}

        {!latest && (
          <Card className="border-dashed p-10 text-center shadow-none">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Activity className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium">Waiting for data…</p>
            <p className="text-xs text-muted-foreground">
              Connect your device to start streaming.
            </p>
          </Card>
        )}

        {/* JSON + Table */}
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="p-5 shadow-sm lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Latest JSON
              </h2>
            </div>
            <pre className="font-mono-tabular max-h-80 overflow-auto rounded-lg bg-muted/60 p-4 text-xs leading-relaxed text-foreground">
              {latestJson}
            </pre>
          </Card>

          <Card className="p-5 shadow-sm lg:col-span-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Last {MAX_RECORDS} records
                <span className="ml-2 text-foreground">({records.length})</span>
              </h2>
              <Button variant="outline" size="sm" onClick={downloadCSV} className="gap-2">
                <Download className="h-4 w-4" /> CSV
              </Button>
            </div>
            <ScrollArea className="h-80 rounded-lg border border-border">
              <table className="w-full text-xs font-mono-tabular">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-2 py-2 font-medium">Fg</th>
                    <th className="px-2 py-2 font-medium">Ld</th>
                    <th className="px-2 py-2 font-medium">ECG</th>
                    <th className="px-2 py-2 font-medium">HR</th>
                    <th className="px-2 py-2 font-medium">SpO₂</th>
                    <th className="px-2 py-2 font-medium">MAX</th>
                    <th className="px-2 py-2 font-medium">Msg</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                        No records yet.
                      </td>
                    </tr>
                  )}
                  {records.map((r, i) => (
                    <tr
                      key={`${r.ts}-${i}`}
                      className="border-t border-border hover:bg-accent/40"
                    >
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {new Date(r.ts).toLocaleTimeString(undefined, { hour12: false })}
                      </td>
                      <td className="px-2 py-1.5">{fmt(r.finger_detected)}</td>
                      <td className="px-2 py-1.5">{fmt(r.lead_on)}</td>
                      <td className="px-2 py-1.5">{fmt(r.ecg)}</td>
                      <td className="px-2 py-1.5">{fmt(r.hr, 1)}</td>
                      <td className="px-2 py-1.5">{fmt(r.spo2, 1)}</td>
                      <td className="px-2 py-1.5">{fmt(r.max30103)}</td>
                      <td className="max-w-[180px] truncate px-2 py-1.5 text-muted-foreground">
                        {r.msg ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </Card>
        </div>

        <footer className="pb-6 pt-2 text-center text-xs text-muted-foreground">
          Parser handles arbitrary key order · ECG <span className="font-mono-tabular">"---"</span> shown as —
        </footer>
      </main>
    </div>
  );
};

export default Index;

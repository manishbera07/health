import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Droplet, Heart, HeartPulse, Radio, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { parseLine, type HealthRecord } from "@/lib/parser";
import { BluetoothStream, SerialStream, type ConnectionStatus } from "@/lib/streamReader";
import { useAlerts } from "@/hooks/useAlerts";
import { useSession } from "@/hooks/useSession";
import { useHotkey } from "@/hooks/useHotkey";

import { ConnectionPanel, type Mode } from "@/components/ConnectionPanel";
import { EcgPanel } from "@/components/EcgPanel";
import { VitalCard } from "@/components/VitalCard";
import { StatusChip } from "@/components/StatusChip";
import { RecordsTable } from "@/components/RecordsTable";
import { AlertSettings } from "@/components/AlertSettings";
import { SessionControls } from "@/components/SessionControls";
import { ThemeToggle } from "@/components/ThemeToggle";

const MAX_RECORDS = 100;
const TREND_LEN = 60;
const RENDER_MS = 80;

const TREND_INIT: (number | null)[] = Array(TREND_LEN).fill(null);

const Index = () => {
  // Connection
  const [mode, setMode] = useState<Mode>("serial");
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [statusDetail, setStatusDetail] = useState("");
  const serialRef = useRef<SerialStream | null>(null);
  const bleRef = useRef<BluetoothStream | null>(null);

  // Live data
  const [latest, setLatest] = useState<HealthRecord | null>(null);
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [hrTrend, setHrTrend] = useState<(number | null)[]>(TREND_INIT);
  const [spo2Trend, setSpo2Trend] = useState<(number | null)[]>(TREND_INIT);
  const ecgRef = useRef<number | null>(null);

  // Buffers (debounced rendering)
  const pendingLatest = useRef<HealthRecord | null>(null);
  const pendingRecords = useRef<HealthRecord[]>([]);
  const lastHr = useRef<number | null>(null);
  const lastSpo2 = useRef<number | null>(null);
  const renderTimer = useRef<number | null>(null);

  // Features
  const { config, update, active } = useAlerts(latest);
  const session = useSession();
  const [now, setNow] = useState(Date.now());

  // Tick recording timer
  useEffect(() => {
    if (!session.state.recording) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session.state.recording]);

  // Toast on alerts
  const lastAlertSig = useRef("");
  useEffect(() => {
    const sig = active.map((a) => a.kind).join("|");
    if (sig && sig !== lastAlertSig.current) {
      active.forEach((a) => toast.warning(a.message, { id: a.kind }));
    }
    lastAlertSig.current = sig;
  }, [active]);

  const flush = useCallback(() => {
    renderTimer.current = null;
    if (pendingLatest.current) {
      setLatest(pendingLatest.current);
      pendingLatest.current = null;
    }
    if (pendingRecords.current.length) {
      const incoming = pendingRecords.current;
      pendingRecords.current = [];
      setRecords((prev) => [...incoming.slice().reverse(), ...prev].slice(0, MAX_RECORDS));
    }
    // Trend pushes — one per flush window keeps sparkline smooth
    setHrTrend((t) => [...t.slice(1), lastHr.current]);
    setSpo2Trend((t) => [...t.slice(1), lastSpo2.current]);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (renderTimer.current !== null) return;
    renderTimer.current = window.setTimeout(flush, RENDER_MS);
  }, [flush]);

  const handleLine = useCallback((line: string) => {
    const rec = parseLine(line);
    if (!rec) return;
    pendingLatest.current = rec;
    pendingRecords.current.push(rec);
    if (pendingRecords.current.length > MAX_RECORDS) {
      pendingRecords.current = pendingRecords.current.slice(-MAX_RECORDS);
    }
    if (rec.hr !== null) lastHr.current = rec.hr;
    if (rec.spo2 !== null) lastSpo2.current = rec.spo2;
    if (rec.ecg !== null) ecgRef.current = rec.ecg;
    if (session.state.recording) session.push(rec);
    scheduleFlush();
  }, [scheduleFlush, session]);

  const handleStatus = useCallback((s: ConnectionStatus, detail?: string) => {
    setStatus(s);
    setStatusDetail(detail ?? "");
    if (s === "connected") toast.success(`Connected${detail ? ` — ${detail}` : ""}`);
    if (s === "error" && detail) toast.error(detail);
  }, []);

  const connect = useCallback(async () => {
    if (mode === "serial") {
      if (!SerialStream.isSupported()) {
        toast.error("Web Serial isn't supported here. Use Chrome/Edge or switch to Bluetooth.");
        return;
      }
      const s = new SerialStream({ onLine: handleLine, onStatus: handleStatus });
      serialRef.current = s;
      await s.connect(115200);
    } else {
      if (!BluetoothStream.isSupported()) {
        toast.error("Web Bluetooth isn't supported here. Use Chrome/Edge desktop or Android.");
        return;
      }
      const b = new BluetoothStream({ onLine: handleLine, onStatus: handleStatus });
      bleRef.current = b;
      await b.connect();
    }
  }, [mode, handleLine, handleStatus]);

  const disconnect = useCallback(async () => {
    await serialRef.current?.disconnect();
    await bleRef.current?.disconnect();
    serialRef.current = null;
    bleRef.current = null;
    setStatus("disconnected");
  }, []);

  useEffect(() => () => {
    serialRef.current?.disconnect();
    bleRef.current?.disconnect();
    if (renderTimer.current !== null) window.clearTimeout(renderTimer.current);
  }, []);

  // Hotkeys
  const isOn = status === "connected" || status === "connecting";
  useHotkey("c", () => { if (!isOn) connect(); });
  useHotkey("d", () => { if (isOn) disconnect(); });
  useHotkey("r", () => {
    if (session.state.recording) session.stop();
    else session.start();
  });
  useHotkey("e", () => {
    if (session.state.count > 0 && !session.exportCSV()) toast.error("Nothing to export");
  });

  // Derived
  const fingerState: "ok" | "bad" | "idle" =
    !latest ? "idle" : latest.finger_detected === 1 ? "ok" : "bad";
  const leadState: "ok" | "bad" | "idle" =
    !latest ? "idle" : latest.lead_on === 1 ? "ok" : "bad";
  const maxState: "ok" | "bad" | "idle" =
    !latest ? "idle" : latest.max30103 === 1 ? "ok" : "bad";

  const hrCardState = useMemo(() => {
    if (!latest || latest.hr === null) return "idle" as const;
    if (latest.hr < config.hrMin || latest.hr > config.hrMax) return "danger" as const;
    return "ok" as const;
  }, [latest, config]);

  const spo2CardState = useMemo(() => {
    if (!latest || latest.spo2 === null) return "idle" as const;
    if (latest.spo2 < config.spo2Min) return "danger" as const;
    return "ok" as const;
  }, [latest, config]);

  const rhythm = !latest ? "Awaiting signal" : latest.lead_on !== 1 ? "Lead off" : latest.hr === null ? "Acquiring" : "Normal sinus";
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const elapsed = session.state.startedAt ? now - session.state.startedAt : 0;

  return (
    <div className="min-h-screen bg-hero">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3 animate-slide-in-left">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <HeartPulse className="h-5 w-5" />
              {isOn && <span className="absolute inset-0 rounded-2xl ring-2 ring-primary/30 pulse-dot" />}
            </div>
            <div className="leading-none">
              <h1 className="text-base font-semibold tracking-tight">AuraSense</h1>
              <p className="text-[11px] text-muted-foreground">Real-time health monitor</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SessionControls
              state={session.state}
              onStart={session.start}
              onStop={session.stop}
              onExport={session.exportCSV}
              elapsedMs={elapsed}
            />
            <AlertSettings config={config} update={update} activeCount={active.length} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container space-y-6 py-8">
        {/* Greeting */}
        <section className="flex flex-col gap-3 animate-fade-in-up md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{greeting}.</h2>
            <p className="mt-1 max-w-prose text-muted-foreground">
              {!latest
                ? "Connect your ESP32 to begin streaming live ECG, heart rate, and SpO₂."
                : active.length
                  ? "Some readings are outside your alert thresholds — check below."
                  : "All vitals look steady. Streaming in real time."}
            </p>
          </div>
          <div
            className={`inline-flex shrink-0 items-center gap-2 self-start rounded-full px-4 py-1.5 text-sm font-medium md:self-auto
              ${active.length
                ? "bg-destructive/10 text-destructive"
                : isOn
                  ? "bg-success/10 text-success"
                  : "bg-muted text-muted-foreground"}`}
          >
            {active.length ? <ShieldAlert className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
            {active.length ? `${active.length} alert${active.length > 1 ? "s" : ""}` : isOn ? "All vitals normal" : "Standby"}
          </div>
        </section>

        {/* Connection */}
        <section className="animate-fade-in-up" style={{ animationDelay: "60ms" }}>
          <ConnectionPanel
            mode={mode}
            setMode={setMode}
            status={status}
            detail={statusDetail}
            onConnect={connect}
            onDisconnect={disconnect}
          />
        </section>

        {/* Status chips */}
        <section className="flex flex-wrap gap-2 animate-fade-in-up" style={{ animationDelay: "120ms" }}>
          <StatusChip
            label="Finger"
            value={!latest || latest.finger_detected === null ? "—" : latest.finger_detected === 1 ? "DETECTED" : "OFF"}
            state={fingerState}
          />
          <StatusChip
            label="Lead"
            value={!latest || latest.lead_on === null ? "—" : latest.lead_on === 1 ? "ON" : "OFF"}
            state={leadState}
          />
          <StatusChip
            label="MAX30103"
            value={!latest || latest.max30103 === null ? "—" : latest.max30103 === 1 ? "OK" : "FAIL"}
            state={maxState}
          />
          <StatusChip
            label="LEAD_OFF"
            value={!latest || latest.lead_off === null ? "—" : String(latest.lead_off)}
            state={!latest || latest.lead_off === null ? "idle" : latest.lead_off === 0 ? "ok" : "bad"}
          />
        </section>

        {/* ECG + vitals */}
        <section className="grid gap-6 lg:grid-cols-3 animate-fade-in-up" style={{ animationDelay: "180ms" }}>
          <div className="lg:col-span-2">
            <EcgPanel ecg={latest?.ecg ?? null} active={isOn && latest !== null} rhythm={rhythm} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <VitalCard
              label="Heart rate"
              value={latest?.hr ?? null}
              unit="bpm"
              digits={0}
              trend={hrTrend}
              trendColor="hsl(var(--accent))"
              state={hrCardState}
              icon={<Heart className="h-3.5 w-3.5" />}
            />
            <VitalCard
              label="SpO₂"
              value={latest?.spo2 ?? null}
              unit="%"
              digits={0}
              trend={spo2Trend}
              trendColor="hsl(var(--secondary))"
              state={spo2CardState}
              icon={<Droplet className="h-3.5 w-3.5" />}
            />
          </div>
        </section>

        {/* Message banner */}
        {latest?.msg && (
          <section className="animate-fade-in">
            <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-4">
              <Radio className="mt-0.5 h-4 w-4 text-warning" />
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-warning">Device message</p>
                <p className="mt-0.5 text-sm">{latest.msg}</p>
              </div>
            </div>
          </section>
        )}

        {/* JSON + table */}
        <section className="grid gap-6 lg:grid-cols-5 animate-fade-in-up" style={{ animationDelay: "240ms" }}>
          <div className="overflow-hidden rounded-3xl border border-border bg-card-gradient shadow-card lg:col-span-2">
            <div className="border-b border-border px-5 py-3">
              <h3 className="text-sm font-semibold">Latest JSON</h3>
              <p className="text-xs text-muted-foreground">Snapshot of the most recent parsed packet.</p>
            </div>
            <pre className="font-mono-tabular max-h-[300px] overflow-auto p-5 text-xs leading-relaxed">
{latest
  ? JSON.stringify({
      finger_detected: latest.finger_detected,
      lead_on: latest.lead_on,
      ecg: latest.ecg,
      hr: latest.hr,
      spo2: latest.spo2,
      max30103: latest.max30103,
      msg: latest.msg,
      ts: latest.ts,
    }, null, 2)
  : "{ }"}
            </pre>
          </div>
          <div className="lg:col-span-3">
            <RecordsTable records={records} />
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pb-6 pt-2 text-center text-xs text-muted-foreground">
          <span>Order-independent KV parser</span>
          <span>·</span>
          <span>Shortcuts: <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">C</kbd> connect · <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">D</kbd> disconnect · <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">R</kbd> record · <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">E</kbd> export</span>
        </footer>
      </main>
    </div>
  );
};

export default Index;

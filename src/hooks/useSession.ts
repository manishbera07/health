import { useCallback, useEffect, useRef, useState } from "react";
import type { HealthRecord } from "@/lib/parser";
import { recordsToCSV } from "@/lib/parser";
import { insertRecords } from "@/lib/db";

/** Max records to hold in memory before auto-flushing to DB */
const MEMORY_CAP = 200;
/** Auto-flush interval in milliseconds */
const FLUSH_INTERVAL_MS = 3000;

export interface SessionState {
  recording: boolean;
  startedAt: number | null;
  /** Total records this session (memory + DB) */
  count: number;
  /** Records flushed to DB so far */
  dbCount: number;
  name: string;
  /** Last DB flush status */
  dbStatus: "idle" | "flushing" | "ok" | "error";
}

export const useSession = () => {
  const [state, setState] = useState<SessionState>({
    recording: false,
    startedAt: null,
    count: 0,
    dbCount: 0,
    name: "",
    dbStatus: "idle",
  });

  /** In-memory buffer — capped at MEMORY_CAP */
  const buffer = useRef<HealthRecord[]>([]);
  /** Records waiting to be flushed to Supabase */
  const pendingFlush = useRef<HealthRecord[]>([]);
  /** Session ID for grouping records in DB */
  const sessionId = useRef<string>("");
  /** Flag to prevent overlapping flushes */
  const flushing = useRef(false);
  /** Interval handle */
  const flushTimer = useRef<number | null>(null);

  /** Flush pending records to Supabase */
  const flushToDb = useCallback(async () => {
    if (flushing.current || pendingFlush.current.length === 0) return;
    flushing.current = true;

    const toFlush = pendingFlush.current.splice(0);
    setState((s) => ({ ...s, dbStatus: "flushing" }));

    const { insertedCount, error } = await insertRecords(sessionId.current, toFlush);

    flushing.current = false;
    setState((s) => ({
      ...s,
      dbCount: s.dbCount + insertedCount,
      dbStatus: error ? "error" : "ok",
    }));

    if (error) {
      // Put failed records back for retry
      pendingFlush.current.unshift(...toFlush);
      console.warn(`DB flush failed, ${toFlush.length} records queued for retry`);
    }
  }, []);

  /** Start the auto-flush interval */
  const startFlushTimer = useCallback(() => {
    if (flushTimer.current !== null) return;
    flushTimer.current = window.setInterval(flushToDb, FLUSH_INTERVAL_MS);
  }, [flushToDb]);

  /** Stop the auto-flush interval */
  const stopFlushTimer = useCallback(() => {
    if (flushTimer.current !== null) {
      window.clearInterval(flushTimer.current);
      flushTimer.current = null;
    }
  }, []);

  const start = useCallback(
    (name?: string) => {
      buffer.current = [];
      pendingFlush.current = [];
      const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      sessionId.current = id;
      setState({
        recording: true,
        startedAt: Date.now(),
        count: 0,
        dbCount: 0,
        name:
          name?.trim() ||
          `session-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`,
        dbStatus: "idle",
      });
      startFlushTimer();
    },
    [startFlushTimer]
  );

  const stop = useCallback(() => {
    setState((s) => ({ ...s, recording: false }));
    stopFlushTimer();
    // Final flush of any remaining records
    flushToDb();
  }, [stopFlushTimer, flushToDb]);

  const push = useCallback((rec: HealthRecord) => {
    // Add to in-memory buffer (capped)
    buffer.current.push(rec);
    if (buffer.current.length > MEMORY_CAP) {
      buffer.current = buffer.current.slice(-MEMORY_CAP);
    }

    // Queue for DB flush
    pendingFlush.current.push(rec);

    setState((s) => ({ ...s, count: s.count + 1 }));
  }, []);

  const exportCSV = useCallback(() => {
    if (!buffer.current.length) return false;
    const csv = recordsToCSV(buffer.current);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.name || "session"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  }, [state.name]);

  const clear = useCallback(() => {
    buffer.current = [];
    pendingFlush.current = [];
    stopFlushTimer();
    setState({
      recording: false,
      startedAt: null,
      count: 0,
      dbCount: 0,
      name: "",
      dbStatus: "idle",
    });
  }, [stopFlushTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopFlushTimer();
    };
  }, [stopFlushTimer]);

  return { state, start, stop, push, exportCSV, clear, sessionId: sessionId.current };
};

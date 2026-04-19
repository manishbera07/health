import { useCallback, useRef, useState } from "react";
import type { HealthRecord } from "@/lib/parser";
import { recordsToCSV } from "@/lib/parser";

export interface SessionState {
  recording: boolean;
  startedAt: number | null;
  count: number;
  name: string;
}

export const useSession = () => {
  const [state, setState] = useState<SessionState>({
    recording: false,
    startedAt: null,
    count: 0,
    name: "",
  });
  const buffer = useRef<HealthRecord[]>([]);

  const start = useCallback((name?: string) => {
    buffer.current = [];
    setState({
      recording: true,
      startedAt: Date.now(),
      count: 0,
      name: name?.trim() || `session-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`,
    });
  }, []);

  const stop = useCallback(() => {
    setState((s) => ({ ...s, recording: false }));
  }, []);

  const push = useCallback((rec: HealthRecord) => {
    if (!state.recording) return;
    buffer.current.push(rec);
    setState((s) => ({ ...s, count: buffer.current.length }));
  }, [state.recording]);

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
    setState({ recording: false, startedAt: null, count: 0, name: "" });
  }, []);

  return { state, start, stop, push, exportCSV, clear };
};

import { useCallback, useEffect, useRef, useState } from "react";
import type { HealthRecord } from "@/lib/parser";

const STORAGE_KEY = "aurasense-alert-config";

export interface AlertConfig {
  enabled: boolean;
  sound: boolean;
  hrMin: number;
  hrMax: number;
  spo2Min: number;
}

const DEFAULT: AlertConfig = {
  enabled: true,
  sound: false,
  hrMin: 50,
  hrMax: 130,
  spo2Min: 92,
};

export type AlertKind = "hr-low" | "hr-high" | "spo2-low";
export interface ActiveAlert { kind: AlertKind; message: string; value: number }

const beep = () => {
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    setTimeout(() => ctx.close(), 300);
  } catch { /* ignore */ }
};

export const useAlerts = (latest: HealthRecord | null) => {
  const [config, setConfig] = useState<AlertConfig>(() => {
    if (typeof window === "undefined") return DEFAULT;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
    } catch { return DEFAULT; }
  });
  const [active, setActive] = useState<ActiveAlert[]>([]);
  const lastBeep = useRef(0);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    if (!config.enabled || !latest) {
      setActive([]);
      return;
    }
    const next: ActiveAlert[] = [];
    if (latest.hr !== null) {
      if (latest.hr < config.hrMin) next.push({ kind: "hr-low", message: `Low heart rate (${latest.hr.toFixed(0)} bpm)`, value: latest.hr });
      else if (latest.hr > config.hrMax) next.push({ kind: "hr-high", message: `High heart rate (${latest.hr.toFixed(0)} bpm)`, value: latest.hr });
    }
    if (latest.spo2 !== null && latest.spo2 < config.spo2Min) {
      next.push({ kind: "spo2-low", message: `Low SpO₂ (${latest.spo2.toFixed(0)}%)`, value: latest.spo2 });
    }
    setActive(next);
    if (next.length && config.sound && Date.now() - lastBeep.current > 2000) {
      lastBeep.current = Date.now();
      beep();
    }
  }, [latest, config]);

  const update = useCallback((patch: Partial<AlertConfig>) => setConfig((c) => ({ ...c, ...patch })), []);
  return { config, update, active };
};

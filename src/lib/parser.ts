export interface HealthRecord {
  finger_detected: 0 | 1 | null;
  lead_on: 0 | 1 | null;
  lead_off: 0 | 1 | null;
  ecg: number | null;
  hr: number | null;
  spo2: number | null;
  max30103: 0 | 1 | null;
  msg: string | null;
  ts: string;
}

const numOrNull = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const t = v.trim();
  if (t === "" || t === "---" || t.toLowerCase() === "nan") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const bitOrNull = (v: string | undefined): 0 | 1 | null => {
  const n = numOrNull(v);
  if (n === null) return null;
  return n === 0 ? 0 : 1;
};

/**
 * Parse a single ESP32 line in key=value CSV format.
 * Order-independent. Unknown keys ignored.
 * Returns null if no recognizable keys are present.
 */
export function parseLine(line: string): HealthRecord | null {
  if (!line) return null;
  const cleaned = line.replace(/[\r\n]+/g, "").trim();
  if (!cleaned) return null;

  const map = new Map<string, string>();
  for (const part of cleaned.split(",")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim().toUpperCase();
    const value = part.slice(idx + 1).trim();
    if (key) map.set(key, value);
  }

  if (map.size === 0) return null;

  const leadOff = bitOrNull(map.get("LEAD_OFF"));
  const leadOn: 0 | 1 | null = leadOff === null ? null : leadOff === 0 ? 1 : 0;

  let ecg = numOrNull(map.get("ECG"));
  if (leadOn === 0) {
    ecg = null;
  }

  return {
    finger_detected: bitOrNull(map.get("FINGER")),
    lead_on: leadOn,
    lead_off: leadOff,
    ecg,
    hr: numOrNull(map.get("HR")),
    spo2: numOrNull(map.get("SPO2")),
    max30103: bitOrNull(map.get("MAX30103")),
    msg: map.get("MSG") ?? null,
    ts: new Date().toISOString(),
  };
}

export function recordsToCSV(records: HealthRecord[]): string {
  const headers = [
    "ts",
    "finger_detected",
    "lead_on",
    "lead_off",
    "ecg",
    "hr",
    "spo2",
    "max30103",
    "msg",
  ];
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = records.map((r) =>
    headers.map((h) => escape((r as any)[h])).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

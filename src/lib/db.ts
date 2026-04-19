import { supabase } from "./supabase";
import type { HealthRecord } from "./parser";

export interface DbHealthRecord {
  id?: number;
  session_id: string;
  finger: number | null;
  lead_on: number | null;
  lead_off: number | null;
  ecg: number | null;
  hr: number | null;
  spo2: number | null;
  max30103: number | null;
  msg: string | null;
  recorded_at: string;
}

/**
 * Convert in-memory HealthRecord to DB row format.
 */
function toDbRow(sessionId: string, rec: HealthRecord): Omit<DbHealthRecord, "id"> {
  return {
    session_id: sessionId,
    finger: rec.finger_detected,
    lead_on: rec.lead_on,
    lead_off: rec.lead_off,
    ecg: rec.ecg,
    hr: rec.hr,
    spo2: rec.spo2,
    max30103: rec.max30103,
    msg: rec.msg,
    recorded_at: rec.ts,
  };
}

/**
 * Batch-insert health records into Supabase.
 * Splits into chunks of MAX_BATCH to stay under Supabase limits.
 */
const MAX_BATCH = 100;

export async function insertRecords(
  sessionId: string,
  records: HealthRecord[]
): Promise<{ insertedCount: number; error: string | null }> {
  if (!records.length) return { insertedCount: 0, error: null };

  const rows = records.map((r) => toDbRow(sessionId, r));
  let insertedCount = 0;

  for (let i = 0; i < rows.length; i += MAX_BATCH) {
    const batch = rows.slice(i, i + MAX_BATCH);
    const { error } = await supabase.from("health_records").insert(batch);

    if (error) {
      console.error("Supabase insert error:", error.message);
      return { insertedCount, error: error.message };
    }
    insertedCount += batch.length;
  }

  return { insertedCount, error: null };
}

/**
 * Fetch recent records for a session (for display in the table).
 */
export async function fetchRecentRecords(
  sessionId: string,
  limit = 100
): Promise<DbHealthRecord[]> {
  const { data, error } = await supabase
    .from("health_records")
    .select("*")
    .eq("session_id", sessionId)
    .order("recorded_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Supabase fetch error:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Fetch distinct session IDs with their record counts and time range.
 */
export async function fetchSessions(): Promise<
  { session_id: string; count: number; first_at: string; last_at: string }[]
> {
  const { data, error } = await supabase.rpc("get_session_summary");

  if (error) {
    console.error("Supabase sessions error:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Get total record count for a session.
 */
export async function getSessionCount(sessionId: string): Promise<number> {
  const { count, error } = await supabase
    .from("health_records")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if (error) {
    console.error("Supabase count error:", error.message);
    return 0;
  }
  return count ?? 0;
}

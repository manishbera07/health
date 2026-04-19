-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/pfapgdfnxfivasokodta/sql/new

CREATE TABLE IF NOT EXISTS health_records (
  id          BIGSERIAL PRIMARY KEY,
  session_id  TEXT NOT NULL,
  finger      SMALLINT,
  lead_on     SMALLINT,
  lead_off    SMALLINT,
  ecg         REAL,
  hr          REAL,
  spo2        REAL,
  max30103    SMALLINT,
  msg         TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_records_session ON health_records(session_id);
CREATE INDEX IF NOT EXISTS idx_health_records_time ON health_records(recorded_at DESC);

-- Enable RLS but allow anonymous inserts/reads for the dashboard
ALTER TABLE health_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert" ON health_records
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anonymous select" ON health_records
  FOR SELECT TO anon USING (true);

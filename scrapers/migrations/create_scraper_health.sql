-- Phase 9a: Scraper health tracking
-- Run once in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS scraper_health (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source               TEXT NOT NULL UNIQUE,
  last_run             TIMESTAMPTZ,
  last_success         TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  total_signals_24h    INTEGER NOT NULL DEFAULT 0,
  last_signal_count    INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'healthy',  -- healthy | degraded | failed
  last_error           TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scraper_health_source_idx ON scraper_health(source);
CREATE INDEX IF NOT EXISTS scraper_health_status_idx ON scraper_health(status);

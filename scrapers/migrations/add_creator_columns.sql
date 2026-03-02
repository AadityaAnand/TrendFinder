-- Part 2: Tag signals by audience type and store platform-specific metadata
-- Run in Supabase SQL editor before deploying creator scrapers.

ALTER TABLE raw_signals ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'developer';
ALTER TABLE raw_signals ADD COLUMN IF NOT EXISTS platform_data JSONB;

CREATE INDEX IF NOT EXISTS raw_signals_source_type_idx ON raw_signals(source_type);

-- Event-based deduplication: groups signals referencing the same real-world event
-- Run AFTER create_prediction_tables.sql

-- Event groups table
CREATE TABLE IF NOT EXISTS event_groups (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT UNIQUE NOT NULL,
    representative_title TEXT,
    signal_ids UUID[] NOT NULL DEFAULT '{}',
    group_size INTEGER NOT NULL DEFAULT 0,
    source_diversity INTEGER NOT NULL DEFAULT 0,
    sources TEXT[] NOT NULL DEFAULT '{}',
    adjusted_weight NUMERIC(10, 2) DEFAULT 0,
    first_seen TIMESTAMPTZ,
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add event_group_id to raw_signals (nullable FK)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'raw_signals' AND column_name = 'event_group_id'
    ) THEN
        ALTER TABLE raw_signals ADD COLUMN event_group_id TEXT;
    END IF;
END $$;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_event_groups_event_id ON event_groups(event_id);
CREATE INDEX IF NOT EXISTS idx_raw_signals_event_group ON raw_signals(event_group_id) WHERE event_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_groups_last_seen ON event_groups(last_seen DESC);

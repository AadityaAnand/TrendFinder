-- Phase 9a: Add signal quotes and source breakdown to opportunity briefs
-- Run once in Supabase SQL editor.

ALTER TABLE opportunity_briefs ADD COLUMN IF NOT EXISTS signal_quotes JSONB;
ALTER TABLE opportunity_briefs ADD COLUMN IF NOT EXISTS source_breakdown JSONB;

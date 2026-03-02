-- Part 2: Creator-specific fields on problem_hypotheses
-- Run in Supabase SQL editor.

ALTER TABLE problem_hypotheses ADD COLUMN IF NOT EXISTS hypothesis_type TEXT DEFAULT 'developer'; -- 'developer' | 'creator'
ALTER TABLE problem_hypotheses ADD COLUMN IF NOT EXISTS platform_focus  TEXT[];   -- ['youtube', 'tiktok', 'instagram', ...]
ALTER TABLE problem_hypotheses ADD COLUMN IF NOT EXISTS monetization_angle TEXT;  -- how creators can monetize this

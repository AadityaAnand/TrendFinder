-- Phase 8: Add goal and experience_level to user_preferences
-- Run once in Supabase SQL editor or via supabase db push.

ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS goal TEXT;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS experience_level TEXT;

-- Part 2: Creator preference columns on user_profiles
-- Run in Supabase SQL editor.

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS builder_type TEXT;             -- 'developer' | 'creator' | 'both'
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS platforms TEXT[];               -- ['youtube', 'tiktok', ...]
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS niches TEXT[];                  -- ['gaming', 'beauty', ...]
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS audience_size TEXT;             -- 'nano' | 'micro' | 'mid' | 'macro'
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS monetization_preferences TEXT[]; -- ['sponsorships', 'courses', ...]

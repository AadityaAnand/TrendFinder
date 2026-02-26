-- Phase 8: User feedback survey storage
-- Run once in Supabase SQL editor or via supabase db push.

CREATE TABLE IF NOT EXISTS user_feedback_surveys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  feedback_type     TEXT NOT NULL DEFAULT 'widget',
  working_well      TEXT,
  could_be_better   TEXT,
  want_to_see       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_feedback_surveys_user_idx ON user_feedback_surveys(user_id);
CREATE INDEX IF NOT EXISTS user_feedback_surveys_created_idx ON user_feedback_surveys(created_at DESC);

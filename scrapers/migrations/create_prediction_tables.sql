-- Phase 9d: Prediction Engine Tables
-- Run in Supabase SQL editor after all Phase 9c migrations.

-- 1. Novelty score on raw_signals
ALTER TABLE raw_signals ADD COLUMN IF NOT EXISTS novelty_score FLOAT DEFAULT 1.0;

-- 2. Signal recurrence patterns (for detecting monthly "Ask HN" etc.)
CREATE TABLE IF NOT EXISTS signal_recurrence_patterns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL,
  title_hash      TEXT NOT NULL,           -- SHA256 of normalized title
  pattern_type    TEXT NOT NULL,           -- 'weekly', 'monthly', 'yearly'
  canonical_title TEXT NOT NULL,           -- representative title
  occurrence_count INTEGER DEFAULT 1,
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  avg_interval_days FLOAT,                -- average days between occurrences
  confidence      FLOAT DEFAULT 0.5,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source, title_hash)
);

CREATE INDEX IF NOT EXISTS idx_recurrence_source ON signal_recurrence_patterns(source);
CREATE INDEX IF NOT EXISTS idx_recurrence_type ON signal_recurrence_patterns(pattern_type);

-- 3. Enhanced trajectory columns
ALTER TABLE trend_trajectories ADD COLUMN IF NOT EXISTS weekly_growth_rate FLOAT;
ALTER TABLE trend_trajectories ADD COLUMN IF NOT EXISTS acceleration FLOAT;
ALTER TABLE trend_trajectories ADD COLUMN IF NOT EXISTS source_lead TEXT;
ALTER TABLE trend_trajectories ADD COLUMN IF NOT EXISTS source_lead_lag_days INTEGER;
ALTER TABLE trend_trajectories ADD COLUMN IF NOT EXISTS avg_novelty FLOAT;

-- 4. Trend predictions
CREATE TABLE IF NOT EXISTS trend_predictions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_id                  UUID NOT NULL REFERENCES detected_trends(id) ON DELETE CASCADE,
  snapshot_id               UUID NOT NULL,
  growth_probability        FLOAT NOT NULL,       -- 0-1 chance of significant growth
  predicted_direction       TEXT NOT NULL,         -- 'accelerating', 'steady', 'declining', 'breakout'
  confidence_level          TEXT NOT NULL,         -- 'high', 'medium', 'low'
  prediction_reasons        JSONB,                 -- [{reason, weight}]
  feature_vector            JSONB,                 -- all input features for auditability
  model_version             TEXT NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trend_id, snapshot_id)
);

CREATE INDEX IF NOT EXISTS idx_predictions_trend ON trend_predictions(trend_id);
CREATE INDEX IF NOT EXISTS idx_predictions_snapshot ON trend_predictions(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_predictions_growth ON trend_predictions(growth_probability DESC);

-- 5. Cluster pain phrases (extracted from demand signals)
CREATE TABLE IF NOT EXISTS cluster_pain_phrases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_id        UUID NOT NULL REFERENCES detected_trends(id) ON DELETE CASCADE,
  snapshot_id     UUID NOT NULL,
  phrase          TEXT NOT NULL,
  phrase_type     TEXT NOT NULL,            -- 'need', 'frustration', 'question', 'wish', 'gap'
  signal_ids      UUID[],
  frequency       INTEGER DEFAULT 1,
  source_signals  JSONB,                   -- [{title, source, url}]
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trend_id, snapshot_id, phrase)
);

CREATE INDEX IF NOT EXISTS idx_pain_phrases_trend ON cluster_pain_phrases(trend_id);
CREATE INDEX IF NOT EXISTS idx_pain_phrases_snapshot ON cluster_pain_phrases(snapshot_id);

-- 6. Opportunity gaps
CREATE TABLE IF NOT EXISTS opportunity_gaps (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_id          UUID NOT NULL REFERENCES detected_trends(id) ON DELETE CASCADE,
  snapshot_id       UUID NOT NULL,
  gap_description   TEXT NOT NULL,
  gap_type          TEXT NOT NULL,          -- 'missing_feature', 'too_complex', 'too_expensive', 'unaddressed_use_case'
  evidence_signals  UUID[],
  source_quotes     JSONB,                 -- [{title, source}]
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trend_id, snapshot_id, gap_description)
);

CREATE INDEX IF NOT EXISTS idx_gaps_trend ON opportunity_gaps(trend_id);

-- 7. Add why_now_prediction to opportunity_briefs for richer "Why now" text
ALTER TABLE opportunity_briefs ADD COLUMN IF NOT EXISTS why_now_prediction TEXT;
ALTER TABLE opportunity_briefs ADD COLUMN IF NOT EXISTS growth_indicator TEXT;  -- 'accelerating', 'steady', 'declining', 'breakout'
ALTER TABLE opportunity_briefs ADD COLUMN IF NOT EXISTS pain_phrases JSONB;

-- A/B Testing Framework
-- Run once in Supabase SQL editor or via supabase db push.

-- User experiment assignments (one row per user+experiment, deterministic variant)
CREATE TABLE IF NOT EXISTS user_experiments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  experiment_name TEXT NOT NULL,
  variant         TEXT NOT NULL,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB,
  UNIQUE (user_id, experiment_name)
);
CREATE INDEX IF NOT EXISTS user_experiments_user_idx ON user_experiments(user_id);
CREATE INDEX IF NOT EXISTS user_experiments_exp_idx ON user_experiments(experiment_name, variant);

-- Per-user, per-experiment metric events
CREATE TABLE IF NOT EXISTS experiment_metrics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  experiment_name TEXT NOT NULL,
  variant         TEXT NOT NULL,
  metric_name     TEXT NOT NULL,
  metric_value    FLOAT NOT NULL DEFAULT 1,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS experiment_metrics_exp_idx ON experiment_metrics(experiment_name, variant);
CREATE INDEX IF NOT EXISTS experiment_metrics_user_idx ON experiment_metrics(user_id, experiment_name);

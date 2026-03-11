-- Performance indexes for frequently-queried composite columns
-- Apply in Supabase SQL editor

CREATE INDEX IF NOT EXISTS idx_raw_signals_source_created
  ON raw_signals(source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_opp_briefs_trend_created
  ON opportunity_briefs(trend_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hypotheses_trend_created
  ON problem_hypotheses(trend_id, created_at DESC);

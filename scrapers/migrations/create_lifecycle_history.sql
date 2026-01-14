-- Day 4: Create trend lifecycle history table
-- Tracks how trends evolve between snapshots (acceleration, lifecycle stages)

CREATE TABLE trend_lifecycle_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,
  trend_keyword TEXT NOT NULL,

  -- Current state
  current_momentum NUMERIC NOT NULL,
  current_signals INTEGER NOT NULL,
  current_top3_mean NUMERIC,

  -- Previous state (NULL for first appearance)
  prev_momentum NUMERIC,
  prev_signals INTEGER,
  prev_snapshot_id UUID REFERENCES trend_snapshots(id),

  -- Acceleration metrics
  momentum_change_pct NUMERIC, -- Percentage change
  signal_change INTEGER, -- Absolute change
  acceleration_score NUMERIC, -- Weighted acceleration metric

  -- Lifecycle
  lifecycle_stage TEXT NOT NULL, -- emerging, rising, peaking, declining, fading, stable
  stage_confidence NUMERIC, -- 0-1, how confident we are in the stage

  -- Context
  snapshots_seen INTEGER NOT NULL, -- How many times has this trend appeared
  first_seen_at TIMESTAMP,
  last_seen_at TIMESTAMP,

  -- Versioning
  lifecycle_version TEXT NOT NULL DEFAULT 'lifecycle-v1',

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_lifecycle_snapshot ON trend_lifecycle_history(snapshot_id);
CREATE INDEX idx_lifecycle_keyword ON trend_lifecycle_history(trend_keyword);
CREATE INDEX idx_lifecycle_stage ON trend_lifecycle_history(lifecycle_stage);
CREATE INDEX idx_lifecycle_created ON trend_lifecycle_history(created_at);

COMMENT ON TABLE trend_lifecycle_history IS 'Tracks trend evolution: acceleration, deceleration, lifecycle stages';
COMMENT ON COLUMN trend_lifecycle_history.momentum_change_pct IS 'Percentage change from previous snapshot (NULL if first appearance)';
COMMENT ON COLUMN trend_lifecycle_history.signal_change IS 'Change in signal count from previous snapshot';
COMMENT ON COLUMN trend_lifecycle_history.acceleration_score IS 'Weighted metric combining momentum and signal changes';
COMMENT ON COLUMN trend_lifecycle_history.lifecycle_stage IS 'emerging | rising | peaking | declining | fading | stable';
COMMENT ON COLUMN trend_lifecycle_history.stage_confidence IS 'Confidence in lifecycle stage (0-1), based on data quality';
COMMENT ON COLUMN trend_lifecycle_history.snapshots_seen IS 'Total number of snapshots this trend has appeared in';
COMMENT ON COLUMN trend_lifecycle_history.lifecycle_version IS 'Version of lifecycle detection algorithm';

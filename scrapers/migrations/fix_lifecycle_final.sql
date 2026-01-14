-- Final correctness fixes for lifecycle tracking

-- 1. Add trend_id as the stable identity (keywords will change with embeddings)
ALTER TABLE trend_lifecycle_history
ADD COLUMN trend_id UUID REFERENCES detected_trends(id);

-- 2. Ensure append-only uniqueness (no duplicate rows for same snapshot+trend)
CREATE UNIQUE INDEX idx_lifecycle_unique_snapshot_trend
ON trend_lifecycle_history(snapshot_id, trend_id);

-- 3. Add normalization metadata for acceleration score auditability
ALTER TABLE trend_lifecycle_history
ADD COLUMN accel_norm_divisor INTEGER DEFAULT 10,  -- signal_change normalized by this
ADD COLUMN accel_momentum_weight NUMERIC DEFAULT 0.7,
ADD COLUMN accel_signal_weight NUMERIC DEFAULT 0.3;

COMMENT ON COLUMN trend_lifecycle_history.trend_id IS 'Stable trend identity (use this, not keyword - keywords will change)';
COMMENT ON COLUMN trend_lifecycle_history.accel_norm_divisor IS 'Divisor for signal_change normalization (±N signals = full weight)';
COMMENT ON COLUMN trend_lifecycle_history.accel_momentum_weight IS 'Weight for momentum component in acceleration_score';
COMMENT ON COLUMN trend_lifecycle_history.accel_signal_weight IS 'Weight for signal component in acceleration_score';

-- 4. Add frontend display guard
COMMENT ON COLUMN trend_lifecycle_history.acceleration_comparable IS
  'Frontend: NEVER show 🔥📈📉 when this is false - acceleration is not trustworthy';

-- Note: trend_keyword kept for human readability but trend_id is source of truth
COMMENT ON COLUMN trend_lifecycle_history.trend_keyword IS
  'Human-readable only - use trend_id for joins (keywords will evolve with embeddings)';

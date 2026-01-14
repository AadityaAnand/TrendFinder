-- Add guards and metadata for truthful lifecycle tracking

ALTER TABLE trend_lifecycle_history
ADD COLUMN prev_scoring_version TEXT,
ADD COLUMN time_gap_hours NUMERIC,
ADD COLUMN acceleration_comparable BOOLEAN DEFAULT true,
ADD COLUMN acceleration_guards TEXT[], -- Array of reasons why acceleration might be unreliable
ADD COLUMN confidence_reasons TEXT[], -- Array of reasons affecting confidence
ADD COLUMN lifecycle_reason TEXT, -- Why this stage was chosen
ADD COLUMN days_seen INTEGER; -- Distinct days (not just snapshots)

COMMENT ON COLUMN trend_lifecycle_history.prev_scoring_version IS 'Scoring version of previous snapshot (null if first appearance)';
COMMENT ON COLUMN trend_lifecycle_history.time_gap_hours IS 'Hours between current and previous snapshot';
COMMENT ON COLUMN trend_lifecycle_history.acceleration_comparable IS 'False if scoring versions differ or time gap too small';
COMMENT ON COLUMN trend_lifecycle_history.acceleration_guards IS 'Warnings: prev_near_zero, version_mismatch, time_gap_small, baseline_method_changed';
COMMENT ON COLUMN trend_lifecycle_history.confidence_reasons IS 'Factors reducing confidence: insufficient_history, unstable_baseline, etc';
COMMENT ON COLUMN trend_lifecycle_history.lifecycle_reason IS 'Explanation of why this lifecycle stage was chosen';
COMMENT ON COLUMN trend_lifecycle_history.days_seen IS 'Number of distinct calendar days this trend appeared (prevents rerun inflation)';

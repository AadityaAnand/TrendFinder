-- ============================================================
-- COMPLETE DAY 3 MIGRATION - Run each section separately
-- ============================================================

-- SECTION 1: Add scoring_version to trend_snapshots
-- Run this first and verify it succeeds before continuing
-- ============================================================
ALTER TABLE trend_snapshots
ADD COLUMN scoring_version TEXT DEFAULT 'norm-p90-decay7d-v1';

-- VERIFY SECTION 1:
SELECT column_name FROM information_schema.columns
WHERE table_name = 'trend_snapshots' AND column_name = 'scoring_version';
-- Should return one row with 'scoring_version'


-- SECTION 2: Backfill existing snapshots
-- Run this after Section 1 succeeds
-- ============================================================
UPDATE trend_snapshots
SET scoring_version = 'unknown-pre-v1'
WHERE scoring_version IS NULL;

-- VERIFY SECTION 2:
SELECT scoring_version, COUNT(*) FROM trend_snapshots GROUP BY scoring_version;


-- SECTION 3: Add columns to trend_snapshot_items
-- Run this after Section 2 succeeds
-- ============================================================
ALTER TABLE trend_snapshot_items
ADD COLUMN top3_mean NUMERIC;

ALTER TABLE trend_snapshot_items
ADD COLUMN scoring_version TEXT;

-- VERIFY SECTION 3:
SELECT column_name FROM information_schema.columns
WHERE table_name = 'trend_snapshot_items'
AND column_name IN ('top3_mean', 'scoring_version');
-- Should return two rows


-- SECTION 4: Backfill trend_snapshot_items scoring_version
-- Run this after Section 3 succeeds
-- ============================================================
UPDATE trend_snapshot_items tsi
SET scoring_version = COALESCE(ts.scoring_version, 'unknown-pre-v1')
FROM trend_snapshots ts
WHERE tsi.snapshot_id = ts.id AND tsi.scoring_version IS NULL;

-- VERIFY SECTION 4:
SELECT scoring_version, COUNT(*) FROM trend_snapshot_items GROUP BY scoring_version;


-- SECTION 5: Add method tracking to snapshot_normalization_params
-- Run this after Section 4 succeeds (skip if columns already exist)
-- ============================================================
-- Check if columns exist first:
SELECT column_name FROM information_schema.columns
WHERE table_name = 'snapshot_normalization_params'
AND column_name IN ('baseline_method', 'window_sample_size', 'window_days');

-- If they don't exist, run these:
ALTER TABLE snapshot_normalization_params
ADD COLUMN baseline_method TEXT;

ALTER TABLE snapshot_normalization_params
ADD COLUMN window_sample_size INTEGER;

ALTER TABLE snapshot_normalization_params
ADD COLUMN window_days INTEGER;


-- SECTION 6: Add comments
-- Run this last
-- ============================================================
COMMENT ON COLUMN trend_snapshots.scoring_version IS 'Scoring formula version (norm method + params). Bump when changing p90/decay/aggregation logic.';
COMMENT ON COLUMN trend_snapshot_items.top3_mean IS 'Mean of top min(3,n) weighted scores. Detects "one breakout signal" vs "many mediocre signals".';
COMMENT ON COLUMN trend_snapshot_items.scoring_version IS 'Scoring version from parent snapshot (denormalized for self-describing rows)';
COMMENT ON COLUMN snapshot_normalization_params.baseline_method IS 'Method used: rolling_14d (raw signals), snapshot_median (≥3 snapshot p90s), bootstrap (hardcoded fallback)';
COMMENT ON COLUMN snapshot_normalization_params.window_sample_size IS 'Number of raw signals in rolling window (if rolling_14d method used)';
COMMENT ON COLUMN snapshot_normalization_params.window_days IS 'Actual lookback window used (default 14, may be less if history sparse)';

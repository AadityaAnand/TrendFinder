-- ============================================================
-- SCHEMA STATUS CHECKER
-- Run this to see which columns exist and which are missing
-- ============================================================

-- Check trend_snapshots columns
SELECT 'trend_snapshots' as table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'trend_snapshots'
AND column_name IN ('detector_version', 'scoring_version')
ORDER BY column_name;

-- Check trend_snapshot_items columns
SELECT 'trend_snapshot_items' as table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'trend_snapshot_items'
AND column_name IN ('top3_mean', 'scoring_version')
ORDER BY column_name;

-- Check snapshot_normalization_params columns
SELECT 'snapshot_normalization_params' as table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'snapshot_normalization_params'
AND column_name IN ('baseline_method', 'window_sample_size', 'window_days')
ORDER BY column_name;

-- Summary: Count which columns are missing
SELECT
  'MISSING COLUMNS' as status,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trend_snapshots' AND column_name = 'scoring_version'
  ) THEN 'trend_snapshots.scoring_version' ELSE NULL END as missing_1,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trend_snapshot_items' AND column_name = 'top3_mean'
  ) THEN 'trend_snapshot_items.top3_mean' ELSE NULL END as missing_2,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trend_snapshot_items' AND column_name = 'scoring_version'
  ) THEN 'trend_snapshot_items.scoring_version' ELSE NULL END as missing_3;

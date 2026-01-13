-- Step 1: Add scoring_version to trend_snapshots
ALTER TABLE trend_snapshots
ADD COLUMN scoring_version TEXT DEFAULT 'norm-p90-decay7d-v1';

-- Verify it was added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'trend_snapshots'
AND column_name = 'scoring_version';

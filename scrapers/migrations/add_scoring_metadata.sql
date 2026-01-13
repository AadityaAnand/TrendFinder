ALTER TABLE trend_snapshots
ADD COLUMN IF NOT EXISTS scoring_version TEXT DEFAULT 'norm-p90-decay7d-v1';

UPDATE trend_snapshots
SET scoring_version = 'unknown-pre-v1'
WHERE scoring_version IS NULL;

ALTER TABLE trend_snapshot_items
ADD COLUMN IF NOT EXISTS top3_mean NUMERIC,
ADD COLUMN IF NOT EXISTS scoring_version TEXT;

UPDATE trend_snapshot_items tsi
SET scoring_version = COALESCE(ts.scoring_version, 'unknown-pre-v1')
FROM trend_snapshots ts
WHERE tsi.snapshot_id = ts.id AND tsi.scoring_version IS NULL;

COMMENT ON COLUMN trend_snapshots.scoring_version IS 'Scoring formula version (norm method + params). Bump when changing p90/decay/aggregation logic.';
COMMENT ON COLUMN trend_snapshot_items.top3_mean IS 'Mean of top min(3,n) weighted scores. Detects "one breakout signal" vs "many mediocre signals".';
COMMENT ON COLUMN trend_snapshot_items.scoring_version IS 'Scoring version from parent snapshot (denormalized for self-describing rows)';

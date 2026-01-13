-- Add missing columns to trend_snapshot_items
ALTER TABLE trend_snapshot_items
ADD COLUMN topk_used INTEGER;

ALTER TABLE trend_snapshot_items
ADD COLUMN trend_keyword TEXT;

COMMENT ON COLUMN trend_snapshot_items.topk_used IS 'Actual k value used in topk_mean calculation (min(3, signal_count))';
COMMENT ON COLUMN trend_snapshot_items.trend_keyword IS 'Trend keyword/theme (denormalized from detected_trends for self-describing rows)';

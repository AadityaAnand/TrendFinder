CREATE TABLE IF NOT EXISTS trend_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMP DEFAULT NOW(),
  signal_count INTEGER,
  unique_signal_count INTEGER,
  duplicate_count INTEGER,
  detector_version TEXT DEFAULT 'keyword-scaffold-v1'
);

CREATE TABLE IF NOT EXISTS trend_snapshot_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID REFERENCES trend_snapshots(id) ON DELETE CASCADE,
  trend_id UUID REFERENCES detected_trends(id) ON DELETE CASCADE,
  momentum_score NUMERIC,
  signal_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(snapshot_id, trend_id)
);

CREATE TABLE IF NOT EXISTS trend_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID REFERENCES trend_snapshots(id) ON DELETE CASCADE,
  trend_id UUID REFERENCES detected_trends(id) ON DELETE CASCADE,
  signal_id UUID REFERENCES raw_signals(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(snapshot_id, trend_id, signal_id)
);

CREATE INDEX idx_trend_snapshot_items_snapshot ON trend_snapshot_items(snapshot_id);
CREATE INDEX idx_trend_snapshot_items_trend ON trend_snapshot_items(trend_id);
CREATE INDEX idx_trend_signals_snapshot ON trend_signals(snapshot_id);
CREATE INDEX idx_trend_signals_trend ON trend_signals(trend_id);
CREATE INDEX idx_trend_signals_signal ON trend_signals(signal_id);

ALTER TABLE detected_trends
ADD COLUMN IF NOT EXISTS detector_version TEXT DEFAULT 'keyword-scaffold-v1',
ADD COLUMN IF NOT EXISTS last_updated TIMESTAMP DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_detected_trends_version_theme
ON detected_trends(detector_version, theme);

COMMENT ON TABLE trend_snapshots IS 'Append-only snapshot history for trend detection runs. Each run creates new snapshot (not deduplicated by time). Semantics: per-run not per-day.';
COMMENT ON TABLE trend_snapshot_items IS 'Per-run metrics for each trend (preserves history). UNIQUE(snapshot_id, trend_id) ensures idempotent reruns.';
COMMENT ON TABLE trend_signals IS 'Snapshot-scoped evidence: which signals supported which trends at which run. Append-only (no deletes). UNIQUE(snapshot_id, trend_id, signal_id) prevents duplicates.';
COMMENT ON COLUMN detected_trends.detector_version IS 'Algorithm version that created this trend entity (namespace for upsert). Prevents keyword scaffold colliding with future embedding-based clusters.';

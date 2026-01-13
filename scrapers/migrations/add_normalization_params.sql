CREATE TABLE IF NOT EXISTS snapshot_normalization_params (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID REFERENCES trend_snapshots(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  p90 NUMERIC NOT NULL,
  sample_size INTEGER NOT NULL,
  half_life_days NUMERIC DEFAULT 7,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(snapshot_id, source)
);

CREATE INDEX idx_snapshot_norm_params_snapshot ON snapshot_normalization_params(snapshot_id);
CREATE INDEX idx_snapshot_norm_params_source ON snapshot_normalization_params(source);

COMMENT ON TABLE snapshot_normalization_params IS 'Per-snapshot normalization parameters for auditability and baseline comparison';
COMMENT ON COLUMN snapshot_normalization_params.p90 IS '90th percentile of engagement score for this source at snapshot time';
COMMENT ON COLUMN snapshot_normalization_params.sample_size IS 'Number of signals used to calculate p90 (for stability assessment)';

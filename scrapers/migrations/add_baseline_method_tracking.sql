ALTER TABLE snapshot_normalization_params
ADD COLUMN IF NOT EXISTS baseline_method TEXT,
ADD COLUMN IF NOT EXISTS window_sample_size INTEGER,
ADD COLUMN IF NOT EXISTS window_days INTEGER;

COMMENT ON COLUMN snapshot_normalization_params.baseline_method IS 'Method used: rolling_14d (raw signals), snapshot_median (≥3 snapshot p90s), bootstrap (hardcoded fallback)';
COMMENT ON COLUMN snapshot_normalization_params.window_sample_size IS 'Number of raw signals in rolling window (if rolling_14d method used)';
COMMENT ON COLUMN snapshot_normalization_params.window_days IS 'Actual lookback window used (default 14, may be less if history sparse)';

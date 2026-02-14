-- Add signal-level demand scoring and cluster-level demand density
-- Phase 1: Signal Purification - Demand Signal Upgrade

CREATE TABLE IF NOT EXISTS signal_demand_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID REFERENCES raw_signals(id),
  snapshot_id UUID REFERENCES trend_snapshots(id),
  layer1_match BOOLEAN DEFAULT FALSE,
  layer1_patterns TEXT[],
  layer2_probability FLOAT,
  layer2_model TEXT,
  demand_probability FLOAT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(snapshot_id, signal_id)
);

ALTER TABLE trend_snapshot_items ADD COLUMN IF NOT EXISTS demand_density FLOAT;
ALTER TABLE trend_snapshot_items ADD COLUMN IF NOT EXISTS demand_signal_count INTEGER;

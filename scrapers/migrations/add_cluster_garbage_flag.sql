-- Add garbage cluster tracking to trend_clusters
-- Phase 1: Signal Purification - Garbage Cluster Rejection

ALTER TABLE trend_clusters ADD COLUMN IF NOT EXISTS is_garbage BOOLEAN DEFAULT FALSE;
ALTER TABLE trend_clusters ADD COLUMN IF NOT EXISTS garbage_reasons JSONB;

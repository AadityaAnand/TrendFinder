CREATE TABLE IF NOT EXISTS trend_trajectories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trend_id UUID NOT NULL REFERENCES detected_trends(id) ON DELETE CASCADE,

    trajectory_data JSONB NOT NULL DEFAULT '[]',

    first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL,
    total_snapshots INTEGER NOT NULL DEFAULT 0,

    peak_momentum NUMERIC,
    peak_momentum_at TIMESTAMP WITH TIME ZONE,

    current_stage TEXT,
    stage_history JSONB DEFAULT '[]',

    qualified_count INTEGER DEFAULT 0,
    last_qualified_at TIMESTAMP WITH TIME ZONE,

    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    computed_from_version TEXT DEFAULT 'trajectory-v1',

    UNIQUE(trend_id)
);

COMMENT ON TABLE trend_trajectories IS 'Computed rollup from immutable sources: trend_snapshot_items, trend_lifecycle_history, trend_opportunities. Can be safely rebuilt.';

CREATE INDEX IF NOT EXISTS idx_trend_trajectories_trend
ON trend_trajectories(trend_id);

CREATE INDEX IF NOT EXISTS idx_trend_trajectories_updated
ON trend_trajectories(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_trend_trajectories_qualified
ON trend_trajectories(qualified_count DESC);

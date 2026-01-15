CREATE TABLE IF NOT EXISTS trend_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,
    trend_id UUID NOT NULL REFERENCES detected_trends(id) ON DELETE CASCADE,

    qualified BOOLEAN NOT NULL DEFAULT FALSE,
    opportunity_score NUMERIC,

    independent_artifact_count INTEGER NOT NULL DEFAULT 0,
    demand_hits INTEGER NOT NULL DEFAULT 0,
    demand_examples JSONB DEFAULT '[]',
    actionability_score NUMERIC DEFAULT 0,
    suggested_actions JSONB DEFAULT '[]',

    signal_quality_score NUMERIC,
    demand_strength NUMERIC,

    rejection_reasons TEXT[] DEFAULT '{}',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(snapshot_id, trend_id)
);

CREATE INDEX IF NOT EXISTS idx_trend_opportunities_snapshot
ON trend_opportunities(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_trend_opportunities_qualified
ON trend_opportunities(snapshot_id) WHERE qualified = TRUE;

CREATE INDEX IF NOT EXISTS idx_trend_opportunities_score
ON trend_opportunities(snapshot_id, opportunity_score DESC) WHERE qualified = TRUE;

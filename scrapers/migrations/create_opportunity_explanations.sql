CREATE TABLE IF NOT EXISTS opportunity_explanations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES trend_opportunities(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,

    why_this_trend TEXT NOT NULL,
    why_now TEXT NOT NULL,
    whats_the_risk TEXT NOT NULL,

    evidence_used JSONB DEFAULT '[]',
    evidence_hash TEXT NOT NULL,
    lifecycle_context JSONB DEFAULT '{}',
    uncertainty_factors JSONB DEFAULT '[]',

    model_used TEXT NOT NULL,
    prompt_version TEXT NOT NULL DEFAULT 'prompt-v1',
    risk_rules_version TEXT NOT NULL DEFAULT 'risk-rules-v1',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_opportunity_explanations_opportunity
ON opportunity_explanations(opportunity_id);

CREATE INDEX IF NOT EXISTS idx_opportunity_explanations_snapshot
ON opportunity_explanations(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_opportunity_explanations_hash
ON opportunity_explanations(evidence_hash);

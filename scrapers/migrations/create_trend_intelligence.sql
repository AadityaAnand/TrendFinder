-- Migration: Create trend_intelligence table
-- Stores LLM-generated intelligence per trend per snapshot
-- Includes: summary, build ideas, existing solutions, risks
-- Scoped by evidence_hash to avoid regenerating when evidence hasn't changed

CREATE TABLE IF NOT EXISTS trend_intelligence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trend_id UUID NOT NULL REFERENCES detected_trends(id),
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id),

    -- LLM-generated content
    summary TEXT,                          -- 2-3 sentence plain-English summary
    build_ideas JSONB DEFAULT '[]'::jsonb, -- array of {idea, effort, audience}
    existing_solutions JSONB DEFAULT '[]'::jsonb, -- array of {name, url, gap}
    risks TEXT[],                          -- plain-English risk factors

    -- Deduplication
    evidence_hash TEXT NOT NULL,           -- SHA256 of evidence used
    signal_count INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    model_used TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(snapshot_id, trend_id)
);

CREATE INDEX IF NOT EXISTS idx_trend_intelligence_trend_id ON trend_intelligence(trend_id);
CREATE INDEX IF NOT EXISTS idx_trend_intelligence_snapshot_id ON trend_intelligence(snapshot_id);

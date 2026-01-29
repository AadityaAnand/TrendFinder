-- Phase 9: Competitive Landscape + Saturation Intelligence
-- Purpose: Prevent recommending saturated opportunities without a wedge

-- 9.1: Per-trend competitive state (computed each snapshot)
CREATE TABLE IF NOT EXISTS trend_competitive_intelligence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,
    trend_id UUID NOT NULL REFERENCES detected_trends(id) ON DELETE CASCADE,

    -- Core saturation assessment
    saturation_score NUMERIC NOT NULL CHECK (saturation_score >= 0 AND saturation_score <= 1),
    competition_level TEXT NOT NULL CHECK (competition_level IN (
        'low', 'moderate', 'high', 'uncertain'
    )),

    -- Confidence and auditability
    confidence NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    confidence_reasons TEXT[] DEFAULT '{}',

    -- What evidence was used
    signals_used INTEGER DEFAULT 0,
    source_types_used TEXT[] DEFAULT '{}',

    method_version TEXT DEFAULT 'competition-v1',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(snapshot_id, trend_id)
);

-- 9.2: Raw competitive signals (evidence)
CREATE TABLE IF NOT EXISTS competitive_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,
    trend_id UUID NOT NULL REFERENCES detected_trends(id) ON DELETE CASCADE,

    signal_type TEXT NOT NULL CHECK (signal_type IN (
        'repo_density',           -- Count of repos in embedding cluster
        'alt_phrases',            -- "alternative to", "vs", "comparison" frequency
        'comparison_posts',       -- Explicit comparison content
        'volume_vs_quality',      -- Rising volume + falling topK mean
        'search_intent',          -- "how to choose", "which tool" patterns
        'cross_source_redundancy' -- Same concept repeated across sources
    )),

    -- Raw and normalized values
    value NUMERIC NOT NULL,
    normalized_value NUMERIC CHECK (normalized_value >= 0 AND normalized_value <= 1),

    -- Provenance
    source TEXT,        -- Where this signal came from
    notes TEXT,         -- Human-readable explanation

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9.3: Differentiation wedges (deterministic suggestions)
CREATE TABLE IF NOT EXISTS trend_wedges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trend_id UUID NOT NULL REFERENCES detected_trends(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,

    wedge_type TEXT NOT NULL CHECK (wedge_type IN (
        'niche_vertical',  -- Domain-specific focus
        'integration',     -- "works with X", "plugin for Y"
        'performance',     -- "faster", "lighter", "scale"
        'compliance',      -- SOC2, HIPAA, GDPR
        'ux',              -- Usability complaints = opportunity
        'distribution'     -- Community-driven / embedded
    )),

    trigger_reason TEXT NOT NULL,  -- What evidence triggered this wedge
    confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(trend_id, snapshot_id, wedge_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_competitive_intel_snapshot
ON trend_competitive_intelligence(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_competitive_intel_trend
ON trend_competitive_intelligence(trend_id);

CREATE INDEX IF NOT EXISTS idx_competitive_intel_level
ON trend_competitive_intelligence(competition_level);

CREATE INDEX IF NOT EXISTS idx_competitive_signals_trend
ON competitive_signals(snapshot_id, trend_id);

CREATE INDEX IF NOT EXISTS idx_competitive_signals_type
ON competitive_signals(signal_type);

CREATE INDEX IF NOT EXISTS idx_trend_wedges_trend
ON trend_wedges(trend_id, snapshot_id);

-- Phase 9 alert types: extend user_alerts constraint
-- Drop and recreate the check constraint to include competition alerts
ALTER TABLE user_alerts DROP CONSTRAINT IF EXISTS user_alerts_alert_type_check;
ALTER TABLE user_alerts ADD CONSTRAINT user_alerts_alert_type_check CHECK (alert_type IN (
    -- Phase 8 types
    'became_eligible',
    'entered_early_edge',
    'confidence_upgraded',
    'expiry_risk_high',
    'momentum_breakout',
    'stage_transition',
    'timing_uncertain',
    -- Phase 9 types
    'entered_crowded_zone',
    'crowding_increasing',
    'wedge_required',
    'competition_uncertain'
));

-- Phase 9 alert rules
INSERT INTO alert_rules (alert_type, min_confidence, requires_comparable_acceleration, thresholds)
VALUES
    ('entered_crowded_zone', 0.6, FALSE, '{"min_saturation": 0.60}'),
    ('crowding_increasing', 0.6, FALSE, '{"saturation_increase": 0.15}'),
    ('wedge_required', 0.7, FALSE, '{"min_saturation": 0.60}'),
    ('competition_uncertain', 0.0, FALSE, '{}')
ON CONFLICT (alert_type) DO NOTHING;

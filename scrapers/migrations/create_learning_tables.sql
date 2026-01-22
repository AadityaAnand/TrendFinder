-- Phase 5: Learning & Adaptation Tables
-- Stores per-user weight adjustments and inferred preferences

-- 5.1: Per-user relevance weight adjustments
-- Tracks how much to adjust each relevance dimension based on feedback
CREATE TABLE IF NOT EXISTS user_weight_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

    -- Weight adjustments (bounded to ±0.20, i.e., ±20%)
    role_match_adj NUMERIC DEFAULT 0 CHECK (role_match_adj >= -0.20 AND role_match_adj <= 0.20),
    domain_match_adj NUMERIC DEFAULT 0 CHECK (domain_match_adj >= -0.20 AND domain_match_adj <= 0.20),
    stack_match_adj NUMERIC DEFAULT 0 CHECK (stack_match_adj >= -0.20 AND stack_match_adj <= 0.20),
    effort_fit_adj NUMERIC DEFAULT 0 CHECK (effort_fit_adj >= -0.20 AND effort_fit_adj <= 0.20),
    risk_fit_adj NUMERIC DEFAULT 0 CHECK (risk_fit_adj >= -0.20 AND risk_fit_adj <= 0.20),

    -- Metadata for auditability
    adjustment_version INTEGER DEFAULT 1,
    last_computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    feedback_count_used INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id)
);

-- 5.2: Inferred preferences (separate from explicit, always overridable)
CREATE TABLE IF NOT EXISTS user_inferred_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

    -- Inferred values (weak signals only)
    inferred_roles TEXT[] DEFAULT '{}',
    inferred_domains TEXT[] DEFAULT '{}',
    inferred_stack TEXT[] DEFAULT '{}',
    inferred_risk_tolerance TEXT,  -- low, medium, high

    -- Confidence and evidence
    confidence_scores JSONB DEFAULT '{}',  -- e.g., {"roles": 0.7, "domains": 0.5}
    evidence_summary JSONB DEFAULT '{}',   -- What feedback led to these inferences

    -- User control
    user_accepted BOOLEAN DEFAULT FALSE,   -- User explicitly accepted these
    user_rejected_items TEXT[] DEFAULT '{}', -- Items user rejected from inference

    inference_version INTEGER DEFAULT 1,
    last_computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id)
);

-- 5.3: Opportunity outcomes (lightweight tracking)
CREATE TABLE IF NOT EXISTS opportunity_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    opportunity_id UUID NOT NULL REFERENCES trend_opportunities(id) ON DELETE CASCADE,

    -- Outcome type
    outcome_type TEXT NOT NULL CHECK (outcome_type IN (
        'explored',      -- User clicked through / viewed details
        'started',       -- User indicated they started working on it
        'completed',     -- User completed/shipped something
        'abandoned',     -- User started but stopped
        'passed'         -- User explicitly passed after consideration
    )),

    -- Optional context
    note TEXT,
    time_spent_days INTEGER,  -- Self-reported

    -- Tracking
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id, opportunity_id)
);

-- 5.4: Weight adjustment history (for auditability)
CREATE TABLE IF NOT EXISTS weight_adjustment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

    adjustment_version INTEGER NOT NULL,

    -- Snapshot of adjustments at this version
    adjustments_snapshot JSONB NOT NULL,

    -- What triggered this update
    trigger_reason TEXT,  -- 'feedback_threshold', 'manual_reset', 'periodic_recompute'
    feedback_window_start TIMESTAMP WITH TIME ZONE,
    feedback_window_end TIMESTAMP WITH TIME ZONE,

    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_weight_adjustments_user
ON user_weight_adjustments(user_id);

CREATE INDEX IF NOT EXISTS idx_user_inferred_preferences_user
ON user_inferred_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_opportunity_outcomes_user
ON opportunity_outcomes(user_id);

CREATE INDEX IF NOT EXISTS idx_opportunity_outcomes_type
ON opportunity_outcomes(outcome_type);

CREATE INDEX IF NOT EXISTS idx_weight_adjustment_history_user
ON weight_adjustment_history(user_id, adjustment_version DESC);

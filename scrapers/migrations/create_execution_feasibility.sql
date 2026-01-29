-- Phase 10: Execution Feasibility & Moat Reality Check
-- Goal: "Can I actually execute this, and is there a defensible path?"
-- Never hides opportunities — only annotates with execution truth.

-- 10.1: Per-user execution feasibility
CREATE TABLE IF NOT EXISTS execution_feasibility (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    opportunity_id UUID NOT NULL REFERENCES trend_opportunities(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,

    -- Core feasibility score (0-1, higher = more feasible)
    feasibility_score NUMERIC NOT NULL CHECK (feasibility_score >= 0 AND feasibility_score <= 1),

    -- Dimension breakdown (each 0-1)
    team_fit NUMERIC CHECK (team_fit >= 0 AND team_fit <= 1),
    time_fit NUMERIC CHECK (time_fit >= 0 AND time_fit <= 1),
    skill_coverage NUMERIC CHECK (skill_coverage >= 0 AND skill_coverage <= 1),
    execution_type_fit NUMERIC CHECK (execution_type_fit >= 0 AND execution_type_fit <= 1),
    sales_motion_fit NUMERIC CHECK (sales_motion_fit >= 0 AND sales_motion_fit <= 1),
    infra_load_fit NUMERIC CHECK (infra_load_fit >= 0 AND infra_load_fit <= 1),

    -- Blocking factors
    blocking_factors TEXT[] DEFAULT '{}',
    fit_summary TEXT,

    -- Inputs used (for auditability)
    inputs_used JSONB DEFAULT '{}',
    model_version TEXT DEFAULT 'exec-v1',
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id, opportunity_id, snapshot_id)
);

-- 10.2: Execution requirements per opportunity
CREATE TABLE IF NOT EXISTS execution_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES trend_opportunities(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,

    -- Build effort (honest ranges, not point estimates)
    build_weeks_min INTEGER,
    build_weeks_max INTEGER,

    -- Ongoing burden
    maintenance_level TEXT CHECK (maintenance_level IN ('low', 'medium', 'high')),
    operational_complexity INTEGER CHECK (operational_complexity >= 1 AND operational_complexity <= 5),

    -- Cost buckets (not precise dollars)
    infra_cost_bucket TEXT CHECK (infra_cost_bucket IN (
        'free_tier',        -- $0/mo
        'hobby',            -- <$50/mo
        'startup',          -- $50-500/mo
        'growth',           -- $500-5000/mo
        'enterprise'        -- $5000+/mo
    )),

    -- Execution type classification
    execution_type TEXT CHECK (execution_type IN (
        'saas', 'infra', 'content', 'marketplace',
        'developer_tool', 'integration', 'api_service'
    )),

    -- Sales motion
    sales_motion TEXT CHECK (sales_motion IN (
        'self_serve',       -- Users find and onboard themselves
        'community_led',    -- Open source / community driven
        'content_led',      -- Blog/SEO/social acquisition
        'outbound',         -- Requires active selling
        'enterprise'        -- Long sales cycles, procurement
    )),

    -- Required capabilities (deterministic)
    required_stack TEXT[] DEFAULT '{}',
    required_team_size_min INTEGER DEFAULT 1,
    required_team_size_max INTEGER DEFAULT 1,

    -- Uncertainty flag
    estimation_confidence TEXT DEFAULT 'low' CHECK (estimation_confidence IN ('low', 'medium', 'high')),
    estimation_notes TEXT,

    model_version TEXT DEFAULT 'exec-v1',
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(opportunity_id, snapshot_id)
);

-- 10.3: Moat classification
CREATE TABLE IF NOT EXISTS opportunity_moats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES trend_opportunities(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,

    -- Moat types (can have multiple)
    moat_types TEXT[] DEFAULT '{}',
    -- Valid values: data_moat, workflow_lock_in, distribution_moat,
    --              speed_wedge, regulatory_moat, none_yet

    -- Overall assessment
    moat_strength TEXT CHECK (moat_strength IN (
        'strong', 'moderate', 'temporary', 'weak', 'none'
    )),
    moat_risk TEXT,  -- Human-readable risk statement

    -- Evidence
    moat_evidence JSONB DEFAULT '{}',

    model_version TEXT DEFAULT 'exec-v1',
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(opportunity_id, snapshot_id)
);

-- 10.4: Execution verdicts (the final truth)
CREATE TABLE IF NOT EXISTS execution_verdicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    opportunity_id UUID NOT NULL REFERENCES trend_opportunities(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,

    -- Verdict (never binary)
    verdict TEXT NOT NULL CHECK (verdict IN (
        'strong_fit',           -- Go signals align
        'conditional_fit',      -- Viable with caveats
        'high_risk',            -- Possible but dangerous
        'execution_mismatch'    -- Don't attempt this
    )),

    -- Why this verdict
    verdict_reasons TEXT[] NOT NULL DEFAULT '{}',

    -- Execution archetype
    archetype TEXT CHECK (archetype IN (
        'solo_feasible_mvp',    -- 1 person, weeks
        'indie_saas_bet',       -- 1-2 people, months
        'team_required',        -- 3-5 people
        'infra_play',           -- Long build, ops heavy
        'distribution_game',    -- Tech easy, users hard
        'vc_scale_only'         -- Capital + speed required
    )),

    -- Execution risk flags (hard warnings, no soft language)
    risk_flags TEXT[] DEFAULT '{}',
    -- Valid: winner_take_most_market, enterprise_sales_required,
    --        infra_heavy, low_switching_costs, crowded_with_funding,
    --        requires_distribution_edge, regulatory_uncertainty

    -- Inputs snapshot
    inputs_used JSONB DEFAULT '{}',
    model_version TEXT DEFAULT 'exec-v1',
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id, opportunity_id, snapshot_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_execution_feasibility_user
ON execution_feasibility(user_id, snapshot_id);

CREATE INDEX IF NOT EXISTS idx_execution_feasibility_opp
ON execution_feasibility(opportunity_id);

CREATE INDEX IF NOT EXISTS idx_execution_requirements_opp
ON execution_requirements(opportunity_id, snapshot_id);

CREATE INDEX IF NOT EXISTS idx_opportunity_moats_opp
ON opportunity_moats(opportunity_id, snapshot_id);

CREATE INDEX IF NOT EXISTS idx_execution_verdicts_user
ON execution_verdicts(user_id, snapshot_id);

CREATE INDEX IF NOT EXISTS idx_execution_verdicts_verdict
ON execution_verdicts(verdict);

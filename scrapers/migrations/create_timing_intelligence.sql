-- Phase 8: Timing Intelligence + Alerts
-- Goal: Answer "When should I act?" with explicit uncertainty

-- 8.1: Trend timing signals (computed each snapshot)
CREATE TABLE IF NOT EXISTS trend_timing_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,
    trend_id UUID NOT NULL REFERENCES detected_trends(id) ON DELETE CASCADE,

    -- Core timing classification
    timing_label TEXT NOT NULL CHECK (timing_label IN (
        'too_early',           -- Insufficient signal, wait for more data
        'early_edge',          -- Sweet spot: rising momentum, not crowded
        'crowded',             -- High competition, diminishing returns
        'late_but_monetizable', -- Past peak but still viable for certain plays
        'timing_uncertain'     -- Cannot determine (guardrails triggered)
    )),

    -- Confidence (from Phase 7 calibration, capped by guardrails)
    timing_confidence NUMERIC NOT NULL CHECK (timing_confidence >= 0 AND timing_confidence <= 1),

    -- Evidence for the label
    timing_reasons TEXT[] DEFAULT '{}',  -- Why this label
    timing_guards TEXT[] DEFAULT '{}',   -- What guardrails triggered

    -- Inflection events detected
    inflections_detected JSONB DEFAULT '[]',
    -- e.g., [{"type": "acceleration_inflection_up", "detected_at": "...", "evidence": {...}}]

    -- Expiry risk assessment
    expiry_risk TEXT CHECK (expiry_risk IN ('low', 'medium', 'high')),
    expiry_reasons TEXT[] DEFAULT '{}',

    -- Raw inputs used (for auditability)
    inputs_used JSONB DEFAULT '{}',
    -- e.g., {"momentum": 0.72, "momentum_slope": 0.05, "days_seen": 5, ...}

    model_version TEXT DEFAULT 'timing-v1',
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(snapshot_id, trend_id)
);

-- 8.2: User alerts
CREATE TABLE IF NOT EXISTS user_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

    -- What triggered the alert
    trend_id UUID REFERENCES detected_trends(id) ON DELETE CASCADE,
    opportunity_id UUID REFERENCES trend_opportunities(id) ON DELETE CASCADE,
    snapshot_id UUID REFERENCES trend_snapshots(id) ON DELETE CASCADE,

    -- Alert classification
    alert_type TEXT NOT NULL CHECK (alert_type IN (
        'became_eligible',      -- First time passed Phase 1 gates
        'entered_early_edge',   -- Timing window opened
        'confidence_upgraded',  -- Calibrated confidence crossed threshold
        'expiry_risk_high',     -- Window closing warning
        'momentum_breakout',    -- Significant momentum increase
        'stage_transition',     -- Lifecycle stage changed
        'timing_uncertain'      -- Explicit uncertainty alert
    )),

    -- Alert details
    payload JSONB NOT NULL DEFAULT '{}',
    -- e.g., {"previous_label": "too_early", "new_label": "early_edge", "confidence": 0.75}

    -- Alert metadata
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),

    -- Tracking
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    seen_at TIMESTAMP WITH TIME ZONE,
    dismissed_at TIMESTAMP WITH TIME ZONE,
    actioned_at TIMESTAMP WITH TIME ZONE
);

-- 8.3: Alert rules configuration (for tuning thresholds)
CREATE TABLE IF NOT EXISTS alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type TEXT NOT NULL,

    -- Trigger conditions
    min_confidence NUMERIC DEFAULT 0.7,
    requires_comparable_acceleration BOOLEAN DEFAULT TRUE,

    -- Other thresholds
    thresholds JSONB DEFAULT '{}',
    -- e.g., {"momentum_breakout_stddev": 1.5, "expiry_days_warning": 7}

    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(alert_type)
);

-- Insert default alert rules
INSERT INTO alert_rules (alert_type, min_confidence, requires_comparable_acceleration, thresholds)
VALUES
    ('became_eligible', 0.5, FALSE, '{"min_opportunity_score": 0.6}'),
    ('entered_early_edge', 0.7, TRUE, '{"min_momentum": 0.5}'),
    ('confidence_upgraded', 0.7, FALSE, '{"upgrade_threshold": 0.15}'),
    ('expiry_risk_high', 0.6, TRUE, '{"momentum_decline_runs": 3}'),
    ('momentum_breakout', 0.7, TRUE, '{"stddev_threshold": 1.5}'),
    ('stage_transition', 0.6, FALSE, '{}'),
    ('timing_uncertain', 0.0, FALSE, '{}')
ON CONFLICT (alert_type) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_timing_signals_snapshot
ON trend_timing_signals(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_timing_signals_trend
ON trend_timing_signals(trend_id);

CREATE INDEX IF NOT EXISTS idx_timing_signals_label
ON trend_timing_signals(timing_label);

CREATE INDEX IF NOT EXISTS idx_user_alerts_user
ON user_alerts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_alerts_unseen
ON user_alerts(user_id, created_at DESC)
WHERE seen_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_alerts_trend
ON user_alerts(trend_id);

CREATE INDEX IF NOT EXISTS idx_user_alerts_type
ON user_alerts(alert_type);

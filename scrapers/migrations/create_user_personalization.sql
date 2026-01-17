CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id TEXT UNIQUE,
    display_name TEXT,
    profile_version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

    target_roles TEXT[] DEFAULT '{}',
    domains TEXT[] DEFAULT '{}',
    tech_stack TEXT[] DEFAULT '{}',

    time_horizon TEXT DEFAULT 'flexible',
    team_size TEXT DEFAULT 'solo',
    risk_tolerance TEXT DEFAULT 'medium',
    avoid_topics TEXT[] DEFAULT '{}',

    preference_version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_opportunity_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    opportunity_id UUID NOT NULL REFERENCES trend_opportunities(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,

    feedback_type TEXT NOT NULL,
    note TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id, opportunity_id)
);

CREATE TABLE IF NOT EXISTS user_preference_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    preference_version INTEGER NOT NULL,
    preferences_snapshot JSONB NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_prefs_user ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_user ON user_opportunity_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_opp ON user_opportunity_feedback(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_user_pref_history_user ON user_preference_history(user_id);

-- Chat sessions: one per user+trend conversation thread
CREATE TABLE IF NOT EXISTS opportunity_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_id UUID REFERENCES detected_trends(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_count INTEGER NOT NULL DEFAULT 0,
  variant TEXT NOT NULL DEFAULT 'prompt_v1',  -- A/B test variant
  metadata JSONB
);

-- Individual chat messages (user + assistant turns)
CREATE TABLE IF NOT EXISTS opportunity_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES opportunity_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  evidence_citations JSONB,    -- [{signal_id, title, url, source, excerpt}]
  confidence_score FLOAT,      -- 0-1, only set on assistant messages
  query_type TEXT,             -- 'evidence' | 'idea' | 'temporal_guard' | 'opinion_guard' | 'feasibility_guard'
  metadata JSONB,              -- {model, latency_ms, token_count, guard_triggered, variant}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User feedback on AI responses
CREATE TABLE IF NOT EXISTS chat_message_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES opportunity_chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('thumbs_up', 'thumbs_down')),
  feedback_text TEXT,          -- optional free text for thumbs_down
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_trend ON opportunity_chat_sessions(user_id, trend_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON opportunity_chat_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON opportunity_chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_role ON opportunity_chat_messages(session_id, role);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_message ON chat_message_feedback(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_user ON chat_message_feedback(user_id, created_at DESC);

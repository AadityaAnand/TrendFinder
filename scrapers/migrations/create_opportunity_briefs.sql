-- Phase 3: Opportunity Brief Engine
-- Pre-generated structured briefs for qualified opportunities
-- Serves as the primary data source for /trends/[id]/brief API endpoint

CREATE TABLE IF NOT EXISTS opportunity_briefs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id         UUID,            -- references trend_opportunities(id)
  snapshot_id            UUID NOT NULL,   -- references trend_snapshots(id)
  trend_id               UUID NOT NULL,   -- references detected_trends(id)
  brief_version          TEXT NOT NULL DEFAULT 'brief-v1',
  generated_at           TIMESTAMPTZ DEFAULT now(),

  -- Section A: What Is Happening
  synthesis              TEXT,            -- existing why_this_trend text
  synthesis_citations    JSONB,           -- [{title, url, source}] top 3 signals

  -- Section B: Who Is Feeling This
  persona_roles          TEXT[],          -- ["backend developer", "DevOps engineer"]
  persona_level          TEXT,            -- beginner/intermediate/expert
  persona_domain         TEXT,            -- web-dev/ai-ml/devops/product/other
  persona_pain_points    JSONB,           -- [{phrase, quote, source}]
  persona_confidence     REAL,            -- 0.7 if LLM, 0.4 if fallback

  -- Section C: What Could Be Built
  hypotheses             JSONB,           -- [{idea, effort, audience}]

  -- Section D: Are Startups Already Doing This?
  competition_narrative  TEXT,            -- plain English, always includes uncertainty flag
  competition_startups   JSONB,           -- [{name, url, note}]
  competition_repos      JSONB,           -- [{name}] github repos found
  competition_tools      JSONB,           -- [{name}] tool names extracted
  competition_funding    JSONB,           -- [str] funding mention contexts
  competition_confidence TEXT,            -- high/medium/low/none

  -- Section E: How to Validate
  validation_experiments JSONB,           -- [{title, description, success_criteria, effort, platforms}]

  -- Section F: Risk & Honesty
  risk_narrative         TEXT,            -- existing whats_the_risk text + Phase 2 additions
  risk_factors           JSONB,           -- [{label, severity, description}]
  stability_label        TEXT,            -- stable/rising/volatile
  negative_signal_ratio  REAL,            -- from trend_snapshot_items

  -- Quality Metrics
  completeness_score     REAL,            -- populated_sections / 6
  is_draft               BOOLEAN DEFAULT FALSE,  -- true if completeness < 0.5

  -- Auditability
  llm_prompts            JSONB,           -- {persona: "full prompt text"} keyed by section
  evidence_hash          TEXT,            -- sha256 of top signals + build_ideas; skip regen if unchanged
  model_used             TEXT DEFAULT 'llama-3.3-70b-versatile',

  UNIQUE(snapshot_id, trend_id)
);

CREATE INDEX IF NOT EXISTS idx_opportunity_briefs_trend_id    ON opportunity_briefs(trend_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_briefs_snapshot_id ON opportunity_briefs(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_briefs_is_draft    ON opportunity_briefs(is_draft);

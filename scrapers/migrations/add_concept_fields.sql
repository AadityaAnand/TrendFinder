-- Add concept synthesis fields to detected_trends
-- Phase 1: Signal Purification - Concept Synthesis Layer

ALTER TABLE detected_trends ADD COLUMN IF NOT EXISTS concept_name TEXT;
ALTER TABLE detected_trends ADD COLUMN IF NOT EXISTS problem_statement TEXT;
ALTER TABLE detected_trends ADD COLUMN IF NOT EXISTS affected_persona JSONB;
ALTER TABLE detected_trends ADD COLUMN IF NOT EXISTS concept_category TEXT;
ALTER TABLE detected_trends ADD COLUMN IF NOT EXISTS is_product_opportunity BOOLEAN;
ALTER TABLE detected_trends ADD COLUMN IF NOT EXISTS concept_confidence FLOAT;
ALTER TABLE detected_trends ADD COLUMN IF NOT EXISTS concept_version TEXT;

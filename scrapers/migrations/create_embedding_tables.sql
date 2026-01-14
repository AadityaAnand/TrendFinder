-- Day 6-7: Embedding-based clustering infrastructure
-- Run this migration to enable semantic trend detection
-- CRITICAL: Designed for cluster-to-trend continuity across snapshots

-- Signal embeddings table - stores vector representations
-- Only embed canonical signals (not duplicates)
CREATE TABLE IF NOT EXISTS signal_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id UUID NOT NULL REFERENCES raw_signals(id) ON DELETE CASCADE,
    embedding_model TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
    embedding VECTOR(384) NOT NULL, -- pgvector extension required
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- One embedding per signal per model
    UNIQUE(signal_id, embedding_model)
);

-- Index for similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS idx_signal_embeddings_vector
ON signal_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Index for fast signal lookups
CREATE INDEX IF NOT EXISTS idx_signal_embeddings_signal_id
ON signal_embeddings(signal_id);

-- Cluster definitions table - stores cluster metadata per snapshot
-- NOTE: cluster_label is arbitrary and changes every run - NOT for identity!
CREATE TABLE IF NOT EXISTS trend_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,
    cluster_label INTEGER NOT NULL, -- HDBSCAN cluster ID (-1 = noise, arbitrary otherwise)
    cluster_name TEXT, -- Display label only (NOT for identity)
    centroid VECTOR(384), -- Cluster centroid for continuity matching
    member_count INTEGER NOT NULL DEFAULT 0,
    high_confidence_count INTEGER DEFAULT 0, -- Members with probability >= threshold
    avg_similarity NUMERIC, -- Average pairwise cosine similarity within cluster

    -- Clustering parameters used (for reproducibility)
    min_cluster_size INTEGER NOT NULL DEFAULT 3,
    min_samples INTEGER DEFAULT 2,
    cluster_selection_epsilon NUMERIC DEFAULT 0.0,

    -- Proto-cluster flag (2 signals = early emergence, don't lifecycle yet)
    is_proto_cluster BOOLEAN DEFAULT FALSE,

    -- Representative signals for explainability (top 3 by weighted score)
    representative_signal_ids UUID[],

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- One cluster definition per snapshot per label
    UNIQUE(snapshot_id, cluster_label)
);

-- Cluster membership table - which signals belong to which clusters
CREATE TABLE IF NOT EXISTS cluster_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,
    cluster_id UUID NOT NULL REFERENCES trend_clusters(id) ON DELETE CASCADE,
    signal_id UUID NOT NULL REFERENCES raw_signals(id) ON DELETE CASCADE,

    -- Membership strength metrics
    membership_probability NUMERIC, -- HDBSCAN soft clustering probability (0-1)
    distance_to_centroid NUMERIC, -- Cosine distance to centroid

    -- Evidence weighting: only high-probability members count as strong evidence
    is_strong_evidence BOOLEAN DEFAULT FALSE, -- probability >= 0.5

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Each signal in one cluster per snapshot
    UNIQUE(snapshot_id, signal_id)
);

-- Index for cluster lookups
CREATE INDEX IF NOT EXISTS idx_cluster_memberships_cluster
ON cluster_memberships(cluster_id);

CREATE INDEX IF NOT EXISTS idx_cluster_memberships_snapshot
ON cluster_memberships(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_cluster_memberships_strong_evidence
ON cluster_memberships(cluster_id) WHERE is_strong_evidence = TRUE;

-- Cluster-to-trend mapping table (SNAPSHOT-AWARE for proper continuity)
-- This is the CRITICAL table for lifecycle continuity across snapshots
CREATE TABLE IF NOT EXISTS cluster_trend_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,
    cluster_id UUID NOT NULL REFERENCES trend_clusters(id) ON DELETE CASCADE,
    trend_id UUID NOT NULL REFERENCES detected_trends(id) ON DELETE CASCADE,

    -- Continuity matching scores (how we decided this cluster = this trend)
    centroid_similarity NUMERIC, -- Cosine similarity to previous cluster's centroid
    artifact_overlap_score NUMERIC, -- Jaccard overlap of top signals
    combined_match_score NUMERIC, -- Weighted combination for final decision

    -- Match decision metadata
    match_method TEXT NOT NULL DEFAULT 'new_trend', -- 'centroid_match' | 'artifact_overlap' | 'new_trend'
    is_new_trend BOOLEAN DEFAULT FALSE, -- True if we created a new trend for this cluster

    -- Lineage tracking for splits/merges
    prev_cluster_id UUID REFERENCES trend_clusters(id),
    prev_trend_id UUID REFERENCES detected_trends(id), -- The trend we matched to
    lineage_event TEXT, -- 'continuation' | 'split' | 'merge' | 'new'

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- One mapping per cluster per snapshot (allows trend reuse across snapshots)
    UNIQUE(snapshot_id, cluster_id)
);

-- Index for trend continuity lookups
CREATE INDEX IF NOT EXISTS idx_cluster_trend_mapping_trend
ON cluster_trend_mapping(trend_id);

CREATE INDEX IF NOT EXISTS idx_cluster_trend_mapping_snapshot
ON cluster_trend_mapping(snapshot_id);

-- Trend lineage table - tracks splits/merges for honest lifecycle interpretation
CREATE TABLE IF NOT EXISTS trend_lineage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,

    -- The event
    event_type TEXT NOT NULL, -- 'split' | 'merge' | 'rename' | 'new' | 'died'

    -- Parent trend(s) - what existed before
    parent_trend_ids UUID[] NOT NULL,

    -- Child trend(s) - what exists after
    child_trend_ids UUID[] NOT NULL,

    -- Confidence in this lineage decision
    confidence NUMERIC DEFAULT 1.0,

    -- Human-readable explanation
    reason TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for trend lookups
CREATE INDEX IF NOT EXISTS idx_cluster_trend_mapping_trend
ON cluster_trend_mapping(trend_id);

-- Comments for documentation
COMMENT ON TABLE signal_embeddings IS 'Vector embeddings for raw signals, used for semantic clustering';
COMMENT ON TABLE trend_clusters IS 'HDBSCAN cluster definitions per snapshot';
COMMENT ON TABLE cluster_memberships IS 'Signal-to-cluster assignments per snapshot';
COMMENT ON TABLE cluster_trend_mapping IS 'Links embedding clusters to detected_trends for lifecycle continuity';

COMMENT ON COLUMN signal_embeddings.embedding IS 'all-MiniLM-L6-v2 produces 384-dimensional vectors';
COMMENT ON COLUMN trend_clusters.cluster_label IS 'HDBSCAN label; -1 indicates noise/outlier';
COMMENT ON COLUMN cluster_memberships.membership_probability IS 'HDBSCAN soft clustering probability (0-1)';

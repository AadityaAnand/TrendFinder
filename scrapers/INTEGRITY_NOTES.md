# Trend Detection Integrity Implementation

## Implemented (Day 2)

### 1. Snapshot-Scoped History
- **trend_snapshots**: Append-only per-run records
- **trend_snapshot_items**: Per-run metrics (momentum_score, signal_count) linked to both snapshot and trend
- **trend_signals**: Snapshot-scoped evidence linking trends to supporting signals
- **Idempotency**: UNIQUE constraints on (snapshot_id, trend_id) and (snapshot_id, trend_id, signal_id)

### 2. Detector Versioning
- Trends namespaced by (detector_version, theme) via unique index
- keyword-scaffold-v1 won't collide with future embedding-based clusters
- Each detector version creates separate trend entities

### 3. Stable Trend Identity
- Trend entities store only stable fields: theme, first_seen, detector_version
- Mutable metrics moved to trend_snapshot_items
- Upsert logic preserves original first_seen timestamp

### 4. Evidence Preservation
- No deletes on trend_signals table
- Each run appends new evidence for that snapshot
- Can reconstruct exactly which signals supported a trend at any point in time

## Current Semantics

### Snapshot Timing
- **Per-run not per-day**: Each detector run creates new snapshot
- No deduplication by time - multiple runs per day = multiple snapshots
- Acceleration math later will need to handle variable time intervals

### first_seen Meaning
- **Current**: earliest signal.created_at (scrape collection time)
- **Not**: published_at or "first seen in the wild"
- **Interpretation**: "first time we collected evidence for this trend"
- **Future**: Use published_at when available from signal sources

### Duplicate Handling
- **Current**: Exclusion-based (filter out duplicate_signal_ids)
- **Evidence references**: Raw signal IDs (not canonical IDs)
- **Risk**: If dedup table changes, could reintroduce duplicates in evidence

## Atomicity and Error Handling

### Insert Idempotency
- snapshot_item and evidence inserts silently ignore UNIQUE constraint violations
- Reruns of same snapshot are safe (duplicate inserts treated as success)
- Non-duplicate errors are logged and raised for visibility

### Partial Failure Handling
- Snapshot creation is first operation (if it fails, nothing is written)
- Trend upsert + metrics + evidence happen per-trend in loop
- If one trend fails, others continue (logged but not fatal)
- Partial snapshots can exist if some trends fail mid-processing
- Safe to rerun: duplicate constraints prevent double-counting

### Foreign Key Integrity
- trend_snapshot_items.snapshot_id REFERENCES trend_snapshots(id)
- trend_snapshot_items.trend_id REFERENCES detected_trends(id)
- trend_signals.snapshot_id REFERENCES trend_snapshots(id)
- trend_signals.trend_id REFERENCES detected_trends(id)
- trend_signals.signal_id REFERENCES raw_signals(id)
- All with ON DELETE CASCADE for cleanup

### Rerun Safety
1. Same snapshot_id: UNIQUE constraints prevent duplicate metrics/evidence
2. New snapshot_id: Appends new history (correct behavior)
3. Partial failure: Logged, can rerun to complete

## Known Limitations (Accepted for Scaffold)

### 1. Trend Identity for Embeddings
- Current: (detector_version, theme) where theme is keyword-derived label
- Future: Embeddings will need (detector_version, cluster_id) with stable IDs
- Cluster labels can drift; cluster_id should be stable hash or assigned ID

### 2. Canonical References
- Evidence should reference canonical artifact IDs, not raw signals
- Would prevent duplicate reintroduction if dedup table evolves
- Deferred: requires canonical_id field on raw_signals

### 3. Snapshot Daily Consolidation
- Currently: one snapshot per run (could be multiple per day)
- Option: Enforce one snapshot per (day, detector_version) for cleaner history
- Deferred: per-run is simpler for now, daily can be layer on top

### 4. Performance on Reruns
- N DB calls in loop for upsert checks
- Partial run failure could leave inconsistent state
- Deferred: batch operations and transactions for production

## Migration Path

### When switching to embeddings (Day 5-7):
1. Deploy new detector_version = 'embedding-v1'
2. Generate cluster_id as stable identifier (hash of centroid?)
3. Upsert trends with (detector_version='embedding-v1', theme=cluster_id)
4. Both keyword and embedding trends coexist in parallel
5. Can compare metrics across detector versions

### When adding canonical_id to signals:
1. Add canonical_id column to raw_signals
2. Backfill: canonical_id = id if not in signal_duplicates.duplicate_signal_id
3. Backfill: canonical_id = canonical_signal_id if in duplicates table
4. Change trend_signals to reference canonical_id instead of signal_id
5. Evidence automatically deduplicated at query time

## Verification

Run `python scrapers/verify_integrity.py` to check:
- Snapshot history integrity
- Trend entity namespace isolation
- Evidence preservation
- Orphaned records

## Design Principles Applied

1. **Make history immutable** - Snapshots and evidence are append-only
2. **Separate identity from metrics** - Trends store stable fields, metrics in time-series table
3. **Namespace for evolution** - detector_version prevents collision across algorithm changes
4. **Idempotency through constraints** - UNIQUE prevents accidental duplication
5. **Defer optimization** - Accept N+1 queries for now, optimize when it matters

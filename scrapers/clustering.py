import os
import logging
from typing import Optional
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import numpy as np

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DETECTOR_VERSION = 'embedding-cluster-v1'
SCORING_VERSION = 'norm-p90-decay7d-v1'
LIFECYCLE_VERSION = 'lifecycle-v1'
EMBEDDING_MODEL = 'all-MiniLM-L6-v2'

MIN_CLUSTER_SIZE = 2
MIN_SAMPLES = 2
CLUSTER_SELECTION_EPSILON = 0.0

CONTINUITY_MATCHING_VERSION = 'continuity-v1'
CENTROID_WEIGHT = 0.7
OVERLAP_WEIGHT = 0.3
COMBINED_MATCH_THRESHOLD = 0.5

DISTANCE_TO_CENTROID_THRESHOLD = 0.3

BOOTSTRAP_P90 = {
    'hackernews': 426,
    'github': 1690,
    'devto': 92
}
DECAY_HALF_LIFE_DAYS = 7


def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def get_normalization_params(supabase: Client, snapshot_id: str = None) -> dict:
    if snapshot_id:
        response = supabase.table('snapshot_normalization_params') \
            .select('source, p90') \
            .eq('snapshot_id', snapshot_id) \
            .execute()
        if response.data:
            return {row['source']: row['p90'] for row in response.data}

    recent = supabase.table('trend_snapshots') \
        .select('id') \
        .eq('scoring_version', SCORING_VERSION) \
        .order('run_at', desc=True) \
        .limit(1) \
        .execute()

    if recent.data:
        response = supabase.table('snapshot_normalization_params') \
            .select('source, p90') \
            .eq('snapshot_id', recent.data[0]['id']) \
            .execute()
        if response.data:
            return {row['source']: row['p90'] for row in response.data}

    logger.warning("Using bootstrap normalization params")
    return BOOTSTRAP_P90


def normalize_score(score: float, source: str, p90_params: dict) -> float:
    p90 = p90_params.get(source, BOOTSTRAP_P90.get(source, 100))
    if p90 <= 0:
        return 0.0
    return min(score / p90, 1.0)


def apply_time_decay(age_days: float) -> float:
    return 0.5 ** (age_days / DECAY_HALF_LIFE_DAYS)


def calculate_signal_weight(signal: dict, p90_params: dict, now: datetime) -> float:
    source = signal.get('source', 'unknown')
    score = signal.get('score', 0)

    normalized = normalize_score(score, source, p90_params)

    created_at = signal.get('created_at')
    if created_at:
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        age_days = (now - created_at).total_seconds() / 86400
        decay = apply_time_decay(age_days)
    else:
        decay = 0.5

    return normalized * decay


def get_canonical_signals_with_embeddings(
    supabase: Client,
    lookback_days: int = 14
) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)

    response = supabase.table('raw_signals') \
        .select('id, title, source, score, created_at') \
        .gte('created_at', cutoff.isoformat()) \
        .order('created_at', desc=True) \
        .execute()

    if not response.data:
        return []

    signals = response.data
    signal_ids = [s['id'] for s in signals]

    emb_response = supabase.table('signal_embeddings') \
        .select('signal_id, embedding') \
        .eq('embedding_model', EMBEDDING_MODEL) \
        .in_('signal_id', signal_ids) \
        .execute()

    embedding_map = {
        e['signal_id']: np.array(e['embedding'])
        for e in (emb_response.data or [])
    }

    dup_response = supabase.table('signal_duplicates') \
        .select('duplicate_signal_id') \
        .execute()

    duplicate_ids = set(d['duplicate_signal_id'] for d in (dup_response.data or []))

    result = []
    for s in signals:
        if s['id'] in embedding_map and s['id'] not in duplicate_ids:
            s['embedding'] = embedding_map[s['id']]
            result.append(s)

    logger.info(f"Excluded {len(duplicate_ids)} duplicates from clustering")
    return result


def cluster_signals(
    signals: list[dict],
    min_cluster_size: int = MIN_CLUSTER_SIZE,
    min_samples: int = MIN_SAMPLES
) -> tuple[np.ndarray, object]:
    import hdbscan

    if len(signals) < min_cluster_size:
        logger.warning(f"Not enough signals ({len(signals)}) for clustering")
        return np.array([-1] * len(signals)), None

    embeddings = np.array([s['embedding'] for s in signals])

    logger.info(f"Clustering {len(embeddings)} signals with HDBSCAN...")

    from sklearn.metrics.pairwise import cosine_distances
    distance_matrix = cosine_distances(embeddings)

    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        cluster_selection_epsilon=CLUSTER_SELECTION_EPSILON,
        metric='precomputed',
        cluster_selection_method='eom',
        prediction_data=False
    )

    cluster_labels = clusterer.fit_predict(distance_matrix)

    n_clusters = len(set(cluster_labels)) - (1 if -1 in cluster_labels else 0)
    n_noise = list(cluster_labels).count(-1)

    logger.info(f"Found {n_clusters} clusters, {n_noise} noise points")

    return cluster_labels, clusterer


def compute_cluster_centroids(
    signals: list[dict],
    cluster_labels: np.ndarray
) -> dict[int, np.ndarray]:
    clusters = defaultdict(list)

    for signal, label in zip(signals, cluster_labels):
        if label >= 0:
            clusters[label].append(signal['embedding'])

    centroids = {}
    for label, embeddings in clusters.items():
        centroid = np.mean(embeddings, axis=0)
        centroid = centroid / np.linalg.norm(centroid)
        centroids[label] = centroid

    return centroids


def get_canonical_id_mapping(supabase: Client, signal_ids: set) -> dict[str, str]:
    if not signal_ids:
        return {}

    response = supabase.table('signal_duplicates') \
        .select('duplicate_signal_id, canonical_signal_id') \
        .in_('duplicate_signal_id', list(signal_ids)) \
        .execute()

    dup_to_canonical = {
        d['duplicate_signal_id']: d['canonical_signal_id']
        for d in (response.data or [])
    }

    mapping = {}
    for sid in signal_ids:
        mapping[sid] = dup_to_canonical.get(sid, sid)

    return mapping


def get_previous_clusters(supabase: Client) -> list[dict]:
    recent = supabase.table('trend_snapshots') \
        .select('id') \
        .eq('detector_version', DETECTOR_VERSION) \
        .order('run_at', desc=True) \
        .limit(1) \
        .execute()

    if not recent.data:
        return []

    prev_snapshot_id = recent.data[0]['id']

    clusters = supabase.table('trend_clusters') \
        .select('id, centroid, cluster_name') \
        .eq('snapshot_id', prev_snapshot_id) \
        .neq('cluster_label', -1) \
        .execute()

    if not clusters.data:
        return []

    mappings = supabase.table('cluster_trend_mapping') \
        .select('cluster_id, trend_id') \
        .eq('snapshot_id', prev_snapshot_id) \
        .execute()

    mapping_lookup = {m['cluster_id']: m['trend_id'] for m in (mappings.data or [])}

    all_member_ids = set()
    cluster_to_members = {}

    for cluster in clusters.data:
        members = supabase.table('cluster_memberships') \
            .select('signal_id') \
            .eq('cluster_id', cluster['id']) \
            .eq('is_strong_evidence', True) \
            .execute()

        member_ids = set(m['signal_id'] for m in (members.data or []))
        cluster_to_members[cluster['id']] = member_ids
        all_member_ids.update(member_ids)

    canonical_mapping = get_canonical_id_mapping(supabase, all_member_ids)

    for cluster in clusters.data:
        raw_ids = cluster_to_members.get(cluster['id'], set())
        canonical_ids = set(canonical_mapping.get(sid, sid) for sid in raw_ids)
        cluster['member_canonical_ids'] = canonical_ids
        cluster['trend_id'] = mapping_lookup.get(cluster['id'])
        cluster['centroid'] = np.array(cluster['centroid']) if cluster['centroid'] else None

    return clusters.data


def match_cluster_to_trend(
    new_centroid: np.ndarray,
    new_canonical_ids: set,
    prev_clusters: list[dict]
) -> tuple[Optional[str], Optional[str], dict]:
    base_metadata = {
        'continuity_version': CONTINUITY_MATCHING_VERSION,
        'centroid_weight': CENTROID_WEIGHT,
        'overlap_weight': OVERLAP_WEIGHT,
        'match_threshold': COMBINED_MATCH_THRESHOLD,
        'distance_threshold': DISTANCE_TO_CENTROID_THRESHOLD
    }

    if not prev_clusters:
        return None, None, {
            **base_metadata,
            'match_method': 'new_trend',
            'lineage_event': 'new'
        }

    best_match = None
    best_score = 0
    best_metadata = {}

    for prev in prev_clusters:
        if prev['centroid'] is None or prev['trend_id'] is None:
            continue

        raw_sim = float(np.dot(new_centroid, prev['centroid']))
        centroid_sim = max(0.0, min(1.0, raw_sim))

        prev_canonical = prev.get('member_canonical_ids', set())
        overlap_unavailable = False

        if not prev_canonical and not new_canonical_ids:
            overlap = 0
            overlap_unavailable = True
        elif prev_canonical and new_canonical_ids:
            intersection = len(new_canonical_ids & prev_canonical)
            union = len(new_canonical_ids | prev_canonical)
            overlap = intersection / union if union > 0 else 0
        else:
            overlap = 0

        combined = CENTROID_WEIGHT * centroid_sim + OVERLAP_WEIGHT * overlap

        if combined > best_score:
            best_score = combined
            best_match = prev
            best_metadata = {
                **base_metadata,
                'centroid_similarity': centroid_sim,
                'centroid_similarity_raw': raw_sim,
                'artifact_overlap_score': overlap,
                'overlap_unavailable': overlap_unavailable,
                'combined_match_score': combined
            }

    if best_match and best_score >= COMBINED_MATCH_THRESHOLD:
        best_metadata['match_method'] = 'centroid_match' if best_metadata['centroid_similarity'] > best_metadata['artifact_overlap_score'] else 'artifact_overlap'
        best_metadata['lineage_event'] = 'continuation'
        return best_match['trend_id'], best_match['id'], best_metadata

    return None, None, {
        **base_metadata,
        'match_method': 'new_trend',
        'lineage_event': 'new'
    }


def calculate_cluster_momentum(
    signals: list[dict],
    centroid: np.ndarray,
    p90_params: dict,
    now: datetime
) -> dict:
    if not signals:
        return {'momentum': 0, 'top3_mean': 0, 'signal_count': 0, 'strong_evidence_count': 0}

    strong_signals = []
    for signal in signals:
        if 'embedding' in signal:
            distance = 1 - np.dot(signal['embedding'], centroid)
            if distance <= DISTANCE_TO_CENTROID_THRESHOLD:
                strong_signals.append(signal)

    if not strong_signals:
        strong_signals = signals

    weighted_scores = []
    for signal in strong_signals:
        weight = calculate_signal_weight(signal, p90_params, now)
        weighted_scores.append(weight)

    momentum = np.mean(weighted_scores) if weighted_scores else 0

    sorted_scores = sorted(weighted_scores, reverse=True)
    top_k = min(3, len(sorted_scores))
    top3_mean = np.mean(sorted_scores[:top_k]) if sorted_scores else 0

    return {
        'momentum': float(momentum),
        'top3_mean': float(top3_mean),
        'signal_count': len(signals),
        'strong_evidence_count': len(strong_signals),
        'topk_used': top_k
    }


def generate_cluster_name(signals: list[dict], top_k: int = 5) -> str:
    from collections import Counter
    import re

    stop_words = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
        'this', 'that', 'what', 'which', 'who', 'how', 'why', 'when', 'where',
        'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'our',
        'their', 'its', 'just', 'now', 'new', 'one', 'two', 'first', 'using',
        'get', 'make', 'use', 'like', 'can', 'will', 'would', 'could', 'should'
    }

    sorted_signals = sorted(signals, key=lambda s: s.get('score', 0), reverse=True)

    word_counts = Counter()
    for signal in sorted_signals[:top_k]:
        title = signal.get('title', '')
        words = re.findall(r'\b[a-zA-Z][a-zA-Z0-9+#]*\b', title.lower())
        words = [w for w in words if w not in stop_words and len(w) > 2]
        word_counts.update(words)

    top_words = [word for word, _ in word_counts.most_common(3)]
    return ' '.join(w.capitalize() for w in top_words) if top_words else "Emerging Tech"


def run_embedding_clustering(lookback_days: int = 14) -> dict:
    supabase = get_supabase()
    now = datetime.now(timezone.utc)

    logger.info("=" * 60)
    logger.info("EMBEDDING-BASED TREND CLUSTERING")
    logger.info("=" * 60)

    logger.info(f"\n1. Fetching canonical signals (last {lookback_days} days)...")
    signals = get_canonical_signals_with_embeddings(supabase, lookback_days)

    if not signals:
        logger.warning("No signals with embeddings found!")
        return {'clusters': 0, 'signals': 0, 'trends': 0}

    logger.info(f"   Found {len(signals)} canonical signals with embeddings")

    logger.info("\n2. Getting normalization parameters...")
    p90_params = get_normalization_params(supabase)
    logger.info(f"   P90 params: {p90_params}")

    logger.info("\n3. Clustering signals...")
    cluster_labels, clusterer = cluster_signals(signals)

    n_clusters = len(set(cluster_labels)) - (1 if -1 in cluster_labels else 0)
    if n_clusters == 0:
        logger.warning("No clusters found!")
        return {'clusters': 0, 'signals': len(signals), 'trends': 0}

    logger.info("\n4. Computing cluster centroids...")
    centroids = compute_cluster_centroids(signals, cluster_labels)

    logger.info("\n5. Loading previous clusters for continuity...")
    prev_clusters = get_previous_clusters(supabase)
    logger.info(f"   Found {len(prev_clusters)} previous clusters")

    logger.info("\n6. Creating snapshot...")
    snapshot_data = {
        'signal_count': len(signals),
        'unique_signal_count': len(signals),
        'duplicate_count': 0,
        'detector_version': DETECTOR_VERSION,
        'scoring_version': SCORING_VERSION,
        'run_at': now.isoformat()
    }
    snapshot_resp = supabase.table('trend_snapshots').insert(snapshot_data).execute()
    snapshot_id = snapshot_resp.data[0]['id']
    logger.info(f"   Snapshot ID: {snapshot_id}")

    logger.info("\n7. Processing clusters with continuity matching...")

    cluster_signals_map = defaultdict(list)
    for signal, label in zip(signals, cluster_labels):
        if label >= 0:
            cluster_signals_map[label].append(signal)

    cluster_results = []
    new_trends = 0
    continued_trends = 0

    all_signal_ids = set(s['id'] for s in signals)
    canonical_mapping = get_canonical_id_mapping(supabase, all_signal_ids)

    for label in sorted(cluster_signals_map.keys()):
        members = cluster_signals_map[label]
        centroid = centroids[label]

        is_proto = len(members) < 3

        member_ids = set(s['id'] for s in members)
        member_canonical_ids = set(canonical_mapping.get(sid, sid) for sid in member_ids)

        trend_id, prev_cluster_id, match_meta = match_cluster_to_trend(
            centroid, member_canonical_ids, prev_clusters
        )

        momentum_stats = calculate_cluster_momentum(members, centroid, p90_params, now)

        cluster_name = generate_cluster_name(members)

        sorted_members = sorted(members, key=lambda s: s.get('score', 0), reverse=True)
        representative_ids = [s['id'] for s in sorted_members[:3]]

        if trend_id:
            supabase.table('detected_trends') \
                .update({'last_updated': now.isoformat()}) \
                .eq('id', trend_id) \
                .execute()
            continued_trends += 1
            logger.info(f"   Cluster {label}: Continued trend (sim={match_meta.get('centroid_similarity', 0):.2f})")
        else:
            trend_data = {
                'theme': cluster_name,
                'keywords': [],
                'detector_version': DETECTOR_VERSION,
                'first_seen': now.isoformat(),
                'last_updated': now.isoformat(),
                'status': 'emerging'
            }
            resp = supabase.table('detected_trends').insert(trend_data).execute()
            trend_id = resp.data[0]['id']
            new_trends += 1
            logger.info(f"   Cluster {label}: New trend '{cluster_name}'")

        cluster_data = {
            'snapshot_id': snapshot_id,
            'cluster_label': label,
            'cluster_name': cluster_name,
            'centroid': centroid.tolist(),
            'member_count': len(members),
            'high_confidence_count': momentum_stats['strong_evidence_count'],
            'min_cluster_size': MIN_CLUSTER_SIZE,
            'min_samples': MIN_SAMPLES,
            'is_proto_cluster': is_proto,
            'representative_signal_ids': representative_ids
        }
        cluster_resp = supabase.table('trend_clusters') \
            .upsert(cluster_data, on_conflict='snapshot_id,cluster_label') \
            .execute()
        cluster_id = cluster_resp.data[0]['id']

        mapping_data = {
            'snapshot_id': snapshot_id,
            'cluster_id': cluster_id,
            'trend_id': trend_id,
            'centroid_similarity': match_meta.get('centroid_similarity'),
            'artifact_overlap_score': match_meta.get('artifact_overlap_score'),
            'combined_match_score': match_meta.get('combined_match_score'),
            'match_method': match_meta['match_method'],
            'is_new_trend': match_meta['lineage_event'] == 'new',
            'prev_cluster_id': prev_cluster_id,
            'prev_trend_id': trend_id if match_meta['lineage_event'] != 'new' else None,
            'lineage_event': match_meta['lineage_event']
        }
        supabase.table('cluster_trend_mapping') \
            .upsert(mapping_data, on_conflict='snapshot_id,cluster_id') \
            .execute()

        cluster_distances = []
        strong_count = 0

        for signal in members:
            distance_to_centroid = float(1 - np.dot(signal['embedding'], centroid))
            cluster_distances.append(distance_to_centroid)

            is_strong = distance_to_centroid <= DISTANCE_TO_CENTROID_THRESHOLD
            if is_strong:
                strong_count += 1

            membership_data = {
                'snapshot_id': snapshot_id,
                'cluster_id': cluster_id,
                'signal_id': signal['id'],
                'membership_probability': None,
                'distance_to_centroid': distance_to_centroid,
                'is_strong_evidence': is_strong
            }
            supabase.table('cluster_memberships') \
                .upsert(membership_data, on_conflict='snapshot_id,signal_id') \
                .execute()

        if cluster_distances:
            dist_arr = np.array(cluster_distances)
            logger.debug(
                f"   Cluster {label} distances: min={dist_arr.min():.3f}, "
                f"max={dist_arr.max():.3f}, mean={dist_arr.mean():.3f}, "
                f"strong={strong_count}/{len(members)} ({100*strong_count/len(members):.0f}%)"
            )

        if not is_proto:
            snapshot_item = {
                'snapshot_id': snapshot_id,
                'trend_id': trend_id,
                'momentum_score': momentum_stats['momentum'],
                'signal_count': momentum_stats['signal_count'],
                'top3_mean': momentum_stats['top3_mean'],
                'topk_used': momentum_stats['topk_used'],
                'trend_keyword': cluster_name,
                'scoring_version': SCORING_VERSION
            }
            supabase.table('trend_snapshot_items') \
                .upsert(snapshot_item, on_conflict='snapshot_id,trend_id') \
                .execute()

            for signal in members:
                supabase.table('trend_signals') \
                    .upsert({
                        'snapshot_id': snapshot_id,
                        'trend_id': trend_id,
                        'signal_id': signal['id']
                    }, on_conflict='snapshot_id,trend_id,signal_id') \
                    .execute()

        cluster_results.append({
            'label': label,
            'name': cluster_name,
            'trend_id': trend_id,
            'member_count': len(members),
            'strong_evidence_count': strong_count,
            'momentum': momentum_stats['momentum'],
            'is_proto': is_proto,
            'is_new': match_meta['lineage_event'] == 'new'
        })

    logger.info("\n" + "=" * 60)
    logger.info("CLUSTERING COMPLETE")
    logger.info("=" * 60)
    logger.info(f"Signals processed: {len(signals)}")
    logger.info(f"Clusters found: {n_clusters}")
    logger.info(f"  - Continued trends: {continued_trends}")
    logger.info(f"  - New trends: {new_trends}")
    logger.info(f"Noise signals: {list(cluster_labels).count(-1)}")

    proto_count = sum(1 for r in cluster_results if r['is_proto'])
    if proto_count:
        logger.info(f"Proto-clusters (not lifecycled): {proto_count}")

    total_members = sum(r['member_count'] for r in cluster_results)
    total_strong = sum(r['strong_evidence_count'] for r in cluster_results)
    if total_members > 0:
        strong_ratio = total_strong / total_members
        logger.info(f"Strong evidence ratio: {total_strong}/{total_members} ({100*strong_ratio:.0f}%)")
        if strong_ratio < 0.1:
            logger.warning(f"  WARNING: <10% strong evidence - threshold may be too tight")
        elif strong_ratio > 0.9:
            logger.warning(f"  WARNING: >90% strong evidence - threshold may be too loose")

    return {
        'clusters': n_clusters,
        'signals': len(signals),
        'trends': continued_trends + new_trends,
        'new_trends': new_trends,
        'continued_trends': continued_trends,
        'snapshot_id': snapshot_id,
        'strong_evidence_ratio': total_strong / total_members if total_members > 0 else 0
    }


if __name__ == '__main__':
    stats = run_embedding_clustering(lookback_days=14)
    print("\n=== Final Stats ===")
    for key, value in stats.items():
        print(f"  {key}: {value}")

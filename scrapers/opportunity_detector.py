import os
import re
import logging
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client, Client
from demand_classifier import (
    classify_demand_layer1,
    DEMAND_REGEX,
)

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

OPPORTUNITY_VERSION = 'opportunity-v2'
MIN_INDEPENDENT_ARTIFACTS = 2
MIN_STAGE_CONFIDENCE = 0.6
MIN_DEMAND_HITS = 1
MIN_HYPOTHESIS_CONFIDENCE = 0.4

WRAPPER_DOMAINS = {'news.ycombinator.com', 'reddit.com', 'www.reddit.com',
                   'twitter.com', 'x.com', 'facebook.com', 'linkedin.com'}


def extract_canonical_url_for_artifact(url: str, source: str) -> Optional[str]:
    if not url:
        return None

    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        path = parsed.path

        if 'github.com' in domain:
            match = re.match(r'^/([^/]+)/([^/]+?)(?:\.git)?(?:/.*)?$', path, re.IGNORECASE)
            if match:
                owner, repo = match.groups()
                return f"github.com/{owner.lower()}/{repo.lower()}"

        if 'dev.to' in domain:
            match = re.match(r'^/([^/]+)/([^/]+)', path)
            if match:
                username, slug = match.groups()
                return f"dev.to/{username.lower()}/{slug.lower()}"

        if 'producthunt.com' in domain:
            match = re.match(r'^/posts/([^/]+)', path)
            if match:
                slug = match.group(1)
                return f"producthunt.com/posts/{slug.lower()}"

        if 'indiehackers.com' in domain:
            match = re.match(r'^/post/([^/?]+)', path)
            if match:
                slug = match.group(1)
                return f"indiehackers.com/post/{slug.lower()}"

        if domain.endswith('.substack.com'):
            match = re.match(r'^/p/([^/?]+)', path)
            if match:
                slug = match.group(1)
                return f"{domain}/p/{slug.lower()}"

        if domain in WRAPPER_DOMAINS:
            return None

        canonical = f"{domain}{path}".rstrip('/')
        return canonical
    except Exception:
        return None


VAGUE_ACTION_WORDS = {
    'explore', 'research', 'investigate', 'monitor', 'watch',
    'consider', 'evaluate', 'assess', 'analyze', 'study'
}


def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_KEY")
    return create_client(url, key)


def get_latest_snapshot(supabase: Client) -> Optional[dict]:
    response = supabase.table('trend_snapshots') \
        .select('id, run_at, detector_version') \
        .order('run_at', desc=True) \
        .limit(1) \
        .execute()

    if response.data:
        return response.data[0]
    return None


def get_trends_for_snapshot(supabase: Client, snapshot_id: str) -> list[dict]:
    response = supabase.table('trend_snapshot_items') \
        .select('''
            trend_id,
            momentum_score,
            signal_count,
            top3_mean,
            trend_keyword,
            scoring_version
        ''') \
        .eq('snapshot_id', snapshot_id) \
        .execute()

    return response.data or []


def get_lifecycle_data(supabase: Client, snapshot_id: str, trend_ids: list[str]) -> dict:
    if not trend_ids:
        return {}

    response = supabase.table('trend_lifecycle_history') \
        .select('''
            trend_id,
            lifecycle_stage,
            stage_confidence,
            acceleration_score,
            acceleration_comparable,
            snapshots_seen,
            days_seen,
            momentum_change_pct,
            time_gap_hours
        ''') \
        .eq('snapshot_id', snapshot_id) \
        .in_('trend_id', trend_ids) \
        .execute()

    lifecycle = {}
    for row in (response.data or []):
        tid = row['trend_id']
        if tid not in lifecycle:
            lifecycle[tid] = {
                'stage': row['lifecycle_stage'],
                'stage_confidence': row['stage_confidence'],
                'acceleration_score': row['acceleration_score'],
                'acceleration_comparable': row['acceleration_comparable'],
                'snapshots_seen': row['snapshots_seen'],
                'days_seen': row.get('days_seen', 0),
                'momentum_change_pct': row.get('momentum_change_pct'),
                'time_gap_hours': row.get('time_gap_hours'),
            }

    return lifecycle


def get_canonical_artifact_count(supabase: Client, snapshot_id: str, trend_id: str) -> int:
    signals_resp = supabase.table('trend_signals') \
        .select('signal_id') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .execute()

    if not signals_resp.data:
        return 0

    signal_ids = [s['signal_id'] for s in signals_resp.data]

    details_resp = supabase.table('raw_signals') \
        .select('id, url, source') \
        .in_('id', signal_ids) \
        .execute()

    if not details_resp.data:
        return 0

    dup_resp = supabase.table('signal_duplicates') \
        .select('duplicate_signal_id, canonical_signal_id') \
        .in_('duplicate_signal_id', signal_ids) \
        .execute()

    dup_to_canonical = {
        d['duplicate_signal_id']: d['canonical_signal_id']
        for d in (dup_resp.data or [])
    }

    canonical_ids = set()
    canonical_urls = set()

    for signal in details_resp.data:
        sid = signal['id']
        url = signal.get('url', '')
        source = signal.get('source', '')

        canonical_id = dup_to_canonical.get(sid, sid)

        canonical_url = extract_canonical_url_for_artifact(url, source)

        if canonical_url:
            if canonical_url not in canonical_urls:
                canonical_urls.add(canonical_url)
                canonical_ids.add(canonical_id)
        else:
            canonical_ids.add(canonical_id)

    return len(canonical_ids)


def get_supporting_signals(supabase: Client, snapshot_id: str, trend_id: str, limit: int = 10) -> list[dict]:
    signals_resp = supabase.table('trend_signals') \
        .select('signal_id') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .execute()

    if not signals_resp.data:
        return []

    signal_ids = [s['signal_id'] for s in signals_resp.data][:limit]

    details_resp = supabase.table('raw_signals') \
        .select('id, title, url, source, score') \
        .in_('id', signal_ids) \
        .order('score', desc=True) \
        .execute()

    return details_resp.data or []


def check_persistence_gate(lifecycle: Optional[dict]) -> tuple[bool, Optional[str]]:
    """Trend must appear in >=2 distinct days OR show breakout acceleration."""
    days_seen = lifecycle.get('days_seen', 0) if lifecycle else 0

    if days_seen >= 2:
        return True, None

    # Breakout exception: momentum jump >2x in 24 hours
    if lifecycle:
        momentum_change = lifecycle.get('momentum_change_pct')
        time_gap = lifecycle.get('time_gap_hours')
        if momentum_change and time_gap and time_gap <= 24 and momentum_change > 100:
            return True, None

    return False, 'insufficient_persistence'


def check_evidence_gate(artifact_count: int) -> tuple[bool, Optional[str]]:
    if artifact_count < MIN_INDEPENDENT_ARTIFACTS:
        return False, 'insufficient_independent_evidence'
    return True, None


def check_confidence_gate(lifecycle: Optional[dict], is_proto: bool = False) -> tuple[bool, list[str]]:
    reasons = []

    if is_proto:
        reasons.append('proto_cluster')

    if not lifecycle:
        reasons.append('no_lifecycle_data')
        return False, reasons

    if not lifecycle.get('acceleration_comparable', False):
        reasons.append('acceleration_not_comparable')

    confidence = lifecycle.get('stage_confidence', 0) or 0
    if confidence < MIN_STAGE_CONFIDENCE:
        reasons.append('low_confidence')

    if reasons:
        return False, reasons

    return True, []


def detect_demand_signals(signals: list[dict]) -> tuple[int, list[dict]]:
    """Detect demand signals using the enhanced two-layer classifier (Layer 1 only in this context)."""
    demand_hits = 0
    demand_examples = []

    for signal in signals:
        title = signal.get('title', '')
        content = signal.get('content', '')
        is_demand, matched_patterns = classify_demand_layer1(title, content)
        if is_demand:
            demand_hits += 1
            demand_examples.append({
                'title': title,
                'url': signal.get('url', ''),
                'source': signal.get('source', ''),
                'matched_patterns': matched_patterns,
            })

    return demand_hits, demand_examples


def check_demand_gate(demand_hits: int) -> tuple[bool, Optional[str]]:
    if demand_hits < MIN_DEMAND_HITS:
        return False, 'no_demand_signal'
    return True, None


ACTION_SPECIFICITY = {
    'migration': 1.0,
    'self_hosted': 1.0,
    'sdk': 0.8,
    'tooling': 0.5,
    'competing': 0.3,
    'generic': 0.0
}


def generate_actions(trend_keyword: str, signals: list[dict], demand_examples: list[dict]) -> list[tuple[str, str]]:
    actions = []

    migration_contexts = []
    for s in signals:
        title = s.get('title', '').lower()
        if 'migrat' in title:
            for pattern in [r'from\s+(\w+)', r'to\s+(\w+)', r'(\w+)\s+to\s+(\w+)']:
                match = re.search(pattern, title, re.IGNORECASE)
                if match:
                    migration_contexts.append(match.group(0))
                    break

    if migration_contexts:
        context = migration_contexts[0]
        actions.append((f"Create migration tooling for {trend_keyword} ({context})", 'migration'))

    alternative_targets = []
    for s in signals:
        title = s.get('title', '').lower()
        if 'alternative' in title or 'self-host' in title or 'self host' in title:
            for pattern in [r'alternative\s+to\s+(\w+)', r'(\w+)\s+alternative', r'self[- ]?hosted?\s+(\w+)']:
                match = re.search(pattern, title, re.IGNORECASE)
                if match:
                    alternative_targets.append(match.group(1))
                    break

    if alternative_targets:
        target = alternative_targets[0]
        actions.append((f"Build self-hosted alternative to {target} using {trend_keyword}", 'self_hosted'))
    elif any(any(w in s.get('title', '').lower() for w in ['hosted', 'cloud', 'saas', 'managed']) for s in signals):
        actions.append((f"Build self-hosted or open-source alternative for {trend_keyword}", 'self_hosted'))

    sdk_contexts = []
    for s in signals:
        title = s.get('title', '').lower()
        for lang in ['python', 'javascript', 'typescript', 'go', 'rust', 'java', 'ruby', 'node']:
            if lang in title and any(w in title for w in ['library', 'sdk', 'package', 'client', 'wrapper']):
                sdk_contexts.append(lang)
                break

    if sdk_contexts:
        lang = sdk_contexts[0].capitalize()
        actions.append((f"Build {lang} SDK/client library for {trend_keyword}", 'sdk'))
    elif any(any(w in s.get('title', '').lower() for w in ['library', 'sdk', 'package', 'framework']) for s in signals):
        actions.append((f"Build SDK or client library for {trend_keyword}", 'sdk'))

    valid_actions = []
    for action, action_type in actions:
        action_lower = action.lower()
        if not any(vague in action_lower for vague in VAGUE_ACTION_WORDS):
            valid_actions.append((action, action_type))

    return valid_actions[:3]


def check_actionability_gate(actions: list[tuple[str, str]]) -> tuple[bool, float, Optional[str]]:
    if not actions:
        return False, 0.0, 'no_clear_action'

    specificities = [ACTION_SPECIFICITY.get(action_type, 0) for _, action_type in actions]
    max_specificity = max(specificities)

    if max_specificity < 0.5:
        return False, max_specificity, 'no_clear_action'

    avg_specificity = sum(specificities) / len(specificities)
    actionability_score = 0.6 * max_specificity + 0.4 * avg_specificity

    return True, actionability_score, None


def calculate_signal_quality(
    momentum: float,
    acceleration: float,
    confidence: float,
    acceleration_comparable: bool
) -> float:
    momentum_norm = min(momentum / 0.5, 1.0) if momentum else 0
    conf_norm = confidence if confidence else 0

    if acceleration_comparable and acceleration and acceleration > 0:
        accel_norm = min(acceleration / 2.0, 1.0)
        return 0.4 * momentum_norm + 0.3 * accel_norm + 0.3 * conf_norm
    else:
        return 0.55 * momentum_norm + 0.45 * conf_norm


def calculate_opportunity_score(
    signal_quality: float,
    demand_strength: float,
    actionability: float
) -> float:
    return 0.5 * signal_quality + 0.3 * demand_strength + 0.2 * actionability


def get_hypothesis(supabase: Client, snapshot_id: str, trend_id: str) -> Optional[dict]:
    response = supabase.table('problem_hypotheses') \
        .select('hypothesis_title, hypothesis_status, confidence, pain_signals, who_it_affects') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .limit(1) \
        .execute()
    return response.data[0] if response.data else None


def check_hypothesis_gate(hypothesis: Optional[dict]) -> tuple[bool, list[str]]:
    if not hypothesis:
        return False, ['no_hypothesis']
    if hypothesis.get('hypothesis_status') != 'valid':
        return False, [f"hypothesis_status_{hypothesis.get('hypothesis_status', 'missing')}"]
    if (hypothesis.get('confidence') or 0) < MIN_HYPOTHESIS_CONFIDENCE:
        return False, ['hypothesis_low_confidence']
    return True, []


def evaluate_trend_as_opportunity(
    supabase: Client,
    snapshot_id: str,
    trend: dict,
    lifecycle: Optional[dict]
) -> dict:
    trend_id = trend['trend_id']
    trend_keyword = trend.get('trend_keyword', 'Unknown')

    result = {
        'trend_id': trend_id,
        'snapshot_id': snapshot_id,
        'qualified': False,
        'opportunity_score': None,
        'independent_artifact_count': 0,
        'demand_hits': 0,
        'demand_examples': [],
        'actionability_score': 0,
        'suggested_actions': [],
        'signal_quality_score': None,
        'demand_strength': None,
        'rejection_reasons': []
    }

    # Gate 0: Persistence — must appear in >=2 days or show breakout
    persistence_ok, persistence_reason = check_persistence_gate(lifecycle)
    if not persistence_ok:
        result['rejection_reasons'].append(persistence_reason)
        return result

    artifact_count = get_canonical_artifact_count(supabase, snapshot_id, trend_id)
    result['independent_artifact_count'] = artifact_count

    evidence_ok, evidence_reason = check_evidence_gate(artifact_count)
    if not evidence_ok:
        result['rejection_reasons'].append(evidence_reason)
        return result

    hypothesis = get_hypothesis(supabase, snapshot_id, trend_id)
    hypothesis_ok, hypothesis_reasons = check_hypothesis_gate(hypothesis)
    if not hypothesis_ok:
        result['rejection_reasons'].extend(hypothesis_reasons)
        return result

    if hypothesis and hypothesis.get('hypothesis_title'):
        result['hypothesis_title'] = hypothesis['hypothesis_title']
        result['pain_signals'] = hypothesis.get('pain_signals', [])
        result['who_it_affects'] = hypothesis.get('who_it_affects', [])

    confidence_ok, confidence_reasons = check_confidence_gate(lifecycle)
    if not confidence_ok:
        result['rejection_reasons'].extend(confidence_reasons)
        return result

    signals = get_supporting_signals(supabase, snapshot_id, trend_id, limit=10)

    demand_hits, demand_examples = detect_demand_signals(signals)
    result['demand_hits'] = demand_hits
    result['demand_examples'] = demand_examples

    demand_ok, demand_reason = check_demand_gate(demand_hits)
    if not demand_ok:
        result['rejection_reasons'].append(demand_reason)
        return result

    actions_with_types = generate_actions(trend_keyword, signals, demand_examples)
    result['suggested_actions'] = [action for action, _ in actions_with_types]

    action_ok, actionability_score, action_reason = check_actionability_gate(actions_with_types)
    result['actionability_score'] = actionability_score

    if not action_ok:
        result['rejection_reasons'].append(action_reason)
        return result

    momentum = trend.get('momentum_score', 0) or 0
    acceleration = lifecycle.get('acceleration_score', 1) if lifecycle else 1
    confidence = lifecycle.get('stage_confidence', 0) if lifecycle else 0
    accel_comparable = lifecycle.get('acceleration_comparable', False) if lifecycle else False

    signal_quality = calculate_signal_quality(momentum, acceleration, confidence, accel_comparable)
    result['signal_quality_score'] = signal_quality

    demand_strength = min(demand_hits / 3.0, 1.0)
    result['demand_strength'] = demand_strength

    opportunity_score = calculate_opportunity_score(signal_quality, demand_strength, actionability_score)
    result['opportunity_score'] = opportunity_score

    result['qualified'] = True

    return result


def save_opportunity_result(supabase: Client, result: dict) -> None:
    data = {
        'snapshot_id': result['snapshot_id'],
        'trend_id': result['trend_id'],
        'qualified': result['qualified'],
        'opportunity_score': result['opportunity_score'],
        'independent_artifact_count': result['independent_artifact_count'],
        'demand_hits': result['demand_hits'],
        'demand_examples': result['demand_examples'],
        'actionability_score': result['actionability_score'],
        'suggested_actions': result['suggested_actions'],
        'signal_quality_score': result['signal_quality_score'],
        'demand_strength': result['demand_strength'],
        'rejection_reasons': result['rejection_reasons']
    }

    supabase.table('trend_opportunities') \
        .upsert(data, on_conflict='snapshot_id,trend_id') \
        .execute()


def run_opportunity_detection(snapshot_id: str = None) -> dict:
    supabase = get_supabase()

    logger.info("=" * 60)
    logger.info("OPPORTUNITY DETECTION")
    logger.info("=" * 60)

    if not snapshot_id:
        snapshot = get_latest_snapshot(supabase)
        if not snapshot:
            logger.error("No snapshots found")
            return {'qualified': 0, 'rejected': 0, 'total': 0}
        snapshot_id = snapshot['id']
        logger.info(f"Using latest snapshot: {snapshot_id}")

    trends = get_trends_for_snapshot(supabase, snapshot_id)
    logger.info(f"Found {len(trends)} trends in snapshot")

    if not trends:
        return {'qualified': 0, 'rejected': 0, 'total': 0}

    trend_ids = [t['trend_id'] for t in trends]
    lifecycle_data = get_lifecycle_data(supabase, snapshot_id, trend_ids)

    qualified_count = 0
    rejected_count = 0
    rejection_stats = {}

    for trend in trends:
        trend_id = trend['trend_id']
        lifecycle = lifecycle_data.get(trend_id)

        result = evaluate_trend_as_opportunity(supabase, snapshot_id, trend, lifecycle)

        save_opportunity_result(supabase, result)

        if result['qualified']:
            qualified_count += 1
            logger.info(f"  ✓ {trend.get('trend_keyword', 'Unknown')}: score={result['opportunity_score']:.2f}")
        else:
            rejected_count += 1
            for reason in result['rejection_reasons']:
                rejection_stats[reason] = rejection_stats.get(reason, 0) + 1

    logger.info("\n" + "=" * 60)
    logger.info("RESULTS")
    logger.info("=" * 60)
    logger.info(f"Total trends: {len(trends)}")
    logger.info(f"Qualified opportunities: {qualified_count}")
    logger.info(f"Rejected: {rejected_count}")

    if rejection_stats:
        logger.info("\nRejection reasons:")
        for reason, count in sorted(rejection_stats.items(), key=lambda x: -x[1]):
            logger.info(f"  {reason}: {count}")

    return {
        'qualified': qualified_count,
        'rejected': rejected_count,
        'total': len(trends),
        'snapshot_id': snapshot_id,
        'rejection_stats': rejection_stats
    }


if __name__ == '__main__':
    stats = run_opportunity_detection()
    print(f"\n=== Final Stats ===")
    print(f"Qualified: {stats['qualified']}")
    print(f"Rejected: {stats['rejected']}")
    print(f"Total: {stats['total']}")

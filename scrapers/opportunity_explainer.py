import os
import json
import hashlib
import logging
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client, Client
from groq import Groq

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
groq_client = Groq(api_key=GROQ_API_KEY)

PROMPT_VERSION = 'prompt-v2'
RISK_RULES_VERSION = 'risk-rules-v1'
MODEL_NAME = 'llama-3.3-70b-versatile'


def compute_evidence_hash(evidence: list[dict], demand_examples: list[dict]) -> str:
    sorted_evidence = sorted(
        evidence,
        key=lambda x: (-(x.get('score', 0) or 0), x.get('url', ''))
    )
    canonical_evidence = []
    for e in sorted_evidence:
        canonical_evidence.append({
            'title': e.get('title', ''),
            'url': e.get('url', ''),
            'source': e.get('source', ''),
            'score': e.get('score', 0)
        })

    sorted_demand = sorted(
        demand_examples,
        key=lambda x: x.get('url', '')
    )
    canonical_demand = []
    for d in sorted_demand:
        canonical_demand.append({
            'title': d.get('title', ''),
            'url': d.get('url', ''),
            'source': d.get('source', '')
        })

    hash_input = {
        'evidence': canonical_evidence,
        'demand': canonical_demand
    }
    return hashlib.sha256(json.dumps(hash_input, sort_keys=True).encode()).hexdigest()[:16]


def get_qualified_opportunities(snapshot_id: str) -> list[dict]:
    response = supabase.table('trend_opportunities') \
        .select('''
            id,
            trend_id,
            snapshot_id,
            opportunity_score,
            independent_artifact_count,
            demand_hits,
            demand_examples,
            suggested_actions,
            signal_quality_score,
            demand_strength,
            actionability_score
        ''') \
        .eq('snapshot_id', snapshot_id) \
        .eq('qualified', True) \
        .execute()

    return response.data or []


def get_latest_snapshot() -> Optional[dict]:
    response = supabase.table('trend_snapshots') \
        .select('id, run_at') \
        .order('run_at', desc=True) \
        .limit(1) \
        .single() \
        .execute()

    return response.data


def get_trend_details(trend_id: str) -> Optional[dict]:
    response = supabase.table('detected_trends') \
        .select('id, theme, status, first_seen') \
        .eq('id', trend_id) \
        .single() \
        .execute()

    return response.data


def get_lifecycle_context(snapshot_id: str, trend_id: str) -> Optional[dict]:
    response = supabase.table('trend_lifecycle_history') \
        .select('''
            lifecycle_stage,
            stage_confidence,
            acceleration_score,
            acceleration_comparable,
            momentum_change_pct,
            snapshots_seen
        ''') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .single() \
        .execute()

    return response.data


def get_top_evidence(snapshot_id: str, trend_id: str, limit: int = 5) -> list[dict]:
    signals_resp = supabase.table('trend_signals') \
        .select('signal_id') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .execute()

    if not signals_resp.data:
        return []

    signal_ids = [s['signal_id'] for s in signals_resp.data][:limit * 2]

    details_resp = supabase.table('raw_signals') \
        .select('id, title, url, source, score, created_at') \
        .in_('id', signal_ids) \
        .order('score', desc=True) \
        .limit(limit) \
        .execute()

    return details_resp.data or []


def get_existing_explanation(opportunity_id: str) -> Optional[dict]:
    response = supabase.table('opportunity_explanations') \
        .select('evidence_hash, snapshot_id') \
        .eq('opportunity_id', opportunity_id) \
        .single() \
        .execute()

    return response.data if response.data else None


def build_uncertainty_factors(
    canonical_artifact_count: int,
    source_types: set,
    lifecycle: Optional[dict],
    demand_hits: int
) -> list[dict]:
    factors = []

    if canonical_artifact_count < 5:
        factors.append({
            'type': 'limited_evidence',
            'severity': 'medium' if canonical_artifact_count >= 3 else 'high',
            'detail': f'Only {canonical_artifact_count} independent artifacts'
        })

    if len(source_types) < 2:
        factors.append({
            'type': 'single_source_type',
            'severity': 'medium',
            'detail': f'Evidence from {len(source_types)} source type(s): {", ".join(source_types)}'
        })

    if lifecycle:
        confidence = lifecycle.get('stage_confidence', 0) or 0
        if confidence < 0.8:
            factors.append({
                'type': 'confidence_gap',
                'severity': 'medium' if confidence >= 0.6 else 'high',
                'detail': f'Stage confidence at {confidence:.0%}'
            })

        snapshots = lifecycle.get('snapshots_seen', 0) or 0
        if snapshots < 5:
            factors.append({
                'type': 'short_history',
                'severity': 'medium' if snapshots >= 3 else 'high',
                'detail': f'Only {snapshots} days of data'
            })

        if not lifecycle.get('acceleration_comparable', False):
            factors.append({
                'type': 'acceleration_uncertain',
                'severity': 'medium',
                'detail': 'Acceleration not yet comparable'
            })

    if demand_hits < 3:
        factors.append({
            'type': 'weak_demand_signal',
            'severity': 'low' if demand_hits >= 2 else 'medium',
            'detail': f'Only {demand_hits} demand signal(s)'
        })

    return factors


def render_risk_deterministic(uncertainty_factors: list[dict]) -> str:
    if not uncertainty_factors:
        return "Low uncertainty: Strong evidence base with comparable historical data."

    high = [f for f in uncertainty_factors if f.get('severity') == 'high']
    medium = [f for f in uncertainty_factors if f.get('severity') == 'medium']
    low = [f for f in uncertainty_factors if f.get('severity') == 'low']

    parts = []

    if high:
        parts.append(f"High uncertainty: {'; '.join(f['detail'] for f in high)}.")

    if medium:
        parts.append(f"Moderate concerns: {'; '.join(f['detail'] for f in medium)}.")

    if low and not high and not medium:
        parts.append(f"Minor notes: {'; '.join(f['detail'] for f in low)}.")

    confidence_tip = None
    for f in uncertainty_factors:
        if f['type'] == 'short_history':
            confidence_tip = "More snapshots would increase confidence."
            break
        elif f['type'] == 'limited_evidence':
            confidence_tip = "Additional independent sources would strengthen this."
            break
        elif f['type'] == 'acceleration_uncertain':
            confidence_tip = "Timing will clarify as acceleration becomes comparable."
            break

    if confidence_tip:
        parts.append(confidence_tip)

    return ' '.join(parts)


def generate_why_this_trend(
    theme: str,
    evidence: list[dict],
    demand_examples: list[dict],
    artifact_count: int
) -> str:
    evidence_titles = [e.get('title', '')[:100] for e in evidence[:5]]
    evidence_sources = [e.get('source', '') for e in evidence[:5]]

    source_counts = {}
    for s in evidence_sources:
        source_counts[s] = source_counts.get(s, 0) + 1
    source_summary = ', '.join(f"{count} from {source}" for source, count in source_counts.items())

    demand_titles = [d.get('title', '')[:80] for d in demand_examples[:3]]

    prompt = f"""Write a 2-sentence explanation of why "{theme}" is an emerging opportunity.

Evidence ({artifact_count} independent artifacts - {source_summary}):
{chr(10).join(f'- {t}' for t in evidence_titles)}

Demand signals found in titles:
{chr(10).join(f'- {t}' for t in demand_titles) if demand_titles else '- General interest detected'}

Rules:
- Be specific about WHAT people are looking for
- Reference the actual evidence (e.g., "HN discussions about...", "GitHub repos for...")
- No fluff or marketing language
- Max 50 words"""

    try:
        response = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=MODEL_NAME,
            temperature=0.3,
            max_tokens=100
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"LLM error for why_this_trend: {e}")
        return f"Developers are discussing {theme} across {artifact_count} independent artifacts ({source_summary}), with active demand signals in community discussions."


def generate_why_now_deterministic(lifecycle: Optional[dict]) -> str:
    if not lifecycle:
        return "Timing context unavailable: No lifecycle data for this snapshot."

    stage = lifecycle.get('lifecycle_stage', 'unknown')
    confidence = lifecycle.get('stage_confidence', 0) or 0
    snapshots = lifecycle.get('snapshots_seen', 0) or 0
    momentum_change = lifecycle.get('momentum_change_pct', 0) or 0
    accel_comparable = lifecycle.get('acceleration_comparable', False)

    if not accel_comparable:
        return f"Timing is uncertain: Acceleration data not yet comparable. Stage appears {stage} based on {snapshots} snapshots at {confidence:.0%} confidence."

    stage_phrases = {
        'emerging': f"Early stage ({stage}) with {momentum_change:+.0%} momentum change. First-mover window may be open.",
        'rising': f"Actively rising ({stage}) with {momentum_change:+.0%} momentum. Growing interest suggests building now captures momentum.",
        'peaking': f"At or near peak ({stage}). High attention now, but may plateau soon.",
        'stable': f"Stable interest ({stage}). Consistent demand without rapid change.",
        'declining': f"Past peak ({stage}) with {momentum_change:+.0%} momentum. Consider whether demand is shifting.",
    }

    base = stage_phrases.get(stage, f"Stage: {stage} with {momentum_change:+.0%} momentum change.")
    return f"{base} Tracked {snapshots} snapshots at {confidence:.0%} confidence."


def save_explanation(
    opportunity_id: str,
    snapshot_id: str,
    why_this_trend: str,
    why_now: str,
    whats_the_risk: str,
    evidence_used: list[dict],
    evidence_hash: str,
    lifecycle_context: dict,
    uncertainty_factors: list[dict]
) -> bool:
    data = {
        'opportunity_id': opportunity_id,
        'snapshot_id': snapshot_id,
        'why_this_trend': why_this_trend,
        'why_now': why_now,
        'whats_the_risk': whats_the_risk,
        'evidence_used': json.dumps([{
            'title': e.get('title', ''),
            'url': e.get('url', ''),
            'source': e.get('source', '')
        } for e in evidence_used[:5]]),
        'evidence_hash': evidence_hash,
        'lifecycle_context': json.dumps(lifecycle_context or {}),
        'uncertainty_factors': json.dumps(uncertainty_factors),
        'model_used': MODEL_NAME,
        'prompt_version': PROMPT_VERSION,
        'risk_rules_version': RISK_RULES_VERSION
    }

    try:
        supabase.table('opportunity_explanations') \
            .upsert(data, on_conflict='opportunity_id') \
            .execute()
        return True
    except Exception as e:
        logger.error(f"Error saving explanation: {e}")
        return False


def save_skipped_explanation(
    opportunity_id: str,
    snapshot_id: str,
    skip_reason: str
) -> bool:
    data = {
        'opportunity_id': opportunity_id,
        'snapshot_id': snapshot_id,
        'why_this_trend': f'Explanation skipped: {skip_reason}',
        'why_now': f'Explanation skipped: {skip_reason}',
        'whats_the_risk': f'Explanation skipped: {skip_reason}',
        'evidence_used': json.dumps([]),
        'evidence_hash': 'skipped',
        'lifecycle_context': json.dumps({}),
        'uncertainty_factors': json.dumps([{'type': 'explanation_skipped', 'severity': 'high', 'detail': skip_reason}]),
        'model_used': 'none',
        'prompt_version': PROMPT_VERSION,
        'risk_rules_version': RISK_RULES_VERSION
    }

    try:
        supabase.table('opportunity_explanations') \
            .upsert(data, on_conflict='opportunity_id') \
            .execute()
        return True
    except Exception as e:
        logger.error(f"Error saving skipped explanation: {e}")
        return False


def explain_opportunity(opportunity: dict, snapshot_id: str) -> dict:
    opportunity_id = opportunity['id']
    trend_id = opportunity['trend_id']

    result = {
        'opportunity_id': opportunity_id,
        'status': 'skipped',
        'reason': None
    }

    trend = get_trend_details(trend_id)
    if not trend:
        result['reason'] = 'trend_not_found'
        save_skipped_explanation(opportunity_id, snapshot_id, 'trend_not_found')
        return result

    theme = trend.get('theme', 'Unknown')

    evidence = get_top_evidence(snapshot_id, trend_id, limit=5)

    canonical_artifact_count = opportunity.get('independent_artifact_count', 0)
    if canonical_artifact_count < 2:
        result['reason'] = 'insufficient_evidence'
        save_skipped_explanation(opportunity_id, snapshot_id, f'insufficient_evidence ({canonical_artifact_count} artifacts)')
        logger.info(f"Skipping {theme}: insufficient evidence ({canonical_artifact_count} artifacts)")
        return result

    evidence_with_urls = [e for e in evidence if e.get('url')]
    if len(evidence_with_urls) < 2:
        result['reason'] = 'insufficient_urls'
        save_skipped_explanation(opportunity_id, snapshot_id, f'insufficient_urls ({len(evidence_with_urls)} with URLs)')
        logger.info(f"Skipping {theme}: insufficient URLs ({len(evidence_with_urls)})")
        return result

    demand_examples = opportunity.get('demand_examples', [])
    if isinstance(demand_examples, str):
        demand_examples = json.loads(demand_examples)

    evidence_hash = compute_evidence_hash(evidence, demand_examples)

    existing = get_existing_explanation(opportunity_id)
    if existing:
        if existing.get('evidence_hash') == evidence_hash and existing.get('snapshot_id') == snapshot_id:
            result['status'] = 'unchanged'
            result['reason'] = 'evidence_hash_match'
            logger.info(f"Skipping {theme}: evidence unchanged")
            return result

    logger.info(f"Explaining opportunity: {theme}")

    lifecycle = get_lifecycle_context(snapshot_id, trend_id)

    source_types = set(e.get('source', '') for e in evidence)

    uncertainty_factors = build_uncertainty_factors(
        canonical_artifact_count,
        source_types,
        lifecycle,
        opportunity.get('demand_hits', 0)
    )

    why_this_trend = generate_why_this_trend(
        theme,
        evidence,
        demand_examples,
        canonical_artifact_count
    )

    why_now = generate_why_now_deterministic(lifecycle)

    whats_the_risk = render_risk_deterministic(uncertainty_factors)

    lifecycle_context = lifecycle if lifecycle else {}

    success = save_explanation(
        opportunity_id,
        snapshot_id,
        why_this_trend,
        why_now,
        whats_the_risk,
        evidence,
        evidence_hash,
        lifecycle_context,
        uncertainty_factors
    )

    if success:
        result['status'] = 'generated'
        logger.info(f"  Why this trend: {why_this_trend[:80]}...")
        logger.info(f"  Why now: {why_now[:80]}...")
        logger.info(f"  Risk: {whats_the_risk[:80]}...")
    else:
        result['status'] = 'failed'
        result['reason'] = 'save_error'

    return result


def run_explanation_generation() -> dict:
    logger.info("=" * 60)
    logger.info("OPPORTUNITY EXPLANATION GENERATION")
    logger.info(f"Prompt version: {PROMPT_VERSION}")
    logger.info(f"Risk rules version: {RISK_RULES_VERSION}")
    logger.info("=" * 60)

    snapshot = get_latest_snapshot()
    if not snapshot:
        logger.error("No snapshot found")
        return {'generated': 0, 'unchanged': 0, 'failed': 0, 'total': 0}

    snapshot_id = snapshot['id']
    logger.info(f"Using snapshot: {snapshot_id}")

    opportunities = get_qualified_opportunities(snapshot_id)
    logger.info(f"Found {len(opportunities)} qualified opportunities")

    if not opportunities:
        logger.info("No qualified opportunities to explain")
        return {'generated': 0, 'unchanged': 0, 'failed': 0, 'total': 0}

    generated = 0
    unchanged = 0
    failed = 0

    for opp in opportunities:
        result = explain_opportunity(opp, snapshot_id)
        if result['status'] == 'generated':
            generated += 1
        elif result['status'] == 'unchanged':
            unchanged += 1
        else:
            failed += 1

    logger.info("=" * 60)
    logger.info("RESULTS")
    logger.info("=" * 60)
    logger.info(f"Generated: {generated}")
    logger.info(f"Unchanged: {unchanged}")
    logger.info(f"Failed: {failed}")
    logger.info(f"Total: {len(opportunities)}")

    return {
        'generated': generated,
        'unchanged': unchanged,
        'failed': failed,
        'total': len(opportunities)
    }


if __name__ == '__main__':
    stats = run_explanation_generation()
    print(f"\n=== Final Stats ===")
    print(f"Generated: {stats['generated']}")
    print(f"Unchanged: {stats['unchanged']}")
    print(f"Failed: {stats['failed']}")
    print(f"Total: {stats['total']}")

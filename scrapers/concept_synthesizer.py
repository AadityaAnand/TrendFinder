"""
Concept Synthesis Layer.

Replaces raw cluster names with LLM-generated market concepts.
Runs as a pipeline stage after clustering/trend detection, before hypothesis generation.

Phase 1: Signal Purification — Task 3
"""

import os
import json
import hashlib
import logging
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client, Client
from groq import Groq

from content_classifier import classify_content_type
from demand_classifier import classify_demand_layer1

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
groq_client = Groq(api_key=GROQ_API_KEY)

CONCEPT_VERSION = 'concept-v1'
MODEL_NAME = 'llama-3.3-70b-versatile'


def get_latest_snapshot() -> Optional[dict]:
    response = supabase.table('trend_snapshots') \
        .select('id, run_at') \
        .order('run_at', desc=True) \
        .limit(1) \
        .execute()
    return response.data[0] if response.data else None


def get_snapshot_trends(snapshot_id: str) -> list[dict]:
    """Get all trends in a snapshot with their IDs and keywords."""
    items = supabase.table('trend_snapshot_items') \
        .select('trend_id, momentum_score, signal_count, trend_keyword') \
        .eq('snapshot_id', snapshot_id) \
        .execute()

    if not items.data:
        return []

    trend_ids = [i['trend_id'] for i in items.data]

    trends_resp = supabase.table('detected_trends') \
        .select('id, theme, concept_version') \
        .in_('id', trend_ids) \
        .execute()

    trend_map = {t['id']: t for t in (trends_resp.data or [])}

    result = []
    for item in items.data:
        trend = trend_map.get(item['trend_id'], {})
        result.append({
            'trend_id': item['trend_id'],
            'name': trend.get('theme') or item.get('trend_keyword') or 'Unknown',
            'trend_keyword': item.get('trend_keyword', ''),
            'momentum_score': item['momentum_score'],
            'signal_count': item['signal_count'],
            'existing_concept_version': trend.get('concept_version'),
        })

    return result


def get_trend_signals(snapshot_id: str, trend_id: str, limit: int = 10) -> list[dict]:
    """Get signals for a trend, sorted by engagement."""
    signals_resp = supabase.table('trend_signals') \
        .select('signal_id') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .execute()

    if not signals_resp.data:
        return []

    signal_ids = [s['signal_id'] for s in signals_resp.data][:limit * 2]

    details_resp = supabase.table('raw_signals') \
        .select('id, title, url, source, score, content') \
        .in_('id', signal_ids) \
        .order('score', desc=True) \
        .limit(limit) \
        .execute()

    return details_resp.data or []


def compute_evidence_hash(signals: list[dict]) -> str:
    """Hash the top signals to detect changes (same pattern as hypothesis_generator)."""
    sorted_signals = sorted(signals, key=lambda x: x.get('url', '') or x.get('title', ''))
    canonical = [{'title': s.get('title', ''), 'url': s.get('url', ''), 'source': s.get('source', '')} for s in sorted_signals]
    return hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()[:16]


def get_existing_concept_hash(trend_id: str) -> Optional[str]:
    """Check if we already synthesized a concept for this trend with the same evidence."""
    response = supabase.table('detected_trends') \
        .select('concept_name, concept_version') \
        .eq('id', trend_id) \
        .limit(1) \
        .execute()

    if response.data and response.data[0].get('concept_version'):
        # Return the concept_version which encodes the evidence hash
        return response.data[0]['concept_version']
    return None


def synthesize_concept(
    trend_name: str,
    signals: list[dict],
    source_mix: dict[str, int],
    demand_phrases: list[str],
) -> Optional[dict]:
    """
    Use LLM to synthesize a market concept from cluster signals.

    Returns structured concept dict or None on failure.
    """
    signal_lines = []
    for s in signals[:10]:
        source = s.get('source', 'unknown')
        title = s.get('title', '')[:120]
        score = s.get('score', 0)
        signal_lines.append(f"- [{source}] {title} (engagement: {score})")

    signals_text = '\n'.join(signal_lines)

    source_summary = ', '.join(f"{src}: {count}" for src, count in source_mix.items())

    demand_text = '\n'.join(f"- {p}" for p in demand_phrases[:5]) if demand_phrases else '- No demand signals detected'

    prompt = f"""You are analyzing developer community signals to identify a MARKET CONCEPT — a coherent product opportunity or problem space.

Raw cluster name: "{trend_name}"
Sources: {source_summary}

Signals:
{signals_text}

Demand phrases found:
{demand_text}

Your job: Synthesize these signals into a coherent MARKET CONCEPT. This is not a topic label — it's a specific, buildable opportunity.

Respond in this exact JSON format (no markdown, no code blocks, just raw JSON):
{{
  "concept_name": "Short market-level name, 3-8 words. Examples: 'Self-hosted AI code review tools', 'Database migration automation for PostgreSQL', 'Privacy-first analytics alternatives'. NOT just a topic like 'React' or 'AI'.",
  "problem_statement": "One sentence: [Who] struggles with [what problem] because [why]. Ground this in the evidence above.",
  "affected_persona": ["specific persona 1", "specific persona 2"],
  "category": "devtools|infrastructure|ai-ml|web|data|security|other",
  "is_product_opportunity": true,
  "confidence": 0.7,
  "supporting_evidence": ["evidence bullet 1 citing a specific signal above", "evidence bullet 2"]
}}

Rules:
- concept_name MUST be specific and market-oriented, not a generic topic label
- problem_statement MUST reference the evidence — don't invent problems
- affected_persona should be specific (e.g., "backend engineers migrating from MongoDB") not generic ("developers")
- is_product_opportunity: true if someone could build a product/tool/service around this
- confidence: 0.0-1.0 based on evidence strength
- Max 3 personas, max 4 supporting evidence bullets"""

    try:
        response = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=MODEL_NAME,
            temperature=0.3,
            max_tokens=600
        )
        raw = response.choices[0].message.content.strip()

        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
            raw = raw.strip()

        result = json.loads(raw)

        concept_name = str(result.get('concept_name', ''))
        if not concept_name or len(concept_name) < 5:
            logger.warning(f"Concept name too short for '{trend_name}'")
            return None

        return {
            'concept_name': concept_name[:200],
            'problem_statement': str(result.get('problem_statement', ''))[:500],
            'affected_persona': (result.get('affected_persona') or [])[:3],
            'category': result.get('category', 'other'),
            'is_product_opportunity': bool(result.get('is_product_opportunity', False)),
            'confidence': max(0.0, min(1.0, float(result.get('confidence', 0.5)))),
            'supporting_evidence': [str(e)[:200] for e in (result.get('supporting_evidence') or [])[:4]],
        }
    except json.JSONDecodeError:
        logger.warning(f"Failed to parse LLM concept response for '{trend_name}'")
        return None
    except Exception as e:
        logger.error(f"LLM concept error for '{trend_name}': {e}")
        return None


def save_concept(trend_id: str, concept: dict, evidence_hash: str) -> bool:
    """Save concept data to detected_trends table."""
    data = {
        'theme': concept['concept_name'],
        'concept_name': concept['concept_name'],
        'problem_statement': concept['problem_statement'],
        'affected_persona': json.dumps(concept['affected_persona']),
        'concept_category': concept['category'],
        'is_product_opportunity': concept['is_product_opportunity'],
        'concept_confidence': concept['confidence'],
        'concept_version': f"{CONCEPT_VERSION}:{evidence_hash}",
    }

    try:
        supabase.table('detected_trends') \
            .update(data) \
            .eq('id', trend_id) \
            .execute()
        return True
    except Exception as e:
        logger.error(f"Error saving concept for {trend_id}: {e}")
        return False


def run_concept_synthesis() -> dict:
    logger.info("=" * 60)
    logger.info("CONCEPT SYNTHESIS")
    logger.info(f"Version: {CONCEPT_VERSION}")
    logger.info("=" * 60)

    snapshot = get_latest_snapshot()
    if not snapshot:
        logger.error("No snapshot found")
        return {'synthesized': 0, 'skipped': 0, 'failed': 0, 'total': 0}

    snapshot_id = snapshot['id']
    logger.info(f"Using snapshot: {snapshot_id}")

    trends = get_snapshot_trends(snapshot_id)
    logger.info(f"Found {len(trends)} trends in snapshot")

    if not trends:
        return {'synthesized': 0, 'skipped': 0, 'failed': 0, 'total': 0}

    stats = {'synthesized': 0, 'skipped': 0, 'failed': 0}

    for trend in trends:
        trend_id = trend['trend_id']
        trend_name = trend['name']

        # Get signals for this trend
        signals = get_trend_signals(snapshot_id, trend_id)
        if not signals:
            logger.info(f"Skipping '{trend_name}': no signals")
            stats['skipped'] += 1
            continue

        # Check evidence hash for change detection
        evidence_hash = compute_evidence_hash(signals)
        existing_version = get_existing_concept_hash(trend_id)
        if existing_version and existing_version == f"{CONCEPT_VERSION}:{evidence_hash}":
            logger.info(f"Skipping '{trend_name}': evidence unchanged")
            stats['skipped'] += 1
            continue

        # Classify content types and find demand signals
        for sig in signals:
            sig['content_type'] = classify_content_type(sig)

        demand_phrases = []
        for sig in signals:
            is_demand, patterns = classify_demand_layer1(sig.get('title', ''), sig.get('content', ''))
            if is_demand:
                demand_phrases.append(sig.get('title', '')[:100])

        # Compute source mix
        source_mix: dict[str, int] = {}
        for sig in signals:
            src = sig.get('source', 'unknown')
            source_mix[src] = source_mix.get(src, 0) + 1

        # Synthesize concept via LLM
        concept = synthesize_concept(trend_name, signals, source_mix, demand_phrases)

        if concept:
            if save_concept(trend_id, concept, evidence_hash):
                stats['synthesized'] += 1
                logger.info(f"Synthesized: '{concept['concept_name']}' (was '{trend_name}', confidence={concept['confidence']:.2f})")
            else:
                stats['failed'] += 1
        else:
            stats['failed'] += 1
            logger.warning(f"Failed to synthesize concept for '{trend_name}'")

    logger.info("=" * 60)
    logger.info("RESULTS")
    logger.info(f"Synthesized: {stats['synthesized']}, Skipped: {stats['skipped']}, Failed: {stats['failed']}")
    logger.info(f"Total processed: {len(trends)}")

    return {**stats, 'total': len(trends)}


if __name__ == '__main__':
    result = run_concept_synthesis()
    print(f"\n=== Concept Synthesis Results ===")
    for k, v in result.items():
        print(f"{k}: {v}")

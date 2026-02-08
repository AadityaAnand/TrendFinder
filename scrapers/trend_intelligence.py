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

PROMPT_VERSION = 'intelligence-v1'
MODEL_NAME = 'llama-3.3-70b-versatile'


def get_latest_snapshot() -> Optional[dict]:
    response = supabase.table('trend_snapshots') \
        .select('id, run_at') \
        .order('run_at', desc=True) \
        .limit(1) \
        .single() \
        .execute()
    return response.data


def get_snapshot_trends(snapshot_id: str) -> list[dict]:
    """Get all trends in a snapshot with their evidence and metadata."""
    items = supabase.table('trend_snapshot_items') \
        .select('trend_id, momentum_score, signal_count, trend_keyword') \
        .eq('snapshot_id', snapshot_id) \
        .gte('signal_count', 2) \
        .execute()

    if not items.data:
        return []

    trend_ids = [i['trend_id'] for i in items.data]

    trends_resp = supabase.table('detected_trends') \
        .select('id, theme') \
        .in_('id', trend_ids) \
        .execute()

    trend_map = {t['id']: t for t in (trends_resp.data or [])}

    result = []
    for item in items.data:
        trend = trend_map.get(item['trend_id'], {})
        name = trend.get('theme') or item.get('trend_keyword') or 'Unknown'
        result.append({
            'trend_id': item['trend_id'],
            'name': name,
            'momentum_score': item['momentum_score'],
            'signal_count': item['signal_count'],
        })

    return result


def get_trend_evidence(snapshot_id: str, trend_id: str, limit: int = 8) -> list[dict]:
    """Get evidence signals for a trend."""
    signals_resp = supabase.table('trend_signals') \
        .select('signal_id') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .execute()

    if not signals_resp.data:
        return []

    signal_ids = [s['signal_id'] for s in signals_resp.data][:limit * 2]

    details_resp = supabase.table('raw_signals') \
        .select('id, title, url, source, score') \
        .in_('id', signal_ids) \
        .order('score', desc=True) \
        .limit(limit) \
        .execute()

    return details_resp.data or []


def get_lifecycle_context(snapshot_id: str, trend_id: str) -> Optional[dict]:
    response = supabase.table('trend_lifecycle_history') \
        .select('lifecycle_stage, stage_confidence, acceleration_comparable, momentum_change_pct, snapshots_seen') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .single() \
        .execute()
    return response.data


def compute_evidence_hash(evidence: list[dict]) -> str:
    sorted_evidence = sorted(evidence, key=lambda x: x.get('url', '') or x.get('title', ''))
    canonical = [{'title': e.get('title', ''), 'url': e.get('url', ''), 'source': e.get('source', '')} for e in sorted_evidence]
    return hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()[:16]


def get_existing_intelligence(snapshot_id: str, trend_id: str) -> Optional[dict]:
    response = supabase.table('trend_intelligence') \
        .select('evidence_hash') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .single() \
        .execute()
    return response.data if response.data else None


def generate_intelligence(trend_name: str, evidence: list[dict], lifecycle: Optional[dict]) -> dict:
    """Generate summary, build ideas, and existing solutions using LLM."""
    evidence_lines = []
    for e in evidence[:6]:
        source = e.get('source', 'unknown')
        title = e.get('title', '')[:120]
        evidence_lines.append(f"- [{source}] {title}")

    evidence_text = '\n'.join(evidence_lines) if evidence_lines else '- No specific evidence available'

    stage_info = ''
    if lifecycle:
        stage = lifecycle.get('lifecycle_stage', 'unknown')
        confidence = lifecycle.get('stage_confidence', 0)
        stage_info = f"\nLifecycle: {stage} (confidence: {confidence:.0%})"

    prompt = f"""Analyze this developer trend and provide intelligence.

Trend: "{trend_name}"{stage_info}

Evidence from developer communities:
{evidence_text}

Respond in this exact JSON format (no markdown, no code blocks, just raw JSON):
{{
  "summary": "2-3 sentence plain-English summary of what this trend is about and why it matters to builders. Be specific about what developers are doing/discussing.",
  "build_ideas": [
    {{"idea": "specific product/tool idea", "effort": "weekend|week|month", "audience": "who would use this"}},
    {{"idea": "another specific idea", "effort": "weekend|week|month", "audience": "who would use this"}}
  ],
  "existing_solutions": [
    {{"name": "known tool/product name", "gap": "what gap or limitation exists"}}
  ],
  "risks": ["specific risk 1", "specific risk 2"]
}}

Rules:
- Summary must reference actual evidence, not be generic
- Build ideas must be specific and actionable (not "build a tool for X")
- Existing solutions: only include ones you're confident actually exist
- Risks should be honest and specific
- Max 3 build ideas, max 3 existing solutions, max 3 risks
- Keep all text concise (no marketing language)"""

    try:
        response = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=MODEL_NAME,
            temperature=0.3,
            max_tokens=600
        )
        raw = response.choices[0].message.content.strip()

        # Try to extract JSON from the response
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
            raw = raw.strip()

        result = json.loads(raw)

        # Validate and normalize
        return {
            'summary': str(result.get('summary', ''))[:500],
            'build_ideas': (result.get('build_ideas') or [])[:3],
            'existing_solutions': (result.get('existing_solutions') or [])[:3],
            'risks': [str(r)[:200] for r in (result.get('risks') or [])[:3]],
        }
    except json.JSONDecodeError:
        logger.warning(f"Failed to parse LLM response for {trend_name}")
        return generate_fallback(trend_name, evidence)
    except Exception as e:
        logger.error(f"LLM error for {trend_name}: {e}")
        return generate_fallback(trend_name, evidence)


def generate_fallback(trend_name: str, evidence: list[dict]) -> dict:
    """Generate basic intelligence without LLM."""
    sources = set(e.get('source', '') for e in evidence)
    source_summary = ', '.join(sources) if sources else 'developer communities'

    return {
        'summary': f"Developers are actively discussing {trend_name} across {source_summary}. "
                   f"Based on {len(evidence)} signals, there's growing interest in this area.",
        'build_ideas': [],
        'existing_solutions': [],
        'risks': ['Limited evidence — more data needed for confident assessment'],
    }


def save_intelligence(
    trend_id: str,
    snapshot_id: str,
    intelligence: dict,
    evidence_hash: str,
    signal_count: int
) -> bool:
    data = {
        'trend_id': trend_id,
        'snapshot_id': snapshot_id,
        'summary': intelligence['summary'],
        'build_ideas': json.dumps(intelligence['build_ideas']),
        'existing_solutions': json.dumps(intelligence['existing_solutions']),
        'risks': intelligence['risks'],
        'evidence_hash': evidence_hash,
        'signal_count': signal_count,
        'model_used': MODEL_NAME,
        'prompt_version': PROMPT_VERSION,
    }

    try:
        supabase.table('trend_intelligence') \
            .upsert(data, on_conflict='snapshot_id,trend_id') \
            .execute()
        return True
    except Exception as e:
        logger.error(f"Error saving intelligence: {e}")
        return False


def run_intelligence_generation() -> dict:
    logger.info("=" * 60)
    logger.info("TREND INTELLIGENCE GENERATION")
    logger.info(f"Prompt version: {PROMPT_VERSION}")
    logger.info("=" * 60)

    snapshot = get_latest_snapshot()
    if not snapshot:
        logger.error("No snapshot found")
        return {'generated': 0, 'unchanged': 0, 'failed': 0, 'total': 0}

    snapshot_id = snapshot['id']
    logger.info(f"Using snapshot: {snapshot_id}")

    trends = get_snapshot_trends(snapshot_id)
    logger.info(f"Found {len(trends)} trends with 2+ signals")

    if not trends:
        return {'generated': 0, 'unchanged': 0, 'failed': 0, 'total': 0}

    generated = 0
    unchanged = 0
    failed = 0

    for trend in trends:
        trend_id = trend['trend_id']
        trend_name = trend['name']

        evidence = get_trend_evidence(snapshot_id, trend_id)
        if len(evidence) < 2:
            logger.info(f"Skipping {trend_name}: insufficient evidence ({len(evidence)})")
            continue

        evidence_hash = compute_evidence_hash(evidence)

        # Check if intelligence already exists with same evidence
        existing = get_existing_intelligence(snapshot_id, trend_id)
        if existing and existing.get('evidence_hash') == evidence_hash:
            logger.info(f"Skipping {trend_name}: evidence unchanged")
            unchanged += 1
            continue

        lifecycle = get_lifecycle_context(snapshot_id, trend_id)
        intelligence = generate_intelligence(trend_name, evidence, lifecycle)

        success = save_intelligence(
            trend_id, snapshot_id, intelligence,
            evidence_hash, trend['signal_count']
        )

        if success:
            generated += 1
            logger.info(f"Generated intelligence for: {trend_name}")
            logger.info(f"  Summary: {intelligence['summary'][:80]}...")
            logger.info(f"  Build ideas: {len(intelligence['build_ideas'])}")
        else:
            failed += 1

    logger.info("=" * 60)
    logger.info("RESULTS")
    logger.info(f"Generated: {generated}, Unchanged: {unchanged}, Failed: {failed}")
    logger.info(f"Total processed: {len(trends)}")

    return {
        'generated': generated,
        'unchanged': unchanged,
        'failed': failed,
        'total': len(trends)
    }


if __name__ == '__main__':
    stats = run_intelligence_generation()
    print(f"\n=== Intelligence Generation Results ===")
    print(f"Generated: {stats['generated']}")
    print(f"Unchanged: {stats['unchanged']}")
    print(f"Failed: {stats['failed']}")
    print(f"Total: {stats['total']}")

import os
import re
import json
import hashlib
import logging
import statistics
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client, Client
from groq import Groq
from content_classifier import (
    is_narrative_title, is_generic_non_market,
    NARRATIVE_REGEX, GENERIC_NON_MARKET,
)
from creator_gates import get_cluster_signal_type

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
groq_client = Groq(api_key=GROQ_API_KEY)

HYPOTHESIS_VERSION = 'hypothesis-v1'
PROMPT_VERSION = 'hypothesis-prompt-v1'
MODEL_NAME = 'llama-3.3-70b-versatile'

DEMAND_PATTERNS = [
    r'\bhow to\b', r'\blooking for\b', r'\bbenchmark\b', r'\bcomparison\b',
    r'\bmigrat(?:e|ion|ing)\b', r'\bproduction\b', r'\bscaling\b',
    r'\blimitation[s]?\b', r'\bproblem[s]?\b', r'\bissue[s]?\b',
    r'\balternative\b', r'\bpain[- ]?point[s]?\b',
    r'\bfrustrat(?:ed|ing|ion)\b', r'\bneed[s]?\b', r'\breplace(?:ment)?\b',
    r'\bself[- ]?host(?:ed|ing)?\b', r'\bwish(?:ing|ed)?\b',
]
DEMAND_REGEX = re.compile('|'.join(DEMAND_PATTERNS), re.IGNORECASE)


def get_latest_snapshot() -> Optional[dict]:
    response = supabase.table('trend_snapshots') \
        .select('id, run_at') \
        .order('run_at', desc=True) \
        .limit(1) \
        .execute()
    return response.data[0] if response.data else None


def get_snapshot_trends(snapshot_id: str) -> list[dict]:
    items = supabase.table('trend_snapshot_items') \
        .select('trend_id, momentum_score, signal_count, trend_keyword') \
        .eq('snapshot_id', snapshot_id) \
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
            'trend_keyword': item.get('trend_keyword', ''),
        })

    return result


def get_trend_evidence(snapshot_id: str, trend_id: str, limit: int = 8) -> list[dict]:
    signals_resp = supabase.table('trend_signals') \
        .select('signal_id') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .execute()

    if not signals_resp.data:
        return []

    signal_ids = [s['signal_id'] for s in signals_resp.data][:limit * 2]

    details_resp = supabase.table('raw_signals') \
        .select('id, title, url, source, score, source_type') \
        .in_('id', signal_ids) \
        .order('score', desc=True) \
        .limit(limit) \
        .execute()

    return details_resp.data or []


def get_lifecycle_context(snapshot_id: str, trend_id: str) -> Optional[dict]:
    response = supabase.table('trend_lifecycle_history') \
        .select('lifecycle_stage, stage_confidence, acceleration_comparable, momentum_change_pct, snapshots_seen, days_seen') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .limit(1) \
        .execute()
    return response.data[0] if response.data else None


def compute_evidence_hash(evidence: list[dict]) -> str:
    sorted_evidence = sorted(evidence, key=lambda x: x.get('url', '') or x.get('title', ''))
    canonical = [{'title': e.get('title', ''), 'url': e.get('url', ''), 'source': e.get('source', '')} for e in sorted_evidence]
    return hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()[:16]


def get_existing_hypothesis(snapshot_id: str, trend_id: str) -> Optional[dict]:
    response = supabase.table('problem_hypotheses') \
        .select('evidence_hash') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .limit(1) \
        .execute()
    return response.data[0] if response.data else None


def _generate_fallback_summary(trend_name: str, signals: list[dict], demand_evidence: list[dict]) -> str:
    """
    Build a genuine, readable narrative summary from raw signals.
    Extracts themes, sentiment/intent, and quotes from top signals.
    """
    top = sorted(signals, key=lambda s: s.get('score', 0), reverse=True)[:5]
    sources = list(dict.fromkeys(s.get('source', '') for s in top if s.get('source')))

    # Extract frequent non-stopword terms from signal titles
    stopwords = {
        'the', 'a', 'an', 'of', 'in', 'for', 'to', 'and', 'or', 'is', 'are',
        'with', 'on', 'it', 'this', 'that', 'at', 'by', 'how', 'new', 'best',
        'show', 'hn', 'ask', 'tell', 'your', 'my', 'our', 'from', 'about',
    }
    term_counts: dict[str, int] = {}
    for s in top:
        for w in s.get('title', '').lower().split():
            w = w.strip('.,?!:;()[]"\'')
            if len(w) > 3 and w not in stopwords and w.isalpha():
                term_counts[w] = term_counts.get(w, 0) + 1
    top_terms = [t for t, _ in sorted(term_counts.items(), key=lambda x: -x[1])[:4]]

    source_str = ', '.join(sources) if sources else 'one community'

    # Detect discussion intent from titles
    question_signals = [s for s in top if '?' in s.get('title', '') or s.get('title', '').lower().startswith(('how', 'why', 'what', 'is '))]
    frustration_words = {'frustrat', 'problem', 'issue', 'broken', 'slow', 'pain', 'struggle', 'bug', 'fail'}
    frustration_signals = [s for s in top if any(w in s.get('title', '').lower() for w in frustration_words)]
    sharing_words = {'launch', 'released', 'introducing', 'built', 'open source', 'announce'}
    sharing_signals = [s for s in top if any(w in s.get('title', '').lower() for w in sharing_words)]

    # Build narrative parts
    parts = []

    # Opening: signal count and sources
    parts.append(f"There are {len(signals)} active discussion(s) on {source_str}.")

    # Quote the top signal for flavor
    if top and top[0].get('title'):
        best = top[0]
        score_note = f" ({best.get('score', 0)} points)" if best.get('score', 0) else ""
        parts.append(f'The most engaged post is "{best["title"][:120]}"{score_note}.')

    # Describe discussion intent
    if question_signals:
        q_title = question_signals[0].get('title', '')[:100]
        parts.append(f'People are asking questions like "{q_title}".')
    elif frustration_signals:
        parts.append('The discussion reflects frustration or pain points that people are experiencing.')
    elif sharing_signals:
        parts.append('The conversation is driven by new launches, tools, or announcements being shared.')
    else:
        terms_str = ', '.join(top_terms) if top_terms else trend_name
        parts.append(f'Key themes include {terms_str}.')

    # Second signal quote if available
    if len(top) >= 2 and top[1].get('title'):
        parts.append(f'Another notable post: "{top[1]["title"][:100]}".')

    # Demand note
    if demand_evidence:
        parts.append(f'{len(demand_evidence)} signal(s) show people actively looking for solutions or alternatives.')

    # Source diversity note
    if len(sources) < 2:
        parts.append("The conversation hasn't spread across multiple platforms yet, which could mean it's still early.")

    return ' '.join(parts)


def check_topic_only_deterministic(trend_name: str, evidence: list[dict]) -> tuple[bool, list[str]]:
    reasons = []

    if is_generic_non_market(trend_name):
        reasons.append(f'generic_non_market_term: {trend_name}')

    narrative_count = sum(1 for e in evidence if is_narrative_title(e.get('title', '')))
    if narrative_count > len(evidence) * 0.6:
        reasons.append(f'majority_narrative_titles: {narrative_count}/{len(evidence)}')

    sources = set(e.get('source', '') for e in evidence)
    if len(sources) < 2 and len(evidence) <= 2:
        reasons.append(f'single_source_low_evidence: {len(sources)} source(s), {len(evidence)} signal(s)')

    canonical_urls = set()
    for e in evidence:
        url = e.get('url', '')
        if url:
            canonical_urls.add(url.split('?')[0].rstrip('/').lower())
    if len(canonical_urls) <= 1 and len(evidence) > 1:
        reasons.append(f'single_canonical_artifact: {len(canonical_urls)} unique URL(s)')

    return len(reasons) > 0, reasons


def check_uncertainty_gate(
    evidence: list[dict],
    lifecycle: Optional[dict],
    demand_count: int
) -> tuple[bool, float, list[str]]:
    confidence = 0.0
    reasons = []

    sources = set(e.get('source', '') for e in evidence)
    canonical_urls = set()
    for e in evidence:
        url = e.get('url', '')
        if url:
            canonical_urls.add(url.split('?')[0].rstrip('/').lower())

    if len(canonical_urls) >= 3:
        confidence += 0.3
        reasons.append(f'{len(canonical_urls)} independent artifacts')
    elif len(canonical_urls) >= 2:
        confidence += 0.15
        reasons.append(f'{len(canonical_urls)} independent artifacts (minimum)')

    if len(sources) >= 3:
        confidence += 0.2
        reasons.append(f'{len(sources)} source types')
    elif len(sources) >= 2:
        confidence += 0.1
        reasons.append(f'{len(sources)} source types')
    else:
        reasons.append('single source type')

    if demand_count >= 3:
        confidence += 0.2
        reasons.append(f'{demand_count} demand signals')
    elif demand_count >= 1:
        confidence += 0.1
        reasons.append(f'{demand_count} demand signal(s)')
    else:
        reasons.append('no demand signals')

    if lifecycle:
        days_seen = lifecycle.get('days_seen', 0) or 0
        stage_conf = lifecycle.get('stage_confidence', 0) or 0
        comparable = lifecycle.get('acceleration_comparable', False)

        if days_seen >= 5 and stage_conf >= 0.6 and comparable:
            confidence += 0.3
            reasons.append(f'{days_seen} days tracked, {stage_conf:.0%} stage confidence')
        elif days_seen >= 3 and stage_conf >= 0.5:
            confidence += 0.15
            reasons.append(f'{days_seen} days tracked, {stage_conf:.0%} stage confidence')
        else:
            reasons.append(f'short history: {days_seen} days, {stage_conf:.0%} confidence')
    else:
        reasons.append('no lifecycle data')

    should_be_uncertain = confidence < 0.5 or demand_count == 0
    return should_be_uncertain, min(confidence, 1.0), reasons


def should_call_llm(evidence: list[dict], demand_count: int) -> bool:
    canonical_urls = set()
    for e in evidence:
        url = e.get('url', '')
        if url:
            canonical_urls.add(url.split('?')[0].rstrip('/').lower())

    if len(canonical_urls) < 2:
        return False

    sources = set(e.get('source', '') for e in evidence)
    if len(sources) < 2 and demand_count == 0:
        return False

    if demand_count >= 1:
        return True

    pain_words = ['problem', 'issue', 'pain', 'frustrat', 'bug', 'broken', 'slow', 'expensive', 'hard']
    pain_count = 0
    for e in evidence:
        title_lower = e.get('title', '').lower()
        if any(w in title_lower for w in pain_words):
            pain_count += 1

    return pain_count >= 2


def generate_hypothesis_llm(
    trend_name: str,
    evidence: list[dict],
    lifecycle: Optional[dict],
    demand_evidence: list[dict]
) -> Optional[dict]:
    evidence_lines = []
    for e in evidence[:5]:
        source = e.get('source', 'unknown')
        title = e.get('title', '')[:120]
        score = e.get('score', 0)
        evidence_lines.append(f"- [{source}] {title} (engagement: {score})")

    evidence_text = '\n'.join(evidence_lines)

    demand_lines = []
    for d in demand_evidence[:3]:
        demand_lines.append(f"- [{d.get('source', '')}] {d.get('title', '')[:100]}")
    demand_text = '\n'.join(demand_lines) if demand_lines else '- No explicit demand signals'

    stage_info = ''
    if lifecycle:
        stage = lifecycle.get('lifecycle_stage', 'unknown')
        conf = lifecycle.get('stage_confidence', 0)
        days = lifecycle.get('days_seen', 0)
        stage_info = f"\nLifecycle: {stage} (confidence: {conf:.0%}, {days} days tracked)"

    prompt = f"""You are analyzing online community signals to understand what people are discussing and identify potential opportunities.

Topic cluster: "{trend_name}"{stage_info}

Evidence signals:
{evidence_text}

Demand signals (people expressing needs/frustrations):
{demand_text}

Your job: Synthesize these signals into a clear HYPOTHESIS about what's happening and why it matters. Describe the key discussion themes, recurring questions or needs, and what opportunity might exist for builders.

Respond in this exact JSON format (no markdown, no code blocks, just raw JSON):
{{
  "hypothesis_title": "Short descriptive statement about what's happening, e.g. 'Teams struggling to track AI tool usage costs' or 'Growing debate around carbon capture feasibility'",
  "hypothesis_summary": "3-5 sentence plain English explanation of what people are discussing, who cares about it, and why it matters now. Reference the evidence.",
  "who_it_affects": ["specific group 1", "specific group 2"],
  "pain_signals": ["key theme or need grounded in evidence", "theme 2", "theme 3"],
  "confidence_assessment": "high|medium|low"
}}

Rules:
- hypothesis_title should describe what's happening, not just name a topic. Bad: "React Server Components". Good: "Developers struggle with React Server Component caching and hydration errors"
- pain_signals MUST be derived from the evidence titles/snippets above. They can be problems, questions, debates, or needs — whatever the signals show. Do NOT invent themes not in the evidence.
- who_it_affects should be specific groups (e.g., "backend developers using PostgreSQL", "climate policy researchers"), not generic ("developers", "people")
- confidence_assessment reflects how clear and coherent the signals are, not whether it's a "valid problem"
- Max 6 pain signals, max 3 personas
- Keep all text concise"""

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

        title = str(result.get('hypothesis_title', ''))
        if not title or len(title) < 10:
            return None

        return {
            'hypothesis_title': title[:200],
            'hypothesis_summary': str(result.get('hypothesis_summary', ''))[:800],
            'who_it_affects': (result.get('who_it_affects') or [])[:3],
            'pain_signals': [str(p)[:200] for p in (result.get('pain_signals') or [])[:6]],
            'confidence_assessment': result.get('confidence_assessment', 'low'),
        }
    except json.JSONDecodeError:
        logger.warning(f"Failed to parse LLM response for {trend_name}")
        return None
    except Exception as e:
        logger.error(f"LLM error for {trend_name}: {e}")
        return None


def generate_creator_hypothesis_llm(
    trend_name: str,
    evidence: list[dict],
    demand_evidence: list[dict],
) -> Optional[dict]:
    """
    Generate a creator-focused content opportunity hypothesis using the LLM.
    Returns structured creator hypothesis or None on failure.
    """
    evidence_lines = []
    for e in evidence[:8]:
        source = e.get('source', 'unknown')
        title = e.get('title', '')[:120]
        score = e.get('score', 0)
        evidence_lines.append(f"- [{source}] {title} (engagement: {score})")

    evidence_text = '\n'.join(evidence_lines)

    prompt = f"""You are analyzing content creator platform signals to identify emerging content opportunities.

Trend cluster: "{trend_name}"

Signals from creator platforms (YouTube, Spotify, Twitch, Medium, TikTok, etc.):
{evidence_text}

Your job: Identify a CONTENT OPPORTUNITY — a format, topic, or series that creators could make right now to tap into this trend.

Respond in this exact JSON format (no markdown, no code blocks, just raw JSON):
{{
  "hypothesis_title": "Catchy opportunity title, 5-8 words, e.g. 'Short-form explainer series on AI tools'",
  "hypothesis_summary": "3-4 sentence plain English description: what content to create, why audiences want it now, what makes it distinctive. Reference the evidence.",
  "content_type": "one of: video_series|newsletter|podcast|challenge|course|live_stream|thread_series",
  "platform_focus": ["list of platforms this works best on, e.g. youtube, tiktok, instagram, substack, linkedin, twitch"],
  "target_audience": "Specific creator niche and audience size, e.g. 'fitness creators with 10-100k followers'",
  "format_description": "What the content actually looks like — format, length, cadence, tone",
  "why_now": "Why this is emerging right now based on the signals",
  "monetization_angle": "How creators could monetize: sponsorships, course, affiliate, merch, etc.",
  "confidence_assessment": "high|medium|low"
}}

Rules:
- hypothesis_title should sound like a real content idea, not a topic label
- monetization_angle must be realistic and specific
- platform_focus should only include platforms actually represented in the signals
- If signals are too generic for a specific opportunity, set confidence_assessment to "low"
- Keep all text concise"""

    try:
        response = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=MODEL_NAME,
            temperature=0.4,
            max_tokens=700,
        )
        raw = response.choices[0].message.content.strip()

        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
            raw = raw.strip()

        result = json.loads(raw)

        title = str(result.get('hypothesis_title', ''))
        if not title or len(title) < 10:
            return None

        return {
            'hypothesis_title': title[:200],
            'hypothesis_summary': str(result.get('hypothesis_summary', ''))[:800],
            'who_it_affects': [str(result.get('target_audience', ''))],
            'pain_signals': [str(result.get('format_description', '')), str(result.get('why_now', ''))],
            'confidence_assessment': result.get('confidence_assessment', 'low'),
            # Creator-specific extras
            'content_type': result.get('content_type', 'video_series'),
            'platform_focus': result.get('platform_focus', []),
            'monetization_angle': result.get('monetization_angle', ''),
        }
    except json.JSONDecodeError:
        logger.warning(f"Failed to parse creator LLM response for {trend_name}")
        return None
    except Exception as e:
        logger.error(f"Creator LLM error for {trend_name}: {e}")
        return None


def save_hypothesis(
    snapshot_id: str,
    trend_id: str,
    hypothesis: dict,
    evidence_hash: str,
    status: str,
    confidence: float,
    confidence_reasons: list[str],
    used_llm: bool,
    hypothesis_type: str = 'developer',
    platform_focus: list = None,
    monetization_angle: str = None,
) -> bool:
    data = {
        'snapshot_id': snapshot_id,
        'trend_id': trend_id,
        'detector_version': HYPOTHESIS_VERSION,
        'evidence_hash': evidence_hash,
        'hypothesis_title': hypothesis.get('hypothesis_title', ''),
        'hypothesis_summary': hypothesis.get('hypothesis_summary'),
        'who_it_affects': json.dumps(hypothesis.get('who_it_affects', [])),
        'pain_signals': json.dumps(hypothesis.get('pain_signals', [])),
        'demand_evidence': json.dumps(hypothesis.get('demand_evidence', [])),
        'confidence': confidence,
        'confidence_reasons': json.dumps(confidence_reasons),
        'hypothesis_status': status,
        'model_used': MODEL_NAME if used_llm else 'deterministic',
        'prompt_version': PROMPT_VERSION if used_llm else 'deterministic',
        'hypothesis_type': hypothesis_type,
        'platform_focus': platform_focus or [],
        'monetization_angle': monetization_angle,
    }

    try:
        supabase.table('problem_hypotheses') \
            .upsert(data, on_conflict='snapshot_id,trend_id') \
            .execute()
        return True
    except Exception as e:
        logger.error(f"Error saving hypothesis: {e}")
        return False


def run_hypothesis_generation() -> dict:
    logger.info("=" * 60)
    logger.info("HYPOTHESIS GENERATION")
    logger.info(f"Version: {HYPOTHESIS_VERSION}")
    logger.info("=" * 60)

    snapshot = get_latest_snapshot()
    if not snapshot:
        logger.error("No snapshot found")
        return {'valid': 0, 'uncertain': 0, 'unchanged': 0, 'failed': 0, 'total': 0}

    snapshot_id = snapshot['id']
    logger.info(f"Using snapshot: {snapshot_id}")

    trends = get_snapshot_trends(snapshot_id)
    logger.info(f"Found {len(trends)} trends in snapshot")

    if not trends:
        return {'valid': 0, 'uncertain': 0, 'unchanged': 0, 'failed': 0, 'total': 0}

    stats = {'valid': 0, 'uncertain': 0, 'unchanged': 0, 'failed': 0}

    for trend in trends:
        trend_id = trend['trend_id']
        trend_name = trend['name']

        evidence = get_trend_evidence(snapshot_id, trend_id)

        if len(evidence) < 1:
            logger.info(f"Skipping {trend_name}: no evidence")
            continue

        evidence_hash = compute_evidence_hash(evidence)

        existing = get_existing_hypothesis(snapshot_id, trend_id)
        if existing and existing.get('evidence_hash') == evidence_hash:
            logger.info(f"Skipping {trend_name}: evidence unchanged")
            stats['unchanged'] += 1
            continue

        # --- Creator branch: detect creator-majority clusters and use creator LLM ---
        signal_type = get_cluster_signal_type(evidence)
        if signal_type == 'creator':
            logger.info(f"Creator cluster: {trend_name} — using creator hypothesis")
            demand_evidence = []
            for e in evidence:
                if DEMAND_REGEX.search(e.get('title', '')):
                    demand_evidence.append({'title': e.get('title', ''), 'source': e.get('source', ''), 'url': e.get('url', '')})

            creator_result = generate_creator_hypothesis_llm(trend_name, evidence, demand_evidence)
            if creator_result:
                save_hypothesis(
                    snapshot_id, trend_id, creator_result, evidence_hash,
                    'valid', 0.6, ['creator_cluster'],
                    used_llm=True,
                    hypothesis_type='creator',
                    platform_focus=creator_result.get('platform_focus', []),
                    monetization_angle=creator_result.get('monetization_angle', ''),
                )
                stats['valid'] += 1
            else:
                # Fallback for creator clusters
                fallback = {
                    'hypothesis_title': trend_name,
                    'hypothesis_summary': _generate_fallback_summary(trend_name, evidence, demand_evidence),
                    'who_it_affects': [],
                    'pain_signals': [],
                    'demand_evidence': demand_evidence,
                }
                save_hypothesis(
                    snapshot_id, trend_id, fallback, evidence_hash,
                    'uncertain', 0.3, ['creator_cluster', 'llm_failed'],
                    used_llm=False,
                    hypothesis_type='creator',
                )
                stats['uncertain'] += 1
            continue
        # --- End creator branch ---

        # Note: check_topic_only_deterministic flags are used as confidence signals,
        # not as a hard gate. All trends get a summary — the user decides what's valuable.
        is_low_signal, low_signal_reasons = check_topic_only_deterministic(trend_name, evidence)
        if is_low_signal:
            logger.info(f"Low-signal cluster: {trend_name} ({', '.join(low_signal_reasons)}) — generating narrative summary")
            # Still generate a useful fallback summary instead of blocking
            demand_evidence_early = []
            for e in evidence:
                if DEMAND_REGEX.search(e.get('title', '')):
                    demand_evidence_early.append({'title': e.get('title', ''), 'source': e.get('source', ''), 'url': e.get('url', '')})
            hypothesis = {
                'hypothesis_title': trend_name,
                'hypothesis_summary': _generate_fallback_summary(trend_name, evidence, demand_evidence_early),
                'who_it_affects': [],
                'pain_signals': [],
                'demand_evidence': demand_evidence_early,
            }
            save_hypothesis(snapshot_id, trend_id, hypothesis, evidence_hash, 'uncertain', 0.15, low_signal_reasons, False)
            stats['uncertain'] += 1
            continue

        demand_evidence = []
        demand_count = 0
        for e in evidence:
            title = e.get('title', '')
            if DEMAND_REGEX.search(title):
                demand_count += 1
                demand_evidence.append({
                    'title': title,
                    'source': e.get('source', ''),
                    'url': e.get('url', ''),
                    'matched_signal': e.get('id', ''),
                })

        is_uncertain, confidence, confidence_reasons = check_uncertainty_gate(evidence, get_lifecycle_context(snapshot_id, trend_id), demand_count)

        if not should_call_llm(evidence, demand_count):
            logger.info(f"Uncertain (no LLM): {trend_name} (confidence={confidence:.2f})")
            hypothesis = {
                'hypothesis_title': trend_name,
                'hypothesis_summary': _generate_fallback_summary(trend_name, evidence, demand_evidence),
                'who_it_affects': [],
                'pain_signals': [],
                'demand_evidence': demand_evidence,
            }
            save_hypothesis(snapshot_id, trend_id, hypothesis, evidence_hash, 'uncertain', confidence, confidence_reasons, False)
            stats['uncertain'] += 1
            continue

        lifecycle = get_lifecycle_context(snapshot_id, trend_id)
        llm_result = generate_hypothesis_llm(trend_name, evidence, lifecycle, demand_evidence)

        if not llm_result:
            logger.warning(f"LLM failed for {trend_name}, marking uncertain")
            hypothesis = {
                'hypothesis_title': trend_name,
                'hypothesis_summary': _generate_fallback_summary(trend_name, evidence, demand_evidence),
                'who_it_affects': [],
                'pain_signals': [],
                'demand_evidence': demand_evidence,
            }
            save_hypothesis(snapshot_id, trend_id, hypothesis, evidence_hash, 'uncertain', confidence, confidence_reasons + ['llm_generation_failed'], False)
            stats['failed'] += 1
            continue

        llm_confidence = llm_result.get('confidence_assessment', 'low')
        if llm_confidence == 'high' and confidence >= 0.5:
            confidence = min(confidence + 0.15, 1.0)
        elif llm_confidence == 'low':
            confidence = max(confidence - 0.1, 0.0)

        if confidence < 0.4:
            status = 'uncertain'
        else:
            status = 'valid'

        llm_result['demand_evidence'] = demand_evidence

        save_hypothesis(snapshot_id, trend_id, llm_result, evidence_hash, status, confidence, confidence_reasons, True)

        if status == 'valid':
            stats['valid'] += 1
            logger.info(f"Valid: {llm_result['hypothesis_title'][:80]} (confidence={confidence:.2f})")
        else:
            stats['uncertain'] += 1
            logger.info(f"Uncertain: {llm_result['hypothesis_title'][:80]} (confidence={confidence:.2f})")

    logger.info("=" * 60)
    logger.info("RESULTS")
    logger.info(f"Valid: {stats['valid']}, Uncertain: {stats['uncertain']}")
    logger.info(f"Unchanged: {stats['unchanged']}, Failed: {stats['failed']}")
    logger.info(f"Total processed: {len(trends)}")

    return {**stats, 'total': len(trends)}


if __name__ == '__main__':
    result = run_hypothesis_generation()
    print(f"\n=== Hypothesis Generation Results ===")
    for k, v in result.items():
        print(f"{k}: {v}")

"""
Phase 3: Opportunity Brief Generator

Orchestrates generation of all 6 brief sections for qualified opportunities.
Reads from existing DB tables (opportunity_explanations, trend_intelligence,
trend_competitive_intelligence, etc.) — only 1 new LLM call per brief (persona extraction).

Pipeline position: after trend_intelligence, before trajectory_updater.
"""

import os
import json
import hashlib
import logging
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client, Client
from groq import Groq

from persona_extractor import extract_persona
from validation_playbook import select_playbooks

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')
GROQ_API_KEY = os.getenv('GROQ_API_KEY')

BRIEF_VERSION = 'brief-v1'
MODEL_NAME = 'llama-3.3-70b-versatile'


# ============================================================
# SUPABASE / CLIENT SETUP
# ============================================================

def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def get_groq_client():
    if not GROQ_API_KEY:
        return None
    return Groq(api_key=GROQ_API_KEY)


# ============================================================
# DATA LOADERS
# ============================================================

def get_latest_snapshot(supabase: Client) -> Optional[dict]:
    resp = supabase.table('trend_snapshots') \
        .select('id, run_at') \
        .order('run_at', desc=True) \
        .limit(1) \
        .execute()
    return resp.data[0] if resp.data else None


def get_qualified_opportunities(supabase: Client, snapshot_id: str) -> list[dict]:
    resp = supabase.table('trend_opportunities') \
        .select('id, trend_id, snapshot_id, opportunity_score, demand_hits, demand_examples, suggested_actions') \
        .eq('snapshot_id', snapshot_id) \
        .eq('qualified', True) \
        .execute()
    return resp.data or []


def get_trend_details(supabase: Client, trend_id: str) -> dict:
    resp = supabase.table('detected_trends') \
        .select('id, theme, concept_name, problem_statement, affected_persona, concept_category, concept_confidence') \
        .eq('id', trend_id) \
        .single() \
        .execute()
    return resp.data or {}


def get_opportunity_explanation(supabase: Client, opportunity_id: str) -> dict:
    resp = supabase.table('opportunity_explanations') \
        .select('why_this_trend, why_now, whats_the_risk') \
        .eq('opportunity_id', opportunity_id) \
        .limit(1) \
        .execute()
    return resp.data[0] if resp.data else {}


def get_trend_intelligence(supabase: Client, snapshot_id: str, trend_id: str) -> dict:
    resp = supabase.table('trend_intelligence') \
        .select('summary, build_ideas, existing_solutions, risks') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .limit(1) \
        .execute()
    return resp.data[0] if resp.data else {}


def get_hypothesis(supabase: Client, snapshot_id: str, trend_id: str) -> dict:
    resp = supabase.table('problem_hypotheses') \
        .select('hypothesis_title, who_it_affects, pain_signals, demand_evidence') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .limit(1) \
        .execute()
    return resp.data[0] if resp.data else {}


def get_snapshot_metrics(supabase: Client, snapshot_id: str, trend_id: str) -> dict:
    resp = supabase.table('trend_snapshot_items') \
        .select('momentum_score, signal_count, stability_score, volatility_label, negative_signal_ratio') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .limit(1) \
        .execute()
    return resp.data[0] if resp.data else {}


def get_competition_data(supabase: Client, snapshot_id: str, trend_id: str) -> dict:
    resp = supabase.table('trend_competitive_intelligence') \
        .select('''
            competition_level, saturation_score, confidence, entity_confidence,
            existing_solutions_count, open_source_repos, mentioned_tools,
            funding_mentions
        ''') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .limit(1) \
        .execute()
    return resp.data[0] if resp.data else {}


def get_top_signals(supabase: Client, snapshot_id: str, trend_id: str, limit: int = 15) -> list[dict]:
    sig_resp = supabase.table('trend_signals') \
        .select('signal_id') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .execute()

    if not sig_resp.data:
        return []

    signal_ids = [s['signal_id'] for s in sig_resp.data][:limit * 2]

    details_resp = supabase.table('raw_signals') \
        .select('id, title, url, source, score') \
        .in_('id', signal_ids) \
        .order('score', desc=True) \
        .limit(limit) \
        .execute()

    return details_resp.data or []


def get_existing_brief(supabase: Client, snapshot_id: str, trend_id: str) -> Optional[dict]:
    resp = supabase.table('opportunity_briefs') \
        .select('id, evidence_hash') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .limit(1) \
        .execute()
    return resp.data[0] if resp.data else None


# ============================================================
# EVIDENCE HASHING
# ============================================================

def compute_evidence_hash(signals: list[dict], build_ideas) -> str:
    canonical_signals = sorted(
        [{'url': s.get('url', ''), 'title': s.get('title', '')} for s in signals[:10]],
        key=lambda x: x['url'] or x['title']
    )
    ideas_raw = build_ideas if isinstance(build_ideas, list) else []
    canonical_ideas = [str(i.get('idea', '')) for i in ideas_raw[:3]]

    hash_input = {'signals': canonical_signals, 'ideas': canonical_ideas}
    return hashlib.sha256(json.dumps(hash_input, sort_keys=True).encode()).hexdigest()[:16]


# ============================================================
# SECTION BUILDERS
# ============================================================

def _parse_json_field(value, fallback):
    if value is None:
        return fallback
    if isinstance(value, (list, dict)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, ValueError):
            return fallback
    return fallback


def build_section_a(explanation: dict, signals: list[dict]) -> tuple[str, list[dict]]:
    """Section A: What Is Happening — existing why_this_trend + top 3 signal citations."""
    synthesis = explanation.get('why_this_trend') or ''

    # Top 3 citations by score
    citations = []
    for s in signals[:3]:
        if s.get('title'):
            citations.append({
                'title': s['title'][:150],
                'url': s.get('url') or '',
                'source': s.get('source', 'unknown'),
            })

    return synthesis, citations


def build_section_b(
    signals: list[dict],
    trend: dict,
    hypothesis: dict,
    groq_client,
) -> tuple[dict, Optional[str]]:
    """Section B: Who Is Feeling This — persona extraction."""
    concept_name = trend.get('concept_name') or trend.get('theme') or ''
    problem_statement = trend.get('problem_statement') or ''
    existing_persona = _parse_json_field(trend.get('affected_persona'), [])
    who_it_affects = _parse_json_field(hypothesis.get('who_it_affects'), [])
    pain_signals = _parse_json_field(hypothesis.get('pain_signals'), [])

    persona = extract_persona(
        signals=signals,
        concept_name=concept_name,
        problem_statement=problem_statement,
        existing_persona=existing_persona,
        who_it_affects=who_it_affects,
        pain_signals=pain_signals,
        groq_client=groq_client,
    )

    llm_prompt = persona.pop('llm_prompt', None)
    return persona, llm_prompt


def build_section_c(intelligence: dict, opportunity: dict) -> list[dict]:
    """Section C: What Could Be Built — build ideas from trend_intelligence."""
    build_ideas = _parse_json_field(intelligence.get('build_ideas'), [])

    hypotheses = []
    for idea in build_ideas[:5]:
        if isinstance(idea, dict) and idea.get('idea'):
            hypotheses.append({
                'idea': str(idea.get('idea', ''))[:200],
                'effort': str(idea.get('effort', ''))[:30],
                'audience': str(idea.get('audience', ''))[:150],
            })

    # Supplement with suggested_actions from opportunity if needed
    if len(hypotheses) < 2:
        suggested = _parse_json_field(opportunity.get('suggested_actions'), [])
        for action in suggested:
            if isinstance(action, str) and action.strip():
                hypotheses.append({
                    'idea': action[:200],
                    'effort': '',
                    'audience': '',
                })
                if len(hypotheses) >= 3:
                    break

    return hypotheses[:5]


def build_section_d(competition: dict) -> tuple[str, list, list, list, list, str]:
    """Section D: Are Startups Already Doing This? — deterministic from Phase 2 entities."""
    level = competition.get('competition_level', 'uncertain')
    entity_conf = competition.get('entity_confidence', 'low') or 'low'

    repos_raw = _parse_json_field(competition.get('open_source_repos'), [])
    tools_raw = _parse_json_field(competition.get('mentioned_tools'), [])
    funding_raw = _parse_json_field(competition.get('funding_mentions'), [])

    repos = [{'name': r} for r in repos_raw[:10] if r]
    tools = [{'name': t} for t in tools_raw[:8] if t]
    funding = [str(f)[:120] for f in funding_raw[:3] if f]

    # Build narrative
    parts = []

    if level == 'high':
        parts.append(f'This space appears crowded (saturation score: {competition.get("saturation_score", 0):.0%}).')
    elif level == 'moderate':
        parts.append('There is moderate competition in this space.')
    elif level == 'low':
        parts.append('Competition appears limited based on available signals.')
    else:
        parts.append('Competition level is uncertain — insufficient data to assess.')

    if repos:
        repo_names = ', '.join(r['name'] for r in repos[:5])
        parts.append(f'Open-source activity detected: {repo_names}.')

    if tools:
        tool_names = ', '.join(t['name'] for t in tools[:5])
        parts.append(f'Tools or products mentioned: {tool_names}.')

    if funding:
        parts.append(f'Funding signals detected: {funding[0][:80]}.')

    if not repos and not tools and not funding:
        parts.append('No direct evidence of startups or tools was found in the signals.')

    parts.append('This may be incomplete — startups could exist without prominent online traces.')

    narrative = ' '.join(parts)

    return narrative, [], repos, tools, funding, entity_conf


def build_section_e(
    concept_name: str,
    category: str,
    persona: dict,
    competition: dict,
) -> list[dict]:
    """Section E: How to Validate — rule-based playbook selection."""
    persona_level = persona.get('level', 'intermediate')
    competition_level = competition.get('competition_level', 'uncertain')

    playbooks = select_playbooks(
        concept_name=concept_name,
        category=category,
        persona_level=persona_level,
        competition_level=competition_level,
        n=3,
    )
    return playbooks


def build_section_f(
    explanation: dict,
    intelligence: dict,
    metrics: dict,
) -> tuple[str, list[dict]]:
    """Section F: Risk & Honesty — existing whats_the_risk + Phase 2 additions."""
    base_risk = explanation.get('whats_the_risk') or ''

    # Append Phase 2 signals
    additions = []
    volatility = metrics.get('volatility_label', '')
    if volatility == 'volatile':
        additions.append('Signal momentum has been volatile — trend may not sustain.')

    neg_ratio = metrics.get('negative_signal_ratio') or 0
    if neg_ratio > 0.15:
        pct = int(neg_ratio * 100)
        additions.append(f'{pct}% of signals contain negative sentiment — validate carefully.')

    risk_narrative = base_risk
    if additions:
        risk_narrative = (risk_narrative + ' ' + ' '.join(additions)).strip()

    # Structured risk factors from trend_intelligence
    raw_risks = intelligence.get('risks') or []
    risk_factors = []
    for r in raw_risks[:4]:
        if isinstance(r, str) and r.strip():
            risk_factors.append({
                'label': r.strip()[:100],
                'severity': 'medium',
                'description': r.strip()[:200],
            })

    return risk_narrative, risk_factors


# ============================================================
# COMPLETENESS SCORING
# ============================================================

def compute_completeness(
    synthesis: str,
    persona: dict,
    hypotheses: list,
    competition_narrative: str,
    validation: list,
    risk_narrative: str,
) -> tuple[float, bool]:
    filled = sum([
        bool(synthesis and len(synthesis) > 20),
        bool(persona.get('roles')),
        bool(hypotheses),
        bool(competition_narrative and len(competition_narrative) > 20),
        bool(validation),
        bool(risk_narrative and len(risk_narrative) > 20),
    ])
    score = filled / 6.0
    is_draft = score < 0.5
    return round(score, 3), is_draft


# ============================================================
# MAIN BRIEF GENERATION
# ============================================================

def generate_opportunity_brief(
    supabase: Client,
    snapshot_id: str,
    opportunity: dict,
    groq_client,
) -> Optional[dict]:
    """
    Generate all 6 sections for a qualified opportunity.
    Returns a dict ready for upsert into opportunity_briefs, or None on failure.
    """
    trend_id = opportunity['trend_id']
    opportunity_id = opportunity['id']

    # Load all source data
    trend = get_trend_details(supabase, trend_id)
    if not trend:
        logger.warning(f'No trend found for {trend_id}')
        return None

    explanation = get_opportunity_explanation(supabase, opportunity_id)
    intelligence = get_trend_intelligence(supabase, snapshot_id, trend_id)
    hypothesis = get_hypothesis(supabase, snapshot_id, trend_id)
    metrics = get_snapshot_metrics(supabase, snapshot_id, trend_id)
    competition = get_competition_data(supabase, snapshot_id, trend_id)
    signals = get_top_signals(supabase, snapshot_id, trend_id)

    # Evidence hash → skip if unchanged
    build_ideas = _parse_json_field(intelligence.get('build_ideas'), [])
    evidence_hash = compute_evidence_hash(signals, build_ideas)

    existing = get_existing_brief(supabase, snapshot_id, trend_id)
    if existing and existing.get('evidence_hash') == evidence_hash:
        logger.info(f'Brief unchanged for trend {trend_id}, skipping')
        return None

    # Section A
    synthesis, citations = build_section_a(explanation, signals)

    # Section B
    persona, persona_llm_prompt = build_section_b(signals, trend, hypothesis, groq_client)

    # Section C
    hypotheses = build_section_c(intelligence, opportunity)

    # Section D
    (competition_narrative, startups, repos, tools, funding, entity_conf) = build_section_d(competition)

    # Section E
    concept_name = trend.get('concept_name') or trend.get('theme') or ''
    category = trend.get('concept_category') or 'other'
    validation_experiments = build_section_e(concept_name, category, persona, competition)

    # Section F
    risk_narrative, risk_factors = build_section_f(explanation, intelligence, metrics)

    # Completeness
    completeness_score, is_draft = compute_completeness(
        synthesis, persona, hypotheses,
        competition_narrative, validation_experiments, risk_narrative
    )

    # Auditability
    llm_prompts = {}
    if persona_llm_prompt:
        llm_prompts['persona'] = persona_llm_prompt[:2000]

    return {
        'opportunity_id': opportunity_id,
        'snapshot_id': snapshot_id,
        'trend_id': trend_id,
        'brief_version': BRIEF_VERSION,

        # Section A
        'synthesis': synthesis,
        'synthesis_citations': json.dumps(citations),

        # Section B
        'persona_roles': persona.get('roles', []),
        'persona_level': persona.get('level', 'intermediate'),
        'persona_domain': persona.get('domain', 'other'),
        'persona_pain_points': json.dumps(persona.get('pain_points', [])),
        'persona_confidence': persona.get('confidence', 0.4),

        # Section C
        'hypotheses': json.dumps(hypotheses),

        # Section D
        'competition_narrative': competition_narrative,
        'competition_startups': json.dumps(startups),
        'competition_repos': json.dumps(repos),
        'competition_tools': json.dumps(tools),
        'competition_funding': json.dumps(funding),
        'competition_confidence': entity_conf,

        # Section E
        'validation_experiments': json.dumps(validation_experiments),

        # Section F
        'risk_narrative': risk_narrative,
        'risk_factors': json.dumps(risk_factors),
        'stability_label': metrics.get('volatility_label') or '',
        'negative_signal_ratio': metrics.get('negative_signal_ratio'),

        # Quality
        'completeness_score': completeness_score,
        'is_draft': is_draft,

        # Auditability
        'llm_prompts': json.dumps(llm_prompts) if llm_prompts else None,
        'evidence_hash': evidence_hash,
        'model_used': MODEL_NAME,
    }


def save_brief(supabase: Client, brief: dict) -> bool:
    try:
        supabase.table('opportunity_briefs') \
            .upsert(brief, on_conflict='snapshot_id,trend_id') \
            .execute()
        return True
    except Exception as e:
        logger.error(f"Error saving brief for trend {brief.get('trend_id')}: {e}")
        return False


# ============================================================
# MAIN RUNNER
# ============================================================

def run_brief_generation(snapshot_id: str = None) -> dict:
    supabase = get_supabase()
    groq_client = get_groq_client()

    logger.info('=' * 60)
    logger.info('OPPORTUNITY BRIEF GENERATION')
    logger.info(f'Brief version: {BRIEF_VERSION}')
    logger.info('=' * 60)

    if not snapshot_id:
        snapshot = get_latest_snapshot(supabase)
        if not snapshot:
            logger.error('No snapshot found')
            return {'generated': 0, 'unchanged': 0, 'failed': 0, 'total': 0}
        snapshot_id = snapshot['id']
        logger.info(f'Using snapshot: {snapshot_id}')

    opportunities = get_qualified_opportunities(supabase, snapshot_id)
    logger.info(f'Found {len(opportunities)} qualified opportunities')

    if not opportunities:
        return {'generated': 0, 'unchanged': 0, 'failed': 0, 'total': 0}

    generated = 0
    unchanged = 0
    failed = 0

    for opp in opportunities:
        trend_id = opp['trend_id']
        try:
            brief = generate_opportunity_brief(supabase, snapshot_id, opp, groq_client)

            if brief is None:
                unchanged += 1
                continue

            if save_brief(supabase, brief):
                generated += 1
                status = 'draft' if brief['is_draft'] else 'complete'
                logger.info(
                    f"  ✓ trend={trend_id[:8]} "
                    f"completeness={brief['completeness_score']:.0%} "
                    f"status={status} "
                    f"persona={brief['persona_level']}"
                )
            else:
                failed += 1
        except Exception as e:
            logger.error(f'Failed to generate brief for trend {trend_id}: {e}')
            failed += 1

    logger.info('=' * 60)
    logger.info('RESULTS')
    logger.info(f'Generated: {generated}')
    logger.info(f'Unchanged: {unchanged}')
    logger.info(f'Failed:    {failed}')
    logger.info(f'Total:     {len(opportunities)}')

    return {
        'generated': generated,
        'unchanged': unchanged,
        'failed': failed,
        'total': len(opportunities),
        'snapshot_id': snapshot_id,
    }


if __name__ == '__main__':
    stats = run_brief_generation()
    print(f'\n=== Brief Generation Results ===')
    print(f'Generated: {stats["generated"]}')
    print(f'Unchanged: {stats["unchanged"]}')
    print(f'Failed:    {stats["failed"]}')
    print(f'Total:     {stats["total"]}')

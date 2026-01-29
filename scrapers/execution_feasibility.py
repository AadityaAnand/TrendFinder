"""
Phase 10: Execution Feasibility & Moat Reality Check

Answers: "Can I actually execute this, and is there a defensible path to win?"

This module NEVER hides opportunities. It annotates with execution truth.
It NEVER ranks or reorders. It adds context.

Non-goals (documented):
- No guarantees of success
- No financial advice claims
- No suppression of uncomfortable truths
- No ranking manipulation via feasibility
"""

import os
import re
import logging
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

EXECUTION_VERSION = 'exec-v1'

# ============================================================
# KEYWORD MAPS FOR DETERMINISTIC CLASSIFICATION
# ============================================================

EXECUTION_TYPE_KEYWORDS = {
    'saas': ['saas', 'subscription', 'dashboard', 'portal', 'platform', 'app'],
    'infra': ['infrastructure', 'hosting', 'server', 'cluster', 'deploy', 'pipeline', 'kubernetes', 'docker'],
    'content': ['content', 'blog', 'newsletter', 'course', 'tutorial', 'education', 'media'],
    'marketplace': ['marketplace', 'two-sided', 'matching', 'listing', 'vendor', 'supplier'],
    'developer_tool': ['cli', 'sdk', 'library', 'framework', 'devtool', 'ide', 'linter', 'debugger'],
    'integration': ['plugin', 'extension', 'connector', 'integration', 'middleware', 'adapter'],
    'api_service': ['api', 'endpoint', 'service', 'webhook', 'rest', 'graphql'],
}

SALES_MOTION_KEYWORDS = {
    'self_serve': ['self-serve', 'self serve', 'freemium', 'free tier', 'sign up', 'try free'],
    'community_led': ['open source', 'community', 'contributor', 'github', 'discord'],
    'content_led': ['blog', 'seo', 'content marketing', 'newsletter', 'inbound'],
    'outbound': ['sales team', 'outbound', 'cold email', 'demo', 'sales call'],
    'enterprise': ['enterprise', 'procurement', 'soc2', 'compliance', 'annual contract'],
}

MOAT_KEYWORDS = {
    'data_moat': ['data flywheel', 'user data', 'training data', 'proprietary data', 'data advantage',
                  'network effect', 'more users', 'data accumulation'],
    'workflow_lock_in': ['daily use', 'workflow', 'embedded', 'habit', 'integrated into',
                         'switching cost', 'migration pain'],
    'distribution_moat': ['audience', 'community', 'followers', 'channel', 'distribution',
                          'viral', 'word of mouth', 'referral'],
    'speed_wedge': ['first mover', 'early', 'before anyone', 'head start', 'timing advantage'],
    'regulatory_moat': ['regulated', 'license', 'compliance', 'certification', 'approved',
                        'hipaa', 'soc2', 'gdpr', 'fedramp'],
}

RISK_KEYWORDS = {
    'winner_take_most_market': ['winner take all', 'network effects', 'platform lock-in', 'monopoly'],
    'enterprise_sales_required': ['enterprise sales', 'long sales cycle', 'procurement', 'annual contract'],
    'infra_heavy': ['infrastructure', 'ops burden', 'devops', 'scaling', 'high availability', 'self-hosted'],
    'low_switching_costs': ['easy to switch', 'commodity', 'no lock-in', 'interchangeable'],
    'crowded_with_funding': ['well-funded', 'series', 'raised', 'backed by', 'venture'],
    'requires_distribution_edge': ['go-to-market', 'distribution', 'acquisition channel', 'marketing spend'],
    'regulatory_uncertainty': ['regulation', 'legal uncertainty', 'pending legislation', 'compliance risk'],
}

INFRA_KEYWORDS = {
    'free_tier': ['static site', 'serverless', 'edge function', 'vercel', 'netlify', 'cloudflare'],
    'hobby': ['small vps', 'single server', 'sqlite', 'minimal infra'],
    'startup': ['database', 'redis', 'queue', 'worker', 'cron', 's3', 'cdn'],
    'growth': ['kubernetes', 'auto-scaling', 'multi-region', 'elasticsearch', 'data pipeline'],
    'enterprise': ['dedicated cluster', 'sla', 'multi-tenant', 'data warehouse', 'ml training'],
}

_supabase: Optional[Client] = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase


# ============================================================
# TEXT CLASSIFICATION HELPERS
# ============================================================

def _classify_from_keywords(corpus: str, keyword_map: dict) -> list[tuple[str, int]]:
    """Score each category by keyword hit count. Returns sorted (category, count)."""
    scores = []
    for category, keywords in keyword_map.items():
        count = sum(1 for kw in keywords if kw.lower() in corpus)
        if count > 0:
            scores.append((category, count))
    scores.sort(key=lambda x: x[1], reverse=True)
    return scores


def _build_opportunity_corpus(opportunity: dict, trend: dict, signals: list[dict]) -> str:
    """Build text corpus from opportunity + trend + signals."""
    parts = []
    for field in ['action_title', 'why_now', 'suggested_actions']:
        val = opportunity.get(field)
        if isinstance(val, str):
            parts.append(val)
        elif isinstance(val, list):
            parts.extend(str(v) for v in val)
    if trend.get('theme'):
        parts.append(trend['theme'])
    if trend.get('description'):
        parts.append(trend['description'])
    for s in signals[:20]:
        if s.get('title'):
            parts.append(s['title'])
    return ' '.join(parts).lower()


# ============================================================
# 10.2: EXECUTION REQUIREMENTS
# ============================================================

def estimate_execution_requirements(
    opportunity: dict,
    trend: dict,
    signals: list[dict],
    competition_level: str = 'uncertain'
) -> dict:
    """
    Estimate execution requirements deterministically.
    Biases toward underestimation warnings, not false optimism.
    """
    corpus = _build_opportunity_corpus(opportunity, trend, signals)

    # Classify execution type
    type_scores = _classify_from_keywords(corpus, EXECUTION_TYPE_KEYWORDS)
    execution_type = type_scores[0][0] if type_scores else 'saas'

    # Classify sales motion
    sales_scores = _classify_from_keywords(corpus, SALES_MOTION_KEYWORDS)
    sales_motion = sales_scores[0][0] if sales_scores else 'self_serve'

    # Classify infra cost
    infra_scores = _classify_from_keywords(corpus, INFRA_KEYWORDS)
    infra_cost = infra_scores[0][0] if infra_scores else 'hobby'

    # Estimate build time ranges by execution type
    build_ranges = {
        'developer_tool': (1, 4),
        'api_service': (2, 6),
        'integration': (1, 3),
        'content': (1, 4),
        'saas': (4, 12),
        'marketplace': (6, 16),
        'infra': (8, 24),
    }
    build_min, build_max = build_ranges.get(execution_type, (4, 12))

    # Adjust for competition (crowded = need more polish)
    if competition_level == 'high':
        build_min = int(build_min * 1.5)
        build_max = int(build_max * 1.5)

    # Maintenance level
    maintenance_map = {
        'developer_tool': 'low',
        'api_service': 'medium',
        'integration': 'low',
        'content': 'low',
        'saas': 'medium',
        'marketplace': 'high',
        'infra': 'high',
    }
    maintenance = maintenance_map.get(execution_type, 'medium')

    # Operational complexity (1-5)
    complexity_map = {
        'developer_tool': 2, 'api_service': 3, 'integration': 2,
        'content': 1, 'saas': 3, 'marketplace': 4, 'infra': 5,
    }
    complexity = complexity_map.get(execution_type, 3)

    # Required team size
    team_map = {
        'developer_tool': (1, 1), 'api_service': (1, 2), 'integration': (1, 1),
        'content': (1, 1), 'saas': (1, 3), 'marketplace': (2, 5), 'infra': (2, 5),
    }
    team_min, team_max = team_map.get(execution_type, (1, 3))

    if sales_motion == 'enterprise':
        team_min = max(team_min, 2)
        team_max = max(team_max, 4)

    # Required stack (from trend signals)
    required_stack = _extract_required_stack(corpus)

    # Estimation confidence
    signal_count = len(signals)
    if signal_count >= 10:
        confidence = 'medium'
    elif signal_count >= 5:
        confidence = 'low'
    else:
        confidence = 'low'

    return {
        'build_weeks_min': build_min,
        'build_weeks_max': build_max,
        'maintenance_level': maintenance,
        'operational_complexity': complexity,
        'infra_cost_bucket': infra_cost,
        'execution_type': execution_type,
        'sales_motion': sales_motion,
        'required_stack': required_stack,
        'required_team_size_min': team_min,
        'required_team_size_max': team_max,
        'estimation_confidence': confidence,
        'estimation_notes': f"Based on {signal_count} signals. Ranges are estimates, not commitments."
    }


def _extract_required_stack(corpus: str) -> list[str]:
    """Extract required tech stack from corpus."""
    tech_patterns = {
        'python': r'\bpython\b', 'typescript': r'\btypescript\b',
        'javascript': r'\bjavascript\b', 'react': r'\breact\b',
        'node': r'\bnode(?:js)?\b', 'rust': r'\brust\b',
        'go': r'\bgolang\b|\bgo\s', 'postgres': r'\bpostgres',
        'redis': r'\bredis\b', 'docker': r'\bdocker\b',
        'kubernetes': r'\bkubernetes\b|\bk8s\b',
        'aws': r'\baws\b', 'gcp': r'\bgcp\b',
    }
    found = []
    for tech, pattern in tech_patterns.items():
        if re.search(pattern, corpus, re.IGNORECASE):
            found.append(tech)
    return found


# ============================================================
# 10.3: MOAT CLASSIFICATION
# ============================================================

def classify_moat(corpus: str, competition_level: str) -> dict:
    """
    Classify moat types deterministically.
    Default is 'none_yet' — moats must be earned.
    """
    moat_scores = _classify_from_keywords(corpus, MOAT_KEYWORDS)

    moat_types = [m[0] for m in moat_scores]

    if not moat_types:
        moat_types = ['none_yet']

    # Moat strength
    if len(moat_scores) >= 2 and moat_scores[0][1] >= 3:
        strength = 'strong'
    elif len(moat_scores) >= 1 and moat_scores[0][1] >= 2:
        strength = 'moderate'
    elif moat_types == ['speed_wedge']:
        strength = 'temporary'
    elif moat_types == ['none_yet']:
        strength = 'none'
    else:
        strength = 'weak'

    # Moat risk
    if strength == 'none':
        risk = 'No defensibility detected — easily replicated'
    elif strength == 'temporary':
        risk = 'Timing advantage only — will erode without additional moats'
    elif competition_level == 'high':
        risk = 'Moat signals present but competition is high — execution speed critical'
    else:
        risk = 'Defensibility signals present'

    evidence = {}
    for mtype, count in moat_scores:
        evidence[mtype] = f"{count} keyword matches"

    return {
        'moat_types': moat_types[:3],  # Max 3
        'moat_strength': strength,
        'moat_risk': risk,
        'moat_evidence': evidence
    }


# ============================================================
# 10.4: EXECUTION RISK FLAGS
# ============================================================

def detect_risk_flags(
    corpus: str,
    requirements: dict,
    competition_level: str,
    moat: dict
) -> list[str]:
    """
    Detect hard execution risk flags.
    No soft language — these are clear warnings.
    """
    flags = []

    # Keyword-based risks
    for flag, keywords in RISK_KEYWORDS.items():
        if any(kw.lower() in corpus for kw in keywords):
            flags.append(flag)

    # Derived risks
    if requirements.get('sales_motion') == 'enterprise':
        if 'enterprise_sales_required' not in flags:
            flags.append('enterprise_sales_required')

    if requirements.get('operational_complexity', 0) >= 4:
        if 'infra_heavy' not in flags:
            flags.append('infra_heavy')

    if competition_level == 'high' and moat.get('moat_strength') in ['none', 'weak']:
        flags.append('crowded_with_funding')

    if moat.get('moat_strength') in ['none', 'temporary']:
        if 'low_switching_costs' not in flags:
            flags.append('low_switching_costs')

    if requirements.get('sales_motion') in ['outbound', 'enterprise']:
        if 'requires_distribution_edge' not in flags:
            flags.append('requires_distribution_edge')

    return list(set(flags))  # Deduplicate


# ============================================================
# 10.5: EXECUTION ARCHETYPES
# ============================================================

def classify_archetype(requirements: dict, moat: dict, risk_flags: list[str]) -> str:
    """
    Deterministic mapping from feasibility + moat + risk → archetype.
    """
    team_max = requirements.get('required_team_size_max', 1)
    build_max = requirements.get('build_weeks_max', 4)
    exec_type = requirements.get('execution_type', 'saas')
    sales = requirements.get('sales_motion', 'self_serve')

    # VC-Scale Only: enterprise sales + large team + high infra
    if sales == 'enterprise' and team_max >= 4:
        return 'vc_scale_only'

    # Infra Play: infra type + high complexity
    if exec_type == 'infra' or requirements.get('operational_complexity', 0) >= 4:
        return 'infra_play'

    # Distribution Game: content/marketplace + distribution moat needed
    if exec_type in ['marketplace', 'content'] or 'requires_distribution_edge' in risk_flags:
        if team_max <= 2:
            return 'distribution_game'

    # Team Required: 3+ people needed
    if team_max >= 3:
        return 'team_required'

    # Solo Feasible MVP: 1 person, short build
    if team_max == 1 and build_max <= 6:
        return 'solo_feasible_mvp'

    # Indie SaaS Bet: 1-2 people, moderate build
    if team_max <= 2:
        return 'indie_saas_bet'

    return 'indie_saas_bet'  # Default


# ============================================================
# 10.1: FEASIBILITY SCORING
# ============================================================

def compute_feasibility(
    user_preferences: dict,
    requirements: dict,
    moat: dict,
    risk_flags: list[str]
) -> dict:
    """
    Compute per-user execution feasibility.
    Never hides opportunities — only annotates.
    """
    blocking_factors = []

    # Team fit
    user_team = user_preferences.get('team_size', 'solo')
    team_sizes = {'solo': 1, 'small': 3, 'company': 10}
    user_team_size = team_sizes.get(user_team, 1)
    required_min = requirements.get('required_team_size_min', 1)

    if user_team_size >= required_min:
        team_fit = 1.0
    elif user_team_size >= required_min - 1:
        team_fit = 0.6
        blocking_factors.append(f"team_size_tight ({user_team} vs need {required_min}+)")
    else:
        team_fit = 0.2
        blocking_factors.append(f"team_too_small ({user_team} vs need {required_min}+)")

    # Time fit
    user_horizon = user_preferences.get('time_horizon', 'flexible')
    horizon_weeks = {'weekend': 1, '1-2_weeks': 2, '1-3_months': 12, 'flexible': 52}
    user_weeks = horizon_weeks.get(user_horizon, 12)
    build_min = requirements.get('build_weeks_min', 4)

    if user_weeks >= build_min:
        time_fit = min(1.0, user_weeks / max(build_min, 1))
    else:
        time_fit = max(0.1, user_weeks / max(build_min, 1))
        blocking_factors.append(f"time_too_short ({user_horizon} vs {build_min}+ weeks)")

    # Skill coverage
    user_stack = set(s.lower() for s in user_preferences.get('tech_stack', []))
    required_stack = set(s.lower() for s in requirements.get('required_stack', []))

    if not required_stack:
        skill_coverage = 0.7  # No specific requirements
    elif not user_stack:
        skill_coverage = 0.5  # Unknown user stack
    else:
        overlap = len(user_stack & required_stack)
        skill_coverage = overlap / len(required_stack) if required_stack else 0.7
        if skill_coverage < 0.5:
            missing = required_stack - user_stack
            blocking_factors.append(f"skill_gap (missing: {', '.join(list(missing)[:3])})")

    # Execution type fit (some types harder for certain profiles)
    exec_type = requirements.get('execution_type', 'saas')
    exec_type_fit = 0.7  # Default moderate
    if exec_type in ['developer_tool', 'integration', 'api_service'] and user_team == 'solo':
        exec_type_fit = 0.9  # Solo-friendly
    elif exec_type in ['marketplace', 'infra'] and user_team == 'solo':
        exec_type_fit = 0.3
        blocking_factors.append(f"{exec_type}_hard_for_solo")

    # Sales motion fit
    sales = requirements.get('sales_motion', 'self_serve')
    user_roles = [r.lower() for r in user_preferences.get('target_roles', [])]
    sales_fit = 0.7
    if sales in ['self_serve', 'community_led']:
        sales_fit = 0.9
    elif sales == 'outbound' and 'founder' not in user_roles:
        sales_fit = 0.3
        blocking_factors.append('outbound_sales_required')
    elif sales == 'enterprise':
        sales_fit = 0.2
        blocking_factors.append('enterprise_sales_required')

    # Infra load fit
    infra_cost = requirements.get('infra_cost_bucket', 'hobby')
    infra_fit_map = {'free_tier': 1.0, 'hobby': 0.9, 'startup': 0.7, 'growth': 0.4, 'enterprise': 0.2}
    infra_fit = infra_fit_map.get(infra_cost, 0.5)
    if infra_cost in ['growth', 'enterprise']:
        blocking_factors.append(f"high_infra_cost ({infra_cost})")

    # Composite score (weighted)
    feasibility_score = (
        0.20 * team_fit +
        0.20 * time_fit +
        0.20 * skill_coverage +
        0.15 * exec_type_fit +
        0.15 * sales_fit +
        0.10 * infra_fit
    )

    # Generate summary
    fit_summary = _generate_fit_summary(feasibility_score, blocking_factors, requirements)

    return {
        'feasibility_score': round(feasibility_score, 3),
        'team_fit': round(team_fit, 3),
        'time_fit': round(time_fit, 3),
        'skill_coverage': round(skill_coverage, 3),
        'execution_type_fit': round(exec_type_fit, 3),
        'sales_motion_fit': round(sales_fit, 3),
        'infra_load_fit': round(infra_fit, 3),
        'blocking_factors': blocking_factors,
        'fit_summary': fit_summary
    }


def _generate_fit_summary(score: float, blockers: list[str], requirements: dict) -> str:
    """Generate honest fit summary."""
    exec_type = requirements.get('execution_type', 'saas')
    sales = requirements.get('sales_motion', 'self_serve')

    if score >= 0.8 and not blockers:
        return f"Strong execution fit for {exec_type}"
    elif score >= 0.6:
        qualifier = f" ({sales} motion)" if sales not in ['self_serve', 'community_led'] else ""
        return f"Technically feasible{qualifier} with manageable gaps"
    elif score >= 0.4:
        return f"Feasible but challenging — {len(blockers)} blocking factor(s)"
    else:
        return f"Significant execution gaps — {len(blockers)} blocking factor(s)"


# ============================================================
# 10.6: VERDICT DERIVATION
# ============================================================

def derive_verdict(
    feasibility: dict,
    moat: dict,
    risk_flags: list[str],
    archetype: str,
    timing_label: str = 'timing_uncertain',
    competition_level: str = 'uncertain'
) -> dict:
    """
    Derive execution verdict from all inputs.
    Verdict is DERIVED, not generated. Must cite reasons.
    Never binary (yes/no) — always nuanced.
    """
    score = feasibility['feasibility_score']
    blockers = feasibility.get('blocking_factors', [])
    moat_strength = moat.get('moat_strength', 'none')
    reasons = []

    # Strong Fit: high feasibility + no critical risks + good timing
    if score >= 0.7 and len(risk_flags) <= 1 and len(blockers) == 0:
        if timing_label in ['early_edge']:
            verdict = 'strong_fit'
            reasons.append('High execution feasibility')
            reasons.append('Favorable timing window')
            if moat_strength in ['strong', 'moderate']:
                reasons.append(f'Defensible: {moat_strength} moat signals')
        else:
            verdict = 'conditional_fit'
            reasons.append('Good execution fit')
            reasons.append(f'Timing: {timing_label}')
    # Conditional Fit: moderate feasibility or some blockers
    elif score >= 0.5 and len(blockers) <= 2:
        verdict = 'conditional_fit'
        reasons.append(f'Feasibility: {score:.0%}')
        for b in blockers[:2]:
            reasons.append(f'Caveat: {b}')
        if moat_strength in ['none', 'weak']:
            reasons.append('No clear defensibility yet')
    # High Risk: possible but dangerous
    elif score >= 0.3 or (score >= 0.5 and len(risk_flags) >= 3):
        verdict = 'high_risk'
        reasons.append(f'Feasibility: {score:.0%}')
        reasons.append(f'{len(risk_flags)} risk flags')
        for rf in risk_flags[:2]:
            reasons.append(f'Risk: {rf.replace("_", " ")}')
    # Execution Mismatch: don't attempt
    else:
        verdict = 'execution_mismatch'
        reasons.append(f'Low feasibility: {score:.0%}')
        reasons.append(f'{len(blockers)} blocking factors')
        for b in blockers[:3]:
            reasons.append(f'Blocker: {b}')

    # Override: competition high + no moat = high risk minimum
    if competition_level == 'high' and moat_strength in ['none', 'weak']:
        if verdict == 'strong_fit':
            verdict = 'conditional_fit'
            reasons.append('High competition with no defensibility — proceed with caution')
        elif verdict == 'conditional_fit' and score < 0.6:
            verdict = 'high_risk'
            reasons.append('High competition compounds execution risk')

    return {
        'verdict': verdict,
        'verdict_reasons': reasons,
        'archetype': archetype,
        'risk_flags': risk_flags
    }


# ============================================================
# MAIN COMPUTATION
# ============================================================

def compute_execution_analysis(
    user_id: str,
    opportunity_id: str,
    snapshot_id: str
) -> dict:
    """
    Full execution feasibility analysis for a user × opportunity.
    """
    supabase = get_supabase()

    # Fetch opportunity
    opp_response = supabase.table('trend_opportunities') \
        .select('*, detected_trends(id, theme, description)') \
        .eq('id', opportunity_id) \
        .single() \
        .execute()

    opportunity = opp_response.data or {}
    trend = opportunity.get('detected_trends', {}) or {}
    trend_id = opportunity.get('trend_id')

    # Fetch signals
    signals_response = supabase.table('trend_signals') \
        .select('title, summary, source') \
        .eq('trend_id', trend_id) \
        .limit(30) \
        .execute()

    signals = signals_response.data or []

    # Fetch user preferences
    prefs_response = supabase.table('user_preferences') \
        .select('*') \
        .eq('user_id', user_id) \
        .single() \
        .execute()

    preferences = prefs_response.data or {}

    # Fetch competition level
    comp_response = supabase.table('trend_competitive_intelligence') \
        .select('competition_level') \
        .eq('trend_id', trend_id) \
        .eq('snapshot_id', snapshot_id) \
        .single() \
        .execute()

    competition_level = (comp_response.data or {}).get('competition_level', 'uncertain')

    # Fetch timing
    timing_response = supabase.table('trend_timing_signals') \
        .select('timing_label') \
        .eq('trend_id', trend_id) \
        .eq('snapshot_id', snapshot_id) \
        .single() \
        .execute()

    timing_label = (timing_response.data or {}).get('timing_label', 'timing_uncertain')

    corpus = _build_opportunity_corpus(opportunity, trend, signals)

    # 10.2: Requirements
    requirements = estimate_execution_requirements(opportunity, trend, signals, competition_level)

    # Store requirements
    req_record = {
        'opportunity_id': opportunity_id,
        'snapshot_id': snapshot_id,
        **requirements,
        'model_version': EXECUTION_VERSION
    }
    supabase.table('execution_requirements') \
        .upsert(req_record, on_conflict='opportunity_id,snapshot_id') \
        .execute()

    # 10.3: Moat
    moat = classify_moat(corpus, competition_level)

    moat_record = {
        'opportunity_id': opportunity_id,
        'snapshot_id': snapshot_id,
        'moat_types': moat['moat_types'],
        'moat_strength': moat['moat_strength'],
        'moat_risk': moat['moat_risk'],
        'moat_evidence': moat['moat_evidence'],
        'model_version': EXECUTION_VERSION
    }
    supabase.table('opportunity_moats') \
        .upsert(moat_record, on_conflict='opportunity_id,snapshot_id') \
        .execute()

    # 10.4: Risk flags
    risk_flags = detect_risk_flags(corpus, requirements, competition_level, moat)

    # 10.5: Archetype
    archetype = classify_archetype(requirements, moat, risk_flags)

    # 10.1: Feasibility (user-specific)
    feasibility = compute_feasibility(preferences, requirements, moat, risk_flags)

    feas_record = {
        'user_id': user_id,
        'opportunity_id': opportunity_id,
        'snapshot_id': snapshot_id,
        **feasibility,
        'inputs_used': {
            'team_size': preferences.get('team_size'),
            'time_horizon': preferences.get('time_horizon'),
            'tech_stack': preferences.get('tech_stack', []),
            'target_roles': preferences.get('target_roles', [])
        },
        'model_version': EXECUTION_VERSION
    }
    supabase.table('execution_feasibility') \
        .upsert(feas_record, on_conflict='user_id,opportunity_id,snapshot_id') \
        .execute()

    # 10.6: Verdict
    verdict = derive_verdict(
        feasibility, moat, risk_flags, archetype,
        timing_label, competition_level
    )

    verdict_record = {
        'user_id': user_id,
        'opportunity_id': opportunity_id,
        'snapshot_id': snapshot_id,
        'verdict': verdict['verdict'],
        'verdict_reasons': verdict['verdict_reasons'],
        'archetype': archetype,
        'risk_flags': risk_flags,
        'inputs_used': {
            'feasibility_score': feasibility['feasibility_score'],
            'moat_strength': moat['moat_strength'],
            'competition_level': competition_level,
            'timing_label': timing_label
        },
        'model_version': EXECUTION_VERSION
    }
    supabase.table('execution_verdicts') \
        .upsert(verdict_record, on_conflict='user_id,opportunity_id,snapshot_id') \
        .execute()

    return {
        'requirements': requirements,
        'moat': moat,
        'risk_flags': risk_flags,
        'archetype': archetype,
        'feasibility': feasibility,
        'verdict': verdict
    }


def compute_all_execution_analyses(user_id: str, snapshot_id: str) -> dict:
    """Compute execution analyses for all qualified opportunities for a user."""
    supabase = get_supabase()

    response = supabase.table('trend_opportunities') \
        .select('id') \
        .eq('snapshot_id', snapshot_id) \
        .eq('qualified', True) \
        .execute()

    opp_ids = [o['id'] for o in (response.data or [])]

    results = {'total': len(opp_ids), 'by_verdict': {}, 'by_archetype': {}, 'errors': []}

    for opp_id in opp_ids:
        try:
            result = compute_execution_analysis(user_id, opp_id, snapshot_id)
            v = result['verdict']['verdict']
            a = result['archetype']
            results['by_verdict'][v] = results['by_verdict'].get(v, 0) + 1
            results['by_archetype'][a] = results['by_archetype'].get(a, 0) + 1
        except Exception as e:
            results['errors'].append(f"{opp_id}: {str(e)}")

    return results


if __name__ == '__main__':
    # Test with sample data
    prefs = {
        'team_size': 'solo',
        'time_horizon': '1-3_months',
        'tech_stack': ['python', 'react', 'postgres'],
        'target_roles': ['developer']
    }

    reqs = estimate_execution_requirements(
        {'action_title': 'Build a CLI tool for API testing'},
        {'theme': 'API testing tools', 'description': 'Growing demand for developer API testing'},
        [{'title': 'New Rust-based API testing framework'}, {'title': 'Comparison of API testing tools'}]
    )

    print("Requirements:")
    print(f"  Type: {reqs['execution_type']}, Sales: {reqs['sales_motion']}")
    print(f"  Build: {reqs['build_weeks_min']}-{reqs['build_weeks_max']} weeks")
    print(f"  Team: {reqs['required_team_size_min']}-{reqs['required_team_size_max']}")

    moat = classify_moat('api testing tool cli developer experience', 'moderate')
    print(f"\nMoat: {moat['moat_types']}, strength: {moat['moat_strength']}")

    risk_flags = detect_risk_flags(
        'api testing tool comparison best tools',
        reqs, 'moderate', moat
    )
    print(f"Risks: {risk_flags}")

    archetype = classify_archetype(reqs, moat, risk_flags)
    print(f"Archetype: {archetype}")

    feasibility = compute_feasibility(prefs, reqs, moat, risk_flags)
    print(f"\nFeasibility: {feasibility['feasibility_score']:.0%}")
    print(f"Summary: {feasibility['fit_summary']}")
    print(f"Blockers: {feasibility['blocking_factors']}")

    verdict = derive_verdict(feasibility, moat, risk_flags, archetype, 'early_edge', 'moderate')
    print(f"\nVerdict: {verdict['verdict']}")
    for r in verdict['verdict_reasons']:
        print(f"  - {r}")

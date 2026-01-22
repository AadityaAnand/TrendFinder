import re
from typing import Optional

RELEVANCE_VERSION = 'relevance-v2'

# Default weights (can be overridden by learning engine)
DEFAULT_WEIGHTS = {
    'role_match': 0.25,
    'domain_match': 0.25,
    'stack_match': 0.20,
    'effort_fit': 0.15,
    'risk_fit': 0.10,
    'avoid_penalty': 0.30,
}

ROLE_KEYWORDS = {
    'backend': ['api', 'backend', 'database', 'server', 'rest', 'graphql', 'postgres', 'mysql', 'redis', 'queue', 'microservice'],
    'frontend': ['react', 'vue', 'angular', 'frontend', 'css', 'tailwind', 'ui', 'ux', 'component', 'browser', 'dom'],
    'data': ['data', 'analytics', 'etl', 'pipeline', 'warehouse', 'spark', 'airflow', 'dbt', 'sql', 'bigquery'],
    'ml': ['ml', 'machine learning', 'model', 'training', 'inference', 'llm', 'gpt', 'transformer', 'neural', 'pytorch', 'tensorflow'],
    'devtools': ['cli', 'developer', 'dx', 'tooling', 'ide', 'editor', 'debug', 'lint', 'format', 'build tool'],
    'mobile': ['ios', 'android', 'mobile', 'react native', 'flutter', 'swift', 'kotlin', 'app store'],
    'infra': ['kubernetes', 'docker', 'cloud', 'aws', 'gcp', 'azure', 'terraform', 'ci/cd', 'deploy', 'infrastructure'],
}

DOMAIN_KEYWORDS = {
    'ai': ['ai', 'artificial intelligence', 'llm', 'gpt', 'chatgpt', 'openai', 'anthropic', 'claude', 'gemini', 'copilot', 'agent'],
    'fintech': ['payment', 'banking', 'finance', 'fintech', 'stripe', 'plaid', 'crypto', 'trading', 'wallet'],
    'security': ['security', 'auth', 'authentication', 'encryption', 'oauth', 'sso', 'vulnerability', 'penetration'],
    'devtools': ['developer tools', 'dx', 'devex', 'ide', 'editor', 'debugging', 'profiling', 'observability'],
    'web3': ['web3', 'blockchain', 'ethereum', 'solana', 'smart contract', 'nft', 'defi', 'dao'],
    'saas': ['saas', 'subscription', 'b2b', 'enterprise', 'startup', 'mvp', 'product'],
    'developer-experience': ['developer experience', 'dx', 'api design', 'sdk', 'documentation', 'onboarding'],
}

TECH_KEYWORDS = {
    'python': ['python', 'django', 'flask', 'fastapi', 'pandas', 'numpy'],
    'typescript': ['typescript', 'ts', 'deno'],
    'javascript': ['javascript', 'js', 'node', 'nodejs', 'npm', 'yarn', 'bun'],
    'rust': ['rust', 'cargo', 'rustc'],
    'go': ['golang', ' go ', 'go-'],
    'react': ['react', 'nextjs', 'next.js', 'remix'],
    'postgres': ['postgres', 'postgresql', 'psql'],
    'redis': ['redis', 'valkey'],
    'docker': ['docker', 'container', 'dockerfile'],
    'kubernetes': ['kubernetes', 'k8s', 'helm'],
}

EFFORT_MAP = {
    'weekend': {'migration': 0.2, 'self_hosted': 0.3, 'sdk': 0.9, 'tooling': 0.8, 'competing': 0.4, 'generic': 0.5},
    '1-2_weeks': {'migration': 0.5, 'self_hosted': 0.6, 'sdk': 1.0, 'tooling': 0.9, 'competing': 0.6, 'generic': 0.7},
    '1-3_months': {'migration': 0.9, 'self_hosted': 1.0, 'sdk': 0.8, 'tooling': 0.7, 'competing': 0.9, 'generic': 0.8},
    'flexible': {'migration': 0.7, 'self_hosted': 0.7, 'sdk': 0.7, 'tooling': 0.7, 'competing': 0.7, 'generic': 0.7},
}

RISK_STAGE_MAP = {
    'emerging': 0.3,
    'rising': 0.6,
    'peaking': 0.9,
    'stable': 0.7,
    'declining': 0.4,
    'fading': 0.2,
}


def extract_text_corpus(trend_data: dict) -> str:
    parts = []
    if trend_data.get('theme'):
        parts.append(trend_data['theme'].lower())
    for signal in trend_data.get('signals', []):
        if signal.get('title'):
            parts.append(signal['title'].lower())
    return ' '.join(parts)


def compute_role_match(trend_data: dict, target_roles: list[str]) -> float:
    if not target_roles:
        return 0.5

    corpus = extract_text_corpus(trend_data)
    matches = 0
    total = len(target_roles)

    for role in target_roles:
        keywords = ROLE_KEYWORDS.get(role, [])
        for kw in keywords:
            if kw in corpus:
                matches += 1
                break

    return matches / total if total > 0 else 0.5


def compute_domain_match(trend_data: dict, domains: list[str]) -> float:
    if not domains:
        return 0.5

    corpus = extract_text_corpus(trend_data)
    matches = 0
    total = len(domains)

    for domain in domains:
        keywords = DOMAIN_KEYWORDS.get(domain, [])
        for kw in keywords:
            if kw in corpus:
                matches += 1
                break

    return matches / total if total > 0 else 0.5


def compute_stack_match(trend_data: dict, tech_stack: list[str]) -> float:
    if not tech_stack:
        return 0.5

    corpus = extract_text_corpus(trend_data)
    matches = 0
    total = len(tech_stack)

    for tech in tech_stack:
        keywords = TECH_KEYWORDS.get(tech, [tech.lower()])
        for kw in keywords:
            if kw in corpus:
                matches += 1
                break

    return matches / total if total > 0 else 0.5


def compute_effort_fit(opportunity: dict, time_horizon: str, team_size: str) -> float:
    actions = opportunity.get('suggested_actions', [])
    if not actions:
        return 0.5

    effort_scores = EFFORT_MAP.get(time_horizon, EFFORT_MAP['flexible'])

    action_types = []
    for action in actions:
        action_lower = action.lower() if isinstance(action, str) else ''
        if 'migrat' in action_lower:
            action_types.append('migration')
        elif 'self-host' in action_lower or 'self host' in action_lower:
            action_types.append('self_hosted')
        elif 'sdk' in action_lower or 'library' in action_lower:
            action_types.append('sdk')
        elif 'tool' in action_lower or 'cli' in action_lower:
            action_types.append('tooling')
        elif 'compet' in action_lower or 'alternative' in action_lower:
            action_types.append('competing')
        else:
            action_types.append('generic')

    if not action_types:
        return 0.5

    scores = [effort_scores.get(at, 0.5) for at in action_types]
    base_score = max(scores)

    if team_size == 'solo' and any(at in ['migration', 'self_hosted'] for at in action_types):
        base_score *= 0.7
    elif team_size == 'company' and all(at in ['sdk', 'tooling'] for at in action_types):
        base_score *= 0.9

    return min(1.0, base_score)


def compute_risk_fit(opportunity: dict, lifecycle: Optional[dict], risk_tolerance: str) -> float:
    if not lifecycle:
        return 0.5

    stage = lifecycle.get('lifecycle_stage', 'stable')
    confidence = lifecycle.get('stage_confidence', 0.5)

    stage_risk = RISK_STAGE_MAP.get(stage, 0.5)
    trend_safety = stage_risk * confidence

    if risk_tolerance == 'low':
        return trend_safety
    elif risk_tolerance == 'high':
        return 0.5 + (1 - trend_safety) * 0.5
    else:
        return 0.3 + trend_safety * 0.4


def compute_avoid_penalty(trend_data: dict, avoid_topics: list[str]) -> float:
    if not avoid_topics:
        return 0.0

    corpus = extract_text_corpus(trend_data)
    hits = 0

    for topic in avoid_topics:
        if topic.lower() in corpus:
            hits += 1

    return min(1.0, hits * 0.5)


def generate_fit_reasons(
    scores: dict,
    preferences: dict,
    trend_data: dict,
    opportunity: dict,
    lifecycle: Optional[dict]
) -> list[dict]:
    reasons = []

    if scores['role_match'] >= 0.5 and preferences.get('target_roles'):
        corpus = extract_text_corpus(trend_data)
        matched = []
        for role in preferences['target_roles']:
            keywords = ROLE_KEYWORDS.get(role, [])
            if any(kw in corpus for kw in keywords):
                matched.append(role.replace('_', ' ').title())
        if matched:
            reasons.append({
                'type': 'match',
                'text': f"Matches your focus: {', '.join(matched[:3])}"
            })

    if scores['domain_match'] >= 0.5 and preferences.get('domains'):
        corpus = extract_text_corpus(trend_data)
        matched = []
        for domain in preferences['domains']:
            keywords = DOMAIN_KEYWORDS.get(domain, [])
            if any(kw in corpus for kw in keywords):
                matched.append(domain.replace('-', ' ').title())
        if matched:
            reasons.append({
                'type': 'match',
                'text': f"Relevant to: {', '.join(matched[:3])}"
            })

    if scores['stack_match'] >= 0.5 and preferences.get('tech_stack'):
        corpus = extract_text_corpus(trend_data)
        matched = []
        for tech in preferences['tech_stack']:
            keywords = TECH_KEYWORDS.get(tech, [tech.lower()])
            if any(kw in corpus for kw in keywords):
                matched.append(tech.title())
        if matched:
            reasons.append({
                'type': 'match',
                'text': f"Uses your stack: {', '.join(matched[:3])}"
            })

    time_horizon = preferences.get('time_horizon', 'flexible')
    if scores['effort_fit'] >= 0.7:
        horizon_labels = {
            'weekend': 'a weekend project',
            '1-2_weeks': '1-2 weeks',
            '1-3_months': '1-3 months',
            'flexible': 'your timeline'
        }
        reasons.append({
            'type': 'match',
            'text': f"Buildable in {horizon_labels.get(time_horizon, time_horizon)}"
        })

    risk_tolerance = preferences.get('risk_tolerance', 'medium')
    if lifecycle:
        stage = lifecycle.get('lifecycle_stage', 'stable')
        confidence = lifecycle.get('stage_confidence', 0.5)

        if risk_tolerance == 'low' and stage in ['emerging', 'fading'] and confidence < 0.7:
            reasons.append({
                'type': 'warning',
                'text': f"Higher risk: {stage} stage with {int(confidence*100)}% confidence"
            })
        elif risk_tolerance == 'high' and stage in ['peaking', 'rising'] and confidence >= 0.7:
            reasons.append({
                'type': 'match',
                'text': f"Strong signal: {stage} with high confidence"
            })

    if scores['avoid_penalty'] > 0:
        reasons.append({
            'type': 'warning',
            'text': "Contains topics from your avoid list"
        })

    return reasons


def compute_user_relevance(
    opportunity: dict,
    preferences: dict,
    trend_data: dict,
    lifecycle: Optional[dict] = None,
    custom_weights: Optional[dict] = None
) -> dict:
    """
    Compute relevance score for an opportunity given user preferences.

    Args:
        opportunity: The opportunity dict
        preferences: User preferences dict
        trend_data: Trend data with theme and signals
        lifecycle: Optional lifecycle data
        custom_weights: Optional custom weights from learning engine (Phase 5)
    """
    target_roles = preferences.get('target_roles', [])
    domains = preferences.get('domains', [])
    tech_stack = preferences.get('tech_stack', [])
    time_horizon = preferences.get('time_horizon', 'flexible')
    team_size = preferences.get('team_size', 'solo')
    risk_tolerance = preferences.get('risk_tolerance', 'medium')
    avoid_topics = preferences.get('avoid_topics', [])

    scores = {
        'role_match': compute_role_match(trend_data, target_roles),
        'domain_match': compute_domain_match(trend_data, domains),
        'stack_match': compute_stack_match(trend_data, tech_stack),
        'effort_fit': compute_effort_fit(opportunity, time_horizon, team_size),
        'risk_fit': compute_risk_fit(opportunity, lifecycle, risk_tolerance),
        'avoid_penalty': compute_avoid_penalty(trend_data, avoid_topics),
    }

    # Use custom weights if provided, otherwise use defaults
    weights = custom_weights if custom_weights else DEFAULT_WEIGHTS

    relevance_score = (
        weights['role_match'] * scores['role_match'] +
        weights['domain_match'] * scores['domain_match'] +
        weights['stack_match'] * scores['stack_match'] +
        weights['effort_fit'] * scores['effort_fit'] +
        weights['risk_fit'] * scores['risk_fit'] -
        weights['avoid_penalty'] * scores['avoid_penalty']
    )

    relevance_score = max(0.0, min(1.0, relevance_score))

    fit_reasons = generate_fit_reasons(scores, preferences, trend_data, opportunity, lifecycle)

    # Include weight info if using custom weights
    result = {
        'relevance_score': relevance_score,
        'breakdown': scores,
        'fit_reasons': fit_reasons,
        'relevance_version': RELEVANCE_VERSION
    }

    if custom_weights:
        result['weights_used'] = 'learned'
    else:
        result['weights_used'] = 'default'

    return result


def personalize_opportunities(
    opportunities: list[dict],
    preferences: dict,
    trend_data_map: dict,
    lifecycle_map: dict,
    custom_weights: Optional[dict] = None,
    outcome_modifiers: Optional[dict] = None
) -> list[dict]:
    """
    Personalize and rank opportunities for a user.

    Args:
        opportunities: List of qualified opportunities
        preferences: User preferences
        trend_data_map: Map of trend_id -> trend data
        lifecycle_map: Map of trend_id -> lifecycle data
        custom_weights: Optional learned weights from Phase 5
        outcome_modifiers: Optional outcome modifiers from Phase 6
            Map of trend_id -> { modifier, factors, has_data }
    """
    personalized = []

    for opp in opportunities:
        trend_id = opp.get('trend_id')
        trend_data = trend_data_map.get(trend_id, {})
        lifecycle = lifecycle_map.get(trend_id)

        relevance = compute_user_relevance(
            opp, preferences, trend_data, lifecycle,
            custom_weights=custom_weights
        )

        global_score = opp.get('opportunity_score', 0)

        # Apply outcome modifier if available (Phase 6)
        outcome_data = None
        if outcome_modifiers and trend_id in outcome_modifiers:
            outcome_data = outcome_modifiers[trend_id]
            if outcome_data.get('has_data'):
                modifier = outcome_data.get('modifier', 0)
                # Apply modifier to global score
                global_score = global_score * (1 + modifier)
                global_score = max(0.0, min(1.0, global_score))

        personalized_score = 0.6 * global_score + 0.4 * relevance['relevance_score']

        result = {
            **opp,
            'relevance_score': relevance['relevance_score'],
            'relevance_breakdown': relevance['breakdown'],
            'fit_reasons': relevance['fit_reasons'],
            'personalized_score': personalized_score,
            'global_score': opp.get('opportunity_score', 0),  # Original score
            'weights_used': relevance.get('weights_used', 'default'),
        }

        # Include outcome data if present
        if outcome_data and outcome_data.get('has_data'):
            result['outcome_modifier'] = outcome_data['modifier']
            result['outcome_factors'] = outcome_data.get('factors', {})
            result['adjusted_global_score'] = global_score

        personalized.append(result)

    personalized.sort(key=lambda x: x['personalized_score'], reverse=True)

    return personalized

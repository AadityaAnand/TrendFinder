"""
Phase 6: Outcome-Aware Scoring

Integrates historical outcome data into opportunity scoring.
Trends with proven success get boosted, execution traps get penalized.

All adjustments are:
- Bounded (±30% max)
- Based on minimum sample size
- Transparent (factors exposed)
"""

import os
import logging
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Thresholds
MIN_OUTCOMES_FOR_ADJUSTMENT = 3
MAX_OUTCOME_BOOST = 0.30
MAX_OUTCOME_PENALTY = 0.30

# Archetype modifiers
ARCHETYPE_MODIFIERS = {
    'proven_winner': 0.20,      # Strong boost
    'fast_mvp': 0.15,           # Good for quick execution
    'infra_bet': 0.05,          # Moderate (long-term play)
    'content_wedge': 0.0,       # Neutral
    'execution_trap': -0.25,    # Strong penalty
}

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

_supabase: Optional[Client] = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase


def get_trend_outcome_stats(trend_id: str) -> Optional[dict]:
    """Fetch outcome stats for a trend."""
    supabase = get_supabase()

    response = supabase.table('trend_outcome_stats') \
        .select('*') \
        .eq('trend_id', trend_id) \
        .single() \
        .execute()

    return response.data if response.data else None


def get_opportunity_outcome_stats(opportunity_id: str) -> Optional[dict]:
    """Fetch outcome stats for a specific opportunity."""
    supabase = get_supabase()

    response = supabase.table('opportunity_outcome_stats') \
        .select('*') \
        .eq('opportunity_id', opportunity_id) \
        .single() \
        .execute()

    return response.data if response.data else None


def compute_outcome_modifier(
    trend_id: str,
    opportunity_id: Optional[str] = None
) -> dict:
    """
    Compute outcome-based score modifier for a trend/opportunity.

    Returns:
        - modifier: float (-0.30 to +0.30)
        - factors: dict explaining the modifier
        - has_data: bool
    """
    result = {
        'modifier': 0.0,
        'factors': {},
        'has_data': False,
        'sample_size': 0,
    }

    # Try opportunity-level stats first (more specific)
    if opportunity_id:
        opp_stats = get_opportunity_outcome_stats(opportunity_id)
        if opp_stats and opp_stats.get('total_starts', 0) >= MIN_OUTCOMES_FOR_ADJUSTMENT:
            result = _compute_from_opportunity_stats(opp_stats)
            return result

    # Fall back to trend-level stats
    trend_stats = get_trend_outcome_stats(trend_id)
    if trend_stats and trend_stats.get('total_user_starts', 0) >= MIN_OUTCOMES_FOR_ADJUSTMENT:
        result = _compute_from_trend_stats(trend_stats)

    return result


def _compute_from_opportunity_stats(stats: dict) -> dict:
    """Compute modifier from opportunity-level stats."""
    factors = {}
    modifier = 0.0

    completion_rate = stats.get('completion_rate', 0) or 0
    success_rate = stats.get('success_rate', 0) or 0
    avg_quality = stats.get('avg_quality_score', 0) or 0
    total_starts = stats.get('total_starts', 0) or 0

    # Completion rate factor (-0.15 to +0.10)
    if completion_rate >= 0.6:
        completion_factor = 0.10
        factors['completion'] = f"High completion rate ({int(completion_rate*100)}%)"
    elif completion_rate >= 0.4:
        completion_factor = 0.05
        factors['completion'] = f"Moderate completion rate ({int(completion_rate*100)}%)"
    elif completion_rate < 0.2:
        completion_factor = -0.15
        factors['completion'] = f"Low completion rate ({int(completion_rate*100)}%)"
    else:
        completion_factor = 0.0

    modifier += completion_factor

    # Quality factor (-0.10 to +0.10)
    if avg_quality and avg_quality >= 4:
        quality_factor = 0.10
        factors['quality'] = f"High quality outcomes (avg {avg_quality:.1f}/5)"
    elif avg_quality and avg_quality >= 3:
        quality_factor = 0.05
        factors['quality'] = f"Good quality outcomes (avg {avg_quality:.1f}/5)"
    elif avg_quality and avg_quality < 2:
        quality_factor = -0.10
        factors['quality'] = f"Low quality outcomes (avg {avg_quality:.1f}/5)"
    else:
        quality_factor = 0.0

    modifier += quality_factor

    # Sample size confidence bonus (up to +0.05)
    if total_starts >= 10:
        sample_factor = 0.05
        factors['sample'] = f"High sample size ({total_starts} users)"
    elif total_starts >= 5:
        sample_factor = 0.02
        factors['sample'] = f"Moderate sample ({total_starts} users)"
    else:
        sample_factor = 0.0

    modifier += sample_factor

    # Cap the modifier
    modifier = max(-MAX_OUTCOME_PENALTY, min(MAX_OUTCOME_BOOST, modifier))

    return {
        'modifier': round(modifier, 3),
        'factors': factors,
        'has_data': True,
        'sample_size': total_starts,
        'source': 'opportunity',
    }


def _compute_from_trend_stats(stats: dict) -> dict:
    """Compute modifier from trend-level stats."""
    factors = {}
    modifier = 0.0

    archetype = stats.get('trend_archetype')
    completion_rate = stats.get('avg_completion_rate', 0) or 0
    avg_quality = stats.get('avg_quality_score', 0) or 0
    total_starts = stats.get('total_user_starts', 0) or 0
    difficulty = stats.get('execution_difficulty_score', 5) or 5

    # Archetype factor (most impactful)
    if archetype:
        archetype_mod = ARCHETYPE_MODIFIERS.get(archetype, 0)
        modifier += archetype_mod
        if archetype_mod > 0:
            factors['archetype'] = f"Trend type: {archetype.replace('_', ' ').title()} (boost)"
        elif archetype_mod < 0:
            factors['archetype'] = f"Trend type: {archetype.replace('_', ' ').title()} (caution)"

    # Completion rate factor (-0.10 to +0.08)
    if completion_rate >= 0.5:
        completion_factor = 0.08
        factors['completion'] = f"Strong completion history ({int(completion_rate*100)}%)"
    elif completion_rate < 0.2:
        completion_factor = -0.10
        factors['completion'] = f"Low completion history ({int(completion_rate*100)}%)"
    else:
        completion_factor = 0.0

    modifier += completion_factor

    # Quality factor (-0.05 to +0.07)
    if avg_quality and avg_quality >= 4:
        quality_factor = 0.07
        factors['quality'] = f"High quality track record (avg {avg_quality:.1f}/5)"
    elif avg_quality and avg_quality < 2.5:
        quality_factor = -0.05
        factors['quality'] = f"Quality concerns (avg {avg_quality:.1f}/5)"
    else:
        quality_factor = 0.0

    modifier += quality_factor

    # Difficulty warning (informational, small penalty for hard trends)
    if difficulty and difficulty >= 7:
        factors['difficulty'] = f"Execution difficulty: {difficulty:.0f}/10 (challenging)"
        modifier -= 0.03

    # Cap the modifier
    modifier = max(-MAX_OUTCOME_PENALTY, min(MAX_OUTCOME_BOOST, modifier))

    return {
        'modifier': round(modifier, 3),
        'factors': factors,
        'has_data': True,
        'sample_size': total_starts,
        'source': 'trend',
    }


def apply_outcome_modifier(
    opportunity_score: float,
    outcome_modifier: dict
) -> float:
    """Apply outcome modifier to opportunity score."""
    if not outcome_modifier.get('has_data'):
        return opportunity_score

    modifier = outcome_modifier.get('modifier', 0)

    # Apply multiplicatively: score * (1 + modifier)
    adjusted = opportunity_score * (1 + modifier)

    # Keep within valid range
    return max(0.0, min(1.0, adjusted))


def get_outcome_factors_display(outcome_modifier: dict) -> list[dict]:
    """
    Convert outcome factors to display format for UI.

    Returns list of { type: 'boost'|'warning'|'info', text: str }
    """
    if not outcome_modifier.get('has_data'):
        return []

    display = []
    factors = outcome_modifier.get('factors', {})
    modifier = outcome_modifier.get('modifier', 0)

    for key, text in factors.items():
        if 'boost' in text.lower() or modifier > 0.1:
            display.append({'type': 'boost', 'text': text})
        elif 'caution' in text.lower() or 'low' in text.lower() or 'concern' in text.lower():
            display.append({'type': 'warning', 'text': text})
        else:
            display.append({'type': 'info', 'text': text})

    return display


def bulk_get_outcome_modifiers(trend_ids: list[str]) -> dict[str, dict]:
    """
    Get outcome modifiers for multiple trends at once.
    More efficient than individual lookups.
    """
    if not trend_ids:
        return {}

    supabase = get_supabase()

    response = supabase.table('trend_outcome_stats') \
        .select('*') \
        .in_('trend_id', trend_ids) \
        .execute()

    stats_map = {s['trend_id']: s for s in (response.data or [])}

    result = {}
    for trend_id in trend_ids:
        stats = stats_map.get(trend_id)
        if stats and stats.get('total_user_starts', 0) >= MIN_OUTCOMES_FOR_ADJUSTMENT:
            result[trend_id] = _compute_from_trend_stats(stats)
        else:
            result[trend_id] = {
                'modifier': 0.0,
                'factors': {},
                'has_data': False,
                'sample_size': 0,
            }

    return result


if __name__ == '__main__':
    import sys

    if len(sys.argv) < 2:
        print("Usage: python outcome_scorer.py <trend_id>")
        sys.exit(1)

    trend_id = sys.argv[1]
    result = compute_outcome_modifier(trend_id)

    print(f"Outcome modifier for trend {trend_id}:")
    print(f"  Modifier: {result['modifier']:+.3f}")
    print(f"  Has data: {result['has_data']}")
    print(f"  Sample size: {result['sample_size']}")
    print(f"  Factors:")
    for key, text in result.get('factors', {}).items():
        print(f"    - {text}")

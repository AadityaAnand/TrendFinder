"""
Phase 5.1: Feedback-Weighted Relevance Learning

Computes per-user weight adjustments based on feedback patterns.
All adjustments are:
- Bounded (±20% max)
- Versioned
- Deterministic (same inputs → same outputs)
"""

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
MAX_ADJUSTMENT = 0.20  # ±20% cap
MIN_FEEDBACK_COUNT = 5  # Need at least 5 feedback items to compute adjustments
LEARNING_RATE = 0.05   # How much each feedback item can shift weights

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_user_feedback_with_scores(user_id: str, days_back: int = 30) -> list[dict]:
    """
    Get user's feedback along with the relevance breakdown for each opportunity.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()

    # Get feedback
    feedback_resp = supabase.table('user_opportunity_feedback') \
        .select('opportunity_id, feedback_type, created_at') \
        .eq('user_id', user_id) \
        .gte('created_at', cutoff) \
        .execute()

    if not feedback_resp.data:
        return []

    # Get opportunity details to reconstruct relevance scores
    opp_ids = [f['opportunity_id'] for f in feedback_resp.data]

    opps_resp = supabase.table('trend_opportunities') \
        .select('id, trend_id, opportunity_score') \
        .in_('id', opp_ids) \
        .execute()

    opp_map = {o['id']: o for o in (opps_resp.data or [])}

    # Get trend details
    trend_ids = [o['trend_id'] for o in (opps_resp.data or [])]
    trends_resp = supabase.table('detected_trends') \
        .select('id, theme, description') \
        .in_('id', trend_ids) \
        .execute()

    trend_map = {t['id']: t for t in (trends_resp.data or [])}

    # Get user preferences to compute what scores would have been
    prefs_resp = supabase.table('user_preferences') \
        .select('*') \
        .eq('user_id', user_id) \
        .single() \
        .execute()

    preferences = prefs_resp.data if prefs_resp.data else {}

    # Combine feedback with opportunity data
    results = []
    for fb in feedback_resp.data:
        opp = opp_map.get(fb['opportunity_id'])
        if not opp:
            continue

        trend = trend_map.get(opp['trend_id'], {})

        results.append({
            'opportunity_id': fb['opportunity_id'],
            'feedback_type': fb['feedback_type'],
            'created_at': fb['created_at'],
            'trend_theme': trend.get('theme', ''),
            'trend_description': trend.get('description', ''),
            'opportunity_score': opp.get('opportunity_score', 0),
            'preferences': preferences
        })

    return results


def compute_dimension_correlation(feedback_items: list[dict], dimension: str) -> float:
    """
    Compute how well a dimension correlates with positive feedback.

    Returns a value in [-1, 1]:
    - Positive: dimension correlates with saved/acted
    - Negative: dimension correlates with dismissed
    """
    from relevance_scorer import (
        compute_role_match,
        compute_domain_match,
        compute_stack_match,
        compute_effort_fit,
        compute_risk_fit
    )

    positive_scores = []
    negative_scores = []

    for item in feedback_items:
        prefs = item.get('preferences', {})
        text = f"{item.get('trend_theme', '')} {item.get('trend_description', '')}"

        # Compute the dimension score
        if dimension == 'role_match':
            score = compute_role_match(text, prefs.get('target_roles', []))
        elif dimension == 'domain_match':
            score = compute_domain_match(text, prefs.get('domains', []))
        elif dimension == 'stack_match':
            score = compute_stack_match(text, prefs.get('tech_stack', []))
        elif dimension == 'effort_fit':
            score = compute_effort_fit(
                'build',  # Default action type
                prefs.get('time_horizon', 'flexible'),
                prefs.get('team_size', 'solo')
            )
        elif dimension == 'risk_fit':
            score = compute_risk_fit(None, prefs.get('risk_tolerance', 'medium'))
        else:
            continue

        # Categorize by feedback type
        if item['feedback_type'] in ('saved', 'acted'):
            positive_scores.append(score)
        elif item['feedback_type'] in ('dismissed', 'not_relevant'):
            negative_scores.append(score)

    if not positive_scores and not negative_scores:
        return 0.0

    avg_positive = sum(positive_scores) / len(positive_scores) if positive_scores else 0.5
    avg_negative = sum(negative_scores) / len(negative_scores) if negative_scores else 0.5

    # Correlation: how much higher is positive avg than negative avg
    correlation = avg_positive - avg_negative

    return max(-1.0, min(1.0, correlation))


def compute_weight_adjustments(user_id: str) -> Optional[dict]:
    """
    Compute weight adjustments for a user based on their feedback.

    Returns dict with adjustments or None if insufficient data.
    """
    feedback_items = get_user_feedback_with_scores(user_id)

    if len(feedback_items) < MIN_FEEDBACK_COUNT:
        logger.info(f"User {user_id}: Only {len(feedback_items)} feedback items, need {MIN_FEEDBACK_COUNT}")
        return None

    dimensions = ['role_match', 'domain_match', 'stack_match', 'effort_fit', 'risk_fit']
    adjustments = {}

    for dim in dimensions:
        correlation = compute_dimension_correlation(feedback_items, dim)

        # Convert correlation to adjustment (scaled by learning rate, capped)
        raw_adj = correlation * LEARNING_RATE * len(feedback_items) / MIN_FEEDBACK_COUNT
        capped_adj = max(-MAX_ADJUSTMENT, min(MAX_ADJUSTMENT, raw_adj))

        adjustments[f'{dim}_adj'] = round(capped_adj, 4)

    return {
        'adjustments': adjustments,
        'feedback_count': len(feedback_items),
        'computed_at': datetime.now(timezone.utc).isoformat()
    }


def update_user_weights(user_id: str, force: bool = False) -> dict:
    """
    Update a user's weight adjustments in the database.
    """
    # Get current adjustments
    current_resp = supabase.table('user_weight_adjustments') \
        .select('*') \
        .eq('user_id', user_id) \
        .single() \
        .execute()

    current = current_resp.data

    # Compute new adjustments
    result = compute_weight_adjustments(user_id)

    if result is None:
        return {'status': 'skipped', 'reason': 'insufficient_feedback'}

    adjustments = result['adjustments']
    feedback_count = result['feedback_count']

    # Check if update is needed
    if current and not force:
        # Only update if feedback count increased significantly
        if feedback_count <= (current.get('feedback_count_used', 0) + 2):
            return {'status': 'skipped', 'reason': 'no_significant_new_feedback'}

    new_version = (current.get('adjustment_version', 0) + 1) if current else 1

    # Save history before updating
    if current:
        supabase.table('weight_adjustment_history').insert({
            'user_id': user_id,
            'adjustment_version': current.get('adjustment_version', 1),
            'adjustments_snapshot': {
                'role_match_adj': current.get('role_match_adj', 0),
                'domain_match_adj': current.get('domain_match_adj', 0),
                'stack_match_adj': current.get('stack_match_adj', 0),
                'effort_fit_adj': current.get('effort_fit_adj', 0),
                'risk_fit_adj': current.get('risk_fit_adj', 0),
            },
            'trigger_reason': 'feedback_threshold',
            'feedback_window_end': datetime.now(timezone.utc).isoformat()
        }).execute()

    # Upsert new adjustments
    upsert_data = {
        'user_id': user_id,
        'role_match_adj': adjustments['role_match_adj'],
        'domain_match_adj': adjustments['domain_match_adj'],
        'stack_match_adj': adjustments['stack_match_adj'],
        'effort_fit_adj': adjustments['effort_fit_adj'],
        'risk_fit_adj': adjustments['risk_fit_adj'],
        'adjustment_version': new_version,
        'feedback_count_used': feedback_count,
        'last_computed_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }

    supabase.table('user_weight_adjustments').upsert(
        upsert_data,
        on_conflict='user_id'
    ).execute()

    logger.info(f"Updated weights for user {user_id}: v{new_version}, {feedback_count} feedback items")

    return {
        'status': 'updated',
        'version': new_version,
        'adjustments': adjustments,
        'feedback_count': feedback_count
    }


def get_adjusted_weights(user_id: str) -> dict:
    """
    Get the effective weights for a user (base weights + adjustments).

    Returns weights that can be used directly in relevance scoring.
    """
    # Base weights from relevance_scorer
    BASE_WEIGHTS = {
        'role_match': 0.25,
        'domain_match': 0.25,
        'stack_match': 0.20,
        'effort_fit': 0.15,
        'risk_fit': 0.10,
        'avoid_penalty': 0.30  # This one doesn't get adjusted
    }

    # Get user adjustments
    adj_resp = supabase.table('user_weight_adjustments') \
        .select('*') \
        .eq('user_id', user_id) \
        .single() \
        .execute()

    if not adj_resp.data:
        return BASE_WEIGHTS

    adj = adj_resp.data

    # Apply adjustments (multiplicative: 1 + adj)
    adjusted = {
        'role_match': BASE_WEIGHTS['role_match'] * (1 + adj.get('role_match_adj', 0)),
        'domain_match': BASE_WEIGHTS['domain_match'] * (1 + adj.get('domain_match_adj', 0)),
        'stack_match': BASE_WEIGHTS['stack_match'] * (1 + adj.get('stack_match_adj', 0)),
        'effort_fit': BASE_WEIGHTS['effort_fit'] * (1 + adj.get('effort_fit_adj', 0)),
        'risk_fit': BASE_WEIGHTS['risk_fit'] * (1 + adj.get('risk_fit_adj', 0)),
        'avoid_penalty': BASE_WEIGHTS['avoid_penalty']
    }

    # Normalize so weights still sum to ~0.95 (excluding avoid_penalty)
    weight_sum = sum(v for k, v in adjusted.items() if k != 'avoid_penalty')
    target_sum = 0.95

    if weight_sum > 0:
        scale = target_sum / weight_sum
        for key in adjusted:
            if key != 'avoid_penalty':
                adjusted[key] *= scale

    return adjusted


def reset_user_weights(user_id: str) -> dict:
    """
    Reset a user's weight adjustments to zero.
    """
    # Get current for history
    current_resp = supabase.table('user_weight_adjustments') \
        .select('*') \
        .eq('user_id', user_id) \
        .single() \
        .execute()

    if current_resp.data:
        # Save to history
        supabase.table('weight_adjustment_history').insert({
            'user_id': user_id,
            'adjustment_version': current_resp.data.get('adjustment_version', 1),
            'adjustments_snapshot': {
                'role_match_adj': current_resp.data.get('role_match_adj', 0),
                'domain_match_adj': current_resp.data.get('domain_match_adj', 0),
                'stack_match_adj': current_resp.data.get('stack_match_adj', 0),
                'effort_fit_adj': current_resp.data.get('effort_fit_adj', 0),
                'risk_fit_adj': current_resp.data.get('risk_fit_adj', 0),
            },
            'trigger_reason': 'manual_reset'
        }).execute()

        # Reset
        supabase.table('user_weight_adjustments').update({
            'role_match_adj': 0,
            'domain_match_adj': 0,
            'stack_match_adj': 0,
            'effort_fit_adj': 0,
            'risk_fit_adj': 0,
            'adjustment_version': current_resp.data.get('adjustment_version', 0) + 1,
            'feedback_count_used': 0,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }).eq('user_id', user_id).execute()

    return {'status': 'reset', 'user_id': user_id}


if __name__ == '__main__':
    import sys

    if len(sys.argv) < 2:
        print("Usage: python learning_engine.py <user_id> [--force]")
        sys.exit(1)

    user_id = sys.argv[1]
    force = '--force' in sys.argv

    result = update_user_weights(user_id, force=force)
    print(f"Result: {result}")

    if result.get('status') == 'updated':
        weights = get_adjusted_weights(user_id)
        print(f"Effective weights: {weights}")

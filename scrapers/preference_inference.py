"""
Phase 5.2: Preference Inference

Infers weak preference signals from user feedback patterns.
All inferences are:
- Separate from explicit preferences
- Clearly labeled as inferred
- Always overridable by user
- Transparent (evidence shown)
"""

import os
import logging
from datetime import datetime, timezone, timedelta
from collections import Counter
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

from relevance_scorer import ROLE_KEYWORDS, DOMAIN_KEYWORDS, TECH_KEYWORDS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Thresholds for inference
MIN_FEEDBACK_FOR_INFERENCE = 8
MIN_CONFIDENCE = 0.6
MAX_INFERRED_PER_CATEGORY = 3

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_feedback_with_trends(user_id: str, days_back: int = 60) -> list[dict]:
    """Get user feedback with associated trend data."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()

    feedback_resp = supabase.table('user_opportunity_feedback') \
        .select('opportunity_id, feedback_type, created_at') \
        .eq('user_id', user_id) \
        .gte('created_at', cutoff) \
        .execute()

    if not feedback_resp.data:
        return []

    opp_ids = [f['opportunity_id'] for f in feedback_resp.data]

    opps_resp = supabase.table('trend_opportunities') \
        .select('id, trend_id') \
        .in_('id', opp_ids) \
        .execute()

    opp_to_trend = {o['id']: o['trend_id'] for o in (opps_resp.data or [])}
    trend_ids = list(set(opp_to_trend.values()))

    trends_resp = supabase.table('detected_trends') \
        .select('id, theme, description') \
        .in_('id', trend_ids) \
        .execute()

    trend_map = {t['id']: t for t in (trends_resp.data or [])}

    # Get lifecycle data
    lifecycle_resp = supabase.table('trend_lifecycle_history') \
        .select('trend_id, lifecycle_stage') \
        .in_('trend_id', trend_ids) \
        .order('created_at', desc=True) \
        .execute()

    lifecycle_map = {}
    for lc in (lifecycle_resp.data or []):
        if lc['trend_id'] not in lifecycle_map:
            lifecycle_map[lc['trend_id']] = lc['lifecycle_stage']

    results = []
    for fb in feedback_resp.data:
        trend_id = opp_to_trend.get(fb['opportunity_id'])
        if not trend_id:
            continue

        trend = trend_map.get(trend_id, {})
        results.append({
            'feedback_type': fb['feedback_type'],
            'trend_theme': trend.get('theme', ''),
            'trend_description': trend.get('description', ''),
            'lifecycle_stage': lifecycle_map.get(trend_id)
        })

    return results


def extract_keyword_hits(text: str, keyword_map: dict) -> dict[str, int]:
    """Count keyword hits for each category."""
    text_lower = text.lower()
    hits = {}

    for category, keywords in keyword_map.items():
        count = sum(1 for kw in keywords if kw in text_lower)
        if count > 0:
            hits[category] = count

    return hits


def infer_preferences_from_feedback(user_id: str) -> Optional[dict]:
    """
    Analyze feedback to infer preferences.

    Returns dict with inferred values and confidence scores.
    """
    feedback_items = get_feedback_with_trends(user_id)

    if len(feedback_items) < MIN_FEEDBACK_FOR_INFERENCE:
        logger.info(f"User {user_id}: Only {len(feedback_items)} items, need {MIN_FEEDBACK_FOR_INFERENCE}")
        return None

    # Separate positive and negative feedback
    positive = [f for f in feedback_items if f['feedback_type'] in ('saved', 'acted')]
    negative = [f for f in feedback_items if f['feedback_type'] in ('dismissed', 'not_relevant')]

    if len(positive) < 3:
        logger.info(f"User {user_id}: Only {len(positive)} positive feedback items")
        return None

    # Count keyword hits in positive feedback
    role_hits = Counter()
    domain_hits = Counter()
    stack_hits = Counter()
    stage_hits = Counter()

    for item in positive:
        text = f"{item['trend_theme']} {item['trend_description']}"

        for role, count in extract_keyword_hits(text, ROLE_KEYWORDS).items():
            role_hits[role] += count

        for domain, count in extract_keyword_hits(text, DOMAIN_KEYWORDS).items():
            domain_hits[domain] += count

        for tech, count in extract_keyword_hits(text, TECH_KEYWORDS).items():
            stack_hits[tech] += count

        if item['lifecycle_stage']:
            stage_hits[item['lifecycle_stage']] += 1

    # Count keyword hits in negative feedback (to subtract)
    neg_role_hits = Counter()
    neg_domain_hits = Counter()
    neg_stack_hits = Counter()

    for item in negative:
        text = f"{item['trend_theme']} {item['trend_description']}"

        for role, count in extract_keyword_hits(text, ROLE_KEYWORDS).items():
            neg_role_hits[role] += count

        for domain, count in extract_keyword_hits(text, DOMAIN_KEYWORDS).items():
            neg_domain_hits[domain] += count

        for tech, count in extract_keyword_hits(text, TECH_KEYWORDS).items():
            neg_stack_hits[tech] += count

    # Calculate net scores (positive - negative)
    def net_score(pos_counter: Counter, neg_counter: Counter) -> dict[str, float]:
        all_keys = set(pos_counter.keys()) | set(neg_counter.keys())
        scores = {}
        for key in all_keys:
            net = pos_counter.get(key, 0) - neg_counter.get(key, 0) * 0.5
            if net > 0:
                scores[key] = net
        return scores

    role_scores = net_score(role_hits, neg_role_hits)
    domain_scores = net_score(domain_hits, neg_domain_hits)
    stack_scores = net_score(stack_hits, neg_stack_hits)

    # Normalize and filter by confidence
    def top_by_confidence(scores: dict, max_items: int) -> tuple[list[str], float]:
        if not scores:
            return [], 0.0

        total = sum(scores.values())
        sorted_items = sorted(scores.items(), key=lambda x: x[1], reverse=True)

        top_items = []
        top_score = 0

        for item, score in sorted_items[:max_items]:
            confidence = score / total if total > 0 else 0
            if confidence >= 0.15:  # At least 15% of positive signals
                top_items.append(item)
                top_score = max(top_score, confidence)

        avg_confidence = top_score if top_items else 0
        return top_items, avg_confidence

    inferred_roles, role_conf = top_by_confidence(role_scores, MAX_INFERRED_PER_CATEGORY)
    inferred_domains, domain_conf = top_by_confidence(domain_scores, MAX_INFERRED_PER_CATEGORY)
    inferred_stack, stack_conf = top_by_confidence(stack_scores, MAX_INFERRED_PER_CATEGORY)

    # Infer risk tolerance from lifecycle stage preferences
    inferred_risk = None
    risk_conf = 0.0

    if stage_hits:
        total_stages = sum(stage_hits.values())
        early_pct = (stage_hits.get('emerging', 0) + stage_hits.get('rising', 0)) / total_stages
        late_pct = (stage_hits.get('stable', 0) + stage_hits.get('declining', 0)) / total_stages

        if early_pct >= 0.6:
            inferred_risk = 'high'
            risk_conf = early_pct
        elif late_pct >= 0.6:
            inferred_risk = 'low'
            risk_conf = late_pct
        else:
            inferred_risk = 'medium'
            risk_conf = 0.5

    # Build evidence summary
    evidence = {
        'feedback_count': len(feedback_items),
        'positive_count': len(positive),
        'negative_count': len(negative),
        'top_role_signals': dict(role_hits.most_common(5)),
        'top_domain_signals': dict(domain_hits.most_common(5)),
        'top_stack_signals': dict(stack_hits.most_common(5)),
        'stage_distribution': dict(stage_hits),
    }

    return {
        'inferred_roles': inferred_roles,
        'inferred_domains': inferred_domains,
        'inferred_stack': inferred_stack,
        'inferred_risk_tolerance': inferred_risk,
        'confidence_scores': {
            'roles': round(role_conf, 2),
            'domains': round(domain_conf, 2),
            'stack': round(stack_conf, 2),
            'risk': round(risk_conf, 2),
        },
        'evidence_summary': evidence,
    }


def update_inferred_preferences(user_id: str) -> dict:
    """Update inferred preferences in the database."""
    result = infer_preferences_from_feedback(user_id)

    if result is None:
        return {'status': 'skipped', 'reason': 'insufficient_feedback'}

    # Get current inferred preferences
    current_resp = supabase.table('user_inferred_preferences') \
        .select('*') \
        .eq('user_id', user_id) \
        .single() \
        .execute()

    current = current_resp.data
    new_version = (current.get('inference_version', 0) + 1) if current else 1

    # Check for user rejections
    rejected_items = current.get('user_rejected_items', []) if current else []

    # Filter out rejected items
    result['inferred_roles'] = [r for r in result['inferred_roles'] if r not in rejected_items]
    result['inferred_domains'] = [d for d in result['inferred_domains'] if d not in rejected_items]
    result['inferred_stack'] = [s for s in result['inferred_stack'] if s not in rejected_items]

    # Upsert
    upsert_data = {
        'user_id': user_id,
        'inferred_roles': result['inferred_roles'],
        'inferred_domains': result['inferred_domains'],
        'inferred_stack': result['inferred_stack'],
        'inferred_risk_tolerance': result['inferred_risk_tolerance'],
        'confidence_scores': result['confidence_scores'],
        'evidence_summary': result['evidence_summary'],
        'inference_version': new_version,
        'last_computed_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }

    # Preserve user acceptance/rejection state
    if current:
        upsert_data['user_accepted'] = current.get('user_accepted', False)
        upsert_data['user_rejected_items'] = rejected_items

    supabase.table('user_inferred_preferences').upsert(
        upsert_data,
        on_conflict='user_id'
    ).execute()

    logger.info(f"Updated inferred preferences for user {user_id}: v{new_version}")

    return {
        'status': 'updated',
        'version': new_version,
        'inferences': result,
    }


def get_merged_preferences(user_id: str) -> dict:
    """
    Get merged explicit + inferred preferences.

    Explicit preferences always take precedence.
    Inferred preferences only apply if:
    - User hasn't set explicit value
    - User has accepted inferences (opt-in)
    """
    # Get explicit preferences
    explicit_resp = supabase.table('user_preferences') \
        .select('*') \
        .eq('user_id', user_id) \
        .single() \
        .execute()

    explicit = explicit_resp.data or {}

    # Get inferred preferences
    inferred_resp = supabase.table('user_inferred_preferences') \
        .select('*') \
        .eq('user_id', user_id) \
        .single() \
        .execute()

    inferred = inferred_resp.data

    # Start with explicit preferences
    merged = {
        'target_roles': explicit.get('target_roles', []),
        'domains': explicit.get('domains', []),
        'tech_stack': explicit.get('tech_stack', []),
        'time_horizon': explicit.get('time_horizon', 'flexible'),
        'team_size': explicit.get('team_size', 'solo'),
        'risk_tolerance': explicit.get('risk_tolerance', 'medium'),
        'avoid_topics': explicit.get('avoid_topics', []),
    }

    # Only merge inferred if user has accepted AND explicit is empty
    if inferred and inferred.get('user_accepted'):
        if not merged['target_roles'] and inferred.get('inferred_roles'):
            merged['target_roles'] = inferred['inferred_roles']
            merged['_inferred_roles'] = True

        if not merged['domains'] and inferred.get('inferred_domains'):
            merged['domains'] = inferred['inferred_domains']
            merged['_inferred_domains'] = True

        if not merged['tech_stack'] and inferred.get('inferred_stack'):
            merged['tech_stack'] = inferred['inferred_stack']
            merged['_inferred_stack'] = True

        # Risk tolerance only if still default
        if merged['risk_tolerance'] == 'medium' and inferred.get('inferred_risk_tolerance'):
            merged['risk_tolerance'] = inferred['inferred_risk_tolerance']
            merged['_inferred_risk'] = True

    return merged


def reject_inferred_item(user_id: str, item: str) -> dict:
    """Mark an inferred item as rejected by user."""
    current_resp = supabase.table('user_inferred_preferences') \
        .select('user_rejected_items') \
        .eq('user_id', user_id) \
        .single() \
        .execute()

    if not current_resp.data:
        return {'status': 'error', 'reason': 'no_inferences_found'}

    rejected = current_resp.data.get('user_rejected_items', [])
    if item not in rejected:
        rejected.append(item)

    supabase.table('user_inferred_preferences') \
        .update({'user_rejected_items': rejected}) \
        .eq('user_id', user_id) \
        .execute()

    return {'status': 'rejected', 'item': item}


def accept_inferences(user_id: str, accept: bool = True) -> dict:
    """Set whether user accepts inferred preferences."""
    supabase.table('user_inferred_preferences') \
        .update({'user_accepted': accept}) \
        .eq('user_id', user_id) \
        .execute()

    return {'status': 'updated', 'user_accepted': accept}


if __name__ == '__main__':
    import sys

    if len(sys.argv) < 2:
        print("Usage: python preference_inference.py <user_id>")
        sys.exit(1)

    user_id = sys.argv[1]
    result = update_inferred_preferences(user_id)
    print(f"Result: {result}")

    if result.get('status') == 'updated':
        merged = get_merged_preferences(user_id)
        print(f"Merged preferences: {merged}")

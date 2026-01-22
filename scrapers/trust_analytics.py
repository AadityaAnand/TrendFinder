"""
Phase 5.4: Trust Analytics

Internal analytics to keep the system honest as it scales.
Tracks:
- Qualification rates
- Time to qualification
- False positive indicators
- Personalization impact
- User trust signals
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

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_qualification_stats(days_back: int = 30) -> dict:
    """
    Calculate qualification funnel metrics.

    Returns % of opportunities shown vs rejected,
    and breakdown by rejection reason.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()

    # Get all opportunities in the time window
    opps_resp = supabase.table('trend_opportunities') \
        .select('id, qualified, rejection_reasons, created_at') \
        .gte('created_at', cutoff) \
        .execute()

    opportunities = opps_resp.data or []

    if not opportunities:
        return {'error': 'no_data'}

    total = len(opportunities)
    qualified = [o for o in opportunities if o.get('qualified')]
    rejected = [o for o in opportunities if not o.get('qualified')]

    # Count rejection reasons
    reason_counts = {}
    for opp in rejected:
        for reason in (opp.get('rejection_reasons') or []):
            reason_counts[reason] = reason_counts.get(reason, 0) + 1

    return {
        'total_opportunities': total,
        'qualified_count': len(qualified),
        'rejected_count': len(rejected),
        'qualification_rate': round(len(qualified) / total * 100, 1) if total > 0 else 0,
        'rejection_reasons': reason_counts,
        'period_days': days_back,
    }


def get_time_to_qualification_stats() -> dict:
    """
    Calculate how long trends take to become qualified opportunities.

    Uses trajectory data to measure days from first_seen to first qualification.
    """
    # Get trajectories with qualified opportunities
    trajectories_resp = supabase.table('trend_trajectories') \
        .select('trend_id, first_seen_at, qualified_count, last_qualified_at') \
        .gt('qualified_count', 0) \
        .execute()

    trajectories = trajectories_resp.data or []

    if not trajectories:
        return {'error': 'no_qualified_trajectories'}

    # Calculate days to first qualification
    days_to_qualify = []

    for traj in trajectories:
        first_seen = traj.get('first_seen_at')
        last_qualified = traj.get('last_qualified_at')

        if first_seen and last_qualified:
            try:
                first_dt = datetime.fromisoformat(first_seen.replace('Z', '+00:00'))
                qual_dt = datetime.fromisoformat(last_qualified.replace('Z', '+00:00'))
                days = (qual_dt - first_dt).days
                if days >= 0:
                    days_to_qualify.append(days)
            except (ValueError, TypeError):
                continue

    if not days_to_qualify:
        return {'error': 'no_valid_data'}

    # Calculate stats
    days_to_qualify.sort()
    n = len(days_to_qualify)

    return {
        'sample_size': n,
        'min_days': min(days_to_qualify),
        'max_days': max(days_to_qualify),
        'median_days': days_to_qualify[n // 2],
        'avg_days': round(sum(days_to_qualify) / n, 1),
        'p25_days': days_to_qualify[n // 4] if n >= 4 else days_to_qualify[0],
        'p75_days': days_to_qualify[3 * n // 4] if n >= 4 else days_to_qualify[-1],
    }


def get_false_positive_indicators() -> dict:
    """
    Identify potential false positives in qualified opportunities.

    Indicators:
    - Qualified opportunities with high dismiss rate
    - Opportunities that qualified but never received positive feedback
    """
    # Get qualified opportunities from recent snapshots
    recent_cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()

    opps_resp = supabase.table('trend_opportunities') \
        .select('id, trend_id, opportunity_score') \
        .eq('qualified', True) \
        .gte('created_at', recent_cutoff) \
        .execute()

    qualified_opps = opps_resp.data or []

    if not qualified_opps:
        return {'error': 'no_qualified_opportunities'}

    opp_ids = [o['id'] for o in qualified_opps]

    # Get feedback on these opportunities
    feedback_resp = supabase.table('user_opportunity_feedback') \
        .select('opportunity_id, feedback_type') \
        .in_('opportunity_id', opp_ids) \
        .execute()

    feedback = feedback_resp.data or []

    # Aggregate feedback by opportunity
    opp_feedback = {}
    for fb in feedback:
        opp_id = fb['opportunity_id']
        if opp_id not in opp_feedback:
            opp_feedback[opp_id] = {'positive': 0, 'negative': 0}

        if fb['feedback_type'] in ('saved', 'acted'):
            opp_feedback[opp_id]['positive'] += 1
        elif fb['feedback_type'] in ('dismissed', 'not_relevant'):
            opp_feedback[opp_id]['negative'] += 1

    # Identify suspicious patterns
    high_dismiss_rate = []
    no_positive_feedback = []

    for opp in qualified_opps:
        opp_id = opp['id']
        fb = opp_feedback.get(opp_id, {'positive': 0, 'negative': 0})

        total_fb = fb['positive'] + fb['negative']

        if total_fb >= 3:
            dismiss_rate = fb['negative'] / total_fb
            if dismiss_rate >= 0.7:
                high_dismiss_rate.append({
                    'opportunity_id': opp_id,
                    'trend_id': opp['trend_id'],
                    'dismiss_rate': round(dismiss_rate, 2),
                    'feedback_count': total_fb,
                })

        # Opportunities with some feedback but no positive
        if total_fb >= 2 and fb['positive'] == 0:
            no_positive_feedback.append({
                'opportunity_id': opp_id,
                'trend_id': opp['trend_id'],
                'negative_count': fb['negative'],
            })

    return {
        'total_qualified_analyzed': len(qualified_opps),
        'with_feedback': len(opp_feedback),
        'high_dismiss_rate': high_dismiss_rate,
        'no_positive_feedback': no_positive_feedback,
        'potential_false_positive_count': len(high_dismiss_rate) + len(no_positive_feedback),
    }


def get_personalization_impact() -> dict:
    """
    Measure how much personalization changes rankings vs global.

    Compares personalized_score rankings to global_score rankings.
    """
    # This would need to be computed from actual API calls
    # For now, return structure for what would be tracked

    return {
        'note': 'Computed at request time from personalized API',
        'metrics_available': [
            'avg_rank_delta',           # How much personalization moves items
            'top_3_change_rate',        # % of time personalized top 3 differs from global
            'relevance_score_spread',   # Variance in relevance scores
            'weight_adjustment_impact', # How much learned weights change scores
        ]
    }


def get_user_trust_signals(days_back: int = 30) -> dict:
    """
    Aggregate user trust signals.

    Key metrics:
    - Dismiss vs save ratio
    - Acted rate (highest trust signal)
    - Feedback engagement rate
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()

    # Get all feedback
    feedback_resp = supabase.table('user_opportunity_feedback') \
        .select('feedback_type, user_id') \
        .gte('created_at', cutoff) \
        .execute()

    feedback = feedback_resp.data or []

    if not feedback:
        return {'error': 'no_feedback'}

    # Aggregate
    total = len(feedback)
    by_type = {}
    users = set()

    for fb in feedback:
        fb_type = fb['feedback_type']
        by_type[fb_type] = by_type.get(fb_type, 0) + 1
        users.add(fb['user_id'])

    saved = by_type.get('saved', 0)
    acted = by_type.get('acted', 0)
    dismissed = by_type.get('dismissed', 0) + by_type.get('not_relevant', 0)

    # Get outcomes for acted rate calculation
    outcomes_resp = supabase.table('opportunity_outcomes') \
        .select('outcome_type') \
        .gte('recorded_at', cutoff) \
        .execute()

    outcomes = outcomes_resp.data or []
    started = len([o for o in outcomes if o['outcome_type'] == 'started'])
    completed = len([o for o in outcomes if o['outcome_type'] == 'completed'])

    return {
        'period_days': days_back,
        'total_feedback': total,
        'unique_users': len(users),
        'feedback_breakdown': by_type,
        'save_rate': round(saved / total * 100, 1) if total > 0 else 0,
        'dismiss_rate': round(dismissed / total * 100, 1) if total > 0 else 0,
        'positive_ratio': round((saved + acted) / total, 2) if total > 0 else 0,
        'outcomes': {
            'started': started,
            'completed': completed,
            'completion_rate': round(completed / started * 100, 1) if started > 0 else 0,
        }
    }


def generate_trust_report() -> dict:
    """Generate a comprehensive trust analytics report."""
    return {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'qualification': get_qualification_stats(),
        'time_to_qualification': get_time_to_qualification_stats(),
        'false_positive_indicators': get_false_positive_indicators(),
        'personalization_impact': get_personalization_impact(),
        'user_trust_signals': get_user_trust_signals(),
    }


if __name__ == '__main__':
    import json

    report = generate_trust_report()
    print(json.dumps(report, indent=2))

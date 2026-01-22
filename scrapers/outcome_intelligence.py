"""
Phase 6: Outcome-Verified Intelligence

Processes real-world outcomes to:
1. Aggregate success/failure rates per opportunity and trend
2. Detect misclassifications (false positives/negatives)
3. Calibrate trust scores based on actual results
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

# Thresholds for classification
MIN_OUTCOMES_FOR_CLASSIFICATION = 3
SUCCESS_QUALITY_THRESHOLD = 3  # quality_score >= 3 is success
EXECUTION_TRAP_THRESHOLD = 0.3  # completion_rate < 30% with starts > 5


def compute_opportunity_outcome_stats(opportunity_id: str) -> Optional[dict]:
    """
    Aggregate all user outcomes for a single opportunity.
    """
    outcomes_resp = supabase.table('opportunity_outcomes') \
        .select('*') \
        .eq('opportunity_id', opportunity_id) \
        .execute()

    outcomes = outcomes_resp.data or []

    if not outcomes:
        return None

    # Count by type
    explored = [o for o in outcomes if o['outcome_type'] == 'explored']
    started = [o for o in outcomes if o['outcome_type'] == 'started']
    completed = [o for o in outcomes if o['outcome_type'] == 'completed']
    abandoned = [o for o in outcomes if o['outcome_type'] == 'abandoned']

    total_views = len(explored) + len(started) + len(completed) + len(abandoned)
    total_starts = len(started) + len(completed) + len(abandoned)
    total_completions = len(completed)
    total_abandonments = len(abandoned)

    # Quality scores (only from completed)
    quality_scores = [o['quality_score'] for o in completed if o.get('quality_score')]
    avg_quality = sum(quality_scores) / len(quality_scores) if quality_scores else None

    # Time metrics
    time_to_starts = [o['time_to_first_action'] for o in outcomes if o.get('time_to_first_action')]
    time_to_completes = [o['time_to_completion'] for o in completed if o.get('time_to_completion')]

    avg_time_to_start = sum(time_to_starts) / len(time_to_starts) if time_to_starts else None
    avg_time_to_complete = sum(time_to_completes) / len(time_to_completes) if time_to_completes else None

    # Rates
    start_rate = total_starts / total_views if total_views > 0 else 0
    completion_rate = total_completions / total_starts if total_starts > 0 else 0

    # Success rate (completions with quality >= 3)
    successful = len([o for o in completed if (o.get('quality_score') or 0) >= SUCCESS_QUALITY_THRESHOLD])
    success_rate = successful / total_completions if total_completions > 0 else 0

    return {
        'opportunity_id': opportunity_id,
        'total_views': total_views,
        'total_starts': total_starts,
        'total_completions': total_completions,
        'total_abandonments': total_abandonments,
        'avg_quality_score': round(avg_quality, 2) if avg_quality else None,
        'avg_time_to_start': round(avg_time_to_start, 1) if avg_time_to_start else None,
        'avg_time_to_complete': round(avg_time_to_complete, 1) if avg_time_to_complete else None,
        'start_rate': round(start_rate, 3),
        'completion_rate': round(completion_rate, 3),
        'success_rate': round(success_rate, 3),
        'last_updated_at': datetime.now(timezone.utc).isoformat()
    }


def update_opportunity_outcome_stats(opportunity_id: str) -> dict:
    """Update aggregated stats for an opportunity."""
    stats = compute_opportunity_outcome_stats(opportunity_id)

    if stats is None:
        return {'status': 'skipped', 'reason': 'no_outcomes'}

    supabase.table('opportunity_outcome_stats').upsert(
        stats,
        on_conflict='opportunity_id'
    ).execute()

    return {'status': 'updated', 'stats': stats}


def compute_trend_outcome_stats(trend_id: str) -> Optional[dict]:
    """
    Aggregate outcomes across all opportunities for a trend.
    """
    # Get all opportunities for this trend
    opps_resp = supabase.table('trend_opportunities') \
        .select('id, qualified, opportunity_score') \
        .eq('trend_id', trend_id) \
        .execute()

    opportunities = opps_resp.data or []

    if not opportunities:
        return None

    opp_ids = [o['id'] for o in opportunities]

    # Get outcome stats for these opportunities
    stats_resp = supabase.table('opportunity_outcome_stats') \
        .select('*') \
        .in_('opportunity_id', opp_ids) \
        .execute()

    opp_stats = stats_resp.data or []

    # Aggregate
    total_opportunities = len(opportunities)
    total_qualified = len([o for o in opportunities if o.get('qualified')])

    total_starts = sum(s.get('total_starts', 0) for s in opp_stats)
    total_completions = sum(s.get('total_completions', 0) for s in opp_stats)

    # Average rates (weighted by starts)
    completion_rates = [(s['completion_rate'], s['total_starts']) for s in opp_stats if s.get('total_starts', 0) > 0]
    if completion_rates:
        weighted_completion = sum(r * w for r, w in completion_rates) / sum(w for _, w in completion_rates)
    else:
        weighted_completion = None

    quality_scores = [s['avg_quality_score'] for s in opp_stats if s.get('avg_quality_score')]
    avg_quality = sum(quality_scores) / len(quality_scores) if quality_scores else None

    # Execution difficulty: inverse of completion rate, scaled
    if weighted_completion and weighted_completion > 0:
        execution_difficulty = round((1 - weighted_completion) * 10, 2)  # 0-10 scale
    else:
        execution_difficulty = None

    # Determine archetype based on patterns
    archetype = classify_trend_archetype(opportunities, opp_stats)

    return {
        'trend_id': trend_id,
        'total_opportunities': total_opportunities,
        'total_qualified': total_qualified,
        'total_user_starts': total_starts,
        'total_user_completions': total_completions,
        'avg_completion_rate': round(weighted_completion, 3) if weighted_completion else None,
        'avg_quality_score': round(avg_quality, 2) if avg_quality else None,
        'execution_difficulty_score': execution_difficulty,
        'trend_archetype': archetype,
        'last_updated_at': datetime.now(timezone.utc).isoformat()
    }


def classify_trend_archetype(opportunities: list[dict], stats: list[dict]) -> Optional[str]:
    """
    Classify trend into archetype based on outcome patterns.

    Archetypes:
    - fast_mvp: Quick to start, quick to complete, moderate quality
    - infra_bet: Slow to start, long completion, high quality when done
    - content_wedge: High start rate, variable completion, creator-focused
    - execution_trap: Many starts, few completions
    - proven_winner: High completion, high quality
    """
    if not stats:
        return None

    total_starts = sum(s.get('total_starts', 0) for s in stats)
    total_completions = sum(s.get('total_completions', 0) for s in stats)

    if total_starts < MIN_OUTCOMES_FOR_CLASSIFICATION:
        return None

    completion_rate = total_completions / total_starts if total_starts > 0 else 0
    quality_scores = [s['avg_quality_score'] for s in stats if s.get('avg_quality_score')]
    avg_quality = sum(quality_scores) / len(quality_scores) if quality_scores else 0

    time_to_completes = [s['avg_time_to_complete'] for s in stats if s.get('avg_time_to_complete')]
    avg_time = sum(time_to_completes) / len(time_to_completes) if time_to_completes else None

    # Classification rules
    if completion_rate < EXECUTION_TRAP_THRESHOLD and total_starts >= 5:
        return 'execution_trap'

    if completion_rate >= 0.6 and avg_quality >= 4:
        return 'proven_winner'

    if avg_time and avg_time <= 7 and completion_rate >= 0.4:
        return 'fast_mvp'

    if avg_time and avg_time >= 30 and avg_quality >= 3.5:
        return 'infra_bet'

    if completion_rate >= 0.3 and completion_rate < 0.6:
        return 'content_wedge'

    return None


def update_trend_outcome_stats(trend_id: str) -> dict:
    """Update aggregated stats for a trend."""
    stats = compute_trend_outcome_stats(trend_id)

    if stats is None:
        return {'status': 'skipped', 'reason': 'no_opportunities'}

    supabase.table('trend_outcome_stats').upsert(
        stats,
        on_conflict='trend_id'
    ).execute()

    return {'status': 'updated', 'stats': stats}


def detect_misclassification(
    trend_id: str,
    snapshot_id: str,
    predicted_qualified: bool,
    predicted_score: float,
    predicted_stage: Optional[str] = None
) -> dict:
    """
    Detect if an opportunity/trend was misclassified based on outcomes.
    """
    # Get trend outcome stats
    stats_resp = supabase.table('trend_outcome_stats') \
        .select('*') \
        .eq('trend_id', trend_id) \
        .single() \
        .execute()

    stats = stats_resp.data

    if not stats or stats.get('total_user_starts', 0) < MIN_OUTCOMES_FOR_CLASSIFICATION:
        return {'status': 'insufficient_data'}

    total_starts = stats.get('total_user_starts', 0)
    total_completions = stats.get('total_user_completions', 0)
    completion_rate = stats.get('avg_completion_rate', 0)
    avg_quality = stats.get('avg_quality_score', 0)

    # Determine actual outcome
    if total_completions >= 3 and avg_quality >= 4:
        actual_outcome = 'successful'
    elif total_completions >= 2 and avg_quality >= 3:
        actual_outcome = 'moderate_success'
    elif total_starts >= 5 and completion_rate < EXECUTION_TRAP_THRESHOLD:
        actual_outcome = 'execution_trap'
    elif predicted_qualified and total_starts < 2:
        actual_outcome = 'low_interest'
    elif not predicted_qualified and total_completions >= 2:
        actual_outcome = 'missed_opportunity'
    else:
        actual_outcome = 'correct_rejection' if not predicted_qualified else 'moderate_success'

    # Determine misclassification type
    if predicted_qualified:
        if actual_outcome in ('execution_trap', 'low_interest'):
            misclass_type = 'false_positive'
        elif actual_outcome == 'successful' and predicted_score < 0.5:
            misclass_type = 'calibration_error'
        else:
            misclass_type = 'none'
    else:
        if actual_outcome in ('successful', 'missed_opportunity'):
            misclass_type = 'false_negative'
        else:
            misclass_type = 'none'

    # Build evidence
    evidence = {
        'total_starts': total_starts,
        'total_completions': total_completions,
        'completion_rate': completion_rate,
        'avg_quality': avg_quality,
        'archetype': stats.get('trend_archetype'),
    }

    record = {
        'trend_id': trend_id,
        'snapshot_id': snapshot_id,
        'predicted_qualified': predicted_qualified,
        'predicted_score': predicted_score,
        'predicted_stage': predicted_stage,
        'actual_outcome': actual_outcome,
        'misclassification_type': misclass_type,
        'evidence_summary': evidence,
        'user_count': total_starts,
        'completion_count': total_completions,
        'avg_quality': avg_quality,
        'detected_at': datetime.now(timezone.utc).isoformat()
    }

    supabase.table('trend_misclassifications').upsert(
        record,
        on_conflict='trend_id,snapshot_id'
    ).execute()

    return {
        'status': 'detected',
        'actual_outcome': actual_outcome,
        'misclassification_type': misclass_type,
        'evidence': evidence
    }


def get_calibration_adjustments() -> dict:
    """
    Calculate calibration adjustments based on misclassification patterns.

    Returns recommended adjustments to scoring thresholds.
    """
    # Get recent misclassifications
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    misclass_resp = supabase.table('trend_misclassifications') \
        .select('*') \
        .gte('detected_at', cutoff) \
        .neq('misclassification_type', 'none') \
        .execute()

    misclassifications = misclass_resp.data or []

    if not misclassifications:
        return {'status': 'no_adjustments_needed', 'reason': 'no_misclassifications'}

    # Count by type
    false_positives = [m for m in misclassifications if m['misclassification_type'] == 'false_positive']
    false_negatives = [m for m in misclassifications if m['misclassification_type'] == 'false_negative']
    calibration_errors = [m for m in misclassifications if m['misclassification_type'] == 'calibration_error']

    total = len(misclassifications)
    fp_rate = len(false_positives) / total if total > 0 else 0
    fn_rate = len(false_negatives) / total if total > 0 else 0

    adjustments = {
        'qualification_threshold': 0,
        'confidence_weight': 0,
        'demand_weight': 0,
    }

    # If too many false positives, raise thresholds
    if fp_rate > 0.3:
        adjustments['qualification_threshold'] = 0.05  # Raise by 5%
        adjustments['confidence_weight'] = 0.1  # Weight confidence more

    # If too many false negatives, lower thresholds
    if fn_rate > 0.3:
        adjustments['qualification_threshold'] = -0.05
        adjustments['demand_weight'] = 0.1  # Weight demand signals more

    # Analyze execution traps
    execution_traps = [m for m in misclassifications if m.get('evidence_summary', {}).get('archetype') == 'execution_trap']
    if len(execution_traps) > 2:
        adjustments['effort_penalty'] = 0.1  # Penalize high-effort opportunities

    return {
        'status': 'adjustments_calculated',
        'total_misclassifications': total,
        'false_positive_rate': round(fp_rate, 2),
        'false_negative_rate': round(fn_rate, 2),
        'adjustments': adjustments,
        'execution_traps_detected': len(execution_traps)
    }


def run_outcome_aggregation() -> dict:
    """
    Run full outcome aggregation for all opportunities and trends.
    """
    logger.info("Starting outcome aggregation...")

    # Get all opportunities with outcomes
    outcomes_resp = supabase.table('opportunity_outcomes') \
        .select('opportunity_id') \
        .execute()

    opp_ids = list(set(o['opportunity_id'] for o in (outcomes_resp.data or [])))
    logger.info(f"Found {len(opp_ids)} opportunities with outcomes")

    # Update opportunity stats
    opp_updated = 0
    for opp_id in opp_ids:
        result = update_opportunity_outcome_stats(opp_id)
        if result.get('status') == 'updated':
            opp_updated += 1

    logger.info(f"Updated {opp_updated} opportunity stats")

    # Get all trends with opportunities that have outcomes
    if opp_ids:
        opps_resp = supabase.table('trend_opportunities') \
            .select('trend_id') \
            .in_('id', opp_ids) \
            .execute()

        trend_ids = list(set(o['trend_id'] for o in (opps_resp.data or [])))

        # Update trend stats
        trend_updated = 0
        for trend_id in trend_ids:
            result = update_trend_outcome_stats(trend_id)
            if result.get('status') == 'updated':
                trend_updated += 1

        logger.info(f"Updated {trend_updated} trend stats")
    else:
        trend_ids = []
        trend_updated = 0

    # Calculate calibration adjustments
    adjustments = get_calibration_adjustments()

    return {
        'opportunities_processed': len(opp_ids),
        'opportunities_updated': opp_updated,
        'trends_processed': len(trend_ids),
        'trends_updated': trend_updated,
        'calibration': adjustments
    }


if __name__ == '__main__':
    result = run_outcome_aggregation()
    print(f"Result: {result}")

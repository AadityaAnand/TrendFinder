"""
Phase 9d: Prediction Engine

Rule-based prediction model that estimates growth probability for each trend.
Uses trajectory features, source diversity, demand signals, and novelty scores.

Runs after trajectory update in the pipeline.
"""

import os
import json
import logging
from typing import Optional
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

MODEL_VERSION = 'prediction-rules-v1'


def get_latest_snapshot(supabase: Client) -> Optional[dict]:
    resp = supabase.table('trend_snapshots') \
        .select('id, run_at') \
        .order('run_at', desc=True) \
        .limit(1) \
        .execute()
    return resp.data[0] if resp.data else None


def get_snapshot_trends(supabase: Client, snapshot_id: str) -> list[dict]:
    """Get all trends in latest snapshot with their metrics."""
    resp = supabase.table('trend_snapshot_items') \
        .select('trend_id, momentum_score, signal_count, stability_score, trend_keyword, source_count, demand_density') \
        .eq('snapshot_id', snapshot_id) \
        .execute()
    return resp.data or []


def get_trajectory(supabase: Client, trend_id: str) -> Optional[dict]:
    """Get trajectory summary for a trend."""
    resp = supabase.table('trend_trajectories') \
        .select('weekly_growth_rate, acceleration, peak_momentum, current_stage, total_snapshots, trajectory_data, first_seen_at, last_seen_at') \
        .eq('trend_id', trend_id) \
        .limit(1) \
        .execute()
    return resp.data[0] if resp.data else None


def get_lifecycle(supabase: Client, snapshot_id: str, trend_id: str) -> Optional[dict]:
    resp = supabase.table('trend_lifecycle_history') \
        .select('lifecycle_stage, stage_confidence, acceleration_score, acceleration_comparable, days_seen, snapshots_seen') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .limit(1) \
        .execute()
    return resp.data[0] if resp.data else None


def get_pain_phrase_count(supabase: Client, snapshot_id: str, trend_id: str) -> int:
    """Count pain phrases for this trend."""
    resp = supabase.table('cluster_pain_phrases') \
        .select('id') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .execute()
    return len(resp.data) if resp.data else 0


def compute_prediction(
    trend: dict,
    trajectory: Optional[dict],
    lifecycle: Optional[dict],
    pain_count: int,
) -> dict:
    """
    Rule-based prediction engine.

    Returns:
        {
            'growth_probability': float 0-1,
            'predicted_direction': str,
            'confidence_level': str,
            'prediction_reasons': [{reason, weight, value}],
            'feature_vector': dict,
        }
    """
    reasons = []
    score = 0.0  # accumulates evidence for growth

    # Feature extraction
    momentum = trend.get('momentum_score') or 0
    signal_count = trend.get('signal_count') or 0
    source_count = trend.get('source_count') or 0
    demand_density = trend.get('demand_density') or 0
    growth_rate = trajectory.get('weekly_growth_rate') if trajectory else None
    acceleration = trajectory.get('acceleration') if trajectory else None
    total_snapshots = trajectory.get('total_snapshots', 0) if trajectory else 0
    stage = lifecycle.get('lifecycle_stage', 'unknown') if lifecycle else 'unknown'
    stage_confidence = lifecycle.get('stage_confidence', 0) if lifecycle else 0
    days_seen = lifecycle.get('days_seen', 0) if lifecycle else 0
    accel_score = lifecycle.get('acceleration_score', 0) if lifecycle else 0

    features = {
        'momentum': momentum,
        'signal_count': signal_count,
        'source_count': source_count,
        'demand_density': demand_density,
        'growth_rate': growth_rate,
        'acceleration': acceleration,
        'total_snapshots': total_snapshots,
        'stage': stage,
        'stage_confidence': stage_confidence,
        'days_seen': days_seen,
        'accel_score': accel_score,
        'pain_count': pain_count,
    }

    # Rule 1: Growth rate signal (strongest predictor)
    if growth_rate is not None:
        if growth_rate > 1.0:  # >100% growth
            score += 0.3
            reasons.append({'reason': f'Signal count grew {growth_rate:.0%} week-over-week', 'weight': 0.3, 'value': growth_rate})
        elif growth_rate > 0.5:  # >50% growth
            score += 0.2
            reasons.append({'reason': f'Signal count grew {growth_rate:.0%} week-over-week', 'weight': 0.2, 'value': growth_rate})
        elif growth_rate > 0.1:
            score += 0.1
            reasons.append({'reason': f'Moderate growth at {growth_rate:.0%} week-over-week', 'weight': 0.1, 'value': growth_rate})
        elif growth_rate < -0.3:
            score -= 0.15
            reasons.append({'reason': f'Declining: signal count dropped {abs(growth_rate):.0%}', 'weight': -0.15, 'value': growth_rate})

    # Rule 2: Acceleration (growth is speeding up)
    if acceleration is not None and acceleration > 0.2:
        score += 0.15
        reasons.append({'reason': 'Growth is accelerating — momentum is building', 'weight': 0.15, 'value': acceleration})
    elif acceleration is not None and acceleration < -0.2:
        score -= 0.1
        reasons.append({'reason': 'Growth is decelerating', 'weight': -0.1, 'value': acceleration})

    # Rule 3: Source diversity (cross-platform spread)
    if source_count >= 4:
        score += 0.15
        reasons.append({'reason': f'Spreading across {source_count} platforms', 'weight': 0.15, 'value': source_count})
    elif source_count >= 2:
        score += 0.08
        reasons.append({'reason': f'Discussed on {source_count} platforms', 'weight': 0.08, 'value': source_count})
    else:
        reasons.append({'reason': 'Single platform — limited spread so far', 'weight': 0.0, 'value': source_count})

    # Rule 4: Demand signals (people asking for solutions)
    if demand_density > 0.3:
        score += 0.15
        reasons.append({'reason': 'Strong demand signals — people are actively seeking solutions', 'weight': 0.15, 'value': demand_density})
    elif demand_density > 0.1:
        score += 0.08
        reasons.append({'reason': 'Some demand signals detected', 'weight': 0.08, 'value': demand_density})

    # Rule 5: Pain phrases (specific unmet needs)
    if pain_count >= 5:
        score += 0.1
        reasons.append({'reason': f'{pain_count} specific pain points identified', 'weight': 0.1, 'value': pain_count})
    elif pain_count >= 2:
        score += 0.05
        reasons.append({'reason': f'{pain_count} pain points found in discussions', 'weight': 0.05, 'value': pain_count})

    # Rule 6: Lifecycle stage
    if stage == 'emerging' and days_seen <= 5:
        score += 0.1
        reasons.append({'reason': 'Newly emerging trend — early stage', 'weight': 0.1, 'value': days_seen})
    elif stage == 'rising':
        score += 0.1
        reasons.append({'reason': 'Actively rising trend', 'weight': 0.1, 'value': stage})
    elif stage == 'peaking':
        score += 0.05
        reasons.append({'reason': 'At or near peak — may not have room to grow', 'weight': 0.05, 'value': stage})
    elif stage in ('declining', 'fading'):
        score -= 0.1
        reasons.append({'reason': f'Trend appears to be {stage}', 'weight': -0.1, 'value': stage})

    # Rule 7: Momentum strength
    if momentum > 0.7:
        score += 0.1
        reasons.append({'reason': 'High absolute momentum', 'weight': 0.1, 'value': momentum})

    # Clamp to [0, 1]
    growth_probability = max(0.0, min(1.0, score))

    # Determine direction (check breakout first — it's a superset of accelerating)
    if growth_rate is not None and growth_rate > 1.5 and source_count >= 3:
        direction = 'breakout'
    elif growth_rate is not None and growth_rate > 0.5 and (acceleration is None or acceleration >= 0):
        direction = 'accelerating'
    elif growth_rate is not None and growth_rate < -0.2:
        direction = 'declining'
    else:
        direction = 'steady'

    # Override to breakout if extreme signals
    if growth_probability > 0.7 and source_count >= 3 and (growth_rate or 0) > 0.8:
        direction = 'breakout'

    # Confidence level
    if total_snapshots >= 5 and stage_confidence >= 0.6:
        confidence = 'high'
    elif total_snapshots >= 3 or stage_confidence >= 0.4:
        confidence = 'medium'
    else:
        confidence = 'low'

    return {
        'growth_probability': round(growth_probability, 4),
        'predicted_direction': direction,
        'confidence_level': confidence,
        'prediction_reasons': reasons,
        'feature_vector': features,
    }


def save_prediction(supabase: Client, snapshot_id: str, trend_id: str, prediction: dict) -> bool:
    data = {
        'trend_id': trend_id,
        'snapshot_id': snapshot_id,
        'growth_probability': prediction['growth_probability'],
        'predicted_direction': prediction['predicted_direction'],
        'confidence_level': prediction['confidence_level'],
        'prediction_reasons': json.dumps(prediction['prediction_reasons']),
        'feature_vector': json.dumps(prediction['feature_vector']),
        'model_version': MODEL_VERSION,
    }
    try:
        supabase.table('trend_predictions') \
            .upsert(data, on_conflict='trend_id,snapshot_id') \
            .execute()
        return True
    except Exception as e:
        logger.error(f"Failed to save prediction for {trend_id}: {e}")
        return False


def run_predictions(snapshot_id: str = None) -> dict:
    """Main entry point: generate predictions for all trends in latest snapshot."""
    logger.info("=" * 60)
    logger.info("PREDICTION ENGINE")
    logger.info(f"Model version: {MODEL_VERSION}")
    logger.info("=" * 60)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    if not snapshot_id:
        snapshot = get_latest_snapshot(supabase)
        if not snapshot:
            logger.error("No snapshot found")
            return {'predicted': 0, 'failed': 0, 'high_growth': 0}
        snapshot_id = snapshot['id']

    logger.info(f"Using snapshot: {snapshot_id}")

    trends = get_snapshot_trends(supabase, snapshot_id)
    logger.info(f"Found {len(trends)} trends")

    stats = {'predicted': 0, 'failed': 0, 'high_growth': 0, 'breakout': 0}

    for trend in trends:
        trend_id = trend['trend_id']

        trajectory = get_trajectory(supabase, trend_id)
        lifecycle = get_lifecycle(supabase, snapshot_id, trend_id)
        pain_count = get_pain_phrase_count(supabase, snapshot_id, trend_id)

        prediction = compute_prediction(trend, trajectory, lifecycle, pain_count)

        if save_prediction(supabase, snapshot_id, trend_id, prediction):
            stats['predicted'] += 1
            keyword = trend.get('trend_keyword', 'unknown')[:40]

            if prediction['growth_probability'] > 0.5:
                stats['high_growth'] += 1
                logger.info(f"  HIGH: {keyword} — {prediction['growth_probability']:.0%} ({prediction['predicted_direction']})")

            if prediction['predicted_direction'] == 'breakout':
                stats['breakout'] += 1
                logger.info(f"  BREAKOUT: {keyword}")
        else:
            stats['failed'] += 1

    logger.info("=" * 60)
    logger.info("RESULTS")
    logger.info(f"Predicted: {stats['predicted']}")
    logger.info(f"High growth (>50%): {stats['high_growth']}")
    logger.info(f"Breakout signals: {stats['breakout']}")
    logger.info(f"Failed: {stats['failed']}")

    return stats


if __name__ == '__main__':
    result = run_predictions()
    print(f"\n=== Prediction Engine Results ===")
    for k, v in result.items():
        print(f"{k}: {v}")

"""
Stability (Volatility) Scorer.

Computes a stability score for each trend based on momentum history
across recent snapshots. Used for confidence calibration and timing classification.

Phase 2: Momentum & Qualification Upgrade — Task 3
"""

import os
import logging
import statistics
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def compute_stability_score(
    supabase: Client,
    trend_id: str,
    current_snapshot_id: str,
    lookback: int = 3,
) -> dict:
    """
    Compute stability score from momentum history.

    stability = 1 - coefficient_of_variation(momentum over last N snapshots)

    Returns:
        {
            'stability_score': float,  # 0.0 to 1.0
            'volatility_label': str,   # 'stable', 'rising', 'volatile'
            'momentum_history': list[float],
            'data_points': int,
        }
    """
    # Fetch recent momentum values for this trend (excluding current snapshot)
    response = supabase.table('trend_snapshot_items') \
        .select('momentum_score, snapshot_id') \
        .eq('trend_id', trend_id) \
        .neq('snapshot_id', current_snapshot_id) \
        .order('created_at', desc=True) \
        .limit(lookback) \
        .execute()

    previous_momentums = [
        row['momentum_score'] for row in (response.data or [])
        if row.get('momentum_score') is not None
    ]

    # Include current momentum if we can get it
    current_resp = supabase.table('trend_snapshot_items') \
        .select('momentum_score') \
        .eq('trend_id', trend_id) \
        .eq('snapshot_id', current_snapshot_id) \
        .limit(1) \
        .execute()

    current_momentum = None
    if current_resp.data:
        current_momentum = current_resp.data[0].get('momentum_score')

    all_momentums = []
    if current_momentum is not None:
        all_momentums.append(current_momentum)
    all_momentums.extend(previous_momentums)

    data_points = len(all_momentums)

    # Default: stable if insufficient data
    if data_points < 2:
        return {
            'stability_score': 1.0,
            'volatility_label': 'stable',
            'momentum_history': all_momentums,
            'data_points': data_points,
        }

    mean_momentum = statistics.mean(all_momentums)
    if mean_momentum <= 0:
        # Can't compute CV with zero or negative mean
        return {
            'stability_score': 1.0,
            'volatility_label': 'stable',
            'momentum_history': all_momentums,
            'data_points': data_points,
        }

    std_momentum = statistics.stdev(all_momentums)
    cv = std_momentum / mean_momentum
    stability_score = max(0.0, min(1.0, 1.0 - cv))

    # Label
    if stability_score >= 0.8:
        volatility_label = 'stable'
    elif stability_score >= 0.5:
        volatility_label = 'rising'
    else:
        volatility_label = 'volatile'

    return {
        'stability_score': round(stability_score, 3),
        'volatility_label': volatility_label,
        'momentum_history': all_momentums,
        'data_points': data_points,
    }


def update_snapshot_item_stability(
    supabase: Client,
    snapshot_id: str,
    trend_id: str,
    stability_data: dict,
) -> bool:
    """Update trend_snapshot_items with stability score and volatility label."""
    try:
        supabase.table('trend_snapshot_items') \
            .update({
                'stability_score': stability_data['stability_score'],
                'volatility_label': stability_data['volatility_label'],
            }) \
            .eq('snapshot_id', snapshot_id) \
            .eq('trend_id', trend_id) \
            .execute()
        return True
    except Exception as e:
        logger.error(f"Error updating stability for trend {trend_id}: {e}")
        return False

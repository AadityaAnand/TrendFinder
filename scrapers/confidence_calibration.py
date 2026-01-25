"""
Phase 7: Confidence-Calibrated Predictions

Every prediction includes a calibrated confidence score.
"70% confident" means 70% of such predictions actually come true.

Key concepts:
- Raw confidence: Initial estimate based on signals
- Calibrated confidence: Adjusted based on historical accuracy
- Brier score: Measures prediction quality (lower = better)
- ECE: Expected Calibration Error (how far off confidence is from accuracy)
"""

import os
import logging
import math
from datetime import datetime, timedelta
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

MODEL_VERSION = 'confidence-v1'

# Confidence buckets for calibration (10% intervals)
CALIBRATION_BUCKETS = [
    (0.0, 0.1), (0.1, 0.2), (0.2, 0.3), (0.3, 0.4), (0.4, 0.5),
    (0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 0.9), (0.9, 1.0)
]

_supabase: Optional[Client] = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase


# ============================================================
# CONFIDENCE COMPUTATION
# ============================================================

def compute_raw_confidence(
    prediction_type: str,
    entity_data: dict,
    historical_stats: Optional[dict] = None
) -> dict:
    """
    Compute raw (uncalibrated) confidence for a prediction.

    Returns:
        {
            'raw_confidence': float,
            'factors': dict,
            'interval_low': float,
            'interval_high': float
        }
    """
    factors = {}

    if prediction_type == 'will_qualify':
        return _confidence_will_qualify(entity_data, historical_stats, factors)
    elif prediction_type == 'will_be_started':
        return _confidence_will_be_started(entity_data, historical_stats, factors)
    elif prediction_type == 'will_be_completed':
        return _confidence_will_be_completed(entity_data, historical_stats, factors)
    elif prediction_type == 'will_succeed':
        return _confidence_will_succeed(entity_data, historical_stats, factors)
    else:
        # Default moderate confidence
        return {
            'raw_confidence': 0.5,
            'factors': {'method': 'default'},
            'interval_low': 0.3,
            'interval_high': 0.7
        }


def _confidence_will_qualify(data: dict, stats: Optional[dict], factors: dict) -> dict:
    """Confidence that a trend will produce qualified opportunities."""
    confidence = 0.5

    # Signal strength factor
    momentum = data.get('momentum_score', 0) or 0
    signal_count = data.get('signal_count', 0) or 0

    if momentum >= 0.7:
        confidence += 0.15
        factors['momentum'] = f"Strong momentum ({momentum:.2f})"
    elif momentum >= 0.5:
        confidence += 0.08
        factors['momentum'] = f"Moderate momentum ({momentum:.2f})"
    elif momentum < 0.3:
        confidence -= 0.10
        factors['momentum'] = f"Weak momentum ({momentum:.2f})"

    if signal_count >= 5:
        confidence += 0.10
        factors['signals'] = f"Strong signal volume ({signal_count})"
    elif signal_count >= 3:
        confidence += 0.05
        factors['signals'] = f"Moderate signals ({signal_count})"

    # Historical qualification rate
    if stats:
        hist_rate = stats.get('qualification_rate', 0) or 0
        sample_size = stats.get('sample_size', 0) or 0
        if sample_size >= 5:
            confidence = 0.4 * confidence + 0.6 * hist_rate
            factors['historical'] = f"Based on {sample_size} similar trends ({hist_rate:.0%} qualified)"

    # Lifecycle stage factor
    stage = data.get('lifecycle_stage', '')
    if stage in ['rising', 'peaking']:
        confidence += 0.08
        factors['lifecycle'] = f"Favorable stage ({stage})"
    elif stage in ['fading', 'declining']:
        confidence -= 0.12
        factors['lifecycle'] = f"Unfavorable stage ({stage})"

    confidence = max(0.05, min(0.95, confidence))

    # Confidence interval (wider with less data)
    width = 0.25 if not stats else max(0.10, 0.30 - (stats.get('sample_size', 0) or 0) * 0.02)

    return {
        'raw_confidence': round(confidence, 3),
        'factors': factors,
        'interval_low': round(max(0, confidence - width), 3),
        'interval_high': round(min(1, confidence + width), 3)
    }


def _confidence_will_be_started(data: dict, stats: Optional[dict], factors: dict) -> dict:
    """Confidence that users will start working on this opportunity."""
    confidence = 0.4  # Base rate - most things don't get started

    # Opportunity score factor
    opp_score = data.get('opportunity_score', 0) or 0
    if opp_score >= 0.7:
        confidence += 0.20
        factors['score'] = f"High opportunity score ({opp_score:.2f})"
    elif opp_score >= 0.5:
        confidence += 0.10
        factors['score'] = f"Moderate score ({opp_score:.2f})"

    # Actionability
    actions = data.get('suggested_actions', []) or []
    if len(actions) >= 3:
        confidence += 0.08
        factors['actionability'] = f"Clear action path ({len(actions)} actions)"

    # Historical start rate
    if stats:
        start_rate = stats.get('start_rate', 0) or 0
        sample = stats.get('total_views', 0) or 0
        if sample >= 10:
            confidence = 0.3 * confidence + 0.7 * start_rate
            factors['historical'] = f"Historical start rate: {start_rate:.0%}"

    confidence = max(0.05, min(0.95, confidence))
    width = 0.20 if stats and stats.get('total_views', 0) >= 10 else 0.30

    return {
        'raw_confidence': round(confidence, 3),
        'factors': factors,
        'interval_low': round(max(0, confidence - width), 3),
        'interval_high': round(min(1, confidence + width), 3)
    }


def _confidence_will_be_completed(data: dict, stats: Optional[dict], factors: dict) -> dict:
    """Confidence that started work will be completed."""
    confidence = 0.35  # Base completion rate

    # Archetype factor
    archetype = data.get('trend_archetype', '')
    archetype_rates = {
        'fast_mvp': 0.55,
        'proven_winner': 0.50,
        'content_wedge': 0.45,
        'infra_bet': 0.30,
        'execution_trap': 0.15
    }
    if archetype in archetype_rates:
        confidence = archetype_rates[archetype]
        factors['archetype'] = f"Archetype {archetype}: typical completion {confidence:.0%}"

    # Historical completion rate
    if stats:
        comp_rate = stats.get('completion_rate', 0) or 0
        starts = stats.get('total_starts', 0) or 0
        if starts >= 5:
            confidence = 0.3 * confidence + 0.7 * comp_rate
            factors['historical'] = f"Historical: {comp_rate:.0%} of {starts} starts completed"

    # Difficulty factor
    difficulty = data.get('execution_difficulty_score', 5) or 5
    if difficulty >= 7:
        confidence *= 0.8
        factors['difficulty'] = f"High difficulty ({difficulty}/10) reduces completion"
    elif difficulty <= 3:
        confidence *= 1.1
        factors['difficulty'] = f"Low difficulty ({difficulty}/10) helps completion"

    confidence = max(0.05, min(0.95, confidence))
    width = 0.15 if stats and stats.get('total_starts', 0) >= 10 else 0.25

    return {
        'raw_confidence': round(confidence, 3),
        'factors': factors,
        'interval_low': round(max(0, confidence - width), 3),
        'interval_high': round(min(1, confidence + width), 3)
    }


def _confidence_will_succeed(data: dict, stats: Optional[dict], factors: dict) -> dict:
    """Confidence that completed work will be successful (quality >= 3)."""
    confidence = 0.6  # Base success rate for completions

    # Quality history
    if stats:
        avg_quality = stats.get('avg_quality_score', 0) or 0
        completions = stats.get('total_completions', 0) or 0
        if completions >= 3:
            success_rate = stats.get('success_rate', 0) or 0
            confidence = 0.3 * confidence + 0.7 * success_rate
            factors['historical'] = f"Historical success: {success_rate:.0%} (n={completions})"

    # Archetype factor
    archetype = data.get('trend_archetype', '')
    if archetype == 'proven_winner':
        confidence += 0.15
        factors['archetype'] = "Proven winner archetype boosts success likelihood"
    elif archetype == 'execution_trap':
        confidence -= 0.20
        factors['archetype'] = "Execution trap archetype indicates success challenges"

    confidence = max(0.05, min(0.95, confidence))
    width = 0.20

    return {
        'raw_confidence': round(confidence, 3),
        'factors': factors,
        'interval_low': round(max(0, confidence - width), 3),
        'interval_high': round(min(1, confidence + width), 3)
    }


# ============================================================
# CALIBRATION ADJUSTMENT
# ============================================================

def get_calibration_adjustments(prediction_type: str) -> list[dict]:
    """Get active calibration adjustments for a prediction type."""
    supabase = get_supabase()

    response = supabase.table('confidence_adjustments') \
        .select('*') \
        .eq('prediction_type', prediction_type) \
        .eq('active', True) \
        .execute()

    return response.data or []


def apply_calibration(raw_confidence: float, prediction_type: str) -> float:
    """
    Apply calibration adjustments to raw confidence.

    Looks up the appropriate adjustment for this confidence level
    and applies the learned correction.
    """
    adjustments = get_calibration_adjustments(prediction_type)

    if not adjustments:
        return raw_confidence  # No adjustments yet

    # Find matching adjustment
    for adj in adjustments:
        if adj['raw_confidence_min'] <= raw_confidence < adj['raw_confidence_max']:
            multiplier = adj.get('adjustment_multiplier', 1.0) or 1.0
            offset = adj.get('adjustment_offset', 0.0) or 0.0
            calibrated = raw_confidence * multiplier + offset
            return max(0.01, min(0.99, calibrated))

    return raw_confidence


def make_prediction(
    entity_type: str,
    entity_id: str,
    snapshot_id: str,
    prediction_type: str,
    entity_data: dict,
    historical_stats: Optional[dict] = None
) -> dict:
    """
    Create a calibrated prediction and store it.

    Returns the prediction record with both raw and calibrated confidence.
    """
    supabase = get_supabase()

    # Compute raw confidence
    raw_result = compute_raw_confidence(prediction_type, entity_data, historical_stats)
    raw_conf = raw_result['raw_confidence']

    # Apply calibration
    calibrated_conf = apply_calibration(raw_conf, prediction_type)

    # Adjust interval proportionally
    interval_ratio = calibrated_conf / raw_conf if raw_conf > 0 else 1.0
    interval_low = max(0, raw_result['interval_low'] * interval_ratio)
    interval_high = min(1, raw_result['interval_high'] * interval_ratio)

    # Determine predicted outcome (for binary predictions)
    predicted_outcome = calibrated_conf >= 0.5

    prediction = {
        'entity_type': entity_type,
        'entity_id': entity_id,
        'snapshot_id': snapshot_id,
        'prediction_type': prediction_type,
        'predicted_outcome': predicted_outcome,
        'predicted_value': calibrated_conf,
        'confidence_score': calibrated_conf,
        'confidence_interval_low': round(interval_low, 3),
        'confidence_interval_high': round(interval_high, 3),
        'confidence_factors': {
            **raw_result['factors'],
            'raw_confidence': raw_conf,
            'calibration_applied': raw_conf != calibrated_conf
        },
        'model_version': MODEL_VERSION
    }

    # Upsert prediction
    response = supabase.table('confidence_predictions') \
        .upsert(prediction, on_conflict='entity_type,entity_id,snapshot_id,prediction_type') \
        .execute()

    return response.data[0] if response.data else prediction


# ============================================================
# PREDICTION RESOLUTION
# ============================================================

def resolve_prediction(
    prediction_id: str,
    actual_outcome: bool,
    actual_value: Optional[float] = None,
    note: Optional[str] = None
) -> dict:
    """Mark a prediction as resolved with the actual outcome."""
    supabase = get_supabase()

    update = {
        'actual_outcome': actual_outcome,
        'actual_value': actual_value,
        'resolved_at': datetime.utcnow().isoformat(),
        'resolution_note': note
    }

    response = supabase.table('confidence_predictions') \
        .update(update) \
        .eq('id', prediction_id) \
        .execute()

    return response.data[0] if response.data else {}


def auto_resolve_predictions(snapshot_id: str) -> dict:
    """
    Auto-resolve predictions based on actual outcomes.

    Call this after outcome data is collected.
    """
    supabase = get_supabase()
    resolved_count = 0
    errors = []

    # Get unresolved predictions for this snapshot
    response = supabase.table('confidence_predictions') \
        .select('*') \
        .eq('snapshot_id', snapshot_id) \
        .is_('resolved_at', 'null') \
        .execute()

    predictions = response.data or []

    for pred in predictions:
        try:
            entity_type = pred['entity_type']
            entity_id = pred['entity_id']
            prediction_type = pred['prediction_type']

            actual = _get_actual_outcome(entity_type, entity_id, prediction_type)

            if actual is not None:
                resolve_prediction(
                    pred['id'],
                    actual_outcome=actual['outcome'],
                    actual_value=actual.get('value'),
                    note=actual.get('note')
                )
                resolved_count += 1

        except Exception as e:
            errors.append(f"{pred['id']}: {str(e)}")

    return {
        'resolved': resolved_count,
        'total_checked': len(predictions),
        'errors': errors
    }


def _get_actual_outcome(entity_type: str, entity_id: str, prediction_type: str) -> Optional[dict]:
    """Look up actual outcome for a prediction."""
    supabase = get_supabase()

    if prediction_type == 'will_qualify':
        # Check if opportunity was qualified
        response = supabase.table('trend_opportunities') \
            .select('qualified') \
            .eq('trend_id', entity_id) \
            .execute()
        if response.data:
            qualified = any(o['qualified'] for o in response.data)
            return {'outcome': qualified, 'note': f"Found {len(response.data)} opportunities"}

    elif prediction_type == 'will_be_started':
        # Check opportunity outcome stats
        response = supabase.table('opportunity_outcome_stats') \
            .select('total_starts') \
            .eq('opportunity_id', entity_id) \
            .single() \
            .execute()
        if response.data:
            started = (response.data.get('total_starts', 0) or 0) > 0
            return {'outcome': started, 'value': response.data.get('total_starts')}

    elif prediction_type == 'will_be_completed':
        response = supabase.table('opportunity_outcome_stats') \
            .select('total_completions, total_starts') \
            .eq('opportunity_id', entity_id) \
            .single() \
            .execute()
        if response.data and response.data.get('total_starts', 0) > 0:
            completed = (response.data.get('total_completions', 0) or 0) > 0
            return {'outcome': completed, 'value': response.data.get('total_completions')}

    elif prediction_type == 'will_succeed':
        response = supabase.table('opportunity_outcome_stats') \
            .select('success_rate, total_completions') \
            .eq('opportunity_id', entity_id) \
            .single() \
            .execute()
        if response.data and response.data.get('total_completions', 0) > 0:
            success_rate = response.data.get('success_rate', 0) or 0
            return {'outcome': success_rate >= 0.5, 'value': success_rate}

    return None


# ============================================================
# CALIBRATION METRICS
# ============================================================

def compute_brier_score(predictions: list[dict]) -> float:
    """
    Compute Brier score for a set of resolved predictions.

    Brier score = mean((confidence - actual)^2)
    Range: 0 (perfect) to 1 (worst)
    """
    if not predictions:
        return 0.0

    total = 0.0
    count = 0

    for pred in predictions:
        if pred.get('resolved_at') and pred.get('actual_outcome') is not None:
            confidence = pred.get('confidence_score', 0.5)
            actual = 1.0 if pred['actual_outcome'] else 0.0
            total += (confidence - actual) ** 2
            count += 1

    return total / count if count > 0 else 0.0


def compute_calibration_error(predictions: list[dict]) -> dict:
    """
    Compute Expected Calibration Error (ECE) and Maximum Calibration Error (MCE).

    ECE: Weighted average of |accuracy - confidence| across buckets
    MCE: Maximum |accuracy - confidence| across buckets
    """
    buckets = {b: {'correct': 0, 'total': 0, 'confidence_sum': 0}
               for b in CALIBRATION_BUCKETS}

    for pred in predictions:
        if pred.get('resolved_at') is None or pred.get('actual_outcome') is None:
            continue

        conf = pred.get('confidence_score', 0.5)
        actual = pred['actual_outcome']

        # Find bucket
        for (low, high) in CALIBRATION_BUCKETS:
            if low <= conf < high or (high == 1.0 and conf == 1.0):
                buckets[(low, high)]['total'] += 1
                buckets[(low, high)]['confidence_sum'] += conf
                if actual:
                    buckets[(low, high)]['correct'] += 1
                break

    # Compute ECE and MCE
    total_samples = sum(b['total'] for b in buckets.values())
    if total_samples == 0:
        return {'ece': 0.0, 'mce': 0.0, 'buckets': {}}

    ece = 0.0
    mce = 0.0
    bucket_stats = {}

    for (low, high), data in buckets.items():
        if data['total'] == 0:
            continue

        accuracy = data['correct'] / data['total']
        avg_conf = data['confidence_sum'] / data['total']
        gap = abs(accuracy - avg_conf)

        ece += (data['total'] / total_samples) * gap
        mce = max(mce, gap)

        bucket_stats[f"{int(low*100)}-{int(high*100)}%"] = {
            'total': data['total'],
            'accuracy': round(accuracy, 3),
            'avg_confidence': round(avg_conf, 3),
            'gap': round(gap, 3)
        }

    return {
        'ece': round(ece, 4),
        'mce': round(mce, 4),
        'buckets': bucket_stats
    }


def update_calibration_metrics(
    prediction_type: str,
    window_days: int = 30
) -> dict:
    """
    Compute and store calibration metrics for a prediction type.
    """
    supabase = get_supabase()

    window_start = datetime.utcnow() - timedelta(days=window_days)

    # Get resolved predictions
    response = supabase.table('confidence_predictions') \
        .select('*') \
        .eq('prediction_type', prediction_type) \
        .not_.is_('resolved_at', 'null') \
        .gte('predicted_at', window_start.isoformat()) \
        .execute()

    predictions = response.data or []

    if not predictions:
        return {'error': 'No resolved predictions in window'}

    # Compute metrics
    brier = compute_brier_score(predictions)
    cal_error = compute_calibration_error(predictions)

    # Compute confidence distribution
    confidences = [p.get('confidence_score', 0.5) for p in predictions]
    avg_conf = sum(confidences) / len(confidences)
    conf_std = math.sqrt(sum((c - avg_conf)**2 for c in confidences) / len(confidences))

    metrics = {
        'prediction_type': prediction_type,
        'brier_score': round(brier, 4),
        'expected_calibration_error': cal_error['ece'],
        'maximum_calibration_error': cal_error['mce'],
        'avg_confidence': round(avg_conf, 3),
        'confidence_std': round(conf_std, 3),
        'total_resolved': len(predictions),
        'window_start': window_start.isoformat(),
        'window_end': datetime.utcnow().isoformat()
    }

    # Store metrics
    supabase.table('calibration_metrics').insert(metrics).execute()

    return {**metrics, 'bucket_details': cal_error['buckets']}


def update_calibration_adjustments(prediction_type: str, min_samples: int = 20) -> dict:
    """
    Learn calibration adjustments from historical predictions.

    For each confidence bucket, compute the observed accuracy
    and create an adjustment to map raw confidence to calibrated.
    """
    supabase = get_supabase()

    # Get resolved predictions
    response = supabase.table('confidence_predictions') \
        .select('confidence_score, confidence_factors, actual_outcome') \
        .eq('prediction_type', prediction_type) \
        .not_.is_('resolved_at', 'null') \
        .execute()

    predictions = response.data or []

    if len(predictions) < min_samples:
        return {'error': f'Need at least {min_samples} samples, have {len(predictions)}'}

    # Group by raw confidence buckets
    buckets = {b: {'correct': 0, 'total': 0} for b in CALIBRATION_BUCKETS}

    for pred in predictions:
        factors = pred.get('confidence_factors', {}) or {}
        raw_conf = factors.get('raw_confidence', pred.get('confidence_score', 0.5))
        actual = pred.get('actual_outcome', False)

        for (low, high) in CALIBRATION_BUCKETS:
            if low <= raw_conf < high or (high == 1.0 and raw_conf == 1.0):
                buckets[(low, high)]['total'] += 1
                if actual:
                    buckets[(low, high)]['correct'] += 1
                break

    # Create adjustments
    adjustments_created = 0

    for (low, high), data in buckets.items():
        if data['total'] < 5:  # Need minimum samples per bucket
            continue

        observed_accuracy = data['correct'] / data['total']
        bucket_midpoint = (low + high) / 2

        # Compute adjustment to map bucket_midpoint -> observed_accuracy
        if bucket_midpoint > 0:
            multiplier = observed_accuracy / bucket_midpoint
        else:
            multiplier = 1.0

        adjustment = {
            'prediction_type': prediction_type,
            'raw_confidence_min': low,
            'raw_confidence_max': high,
            'adjustment_multiplier': round(multiplier, 3),
            'adjustment_offset': 0.0,
            'calibrated_confidence_min': round(low * multiplier, 3),
            'calibrated_confidence_max': round(high * multiplier, 3),
            'based_on_samples': data['total'],
            'observed_accuracy': round(observed_accuracy, 3),
            'active': True
        }

        supabase.table('confidence_adjustments') \
            .upsert(adjustment, on_conflict='prediction_type,raw_confidence_min,raw_confidence_max') \
            .execute()

        adjustments_created += 1

    return {
        'adjustments_created': adjustments_created,
        'total_predictions': len(predictions)
    }


# ============================================================
# BATCH OPERATIONS
# ============================================================

def make_batch_predictions(
    snapshot_id: str,
    prediction_types: list[str] = None
) -> dict:
    """
    Make predictions for all entities in a snapshot.
    """
    supabase = get_supabase()

    if prediction_types is None:
        prediction_types = ['will_qualify', 'will_be_started', 'will_be_completed']

    stats = {pt: 0 for pt in prediction_types}
    errors = []

    # Get trends from snapshot
    response = supabase.table('trend_snapshot_items') \
        .select('trend_id, momentum_score, signal_count') \
        .eq('snapshot_id', snapshot_id) \
        .execute()

    trends = response.data or []

    # Get trend outcome stats for historical data
    trend_ids = [t['trend_id'] for t in trends]
    stats_response = supabase.table('trend_outcome_stats') \
        .select('*') \
        .in_('trend_id', trend_ids) \
        .execute()

    stats_map = {s['trend_id']: s for s in (stats_response.data or [])}

    for trend in trends:
        trend_id = trend['trend_id']
        hist_stats = stats_map.get(trend_id)

        for pred_type in prediction_types:
            try:
                if pred_type == 'will_qualify':
                    make_prediction(
                        entity_type='trend',
                        entity_id=trend_id,
                        snapshot_id=snapshot_id,
                        prediction_type=pred_type,
                        entity_data=trend,
                        historical_stats=hist_stats
                    )
                    stats[pred_type] += 1
            except Exception as e:
                errors.append(f"{trend_id}/{pred_type}: {str(e)}")

    # Get opportunities for this snapshot
    opp_response = supabase.table('trend_opportunities') \
        .select('id, trend_id, opportunity_score, suggested_actions') \
        .eq('snapshot_id', snapshot_id) \
        .eq('qualified', True) \
        .execute()

    opportunities = opp_response.data or []

    # Get opportunity outcome stats
    opp_ids = [o['id'] for o in opportunities]
    opp_stats_response = supabase.table('opportunity_outcome_stats') \
        .select('*') \
        .in_('opportunity_id', opp_ids) \
        .execute()

    opp_stats_map = {s['opportunity_id']: s for s in (opp_stats_response.data or [])}

    for opp in opportunities:
        opp_id = opp['id']
        trend_stats = stats_map.get(opp.get('trend_id'))
        opp_stats = opp_stats_map.get(opp_id)

        # Merge stats
        merged_stats = {**(trend_stats or {}), **(opp_stats or {})}

        for pred_type in ['will_be_started', 'will_be_completed', 'will_succeed']:
            if pred_type not in prediction_types:
                continue
            try:
                make_prediction(
                    entity_type='opportunity',
                    entity_id=opp_id,
                    snapshot_id=snapshot_id,
                    prediction_type=pred_type,
                    entity_data={**opp, **(trend_stats or {})},
                    historical_stats=merged_stats
                )
                stats[pred_type] += 1
            except Exception as e:
                errors.append(f"{opp_id}/{pred_type}: {str(e)}")

    return {
        'predictions_made': stats,
        'trends_processed': len(trends),
        'opportunities_processed': len(opportunities),
        'errors': errors[:10]  # Limit error output
    }


def get_calibration_report() -> dict:
    """Generate a summary calibration report."""
    supabase = get_supabase()

    # Get latest metrics for each prediction type
    response = supabase.table('calibration_metrics') \
        .select('*') \
        .order('computed_at', desc=True) \
        .limit(20) \
        .execute()

    metrics = response.data or []

    # Group by prediction type (take latest)
    by_type = {}
    for m in metrics:
        pt = m['prediction_type']
        if pt not in by_type:
            by_type[pt] = m

    # Get active adjustments count
    adj_response = supabase.table('confidence_adjustments') \
        .select('prediction_type') \
        .eq('active', True) \
        .execute()

    adj_counts = {}
    for a in (adj_response.data or []):
        pt = a['prediction_type']
        adj_counts[pt] = adj_counts.get(pt, 0) + 1

    return {
        'metrics_by_type': by_type,
        'adjustment_counts': adj_counts,
        'summary': {
            'prediction_types': list(by_type.keys()),
            'avg_brier_score': sum(m.get('brier_score', 0) for m in by_type.values()) / max(len(by_type), 1),
            'avg_ece': sum(m.get('expected_calibration_error', 0) for m in by_type.values()) / max(len(by_type), 1)
        }
    }


if __name__ == '__main__':
    report = get_calibration_report()
    print("Calibration Report")
    print("=" * 50)
    print(f"Prediction types: {report['summary']['prediction_types']}")
    print(f"Avg Brier score: {report['summary']['avg_brier_score']:.4f}")
    print(f"Avg ECE: {report['summary']['avg_ece']:.4f}")
    print(f"\nAdjustment counts: {report['adjustment_counts']}")

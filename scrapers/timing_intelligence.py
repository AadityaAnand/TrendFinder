"""
Phase 8: Timing Intelligence

Answers: "When should I act on this opportunity?"
With explicit uncertainty and without overclaiming.

Labels:
- too_early: Insufficient signal, wait
- early_edge: Sweet spot, act now
- crowded: High competition
- late_but_monetizable: Past peak but viable
- timing_uncertain: Cannot determine (guardrails)
"""

import os
import logging
import statistics
from datetime import datetime, timedelta
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

MODEL_VERSION = 'timing-v1'

# Guardrail thresholds
MIN_DAYS_FOR_TIMING = 2
MIN_SNAPSHOTS_FOR_ACCELERATION = 3
UNCERTAIN_CONFIDENCE_CAP = 0.6

# Timing classification thresholds
MOMENTUM_LOW = 0.3
MOMENTUM_HIGH = 0.7
ACCELERATION_THRESHOLD = 0.02
CROWDING_SIGNAL_THRESHOLD = 20  # Signals in a single snapshot
CROWDING_TOPK_DROP = 0.15  # TopK mean drop indicating saturation

_supabase: Optional[Client] = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase


# ============================================================
# DATA FETCHING
# ============================================================

def get_trend_trajectory(trend_id: str, limit: int = 14) -> list[dict]:
    """Get recent trajectory data for a trend."""
    supabase = get_supabase()

    # Get snapshot items for this trend
    response = supabase.table('trend_snapshot_items') \
        .select('snapshot_id, momentum_score, signal_count, top3_mean') \
        .eq('trend_id', trend_id) \
        .order('snapshot_id', desc=True) \
        .limit(limit) \
        .execute()

    items = response.data or []
    if not items:
        return []

    # Get snapshot timestamps
    snapshot_ids = [i['snapshot_id'] for i in items]
    snap_response = supabase.table('trend_snapshots') \
        .select('id, run_at') \
        .in_('id', snapshot_ids) \
        .execute()

    snap_map = {s['id']: s['run_at'] for s in (snap_response.data or [])}

    # Merge and sort
    for item in items:
        item['run_at'] = snap_map.get(item['snapshot_id'])

    items.sort(key=lambda x: x.get('run_at') or '', reverse=False)

    return items


def get_trend_lifecycle(trend_id: str) -> Optional[dict]:
    """Get current lifecycle data."""
    supabase = get_supabase()

    response = supabase.table('trend_lifecycles') \
        .select('*') \
        .eq('trend_id', trend_id) \
        .single() \
        .execute()

    return response.data


def get_trend_outcome_stats(trend_id: str) -> Optional[dict]:
    """Get outcome stats from Phase 6."""
    supabase = get_supabase()

    response = supabase.table('trend_outcome_stats') \
        .select('*') \
        .eq('trend_id', trend_id) \
        .single() \
        .execute()

    return response.data


def get_confidence_prediction(trend_id: str, snapshot_id: str) -> Optional[dict]:
    """Get calibrated confidence from Phase 7."""
    supabase = get_supabase()

    response = supabase.table('confidence_predictions') \
        .select('confidence_score, confidence_factors') \
        .eq('entity_type', 'trend') \
        .eq('entity_id', trend_id) \
        .eq('snapshot_id', snapshot_id) \
        .eq('prediction_type', 'will_qualify') \
        .single() \
        .execute()

    return response.data


# ============================================================
# INFLECTION DETECTION
# ============================================================

def detect_inflections(trajectory: list[dict]) -> list[dict]:
    """
    Detect timing-relevant inflection events from trajectory.

    Returns list of detected inflections with type and evidence.
    """
    inflections = []

    if len(trajectory) < 2:
        return inflections

    # Extract momentum series
    momentum_series = [t.get('momentum_score', 0) or 0 for t in trajectory]
    signal_series = [t.get('signal_count', 0) or 0 for t in trajectory]
    topk_series = [t.get('top3_mean', 0) or 0 for t in trajectory]

    # 1. Acceleration inflection up
    if len(momentum_series) >= 3:
        inflection = _detect_acceleration_inflection(momentum_series, trajectory)
        if inflection:
            inflections.append(inflection)

    # 2. Momentum breakout
    breakout = _detect_momentum_breakout(momentum_series, trajectory)
    if breakout:
        inflections.append(breakout)

    # 3. Demand/signal breakout
    signal_breakout = _detect_signal_breakout(signal_series, trajectory)
    if signal_breakout:
        inflections.append(signal_breakout)

    # 4. TopK mean decline (crowding signal)
    topk_decline = _detect_topk_decline(topk_series, trajectory)
    if topk_decline:
        inflections.append(topk_decline)

    return inflections


def _detect_acceleration_inflection(momentum: list[float], trajectory: list[dict]) -> Optional[dict]:
    """Detect when acceleration crosses from <=0 to >0 and stays."""
    if len(momentum) < 3:
        return None

    # Compute velocity (first derivative)
    velocity = [momentum[i] - momentum[i-1] for i in range(1, len(momentum))]

    # Look for sign change in velocity (acceleration inflection)
    for i in range(1, len(velocity)):
        prev_vel = velocity[i-1]
        curr_vel = velocity[i]

        # Crossing from negative/zero to positive
        if prev_vel <= 0 and curr_vel > ACCELERATION_THRESHOLD:
            # Check if it stays positive for next point (if available)
            if i + 1 < len(velocity) and velocity[i + 1] > 0:
                return {
                    'type': 'acceleration_inflection_up',
                    'detected_at': trajectory[i + 1].get('run_at'),
                    'evidence': {
                        'prev_velocity': round(prev_vel, 4),
                        'new_velocity': round(curr_vel, 4),
                        'sustained': True
                    }
                }

    return None


def _detect_momentum_breakout(momentum: list[float], trajectory: list[dict]) -> Optional[dict]:
    """Detect momentum exceeding its median by significant margin."""
    if len(momentum) < 5:
        return None

    recent = momentum[-3:]  # Last 3 points
    historical = momentum[:-3] if len(momentum) > 3 else momentum

    if len(historical) < 2:
        return None

    median = statistics.median(historical)
    try:
        stdev = statistics.stdev(historical)
    except statistics.StatisticsError:
        stdev = 0.1  # Default if can't compute

    current = recent[-1]

    # Breakout if current exceeds median + 1.5 stddev
    threshold = median + 1.5 * max(stdev, 0.05)

    if current > threshold and current > 0.5:
        return {
            'type': 'momentum_breakout',
            'detected_at': trajectory[-1].get('run_at'),
            'evidence': {
                'current': round(current, 3),
                'median': round(median, 3),
                'threshold': round(threshold, 3),
                'stddev': round(stdev, 3)
            }
        }

    return None


def _detect_signal_breakout(signals: list[int], trajectory: list[dict]) -> Optional[dict]:
    """Detect rising signal volume for 2+ consecutive runs."""
    if len(signals) < 3:
        return None

    # Check last 3 points for rising trend
    recent = signals[-3:]

    if recent[1] > recent[0] and recent[2] > recent[1]:
        growth_rate = (recent[2] - recent[0]) / max(recent[0], 1)
        if growth_rate > 0.3:  # 30% growth
            return {
                'type': 'demand_breakout',
                'detected_at': trajectory[-1].get('run_at'),
                'evidence': {
                    'signal_sequence': recent,
                    'growth_rate': round(growth_rate, 2)
                }
            }

    return None


def _detect_topk_decline(topk: list[float], trajectory: list[dict]) -> Optional[dict]:
    """Detect falling topK mean while signals rise (crowding signal)."""
    if len(topk) < 3:
        return None

    recent = topk[-3:]

    # Declining topK
    if recent[2] < recent[1] < recent[0]:
        decline = (recent[0] - recent[2]) / max(recent[0], 0.01)
        if decline > CROWDING_TOPK_DROP:
            return {
                'type': 'topk_decline_crowding',
                'detected_at': trajectory[-1].get('run_at'),
                'evidence': {
                    'topk_sequence': [round(t, 3) for t in recent],
                    'decline_rate': round(decline, 3)
                }
            }

    return None


# ============================================================
# ENTRY WINDOW CLASSIFIER
# ============================================================

def classify_timing(
    trend_id: str,
    snapshot_id: str,
    trajectory: list[dict],
    lifecycle: Optional[dict],
    outcome_stats: Optional[dict],
    confidence_data: Optional[dict]
) -> dict:
    """
    Classify the timing window for a trend.

    Returns:
        {
            'timing_label': str,
            'timing_confidence': float,
            'timing_reasons': list[str],
            'timing_guards': list[str],
            'inflections_detected': list[dict],
            'expiry_risk': str,
            'expiry_reasons': list[str],
            'inputs_used': dict
        }
    """
    guards = []
    reasons = []

    # Compute inputs
    inputs = _compute_timing_inputs(trajectory, lifecycle, outcome_stats, confidence_data)

    # Detect inflections
    inflections = detect_inflections(trajectory)

    # Apply guardrails first
    days_seen = inputs.get('days_seen', 0)
    acceleration_comparable = inputs.get('acceleration_comparable', False)

    if days_seen < MIN_DAYS_FOR_TIMING:
        guards.append(f"insufficient_days (have {days_seen}, need {MIN_DAYS_FOR_TIMING})")

    if not acceleration_comparable:
        guards.append("acceleration_not_comparable")

    # If guardrails triggered, return uncertain
    if guards:
        # Cap confidence for uncertain
        base_conf = inputs.get('calibrated_confidence', 0.5)
        capped_conf = min(base_conf, UNCERTAIN_CONFIDENCE_CAP)

        return {
            'timing_label': 'timing_uncertain',
            'timing_confidence': capped_conf,
            'timing_reasons': ['Insufficient data for timing determination'],
            'timing_guards': guards,
            'inflections_detected': inflections,
            'expiry_risk': 'low',
            'expiry_reasons': [],
            'inputs_used': inputs
        }

    # Now classify based on inputs
    label, label_reasons = _determine_timing_label(inputs, inflections, lifecycle)
    reasons.extend(label_reasons)

    # Compute expiry risk
    expiry_risk, expiry_reasons = _compute_expiry_risk(inputs, inflections, lifecycle)

    # Get confidence (from Phase 7 or compute)
    confidence = inputs.get('calibrated_confidence', 0.5)

    # Adjust confidence based on data quality
    if inputs.get('snapshot_count', 0) >= 7:
        confidence = min(1.0, confidence * 1.1)  # Boost for more data
    elif inputs.get('snapshot_count', 0) < 4:
        confidence = confidence * 0.9  # Reduce for less data

    return {
        'timing_label': label,
        'timing_confidence': round(confidence, 3),
        'timing_reasons': reasons,
        'timing_guards': guards,
        'inflections_detected': inflections,
        'expiry_risk': expiry_risk,
        'expiry_reasons': expiry_reasons,
        'inputs_used': inputs
    }


def _compute_timing_inputs(
    trajectory: list[dict],
    lifecycle: Optional[dict],
    outcome_stats: Optional[dict],
    confidence_data: Optional[dict]
) -> dict:
    """Compute all inputs needed for timing classification."""
    inputs = {
        'snapshot_count': len(trajectory),
        'days_seen': 0,
        'acceleration_comparable': False,
        'momentum': 0,
        'momentum_slope': 0,
        'signal_count': 0,
        'signal_trend': 'stable',
        'topk_mean': 0,
        'lifecycle_stage': None,
        'stage_confidence': 0,
        'outcome_archetype': None,
        'calibrated_confidence': 0.5
    }

    if not trajectory:
        return inputs

    # Days seen (from first to last snapshot)
    if len(trajectory) >= 2:
        first_date = trajectory[0].get('run_at')
        last_date = trajectory[-1].get('run_at')
        if first_date and last_date:
            try:
                first_dt = datetime.fromisoformat(first_date.replace('Z', '+00:00'))
                last_dt = datetime.fromisoformat(last_date.replace('Z', '+00:00'))
                inputs['days_seen'] = (last_dt - first_dt).days + 1
            except (ValueError, TypeError):
                inputs['days_seen'] = len(trajectory)

    # Acceleration comparable only if enough data points
    inputs['acceleration_comparable'] = len(trajectory) >= MIN_SNAPSHOTS_FOR_ACCELERATION

    # Current values
    latest = trajectory[-1]
    inputs['momentum'] = latest.get('momentum_score', 0) or 0
    inputs['signal_count'] = latest.get('signal_count', 0) or 0
    inputs['topk_mean'] = latest.get('top3_mean', 0) or 0

    # Momentum slope (if enough data)
    if len(trajectory) >= 2:
        momentum_series = [t.get('momentum_score', 0) or 0 for t in trajectory]
        inputs['momentum_slope'] = (momentum_series[-1] - momentum_series[-2])

        # More robust slope with linear regression approximation
        if len(momentum_series) >= 3:
            n = len(momentum_series)
            x_mean = (n - 1) / 2
            y_mean = sum(momentum_series) / n
            numerator = sum((i - x_mean) * (momentum_series[i] - y_mean) for i in range(n))
            denominator = sum((i - x_mean) ** 2 for i in range(n))
            if denominator > 0:
                inputs['momentum_slope'] = numerator / denominator

    # Signal trend
    if len(trajectory) >= 3:
        signals = [t.get('signal_count', 0) or 0 for t in trajectory[-3:]]
        if signals[2] > signals[1] > signals[0]:
            inputs['signal_trend'] = 'rising'
        elif signals[2] < signals[1] < signals[0]:
            inputs['signal_trend'] = 'falling'
        else:
            inputs['signal_trend'] = 'stable'

    # Lifecycle data
    if lifecycle:
        inputs['lifecycle_stage'] = lifecycle.get('lifecycle_stage')
        inputs['stage_confidence'] = lifecycle.get('stage_confidence', 0) or 0

    # Outcome data (Phase 6)
    if outcome_stats:
        inputs['outcome_archetype'] = outcome_stats.get('trend_archetype')

    # Calibrated confidence (Phase 7)
    if confidence_data:
        inputs['calibrated_confidence'] = confidence_data.get('confidence_score', 0.5) or 0.5

    return inputs


def _determine_timing_label(
    inputs: dict,
    inflections: list[dict],
    lifecycle: Optional[dict]
) -> tuple[str, list[str]]:
    """Determine timing label based on inputs."""
    reasons = []

    momentum = inputs.get('momentum', 0)
    slope = inputs.get('momentum_slope', 0)
    stage = inputs.get('lifecycle_stage')
    signal_count = inputs.get('signal_count', 0)
    signal_trend = inputs.get('signal_trend', 'stable')
    topk_mean = inputs.get('topk_mean', 0)

    # Check for inflection types
    inflection_types = {i['type'] for i in inflections}

    # Too early: Low momentum, no breakouts, emerging stage
    if momentum < MOMENTUM_LOW and stage in ['emerging', None]:
        if slope <= 0:
            reasons.append(f"Low momentum ({momentum:.2f}) with no upward trend")
            reasons.append("Stage: emerging or unknown")
            return 'too_early', reasons

    # Crowded: High signals + falling topK + crowding inflection
    if 'topk_decline_crowding' in inflection_types:
        reasons.append("TopK quality declining while signal volume high")
        reasons.append(f"Signal count: {signal_count}")
        return 'crowded', reasons

    if signal_count > CROWDING_SIGNAL_THRESHOLD and slope < 0:
        reasons.append(f"High signal volume ({signal_count}) with declining momentum")
        return 'crowded', reasons

    # Early edge: Rising momentum, positive slope, good inflections
    if momentum >= MOMENTUM_LOW and slope > 0:
        if 'momentum_breakout' in inflection_types or 'acceleration_inflection_up' in inflection_types:
            reasons.append(f"Strong momentum ({momentum:.2f}) with positive acceleration")
            reasons.append("Detected: momentum breakout or acceleration inflection")
            return 'early_edge', reasons

        if stage in ['emerging', 'rising'] and signal_trend == 'rising':
            reasons.append(f"Rising stage ({stage}) with growing signals")
            reasons.append(f"Momentum slope: {slope:.3f}")
            return 'early_edge', reasons

    # Late but monetizable: Declining stage but still decent momentum
    if stage in ['peaking', 'declining', 'stable']:
        if momentum >= 0.4 and slope >= -0.05:
            reasons.append(f"Stage {stage} but momentum still viable ({momentum:.2f})")
            reasons.append("May still be monetizable for certain plays")
            return 'late_but_monetizable', reasons

    # High momentum, positive slope = early edge
    if momentum >= MOMENTUM_HIGH and slope >= 0:
        reasons.append(f"High momentum ({momentum:.2f})")
        reasons.append(f"Slope: {slope:.3f}")
        return 'early_edge', reasons

    # Moderate momentum, could be early edge or too early
    if momentum >= MOMENTUM_LOW:
        if slope > 0 and signal_trend == 'rising':
            reasons.append(f"Moderate momentum ({momentum:.2f}) with positive signals")
            return 'early_edge', reasons
        else:
            reasons.append(f"Moderate momentum ({momentum:.2f}) but unclear trajectory")
            return 'too_early', reasons

    # Default to too early
    reasons.append(f"Momentum below threshold ({momentum:.2f} < {MOMENTUM_LOW})")
    return 'too_early', reasons


def _compute_expiry_risk(
    inputs: dict,
    inflections: list[dict],
    lifecycle: Optional[dict]
) -> tuple[str, list[str]]:
    """Compute expiry risk level."""
    reasons = []

    stage = inputs.get('lifecycle_stage')
    slope = inputs.get('momentum_slope', 0)
    signal_trend = inputs.get('signal_trend', 'stable')

    inflection_types = {i['type'] for i in inflections}

    # High risk: declining stage + negative slope + crowding
    if stage in ['declining', 'fading']:
        reasons.append(f"Lifecycle stage: {stage}")
        if slope < -0.03:
            reasons.append(f"Momentum declining ({slope:.3f}/snapshot)")
            return 'high', reasons
        return 'medium', reasons

    # Medium risk: peaking with negative slope
    if stage == 'peaking' and slope < 0:
        reasons.append("At peak with declining momentum")
        return 'medium', reasons

    # Medium risk: crowding detected
    if 'topk_decline_crowding' in inflection_types:
        reasons.append("Crowding signals detected")
        return 'medium', reasons

    # Medium risk: sustained negative slope
    if slope < -0.05:
        reasons.append(f"Momentum declining significantly ({slope:.3f})")
        return 'medium', reasons

    # Low risk otherwise
    return 'low', reasons


# ============================================================
# MAIN COMPUTATION
# ============================================================

def compute_timing_signal(trend_id: str, snapshot_id: str) -> dict:
    """
    Compute and store timing signal for a trend.
    """
    supabase = get_supabase()

    # Gather data
    trajectory = get_trend_trajectory(trend_id)
    lifecycle = get_trend_lifecycle(trend_id)
    outcome_stats = get_trend_outcome_stats(trend_id)
    confidence_data = get_confidence_prediction(trend_id, snapshot_id)

    # Classify
    result = classify_timing(
        trend_id, snapshot_id, trajectory,
        lifecycle, outcome_stats, confidence_data
    )

    # Store
    signal_record = {
        'snapshot_id': snapshot_id,
        'trend_id': trend_id,
        'timing_label': result['timing_label'],
        'timing_confidence': result['timing_confidence'],
        'timing_reasons': result['timing_reasons'],
        'timing_guards': result['timing_guards'],
        'inflections_detected': result['inflections_detected'],
        'expiry_risk': result['expiry_risk'],
        'expiry_reasons': result['expiry_reasons'],
        'inputs_used': result['inputs_used'],
        'model_version': MODEL_VERSION
    }

    supabase.table('trend_timing_signals') \
        .upsert(signal_record, on_conflict='snapshot_id,trend_id') \
        .execute()

    return result


def compute_all_timing_signals(snapshot_id: str) -> dict:
    """Compute timing signals for all trends in a snapshot."""
    supabase = get_supabase()

    # Get all trends in snapshot
    response = supabase.table('trend_snapshot_items') \
        .select('trend_id') \
        .eq('snapshot_id', snapshot_id) \
        .execute()

    trend_ids = [t['trend_id'] for t in (response.data or [])]

    results = {'total': len(trend_ids), 'by_label': {}, 'errors': []}

    for trend_id in trend_ids:
        try:
            result = compute_timing_signal(trend_id, snapshot_id)
            label = result['timing_label']
            results['by_label'][label] = results['by_label'].get(label, 0) + 1
        except Exception as e:
            results['errors'].append(f"{trend_id}: {str(e)}")

    return results


if __name__ == '__main__':
    # Get latest snapshot
    supabase = get_supabase()
    response = supabase.table('trend_snapshots') \
        .select('id') \
        .order('created_at', desc=True) \
        .limit(1) \
        .single() \
        .execute()

    if response.data:
        snapshot_id = response.data['id']
        print(f"Computing timing signals for snapshot {snapshot_id}")
        results = compute_all_timing_signals(snapshot_id)
        print(f"Results: {results}")

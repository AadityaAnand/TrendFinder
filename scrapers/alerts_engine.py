"""
Phase 8: Alerts Engine

Generates alerts for high-signal timing events.
Only fires when confidence thresholds are met.

Alert types:
- became_eligible: First time passed Phase 1 gates
- entered_early_edge: Timing window opened
- confidence_upgraded: Confidence crossed threshold
- expiry_risk_high: Window closing warning
- momentum_breakout: Significant momentum increase
- stage_transition: Lifecycle stage changed
- timing_uncertain: Explicit uncertainty alert
"""

import os
import logging
from datetime import datetime, timedelta
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

_supabase: Optional[Client] = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase


# ============================================================
# ALERT RULES
# ============================================================

def get_alert_rules() -> dict[str, dict]:
    """Get active alert rules from database."""
    supabase = get_supabase()

    response = supabase.table('alert_rules') \
        .select('*') \
        .eq('active', True) \
        .execute()

    rules = {}
    for rule in (response.data or []):
        rules[rule['alert_type']] = rule

    return rules


def should_fire_alert(
    alert_type: str,
    confidence: float,
    acceleration_comparable: bool,
    rules: dict
) -> tuple[bool, str]:
    """
    Check if an alert should fire based on rules.

    Returns (should_fire, reason_if_not).
    """
    rule = rules.get(alert_type, {})

    min_conf = rule.get('min_confidence', 0.7)
    requires_accel = rule.get('requires_comparable_acceleration', True)

    if confidence < min_conf:
        return False, f"Confidence {confidence:.2f} below threshold {min_conf}"

    if requires_accel and not acceleration_comparable:
        # Special case: uncertain alerts can fire without comparable acceleration
        if alert_type != 'timing_uncertain':
            return False, "Requires comparable acceleration"

    return True, ""


# ============================================================
# ALERT DETECTION
# ============================================================

def detect_alerts_for_trend(
    trend_id: str,
    snapshot_id: str,
    current_timing: dict,
    previous_timing: Optional[dict],
    rules: dict
) -> list[dict]:
    """
    Detect which alerts should fire for a trend.

    Args:
        trend_id: The trend ID
        snapshot_id: Current snapshot ID
        current_timing: Current timing signal data
        previous_timing: Previous timing signal data (if any)
        rules: Alert rules

    Returns list of alert payloads to create.
    """
    alerts = []

    current_label = current_timing.get('timing_label')
    current_conf = current_timing.get('timing_confidence', 0)
    accel_comparable = current_timing.get('inputs_used', {}).get('acceleration_comparable', False)
    inflections = current_timing.get('inflections_detected', [])

    prev_label = previous_timing.get('timing_label') if previous_timing else None
    prev_conf = previous_timing.get('timing_confidence', 0) if previous_timing else 0

    # 1. Entered early edge (label transition)
    if current_label == 'early_edge' and prev_label != 'early_edge':
        should_fire, reason = should_fire_alert('entered_early_edge', current_conf, accel_comparable, rules)
        if should_fire:
            alerts.append({
                'alert_type': 'entered_early_edge',
                'priority': 'high',
                'confidence': current_conf,
                'payload': {
                    'previous_label': prev_label,
                    'new_label': current_label,
                    'reasons': current_timing.get('timing_reasons', []),
                    'inflections': [i['type'] for i in inflections]
                }
            })

    # 2. Confidence upgraded significantly
    conf_threshold = rules.get('confidence_upgraded', {}).get('thresholds', {}).get('upgrade_threshold', 0.15)
    if current_conf - prev_conf >= conf_threshold:
        should_fire, reason = should_fire_alert('confidence_upgraded', current_conf, accel_comparable, rules)
        if should_fire:
            alerts.append({
                'alert_type': 'confidence_upgraded',
                'priority': 'normal',
                'confidence': current_conf,
                'payload': {
                    'previous_confidence': prev_conf,
                    'new_confidence': current_conf,
                    'upgrade_amount': round(current_conf - prev_conf, 3)
                }
            })

    # 3. Expiry risk high
    if current_timing.get('expiry_risk') == 'high':
        prev_expiry = previous_timing.get('expiry_risk') if previous_timing else None
        if prev_expiry != 'high':  # Only alert on transition to high
            should_fire, reason = should_fire_alert('expiry_risk_high', current_conf, accel_comparable, rules)
            if should_fire:
                alerts.append({
                    'alert_type': 'expiry_risk_high',
                    'priority': 'urgent',
                    'confidence': current_conf,
                    'payload': {
                        'expiry_reasons': current_timing.get('expiry_reasons', []),
                        'timing_label': current_label
                    }
                })

    # 4. Momentum breakout (from inflections)
    momentum_breakout = next((i for i in inflections if i['type'] == 'momentum_breakout'), None)
    if momentum_breakout:
        # Check if we already alerted for this recently
        should_fire, reason = should_fire_alert('momentum_breakout', current_conf, accel_comparable, rules)
        if should_fire:
            alerts.append({
                'alert_type': 'momentum_breakout',
                'priority': 'high',
                'confidence': current_conf,
                'payload': {
                    'evidence': momentum_breakout.get('evidence', {}),
                    'timing_label': current_label
                }
            })

    # 5. Timing uncertain (explicit)
    if current_label == 'timing_uncertain' and prev_label != 'timing_uncertain':
        guards = current_timing.get('timing_guards', [])
        alerts.append({
            'alert_type': 'timing_uncertain',
            'priority': 'low',
            'confidence': current_conf,
            'payload': {
                'guards_triggered': guards,
                'what_needed': _explain_guards(guards)
            }
        })

    return alerts


def _explain_guards(guards: list[str]) -> list[str]:
    """Convert guard codes to human-readable explanations."""
    explanations = []

    for guard in guards:
        if 'insufficient_days' in guard:
            explanations.append("Need more days of data to determine timing")
        elif 'acceleration_not_comparable' in guard:
            explanations.append("Need at least 3 data points to compare acceleration")
        else:
            explanations.append(guard)

    return explanations


# ============================================================
# ALERT CREATION
# ============================================================

def create_alerts_for_users(
    trend_id: str,
    snapshot_id: str,
    alerts: list[dict]
) -> dict:
    """
    Create alerts for all users who have this trend in their feed.

    For now, creates alerts for all users with preferences.
    Later can be refined to check if trend matches user preferences.
    """
    supabase = get_supabase()

    if not alerts:
        return {'created': 0}

    # Get all user IDs (simplified - could filter by relevance later)
    response = supabase.table('user_profiles') \
        .select('id') \
        .execute()

    user_ids = [u['id'] for u in (response.data or [])]

    created = 0
    errors = []

    for user_id in user_ids:
        for alert in alerts:
            try:
                # Check for duplicate recent alert
                recent_check = supabase.table('user_alerts') \
                    .select('id') \
                    .eq('user_id', user_id) \
                    .eq('trend_id', trend_id) \
                    .eq('alert_type', alert['alert_type']) \
                    .gte('created_at', (datetime.utcnow() - timedelta(hours=24)).isoformat()) \
                    .limit(1) \
                    .execute()

                if recent_check.data:
                    continue  # Skip duplicate

                # Create alert
                alert_record = {
                    'user_id': user_id,
                    'trend_id': trend_id,
                    'snapshot_id': snapshot_id,
                    'alert_type': alert['alert_type'],
                    'payload': alert['payload'],
                    'priority': alert.get('priority', 'normal'),
                    'confidence': alert.get('confidence')
                }

                supabase.table('user_alerts').insert(alert_record).execute()
                created += 1

            except Exception as e:
                errors.append(f"{user_id}/{alert['alert_type']}: {str(e)}")

    return {'created': created, 'errors': errors[:5]}


def detect_became_eligible_alerts(snapshot_id: str) -> list[dict]:
    """
    Detect trends that became eligible (qualified) for the first time.

    This checks for opportunities that:
    - Are qualified in current snapshot
    - Were not qualified in previous snapshot (or didn't exist)
    """
    supabase = get_supabase()

    # Get current qualified opportunities
    current = supabase.table('trend_opportunities') \
        .select('trend_id, opportunity_score') \
        .eq('snapshot_id', snapshot_id) \
        .eq('qualified', True) \
        .execute()

    current_trends = {o['trend_id']: o for o in (current.data or [])}

    if not current_trends:
        return []

    # Get previous snapshot
    prev_snap = supabase.table('trend_snapshots') \
        .select('id') \
        .lt('id', snapshot_id) \
        .order('created_at', desc=True) \
        .limit(1) \
        .single() \
        .execute()

    newly_eligible = []

    if prev_snap.data:
        prev_snapshot_id = prev_snap.data['id']

        # Get previous qualified trends
        previous = supabase.table('trend_opportunities') \
            .select('trend_id') \
            .eq('snapshot_id', prev_snapshot_id) \
            .eq('qualified', True) \
            .execute()

        prev_trends = {o['trend_id'] for o in (previous.data or [])}

        # Find newly qualified
        for trend_id, opp_data in current_trends.items():
            if trend_id not in prev_trends:
                newly_eligible.append({
                    'trend_id': trend_id,
                    'opportunity_score': opp_data.get('opportunity_score', 0)
                })
    else:
        # First snapshot - all are newly eligible
        for trend_id, opp_data in current_trends.items():
            newly_eligible.append({
                'trend_id': trend_id,
                'opportunity_score': opp_data.get('opportunity_score', 0)
            })

    return newly_eligible


def detect_stage_transitions(snapshot_id: str) -> list[dict]:
    """Detect lifecycle stage transitions."""
    supabase = get_supabase()

    # Get lifecycle history changes
    response = supabase.table('trend_lifecycle_history') \
        .select('trend_id, old_stage, new_stage, changed_at') \
        .order('changed_at', desc=True) \
        .limit(50) \
        .execute()

    # Filter to recent (last 24 hours)
    cutoff = datetime.utcnow() - timedelta(hours=24)
    transitions = []

    for record in (response.data or []):
        changed_at = record.get('changed_at')
        if changed_at:
            try:
                dt = datetime.fromisoformat(changed_at.replace('Z', '+00:00'))
                if dt.replace(tzinfo=None) > cutoff:
                    transitions.append({
                        'trend_id': record['trend_id'],
                        'old_stage': record['old_stage'],
                        'new_stage': record['new_stage']
                    })
            except (ValueError, TypeError):
                pass

    return transitions


# ============================================================
# COMPETITION ALERTS (Phase 9)
# ============================================================

def detect_competition_alerts(
    snapshot_id: str,
    prev_snapshot_id: Optional[str],
    rules: dict
) -> list[dict]:
    """Detect competition-related alerts."""
    supabase = get_supabase()

    alerts = []

    # Get current competition data
    current_response = supabase.table('trend_competitive_intelligence') \
        .select('trend_id, competition_level, saturation_score, confidence') \
        .eq('snapshot_id', snapshot_id) \
        .execute()

    current_data = {c['trend_id']: c for c in (current_response.data or [])}

    # Get previous competition data
    prev_data = {}
    if prev_snapshot_id:
        prev_response = supabase.table('trend_competitive_intelligence') \
            .select('trend_id, competition_level, saturation_score') \
            .eq('snapshot_id', prev_snapshot_id) \
            .execute()
        prev_data = {c['trend_id']: c for c in (prev_response.data or [])}

    for trend_id, current in current_data.items():
        previous = prev_data.get(trend_id)
        conf = current.get('confidence', 0.5)

        # 1. Entered crowded zone (transition to high)
        if current['competition_level'] == 'high':
            prev_level = previous['competition_level'] if previous else None
            if prev_level != 'high':
                should_fire, _ = should_fire_alert('entered_crowded_zone', conf, True, rules)
                if should_fire:
                    alerts.append({
                        'trend_id': trend_id,
                        'alert_type': 'entered_crowded_zone',
                        'priority': 'high',
                        'confidence': conf,
                        'payload': {
                            'saturation_score': current['saturation_score'],
                            'previous_level': prev_level,
                            'message': 'This trend has entered the crowded zone'
                        }
                    })

            # 3. Wedge required (high competition, check for wedges)
            wedge_response = supabase.table('trend_wedges') \
                .select('wedge_type, trigger_reason') \
                .eq('trend_id', trend_id) \
                .eq('snapshot_id', snapshot_id) \
                .execute()

            wedges = wedge_response.data or []
            if wedges:
                should_fire, _ = should_fire_alert('wedge_required', conf, True, rules)
                if should_fire:
                    alerts.append({
                        'trend_id': trend_id,
                        'alert_type': 'wedge_required',
                        'priority': 'normal',
                        'confidence': conf,
                        'payload': {
                            'wedges': [{'type': w['wedge_type'], 'reason': w['trigger_reason']} for w in wedges],
                            'message': 'High competition — differentiation wedge recommended'
                        }
                    })

        # 2. Crowding increasing (saturation rising significantly)
        if previous:
            prev_sat = previous.get('saturation_score', 0) or 0
            curr_sat = current.get('saturation_score', 0) or 0
            increase = curr_sat - prev_sat

            threshold = rules.get('crowding_increasing', {}).get('thresholds', {}).get('saturation_increase', 0.15)
            if increase >= threshold:
                should_fire, _ = should_fire_alert('crowding_increasing', conf, True, rules)
                if should_fire:
                    alerts.append({
                        'trend_id': trend_id,
                        'alert_type': 'crowding_increasing',
                        'priority': 'normal',
                        'confidence': conf,
                        'payload': {
                            'previous_saturation': prev_sat,
                            'current_saturation': curr_sat,
                            'increase': round(increase, 3),
                            'message': f'Competition increased by {increase:.0%}'
                        }
                    })

        # 4. Competition uncertain
        if current['competition_level'] == 'uncertain':
            prev_level = previous['competition_level'] if previous else None
            if prev_level != 'uncertain':
                alerts.append({
                    'trend_id': trend_id,
                    'alert_type': 'competition_uncertain',
                    'priority': 'low',
                    'confidence': conf,
                    'payload': {
                        'message': 'Insufficient data to assess competition level'
                    }
                })

    return alerts


# ============================================================
# MAIN PROCESSING
# ============================================================

def check_scraper_health_alerts() -> list[dict]:
    """
    Return warning dicts for any scraper with 2+ consecutive failures.
    Called from process_alerts_for_snapshot; logs to pipeline run stats.
    """
    supabase = get_supabase()
    try:
        result = supabase.table('scraper_health') \
            .select('source, consecutive_failures, last_error, last_success') \
            .gte('consecutive_failures', 2) \
            .execute()
    except Exception:
        return []

    warnings = []
    for row in (result.data or []):
        warnings.append({
            'alert_type': 'scraper_failure',
            'message': (
                f"Scraper '{row['source']}' has failed {row['consecutive_failures']} consecutive "
                f"times. Last success: {row['last_success']}. Error: {row['last_error']}"
            ),
            'severity': 'high',
            'source': row['source'],
        })
    return warnings


def process_alerts_for_snapshot(snapshot_id: str) -> dict:
    """
    Process all alerts for a snapshot.

    1. Get timing signals
    2. Compare to previous
    3. Detect alert conditions
    4. Create alerts for users
    """
    supabase = get_supabase()

    rules = get_alert_rules()
    stats = {
        'trends_processed': 0,
        'alerts_created': 0,
        'by_type': {},
        'errors': []
    }

    # Get previous snapshot
    prev_snap = supabase.table('trend_snapshots') \
        .select('id') \
        .lt('id', snapshot_id) \
        .order('created_at', desc=True) \
        .limit(1) \
        .execute()

    prev_snapshot_id = prev_snap.data[0]['id'] if prev_snap.data else None

    # Get current timing signals
    current_signals = supabase.table('trend_timing_signals') \
        .select('*') \
        .eq('snapshot_id', snapshot_id) \
        .execute()

    current_map = {s['trend_id']: s for s in (current_signals.data or [])}

    # Get previous timing signals
    prev_map = {}
    if prev_snapshot_id:
        prev_signals = supabase.table('trend_timing_signals') \
            .select('*') \
            .eq('snapshot_id', prev_snapshot_id) \
            .execute()
        prev_map = {s['trend_id']: s for s in (prev_signals.data or [])}

    # Process each trend
    for trend_id, current in current_map.items():
        previous = prev_map.get(trend_id)

        try:
            alerts = detect_alerts_for_trend(
                trend_id, snapshot_id, current, previous, rules
            )

            if alerts:
                result = create_alerts_for_users(trend_id, snapshot_id, alerts)
                stats['alerts_created'] += result.get('created', 0)

                for alert in alerts:
                    atype = alert['alert_type']
                    stats['by_type'][atype] = stats['by_type'].get(atype, 0) + 1

            stats['trends_processed'] += 1

        except Exception as e:
            stats['errors'].append(f"{trend_id}: {str(e)}")

    # Process "became eligible" alerts
    newly_eligible = detect_became_eligible_alerts(snapshot_id)
    for item in newly_eligible:
        try:
            should_fire, _ = should_fire_alert(
                'became_eligible',
                item.get('opportunity_score', 0.5),
                True,  # Not dependent on acceleration
                rules
            )
            if should_fire:
                alerts = [{
                    'alert_type': 'became_eligible',
                    'priority': 'high',
                    'confidence': item.get('opportunity_score', 0.5),
                    'payload': {
                        'opportunity_score': item.get('opportunity_score'),
                        'message': 'This trend just qualified as an opportunity'
                    }
                }]
                result = create_alerts_for_users(item['trend_id'], snapshot_id, alerts)
                stats['alerts_created'] += result.get('created', 0)
                stats['by_type']['became_eligible'] = stats['by_type'].get('became_eligible', 0) + 1

        except Exception as e:
            stats['errors'].append(f"became_eligible/{item['trend_id']}: {str(e)}")

    # Process competition alerts (Phase 9)
    competition_alerts = detect_competition_alerts(snapshot_id, prev_snapshot_id, rules)
    for comp_alert in competition_alerts:
        try:
            result = create_alerts_for_users(comp_alert['trend_id'], snapshot_id, [comp_alert])
            stats['alerts_created'] += result.get('created', 0)
            atype = comp_alert['alert_type']
            stats['by_type'][atype] = stats['by_type'].get(atype, 0) + 1
        except Exception as e:
            stats['errors'].append(f"competition/{comp_alert['trend_id']}: {str(e)}")

    # Process stage transitions
    transitions = detect_stage_transitions(snapshot_id)
    for trans in transitions:
        try:
            alerts = [{
                'alert_type': 'stage_transition',
                'priority': 'normal',
                'confidence': 0.7,
                'payload': {
                    'old_stage': trans['old_stage'],
                    'new_stage': trans['new_stage']
                }
            }]
            result = create_alerts_for_users(trans['trend_id'], snapshot_id, alerts)
            stats['alerts_created'] += result.get('created', 0)
            stats['by_type']['stage_transition'] = stats['by_type'].get('stage_transition', 0) + 1

        except Exception as e:
            stats['errors'].append(f"stage_transition/{trans['trend_id']}: {str(e)}")

    # Check scraper health — log warnings for consecutive failures
    try:
        scraper_warnings = check_scraper_health_alerts()
        for w in scraper_warnings:
            logger.warning(f"[scraper_health] {w['message']}")
            stats['by_type']['scraper_failure'] = stats['by_type'].get('scraper_failure', 0) + 1
    except Exception as e:
        stats['errors'].append(f"scraper_health_check: {str(e)}")

    return stats


def get_user_alerts(
    user_id: str,
    include_seen: bool = False,
    limit: int = 50
) -> list[dict]:
    """Get alerts for a user."""
    supabase = get_supabase()

    query = supabase.table('user_alerts') \
        .select('*, detected_trends(theme)') \
        .eq('user_id', user_id) \
        .order('created_at', desc=True) \
        .limit(limit)

    if not include_seen:
        query = query.is_('seen_at', 'null')

    response = query.execute()

    return response.data or []


def mark_alert_seen(alert_id: str) -> bool:
    """Mark an alert as seen."""
    supabase = get_supabase()

    response = supabase.table('user_alerts') \
        .update({'seen_at': datetime.utcnow().isoformat()}) \
        .eq('id', alert_id) \
        .execute()

    return bool(response.data)


def dismiss_alert(alert_id: str) -> bool:
    """Dismiss an alert."""
    supabase = get_supabase()

    response = supabase.table('user_alerts') \
        .update({'dismissed_at': datetime.utcnow().isoformat()}) \
        .eq('id', alert_id) \
        .execute()

    return bool(response.data)


if __name__ == '__main__':
    # Get latest snapshot and process alerts
    supabase = get_supabase()
    response = supabase.table('trend_snapshots') \
        .select('id') \
        .order('created_at', desc=True) \
        .limit(1) \
        .single() \
        .execute()

    if response.data:
        snapshot_id = response.data['id']
        print(f"Processing alerts for snapshot {snapshot_id}")
        stats = process_alerts_for_snapshot(snapshot_id)
        print(f"Results: {stats}")

import os
import json
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

TRAJECTORY_VERSION = 'trajectory-v1'


def to_utc_date(timestamp_str: Optional[str]) -> Optional[str]:
    if not timestamp_str:
        return None
    try:
        dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        return dt.astimezone(timezone.utc).date().isoformat()
    except Exception:
        return None


def dedupe_by_utc_day(trajectory: list[dict]) -> list[dict]:
    by_day: dict[str, dict] = {}
    for point in trajectory:
        utc_date = to_utc_date(point.get('timestamp'))
        if not utc_date:
            continue
        if utc_date not in by_day:
            by_day[utc_date] = point
            by_day[utc_date]['utc_date'] = utc_date
    return sorted(by_day.values(), key=lambda p: p.get('utc_date', ''))


def get_all_trends() -> list[dict]:
    response = supabase.table('detected_trends') \
        .select('id, theme, first_seen, status') \
        .execute()
    return response.data or []


def get_trend_history(trend_id: str) -> list[dict]:
    # Get snapshot items for this trend
    response = supabase.table('trend_snapshot_items') \
        .select('snapshot_id, momentum_score, signal_count, top3_mean') \
        .eq('trend_id', trend_id) \
        .execute()

    if not response.data:
        return []

    # Get snapshot timestamps separately
    snapshot_ids = [item['snapshot_id'] for item in response.data]
    snapshots_resp = supabase.table('trend_snapshots') \
        .select('id, run_at, scoring_version') \
        .in_('id', snapshot_ids) \
        .execute()

    snapshot_map = {s['id']: s for s in (snapshots_resp.data or [])}

    # Merge and sort
    results = []
    for item in response.data:
        snapshot = snapshot_map.get(item['snapshot_id'], {})
        results.append({
            **item,
            'trend_snapshots': {
                'run_at': snapshot.get('run_at'),
                'scoring_version': snapshot.get('scoring_version')
            }
        })

    # Sort by run_at
    results.sort(key=lambda x: x['trend_snapshots'].get('run_at') or '')
    return results


def get_lifecycle_history(trend_id: str) -> list[dict]:
    response = supabase.table('trend_lifecycle_history') \
        .select('''
            snapshot_id,
            lifecycle_stage,
            stage_confidence,
            acceleration_score,
            acceleration_comparable,
            created_at
        ''') \
        .eq('trend_id', trend_id) \
        .order('created_at', desc=False) \
        .execute()
    return response.data or []


def get_opportunity_history(trend_id: str) -> list[dict]:
    response = supabase.table('trend_opportunities') \
        .select('''
            snapshot_id,
            qualified,
            opportunity_score,
            created_at
        ''') \
        .eq('trend_id', trend_id) \
        .order('created_at', desc=False) \
        .execute()
    return response.data or []


def get_existing_trajectory(trend_id: str) -> Optional[dict]:
    response = supabase.table('trend_trajectories') \
        .select('*') \
        .eq('trend_id', trend_id) \
        .single() \
        .execute()
    return response.data if response.data else None


def build_trajectory_data(
    history: list[dict],
    lifecycle: list[dict],
    opportunities: list[dict]
) -> list[dict]:
    trajectory = []

    lifecycle_map = {l['snapshot_id']: l for l in lifecycle}
    opportunity_map = {o['snapshot_id']: o for o in opportunities}

    for item in history:
        snapshot_id = item['snapshot_id']
        snapshot_info = item.get('trend_snapshots', {})

        point = {
            'snapshot_id': snapshot_id,
            'timestamp': snapshot_info.get('run_at'),
            'momentum': item.get('momentum_score'),
            'signal_count': item.get('signal_count'),
            'top3_mean': item.get('top3_mean'),
        }

        lc = lifecycle_map.get(snapshot_id, {})
        point['stage'] = lc.get('lifecycle_stage')
        point['stage_confidence'] = lc.get('stage_confidence')
        point['acceleration'] = lc.get('acceleration_score')
        point['acceleration_comparable'] = lc.get('acceleration_comparable', False)

        opp = opportunity_map.get(snapshot_id, {})
        point['qualified'] = opp.get('qualified', False)
        point['opportunity_score'] = opp.get('opportunity_score')

        trajectory.append(point)

    return dedupe_by_utc_day(trajectory)


def compute_trajectory_summary(trajectory: list[dict]) -> dict:
    if not trajectory:
        return {
            'peak_momentum': None,
            'peak_momentum_at': None,
            'current_stage': None,
            'qualified_count': 0,
            'last_qualified_at': None,
            'weekly_growth_rate': None,
            'acceleration': None,
        }

    peak_momentum = None
    peak_momentum_at = None
    for point in trajectory:
        m = point.get('momentum')
        if m is not None and (peak_momentum is None or m > peak_momentum):
            peak_momentum = m
            peak_momentum_at = point.get('timestamp')

    current_stage = None
    for point in reversed(trajectory):
        if point.get('stage'):
            current_stage = point['stage']
            break

    qualified_count = sum(1 for p in trajectory if p.get('qualified'))
    last_qualified_at = None
    for point in reversed(trajectory):
        if point.get('qualified'):
            last_qualified_at = point.get('timestamp')
            break

    # Phase 9d: Compute growth rate and acceleration from trajectory points
    weekly_growth_rate = None
    acceleration = None

    if len(trajectory) >= 2:
        recent = trajectory[-1]
        current_signals = recent.get('signal_count') or 0
        recent_ts = recent.get('timestamp', '')

        # Find points closest to 7 and 14 days ago using actual timestamps
        prev_signals = None
        prev_prev_signals = None

        try:
            recent_dt = datetime.fromisoformat(recent_ts.replace('Z', '+00:00'))
            target_7d = recent_dt - timedelta(days=7)
            target_14d = recent_dt - timedelta(days=14)
            max_drift = 5 * 86400  # accept points within 5 days of target

            best_7d = None   # (signal_count, abs_diff_seconds)
            best_14d = None

            for p in trajectory[:-1]:
                pts = p.get('timestamp', '')
                sc = p.get('signal_count')
                if not pts or sc is None or sc <= 0:
                    continue
                pdt = datetime.fromisoformat(pts.replace('Z', '+00:00'))
                diff_7 = abs((pdt - target_7d).total_seconds())
                diff_14 = abs((pdt - target_14d).total_seconds())
                if best_7d is None or diff_7 < best_7d[1]:
                    best_7d = (sc, diff_7)
                if best_14d is None or diff_14 < best_14d[1]:
                    best_14d = (sc, diff_14)

            if best_7d and best_7d[1] < max_drift:
                prev_signals = best_7d[0]
            if best_14d and best_14d[1] < max_drift:
                prev_prev_signals = best_14d[0]
        except (ValueError, TypeError):
            # Fallback: positional walk if timestamps are missing or unparseable
            for i in range(len(trajectory) - 2, -1, -1):
                sc = trajectory[i].get('signal_count')
                if sc is not None and sc > 0:
                    if prev_signals is None:
                        prev_signals = sc
                    elif prev_prev_signals is None:
                        prev_prev_signals = sc
                        break

        if prev_signals and prev_signals > 0:
            weekly_growth_rate = round((current_signals - prev_signals) / prev_signals, 4)

            # Acceleration = change in growth rate
            if prev_prev_signals and prev_prev_signals > 0:
                prev_growth = (prev_signals - prev_prev_signals) / prev_prev_signals
                acceleration = round(weekly_growth_rate - prev_growth, 4)

    return {
        'peak_momentum': peak_momentum,
        'peak_momentum_at': peak_momentum_at,
        'current_stage': current_stage,
        'qualified_count': qualified_count,
        'last_qualified_at': last_qualified_at,
        'weekly_growth_rate': weekly_growth_rate,
        'acceleration': acceleration,
    }


def build_stage_history(trajectory: list[dict]) -> list[dict]:
    stage_history = []
    current_stage = None

    for point in trajectory:
        stage = point.get('stage')
        if stage and stage != current_stage:
            stage_history.append({
                'stage': stage,
                'started_at': point.get('timestamp'),
                'confidence': point.get('stage_confidence')
            })
            current_stage = stage

    return stage_history


def save_trajectory(
    trend_id: str,
    trend: dict,
    trajectory: list[dict],
    summary: dict,
    stage_history: list[dict]
) -> bool:
    timestamps = [p.get('timestamp') for p in trajectory if p.get('timestamp')]
    first_seen = min(timestamps) if timestamps else trend.get('first_seen')
    last_seen = max(timestamps) if timestamps else trend.get('first_seen')

    data = {
        'trend_id': trend_id,
        'trajectory_data': json.dumps(trajectory),
        'first_seen_at': first_seen,
        'last_seen_at': last_seen,
        'total_snapshots': len(trajectory),
        'peak_momentum': summary['peak_momentum'],
        'peak_momentum_at': summary['peak_momentum_at'],
        'current_stage': summary['current_stage'],
        'stage_history': json.dumps(stage_history),
        'qualified_count': summary['qualified_count'],
        'last_qualified_at': summary['last_qualified_at'],
        'weekly_growth_rate': summary.get('weekly_growth_rate'),
        'acceleration': summary.get('acceleration'),
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'computed_from_version': TRAJECTORY_VERSION
    }

    try:
        supabase.table('trend_trajectories') \
            .upsert(data, on_conflict='trend_id') \
            .execute()
        return True
    except Exception as e:
        logger.error(f"Error saving trajectory for {trend_id}: {e}")
        return False


def update_trajectory(trend: dict) -> bool:
    trend_id = trend['id']
    theme = trend.get('theme', 'Unknown')

    history = get_trend_history(trend_id)
    if not history:
        logger.info(f"No history for {theme}, skipping")
        return False

    lifecycle = get_lifecycle_history(trend_id)
    opportunities = get_opportunity_history(trend_id)

    trajectory = build_trajectory_data(history, lifecycle, opportunities)
    summary = compute_trajectory_summary(trajectory)
    stage_history = build_stage_history(trajectory)

    success = save_trajectory(trend_id, trend, trajectory, summary, stage_history)

    if success:
        peak = summary['peak_momentum']
        peak_str = f"{peak:.2f}" if peak else "0"
        logger.info(f"Updated trajectory for {theme}: {len(trajectory)} points, peak={peak_str}")

    return success


def run_trajectory_update() -> dict:
    logger.info("=" * 60)
    logger.info("TRAJECTORY UPDATE")
    logger.info("=" * 60)

    trends = get_all_trends()
    logger.info(f"Found {len(trends)} trends")

    updated = 0
    skipped = 0
    failed = 0

    for trend in trends:
        result = update_trajectory(trend)
        if result:
            updated += 1
        elif result is False:
            skipped += 1
        else:
            failed += 1

    logger.info("=" * 60)
    logger.info("RESULTS")
    logger.info("=" * 60)
    logger.info(f"Updated: {updated}")
    logger.info(f"Skipped: {skipped}")
    logger.info(f"Failed: {failed}")

    return {'updated': updated, 'skipped': skipped, 'failed': failed}


if __name__ == '__main__':
    stats = run_trajectory_update()
    print(f"\n=== Final Stats ===")
    print(f"Updated: {stats['updated']}")
    print(f"Skipped: {stats['skipped']}")
    print(f"Failed: {stats['failed']}")

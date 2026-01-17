import os
import sys
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

PIPELINE_VERSION = 'pipeline-v1'
EXPECTED_SCORING_VERSION = 'norm-p90-decay7d-v1'

DRIFT_THRESHOLDS = {
    'momentum_mean_change': 0.3,
    'momentum_std_change': 0.5,
    'signal_count_change': 0.4,
    'trend_count_change': 0.5,
}


def get_today_utc() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def check_already_ran_today() -> Optional[str]:
    today = get_today_utc()
    response = supabase.table('pipeline_runs') \
        .select('id, run_at, success') \
        .gte('run_at', f'{today}T00:00:00Z') \
        .lt('run_at', f'{today}T23:59:59Z') \
        .eq('success', True) \
        .limit(1) \
        .execute()
    if response.data:
        return response.data[0]['id']
    return None


def check_snapshot_exists_today() -> Optional[str]:
    today = get_today_utc()
    response = supabase.table('trend_snapshots') \
        .select('id, run_at') \
        .gte('run_at', f'{today}T00:00:00Z') \
        .lt('run_at', f'{today}T23:59:59Z') \
        .limit(1) \
        .execute()
    if response.data:
        return response.data[0]['id']
    return None


def get_recent_snapshots(limit: int = 5) -> list[dict]:
    response = supabase.table('trend_snapshots') \
        .select('id, run_at, scoring_version, detector_version') \
        .order('run_at', desc=True) \
        .limit(limit) \
        .execute()
    return response.data or []


def get_snapshot_stats(snapshot_id: str) -> dict:
    response = supabase.table('trend_snapshot_items') \
        .select('momentum_score, signal_count') \
        .eq('snapshot_id', snapshot_id) \
        .execute()

    items = response.data or []
    if not items:
        return {
            'trend_count': 0,
            'momentum_mean': 0,
            'momentum_std': 0,
            'momentum_min': 0,
            'momentum_max': 0,
            'signal_count_mean': 0,
            'total_signals': 0
        }

    momentums = [i['momentum_score'] or 0 for i in items]
    signals = [i['signal_count'] or 0 for i in items]

    mean_m = sum(momentums) / len(momentums)
    variance = sum((m - mean_m) ** 2 for m in momentums) / len(momentums)
    std_m = variance ** 0.5

    return {
        'trend_count': len(items),
        'momentum_mean': mean_m,
        'momentum_std': std_m,
        'momentum_min': min(momentums),
        'momentum_max': max(momentums),
        'signal_count_mean': sum(signals) / len(signals),
        'total_signals': sum(signals)
    }


def compute_drift(current: dict, baseline: dict) -> dict:
    drift = {}

    if baseline['momentum_mean'] > 0:
        drift['momentum_mean_change'] = abs(current['momentum_mean'] - baseline['momentum_mean']) / baseline['momentum_mean']
    else:
        drift['momentum_mean_change'] = 0

    if baseline['momentum_std'] > 0:
        drift['momentum_std_change'] = abs(current['momentum_std'] - baseline['momentum_std']) / baseline['momentum_std']
    else:
        drift['momentum_std_change'] = 0

    if baseline['signal_count_mean'] > 0:
        drift['signal_count_change'] = abs(current['signal_count_mean'] - baseline['signal_count_mean']) / baseline['signal_count_mean']
    else:
        drift['signal_count_change'] = 0

    if baseline['trend_count'] > 0:
        drift['trend_count_change'] = abs(current['trend_count'] - baseline['trend_count']) / baseline['trend_count']
    else:
        drift['trend_count_change'] = 0

    return drift


def check_drift_alerts(drift: dict, version_changed: bool = False) -> list[dict]:
    alerts = []
    for metric, threshold in DRIFT_THRESHOLDS.items():
        if drift.get(metric, 0) > threshold:
            base_severity = 'high' if drift[metric] > threshold * 1.5 else 'medium'
            if version_changed:
                severity = 'info'
                note = 'scoring_version changed - drift expected'
            else:
                severity = base_severity
                note = None
            alert = {
                'metric': metric,
                'value': drift[metric],
                'threshold': threshold,
                'severity': severity
            }
            if note:
                alert['note'] = note
            alerts.append(alert)
    return alerts


def get_evidence_integrity_stats(snapshot_id: str) -> dict:
    items_resp = supabase.table('trend_snapshot_items') \
        .select('trend_id') \
        .eq('snapshot_id', snapshot_id) \
        .execute()
    trend_ids = [i['trend_id'] for i in (items_resp.data or [])]

    if not trend_ids:
        return {
            'total_trends': 0,
            'trends_with_canonical': 0,
            'canonical_percentage': 0,
            'trends_with_opportunities': 0,
            'qualified_opportunities': 0,
            'rejected_opportunities': 0,
            'rejection_rate': 0
        }

    signals_resp = supabase.table('trend_signals') \
        .select('trend_id, raw_signals!inner(source)') \
        .in_('trend_id', trend_ids) \
        .execute()
    signals_data = signals_resp.data or []

    trends_with_canonical = set()
    canonical_sources = {'github', 'hackernews', 'devto'}
    for sig in signals_data:
        source = sig.get('raw_signals', {}).get('source', '')
        if source in canonical_sources:
            trends_with_canonical.add(sig['trend_id'])

    opp_resp = supabase.table('trend_opportunities') \
        .select('trend_id, qualified') \
        .eq('snapshot_id', snapshot_id) \
        .execute()
    opp_data = opp_resp.data or []

    qualified = sum(1 for o in opp_data if o.get('qualified'))
    rejected = sum(1 for o in opp_data if not o.get('qualified'))

    return {
        'total_trends': len(trend_ids),
        'trends_with_canonical': len(trends_with_canonical),
        'canonical_percentage': len(trends_with_canonical) / len(trend_ids) * 100 if trend_ids else 0,
        'trends_with_opportunities': len(opp_data),
        'qualified_opportunities': qualified,
        'rejected_opportunities': rejected,
        'rejection_rate': rejected / len(opp_data) * 100 if opp_data else 0
    }


def check_snapshot_health(snapshot_id: str) -> dict:
    health = {
        'snapshot_id': snapshot_id,
        'checks': [],
        'passed': True
    }

    stats = get_snapshot_stats(snapshot_id)

    if stats['trend_count'] == 0:
        health['checks'].append({'check': 'has_trends', 'passed': False, 'detail': 'No trends detected'})
        health['passed'] = False
    else:
        health['checks'].append({'check': 'has_trends', 'passed': True, 'detail': f"{stats['trend_count']} trends"})

    if stats['total_signals'] == 0:
        health['checks'].append({'check': 'has_signals', 'passed': False, 'detail': 'No signals'})
        health['passed'] = False
    else:
        health['checks'].append({'check': 'has_signals', 'passed': True, 'detail': f"{stats['total_signals']} signals"})

    if stats['momentum_max'] == 0:
        health['checks'].append({'check': 'momentum_valid', 'passed': False, 'detail': 'All momentum scores are 0'})
        health['passed'] = False
    else:
        health['checks'].append({'check': 'momentum_valid', 'passed': True, 'detail': f"Max momentum: {stats['momentum_max']:.2f}"})

    snapshot_resp = supabase.table('trend_snapshots') \
        .select('scoring_version') \
        .eq('id', snapshot_id) \
        .single() \
        .execute()

    if snapshot_resp.data:
        version = snapshot_resp.data.get('scoring_version', '')
        if version != EXPECTED_SCORING_VERSION:
            health['checks'].append({
                'check': 'scoring_version',
                'passed': False,
                'detail': f"Expected {EXPECTED_SCORING_VERSION}, got {version}"
            })
            health['passed'] = False
        else:
            health['checks'].append({'check': 'scoring_version', 'passed': True, 'detail': version})

    evidence_stats = get_evidence_integrity_stats(snapshot_id)

    min_canonical_pct = 50
    if evidence_stats['canonical_percentage'] < min_canonical_pct:
        health['checks'].append({
            'check': 'evidence_canonical_coverage',
            'passed': False,
            'detail': f"{evidence_stats['canonical_percentage']:.0f}% have canonical artifacts (min {min_canonical_pct}%)"
        })
    else:
        health['checks'].append({
            'check': 'evidence_canonical_coverage',
            'passed': True,
            'detail': f"{evidence_stats['canonical_percentage']:.0f}% have canonical artifacts"
        })

    health['checks'].append({
        'check': 'opportunity_stats',
        'passed': True,
        'detail': f"{evidence_stats['qualified_opportunities']} qualified, {evidence_stats['rejected_opportunities']} rejected ({evidence_stats['rejection_rate']:.0f}% rejection)"
    })

    health['stats'] = stats
    health['evidence_stats'] = evidence_stats
    return health


def save_pipeline_run(
    snapshot_id: Optional[str],
    health: Optional[dict],
    drift: Optional[dict],
    alerts: list[dict],
    stages_completed: list[str],
    error: Optional[str] = None
) -> None:
    data = {
        'run_at': datetime.now(timezone.utc).isoformat(),
        'snapshot_id': snapshot_id,
        'pipeline_version': PIPELINE_VERSION,
        'health_check': json.dumps(health) if health else None,
        'drift_metrics': json.dumps(drift) if drift else None,
        'alerts': json.dumps(alerts),
        'stages_completed': stages_completed,
        'error': error,
        'success': error is None and (health is None or health.get('passed', False))
    }

    try:
        supabase.table('pipeline_runs').insert(data).execute()
    except Exception as e:
        logger.error(f"Failed to save pipeline run: {e}")


def run_scraper(name: str) -> bool:
    import subprocess
    logger.info(f"Running {name}...")
    try:
        result = subprocess.run(
            ['python', f'{name}.py'],
            cwd=os.path.dirname(os.path.abspath(__file__)),
            capture_output=True,
            text=True,
            timeout=300
        )
        if result.returncode != 0:
            logger.error(f"{name} failed: {result.stderr[:500]}")
            return False
        logger.info(f"{name} completed")
        return True
    except subprocess.TimeoutExpired:
        logger.error(f"{name} timed out")
        return False
    except Exception as e:
        logger.error(f"{name} error: {e}")
        return False


def run_pipeline(skip_scrapers: bool = False, force: bool = False) -> dict:
    logger.info("=" * 60)
    logger.info("DAILY PIPELINE")
    logger.info(f"Pipeline version: {PIPELINE_VERSION}")
    logger.info(f"UTC date: {get_today_utc()}")
    logger.info("=" * 60)

    if not force:
        existing_run = check_already_ran_today()
        if existing_run:
            logger.info(f"Pipeline already ran successfully today (run_id={existing_run}). Use --force to re-run.")
            return {'success': True, 'skipped': True, 'reason': 'already_ran_today', 'existing_run_id': existing_run}

        existing_snapshot = check_snapshot_exists_today()
        if existing_snapshot:
            logger.info(f"Snapshot already exists for today (snapshot_id={existing_snapshot}). Skipping scrapers and detection.")
            skip_scrapers = True

    stages_completed = []
    error = None

    try:
        if not skip_scrapers:
            scrapers = ['hackernews_scraper', 'github_scraper', 'devto_scraper']
            for scraper in scrapers:
                if run_scraper(scraper):
                    stages_completed.append(f'scrape_{scraper}')
                else:
                    logger.warning(f"Scraper {scraper} failed, continuing...")

        if run_scraper('deduplication'):
            stages_completed.append('deduplication')

        if run_scraper('trend_detector'):
            stages_completed.append('trend_detection')

        if run_scraper('opportunity_detector'):
            stages_completed.append('opportunity_detection')

        if run_scraper('opportunity_explainer'):
            stages_completed.append('explanation_generation')

        if run_scraper('trajectory_updater'):
            stages_completed.append('trajectory_update')

        snapshots = get_recent_snapshots(limit=2)
        if not snapshots:
            error = "No snapshots found after pipeline run"
            logger.error(error)
            save_pipeline_run(None, None, None, [], stages_completed, error)
            return {'success': False, 'error': error}

        current_snapshot = snapshots[0]
        snapshot_id = current_snapshot['id']
        logger.info(f"Current snapshot: {snapshot_id}")

        health = check_snapshot_health(snapshot_id)
        logger.info(f"Health check passed: {health['passed']}")
        for check in health['checks']:
            status = "✓" if check['passed'] else "✗"
            logger.info(f"  {status} {check['check']}: {check['detail']}")

        drift = {}
        alerts = []
        version_changed = False
        if len(snapshots) >= 2:
            baseline_snapshot = snapshots[1]
            baseline_stats = get_snapshot_stats(baseline_snapshot['id'])
            current_stats = health['stats']

            version_changed = current_snapshot.get('scoring_version') != baseline_snapshot.get('scoring_version')
            if version_changed:
                logger.info(f"Scoring version changed: {baseline_snapshot.get('scoring_version')} → {current_snapshot.get('scoring_version')}")

            drift = compute_drift(current_stats, baseline_stats)
            alerts = check_drift_alerts(drift, version_changed=version_changed)

            logger.info(f"Drift from previous snapshot:")
            for metric, value in drift.items():
                threshold = DRIFT_THRESHOLDS.get(metric, 0)
                status = "⚠" if value > threshold else "✓"
                logger.info(f"  {status} {metric}: {value:.2%} (threshold: {threshold:.0%})")

            if alerts:
                logger.warning(f"DRIFT ALERTS{' (version change)' if version_changed else ''}:")
                for alert in alerts:
                    logger.warning(f"  [{alert['severity'].upper()}] {alert['metric']}: {alert['value']:.2%}")

        save_pipeline_run(snapshot_id, health, drift, alerts, stages_completed)

        return {
            'success': health['passed'],
            'snapshot_id': snapshot_id,
            'health': health,
            'drift': drift,
            'alerts': alerts,
            'stages_completed': stages_completed
        }

    except Exception as e:
        error = str(e)
        logger.exception(f"Pipeline failed: {error}")
        save_pipeline_run(None, None, None, [], stages_completed, error)
        return {'success': False, 'error': error}


if __name__ == '__main__':
    skip_scrapers = '--skip-scrapers' in sys.argv
    force = '--force' in sys.argv
    result = run_pipeline(skip_scrapers=skip_scrapers, force=force)

    print(f"\n=== Pipeline Result ===")
    print(f"Success: {result.get('success', False)}")
    if result.get('error'):
        print(f"Error: {result['error']}")
    if result.get('stages_completed'):
        print(f"Stages: {', '.join(result['stages_completed'])}")
    if result.get('alerts'):
        print(f"Alerts: {len(result['alerts'])}")

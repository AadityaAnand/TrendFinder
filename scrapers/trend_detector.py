import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client
from collections import Counter
import re

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

DETECTOR_VERSION = 'keyword-scaffold-v1'
SCORING_VERSION = 'norm-p90-decay7d-v1'
STOP_WORDS = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'is', 'are', 'was', 'were', 'been', 'be', 'have', 'has',
    'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
    'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
    'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where',
    'why', 'how', 'show', 'hn', 'ask', 'just', 'its', 'over', 'your', 'about', 'like', 'now', 'here', 'there',
    'then', 'than', 'them', 'their', 'into', 'out', 'all', 'some', 'any',
    'other', 'more', 'most', 'such', 'very', 'much', 'each', 'every',
    'both', 'few', 'many', 'says', 'said', 'make', 'made', 'get', 'got',
    'one', 'two', 'first', 'last', 'new', 'old', 'good', 'bad'}


THEME_CLUSTERS = {
    'AI & Machine Learning': ['ai', 'llm', 'llms', 'model', 'models', 'machine', 'learning', 'gpt', 'claude', 'openai', 'anthropic', 'chatgpt', 'gemini', 'embedding', 'embeddings'],
    'Development Tools': ['code', 'coding', 'development', 'developer', 'developers', 'programming', 'framework', 'frameworks', 'library', 'libraries', 'tool', 'tools'],
    'Web & APIs': ['api', 'apis', 'web', 'http', 'rest', 'graphql', 'endpoint', 'endpoints'],
    'Data & Analytics': ['data', 'analytics', 'database', 'databases', 'sql', 'analysis', 'visualization'],
    'Cloud & Infrastructure': ['cloud', 'aws', 'azure', 'docker', 'kubernetes', 'infrastructure', 'deployment'],
    'Mobile': ['mobile', 'ios', 'android', 'app', 'apps', 'application', 'applications']
}

def map_keyword_to_theme(keyword):
    for theme, keywords in THEME_CLUSTERS.items():
        if keyword in keywords:
            return theme
    return None

def extract_keywords(text):
    cleaned = re.sub(r'[^a-z0-9\s]', '', text.lower())
    words = cleaned.split()
    keywords = [word for word in words if len(word) > 2 and word not in STOP_WORDS]
    return keywords

def fetch_duplicate_ids():
    try:
        response = supabase.table('signal_duplicates').select('duplicate_signal_id').execute()
        return set(d['duplicate_signal_id'] for d in response.data)
    except Exception as e:
        print(f"Error fetching duplicates: {e}")
        return set()

def fetch_all_signals():
    try:
        response = supabase.table('raw_signals').select('*').order('created_at', desc=True).execute()
        return response.data
    except Exception as e:
        print(f"Error fetching signals: {e}")
        return []

def get_engagement_score(signal):
    source = signal.get('source', '')
    score = signal.get('score', 0)
    comments = signal.get('comments_count', 0)

    if source == 'hackernews':
        return score + comments
    elif source == 'devto':
        return score + comments
    elif source == 'github':
        return score
    else:
        return score + comments

def get_rolling_baseline_percentiles(source, lookback_days=14, min_snapshots=3):
    from datetime import timezone, timedelta
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=lookback_days)

    try:
        signals = supabase.table('raw_signals').select('score, comments_count, created_at, source').eq('source', source).gte('created_at', cutoff.isoformat()).execute()

        if signals.data and len(signals.data) >= 60:
            engagements = []
            for s in signals.data:
                eng = get_engagement_score(s)
                engagements.append(eng)

            sorted_eng = sorted(engagements)
            p90_idx = int(len(sorted_eng) * 0.90)
            p90 = sorted_eng[p90_idx] if p90_idx < len(sorted_eng) else sorted_eng[-1]
            return {'p90': max(p90, 1), 'sample_size': len(signals.data), 'method': 'rolling_14d'}

        params = supabase.table('snapshot_normalization_params').select('p90, sample_size, created_at').eq('source', source).gte('created_at', cutoff.isoformat()).execute()

        valid_params = [p for p in params.data if p['sample_size'] >= 20]
        if valid_params and len(valid_params) >= min_snapshots:
            all_p90s = [p['p90'] for p in valid_params]
            median_p90 = sorted(all_p90s)[len(all_p90s)//2]
            total_samples = sum(p['sample_size'] for p in valid_params)
            return {'p90': median_p90, 'sample_size': total_samples, 'method': 'snapshot_median'}
    except Exception as e:
        pass

    return None

def get_baseline_percentiles(source, fallback_p90=100):
    rolling = get_rolling_baseline_percentiles(source)
    if rolling:
        return rolling

    BOOTSTRAP_BASELINES = {
        'hackernews': {'p90': 426, 'sample_size': 119, 'bootstrap_source': 'analyze_sources.py 2026-01-13 snapshot_1'},
        'github': {'p90': 1690, 'sample_size': 60, 'bootstrap_source': 'analyze_sources.py 2026-01-13 snapshot_1'},
        'devto': {'p90': 92, 'sample_size': 60, 'bootstrap_source': 'analyze_sources.py 2026-01-13 snapshot_1'}
    }
    baseline = BOOTSTRAP_BASELINES.get(source, {'p90': fallback_p90, 'sample_size': 0, 'bootstrap_source': 'unknown'})
    return {'p90': baseline['p90'], 'sample_size': baseline['sample_size'], 'method': 'bootstrap'}

def normalize_score_by_source(signals, snapshot_id=None):
    from collections import defaultdict
    MIN_SAMPLE_SIZE = 20

    by_source = defaultdict(list)
    for s in signals:
        engagement = get_engagement_score(s)
        by_source[s['source']].append({'id': s['id'], 'engagement': engagement})

    percentiles = {}
    for source, items in by_source.items():
        sample_size = len(items)
        engagements = [item['engagement'] for item in items]

        if sample_size >= MIN_SAMPLE_SIZE:
            sorted_eng = sorted(engagements)
            p90_idx = int(len(sorted_eng) * 0.90)
            p90 = sorted_eng[p90_idx] if p90_idx < len(sorted_eng) else sorted_eng[-1]
            p90 = max(p90, 1)
            baseline_info = {'p90': p90, 'sample_size': sample_size, 'method': 'batch_current', 'window_sample_size': sample_size}
        else:
            baseline = get_baseline_percentiles(source)
            p90 = baseline['p90']
            baseline_info = {'p90': p90, 'sample_size': sample_size, 'method': baseline.get('method', 'unknown'), 'window_sample_size': baseline.get('sample_size', 0)}

        percentiles[source] = baseline_info

    if snapshot_id:
        for source, params in percentiles.items():
            try:
                supabase.table('snapshot_normalization_params').insert({
                    'snapshot_id': snapshot_id,
                    'source': source,
                    'p90': params['p90'],
                    'sample_size': params['sample_size'],
                    'half_life_days': 7,
                    'baseline_method': params.get('method', 'unknown'),
                    'window_sample_size': params.get('window_sample_size', 0),
                    'window_days': 14
                }).execute()
            except Exception as e:
                error_str = str(e).lower()
                if 'duplicate' not in error_str and 'unique' not in error_str:
                    print(f"Warning: Could not save norm params for {source}: {e}")

    normalized = {}
    for s in signals:
        source = s['source']
        engagement = get_engagement_score(s)
        if source in percentiles:
            normalized[s['id']] = min(engagement / percentiles[source]['p90'], 1.0)
        else:
            normalized[s['id']] = 0.0

    return normalized, percentiles

def calculate_time_decay(signal_created_at, half_life_days=7):
    from datetime import timezone
    now = datetime.now(timezone.utc)
    created = datetime.fromisoformat(signal_created_at.replace('Z', '+00:00'))
    age_days = (now - created).days
    age_days = max(age_days, 0)
    decay = 0.5 ** (age_days / half_life_days)
    return decay

def group_signals_into_trends(signals, duplicate_ids, snapshot_id=None):
    unique_signals = [s for s in signals if s['id'] not in duplicate_ids]

    normalized_scores, percentiles = normalize_score_by_source(unique_signals, snapshot_id)

    signal_keywords = {}
    for signal in unique_signals:
        signal_id = signal['id']
        title = signal.get('title', '')
        keywords = extract_keywords(title)
        if keywords:
            signal_keywords[signal_id] = keywords

    theme_signals = {}
    for signal_id, keywords in signal_keywords.items():
        for keyword in keywords:
            theme = map_keyword_to_theme(keyword)
            if theme:
                if theme not in theme_signals:
                    theme_signals[theme] = []
                theme_signals[theme].append(signal_id)

    trend_data = []
    for theme, signal_ids in theme_signals.items():
        signal_ids = list(set(signal_ids))

        if len(signal_ids) < 2:
            continue

        trend_signals = [s for s in unique_signals if s['id'] in signal_ids]

        weighted_scores = []
        for s in trend_signals:
            norm_score = normalized_scores.get(s['id'], 0.0)
            time_weight = calculate_time_decay(s['created_at'])
            weighted_scores.append(norm_score * time_weight)

        signal_count = len(trend_signals)
        momentum_score = sum(weighted_scores) / signal_count if signal_count > 0 else 0

        k = min(3, signal_count)
        topk_scores = sorted(weighted_scores, reverse=True)[:k]
        topk_mean = sum(topk_scores) / k if k > 0 else 0

        earliest_signal = min(trend_signals, key=lambda s: s['created_at'])
        first_seen = earliest_signal['created_at']

        trend_data.append({
            'keyword': theme,
            'signal_count': signal_count,
            'momentum_score': momentum_score,
            'topk_mean': topk_mean,
            'topk_used': k,
            'signal_ids': signal_ids,
            'first_seen': first_seen
        })

    trend_data.sort(key=lambda x: x['momentum_score'], reverse=True)
    return trend_data[:20]

def create_snapshot(signal_count, unique_signal_count, duplicate_count):
    try:
        snapshot_data = {
            'signal_count': signal_count,
            'unique_signal_count': unique_signal_count,
            'duplicate_count': duplicate_count,
            'detector_version': DETECTOR_VERSION,
            'scoring_version': SCORING_VERSION
        }
        result = supabase.table('trend_snapshots').insert(snapshot_data).execute()
        return result.data[0]['id']
    except Exception as e:
        print(f"Error creating snapshot: {e}")
        return None

def save_trends_to_db(trends, snapshot_id):
    saved_count = 0
    for trend in trends:
        try:
            existing = supabase.table('detected_trends').select('*').eq('detector_version', DETECTOR_VERSION).eq('theme', trend['keyword']).execute()

            if existing.data:
                existing_trend = existing.data[0]
                update_data = {
                    'last_updated': datetime.now().isoformat(),
                    'status': 'emerging'
                }
                supabase.table('detected_trends').update(update_data).eq('id', existing_trend['id']).execute()
                trend_id = existing_trend['id']
            else:
                insert_data = {
                    'theme': trend['keyword'],
                    'keywords': [trend['keyword']],
                    'first_seen': trend['first_seen'],
                    'last_updated': datetime.now().isoformat(),
                    'detector_version': DETECTOR_VERSION,
                    'status': 'emerging'
                }
                result = supabase.table('detected_trends').insert(insert_data).execute()
                trend_id = result.data[0]['id']

            save_trend_snapshot_item(
                snapshot_id,
                trend_id,
                trend['momentum_score'],
                trend['signal_count'],
                trend.get('topk_mean', 0.0),
                trend.get('topk_used', 0),
                trend.get('keyword', '')
            )
            save_trend_evidence(snapshot_id, trend_id, trend['signal_ids'])
            saved_count += 1
        except Exception as e:
            print(f"Error saving trend '{trend['keyword']}': {e}")
    print(f"Saved {saved_count} trends to the database.")
    return saved_count

def save_trend_snapshot_item(snapshot_id, trend_id, momentum_score, signal_count, top3_mean=0.0, topk_used=0, trend_keyword=''):
    try:
        item_data = {
            'snapshot_id': snapshot_id,
            'trend_id': trend_id,
            'momentum_score': momentum_score,
            'signal_count': signal_count,
            'top3_mean': top3_mean,
            'topk_used': topk_used,
            'trend_keyword': trend_keyword,
            'scoring_version': SCORING_VERSION
        }
        supabase.table('trend_snapshot_items').insert(item_data).execute()
    except Exception as e:
        error_str = str(e).lower()
        if 'duplicate' in error_str or 'unique' in error_str:
            return
        print(f"Error saving snapshot item for trend {trend_id}: {e}")
        raise

def save_trend_evidence(snapshot_id, trend_id, signal_ids):
    try:
        evidence_data = [{'snapshot_id': snapshot_id, 'trend_id': trend_id, 'signal_id': signal_id} for signal_id in signal_ids]
        if evidence_data:
            supabase.table('trend_signals').insert(evidence_data).execute()
    except Exception as e:
        error_str = str(e).lower()
        if 'duplicate' in error_str or 'unique' in error_str:
            return
        print(f"Error saving evidence for trend {trend_id}: {e}")
        raise


def main():
    print("Fetching signals from database...")
    signals = fetch_all_signals()
    print(f"Found {len(signals)} total signals")

    if not signals:
        print("No signals found. Run the scraper first!")
        return

    print("Fetching duplicates...")
    duplicate_ids = fetch_duplicate_ids()
    duplicate_count = len(duplicate_ids)
    unique_signal_count = len([s for s in signals if s['id'] not in duplicate_ids])

    print(f"Found {duplicate_count} duplicate signals")
    print(f"Unique signals: {unique_signal_count}")

    print("\nCreating snapshot...")
    snapshot_id = create_snapshot(len(signals), unique_signal_count, duplicate_count)
    if not snapshot_id:
        print("Failed to create snapshot. Aborting.")
        return

    print("\nDetecting trends...")
    trends = group_signals_into_trends(signals, duplicate_ids, snapshot_id)

    print(f"\nDetected {len(trends)} trends")

    saved_count = save_trends_to_db(trends, snapshot_id)

    print(f"\nTop trends:")
    for i, trend in enumerate(trends, 1):
        print(f"{i}. '{trend['keyword']}' - Signals: {trend['signal_count']}, Score: {trend['momentum_score']:.2f}")

if __name__ == "__main__":
    main()

  
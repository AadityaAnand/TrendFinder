import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client
from collections import Counter
import re
from content_classifier import classify_content_type, evaluate_cluster_quality
from demand_classifier import classify_demand_layer1
from stability_scorer import compute_stability_score, update_snapshot_item_stability
from negative_detector import detect_cluster_negative_signals

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

DETECTOR_VERSION = 'phrase-topic-v2'
SCORING_VERSION = 'norm-p90-decay7d-div-demand-v3'
LIFECYCLE_VERSION = 'lifecycle-v1'

# Non-trend filter: reject trends that are just generic phrases or single headlines
NON_TREND_PHRASES = {
    'show', 'ask', 'tell', 'launch', 'update', 'release', 'announce',
    'new', 'best', 'top', 'how', 'why', 'what', 'guide', 'tutorial',
    'review', 'comparison', 'opinion', 'discussion', 'thoughts',
    'hiring', 'jobs', 'salary', 'interview', 'career', 'remote-work',
    'layoff', 'layoffs', 'culture', 'management', 'burnout',
    'programming', 'software', 'engineering', 'development', 'technology',
    'startup', 'startups', 'funding', 'investing', 'venture-capital',
}

MIN_SOURCES_FOR_HIGH_QUALITY = 2

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


# Known technology terms and phrases for better extraction
TECH_TERMS = {
    # AI/ML specific
    'llm', 'llms', 'gpt', 'chatgpt', 'openai', 'anthropic', 'claude', 'gemini', 'mistral',
    'rag', 'embeddings', 'fine-tuning', 'transformer', 'diffusion', 'copilot',
    # Languages & runtimes
    'rust', 'python', 'golang', 'typescript', 'javascript', 'zig', 'elixir', 'ruby',
    'swift', 'kotlin', 'haskell', 'ocaml', 'gleam', 'nim',
    # Frameworks & tools
    'react', 'nextjs', 'svelte', 'vue', 'angular', 'django', 'fastapi', 'express',
    'docker', 'kubernetes', 'terraform', 'nix', 'guix',
    'postgres', 'sqlite', 'redis', 'clickhouse', 'duckdb', 'supabase', 'firebase',
    'wasm', 'webassembly', 'webtorrent', 'webrtc', 'websocket',
    # Concepts
    'blockchain', 'crypto', 'defi', 'web3', 'decentralized',
    'serverless', 'edge', 'p2p', 'peer-to-peer', 'self-hosted', 'open-source',
    'cli', 'tui', 'api', 'sdk', 'ide', 'devtools',
}

# Compound phrases to detect as single terms
COMPOUND_PHRASES = [
    'machine learning', 'deep learning', 'large language model', 'language model',
    'neural network', 'computer vision', 'natural language',
    'open source', 'self hosted', 'real time', 'local first',
    'developer tools', 'dev tools', 'command line', 'version control',
    'web scraping', 'web assembly', 'web torrent',
    'cloud native', 'cloud computing', 'edge computing',
    'vector database', 'time series', 'key value',
    'type safe', 'type system', 'memory safe',
    'code review', 'code generation', 'code editor',
    'ai agent', 'ai agents', 'ai model', 'ai models', 'ai coding', 'ai powered',
    'speech model', 'speech recognition', 'text to speech',
    'data pipeline', 'data engineering', 'data visualization',
]

# Normalize plural/variant forms to canonical form
CANONICAL_FORMS = {
    'llms': 'llm', 'models': 'model', 'agents': 'agent', 'apps': 'app',
    'apis': 'api', 'databases': 'database', 'frameworks': 'framework',
    'libraries': 'library', 'tools': 'tool', 'applications': 'application',
    'endpoints': 'endpoint', 'developers': 'developer', 'embeddings': 'embedding',
    'containers': 'container', 'pipelines': 'pipeline', 'languages': 'language',
    'language-models': 'llm', 'language-model': 'llm',
    'large-language-model': 'llm', 'chatgpt': 'openai',
}

def normalize_phrase(phrase):
    """Normalize a phrase to its canonical form."""
    return CANONICAL_FORMS.get(phrase, phrase)


def extract_topic_phrases(text):
    """Extract meaningful topic phrases from a signal title.
    Returns a set of normalized phrases (bigrams, tech terms, compound phrases)."""
    cleaned = re.sub(r'[^\w\s\-+#.]', ' ', text.lower())
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()

    phrases = set()

    # 1. Check for compound phrases first
    for phrase in COMPOUND_PHRASES:
        if phrase in cleaned:
            normalized = normalize_phrase(phrase.replace(' ', '-'))
            phrases.add(normalized)

    # 2. Extract known tech terms
    words = cleaned.split()
    for word in words:
        w = word.strip('.-')
        canonical = normalize_phrase(w)
        if canonical in TECH_TERMS or w in TECH_TERMS:
            phrases.add(canonical)

    # 3. Extract meaningful bigrams (adjacent word pairs)
    filtered_words = [w for w in words if len(w) > 2 and w not in STOP_WORDS]
    for i in range(len(filtered_words) - 1):
        w1 = normalize_phrase(filtered_words[i])
        w2 = normalize_phrase(filtered_words[i+1])
        bigram = f"{w1}-{w2}"
        bigram = normalize_phrase(bigram)
        # Keep bigrams where at least one word is a tech term or both are > 4 chars
        if w1 in TECH_TERMS or w2 in TECH_TERMS or \
           (len(w1) > 4 and len(w2) > 4):
            phrases.add(bigram)

    return phrases


def extract_keywords(text):
    """Legacy keyword extraction for backward compatibility."""
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
    elif source == 'reddit':
        return score * 1.0 + comments * 0.5
    elif source == 'producthunt':
        return score * 1.0 + comments * 0.3
    elif source == 'indiehackers':
        return score * 1.0 + comments * 0.5
    elif source == 'substack':
        return 1.0  # no engagement metrics; treat each article as a minimal-but-valid signal
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
        'devto': {'p90': 92, 'sample_size': 60, 'bootstrap_source': 'analyze_sources.py 2026-01-13 snapshot_1'},
        'reddit': {'p90': 150, 'sample_size': 0, 'bootstrap_source': 'phase5-bootstrap'},
        'producthunt': {'p90': 300, 'sample_size': 0, 'bootstrap_source': 'phase5-bootstrap'},
        'indiehackers': {'p90': 50, 'sample_size': 0, 'bootstrap_source': 'phase5-bootstrap'},
        'substack': {'p90': 1, 'sample_size': 0, 'bootstrap_source': 'phase5-bootstrap'},
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

def _calculate_source_diversity(signals: list, max_sources: int = 7) -> float:
    """
    Multi-factor source diversity score (0–1):
      - 70% source breadth: linear scale from 1 source (0.0) to max_sources (1.0)
      - 30% time diversity: std dev of signal timestamps scaled to 7-day range
      - Concentration penalty: -30% if one source > 90% of signals, -10% if > 70%
    """
    if not signals:
        return 0.0

    source_counts: dict = {}
    timestamps: list = []
    for s in signals:
        src = s.get('source', '')
        source_counts[src] = source_counts.get(src, 0) + 1
        raw_ts = s.get('created_at')
        if raw_ts:
            try:
                ts = datetime.fromisoformat(str(raw_ts).replace('Z', '+00:00')).timestamp()
                timestamps.append(ts)
            except Exception:
                pass

    total = sum(source_counts.values())
    unique = len(source_counts)

    source_breadth = min(1.0, (unique - 1) / (max_sources - 1)) if max_sources > 1 else 0.0

    top_pct = max(source_counts.values()) / total if total else 1.0
    concentration_penalty = 0.3 if top_pct > 0.9 else (0.1 if top_pct > 0.7 else 0.0)

    if len(timestamps) >= 2:
        import statistics as _stats
        std_days = _stats.stdev(timestamps) / 86400
        time_diversity = min(1.0, std_days / 7.0)
    else:
        time_diversity = 0.0

    diversity = (source_breadth * 0.7 + time_diversity * 0.3) * (1 - concentration_penalty)
    return round(min(max(diversity, 0.0), 1.0), 4)


def calculate_time_decay(signal_created_at, half_life_days=7):
    from datetime import timezone
    now = datetime.now(timezone.utc)
    created = datetime.fromisoformat(signal_created_at.replace('Z', '+00:00'))
    age_days = (now - created).days
    age_days = max(age_days, 0)
    decay = 0.5 ** (age_days / half_life_days)
    return decay

def group_signals_into_trends(signals, duplicate_ids, snapshot_id=None):
    """Group signals into specific trends using phrase-based topic extraction.

    Instead of mapping to broad categories (e.g., "AI & Machine Learning"),
    this groups signals that share specific topic phrases (e.g., "speech-model",
    "decentralized-hosting", "ai-coding").
    """
    unique_signals = [s for s in signals if s['id'] not in duplicate_ids]

    # Classify content types for all signals
    for signal in unique_signals:
        signal['content_type'] = classify_content_type(signal)

    normalized_scores, percentiles = normalize_score_by_source(unique_signals, snapshot_id)

    # Step 1: Extract topic phrases from each signal
    signal_phrases = {}  # signal_id -> set of phrases
    phrase_signals = {}  # phrase -> set of signal_ids

    for signal in unique_signals:
        signal_id = signal['id']
        title = signal.get('title', '')
        phrases = extract_topic_phrases(title)
        if phrases:
            signal_phrases[signal_id] = phrases
            for phrase in phrases:
                if phrase not in phrase_signals:
                    phrase_signals[phrase] = set()
                phrase_signals[phrase].add(signal_id)

    # Step 2: Find phrases shared by 2+ signals (these are potential trends)
    # Prefer compound/bigram phrases over single generic words
    GENERIC_SINGLE_WORDS = {'edge', 'app', 'model', 'tool', 'code', 'web', 'data',
                            'cloud', 'mobile', 'framework', 'library', 'api',
                            'database', 'server', 'client', 'application'}

    shared_phrases = {}
    for p, sids in phrase_signals.items():
        if len(sids) < 2:
            continue
        # Skip single generic words — they produce broad categories
        if p in GENERIC_SINGLE_WORDS and '-' not in p:
            continue
        shared_phrases[p] = sids

    if not shared_phrases:
        # Fallback: allow generic single words if nothing else
        for p, sids in phrase_signals.items():
            if len(sids) >= 2 and (p in TECH_TERMS or '-' in p):
                shared_phrases[p] = sids

    # Step 3: Merge overlapping phrase groups into trends
    # Two phrase groups should merge if they share >50% of their signals
    phrase_list = sorted(shared_phrases.keys(), key=lambda p: len(shared_phrases[p]), reverse=True)
    merged_groups = []  # list of (primary_phrase, signal_id_set)
    used_signals = set()

    for phrase in phrase_list:
        sids = shared_phrases[phrase]
        # Skip if most signals already assigned
        new_sids = sids - used_signals
        if len(new_sids) < 2 and len(sids) < 3:
            continue

        # Check if this should merge with an existing group
        merged = False
        for i, (_, group_sids) in enumerate(merged_groups):
            overlap = len(sids & group_sids)
            smaller = min(len(sids), len(group_sids))
            if smaller > 0 and overlap / smaller > 0.5:
                # Merge into existing group
                merged_groups[i] = (merged_groups[i][0], group_sids | sids)
                used_signals.update(sids)
                merged = True
                break

        if not merged and len(sids) >= 2:
            merged_groups.append((phrase, sids))
            used_signals.update(sids)

    # Step 4: Name each trend using the best representative phrase
    trend_data = []
    for primary_phrase, signal_ids in merged_groups:
        signal_ids = list(signal_ids)
        trend_signals = [s for s in unique_signals if s['id'] in signal_ids]

        if len(trend_signals) < 2:
            continue

        # Find the most descriptive phrase for this group
        # Prefer compound phrases and bigrams over single words
        group_phrase_counts = Counter()
        for s in trend_signals:
            sid = s['id']
            if sid in signal_phrases:
                for phrase in signal_phrases[sid]:
                    if phrase in shared_phrases or phrase in TECH_TERMS:
                        group_phrase_counts[phrase] += 1

        # Score phrases: prefer longer (more specific), higher count
        best_name = primary_phrase
        best_score = 0
        for phrase, count in group_phrase_counts.items():
            # Compound phrases get a boost for specificity
            specificity = len(phrase.split('-'))
            score = count * (1 + specificity * 0.5)
            if score > best_score:
                best_score = score
                best_name = phrase

        # Format the trend name nicely
        # Some terms should keep specific casing
        CASING_OVERRIDES = {
            'llm': 'LLMs', 'openai': 'OpenAI', 'chatgpt': 'ChatGPT',
            'claude': 'Claude', 'gemini': 'Gemini', 'mistral': 'Mistral',
            'gpt': 'GPT', 'api': 'APIs', 'cli': 'CLI Tools', 'sdk': 'SDKs',
            'ide': 'IDE', 'tui': 'TUI', 'ai': 'AI',
            'redis': 'Redis', 'postgres': 'PostgreSQL', 'sqlite': 'SQLite',
            'docker': 'Docker', 'kubernetes': 'Kubernetes', 'terraform': 'Terraform',
            'react': 'React', 'nextjs': 'Next.js', 'svelte': 'Svelte', 'vue': 'Vue',
            'rust': 'Rust', 'python': 'Python', 'golang': 'Go', 'zig': 'Zig',
            'typescript': 'TypeScript', 'javascript': 'JavaScript', 'elixir': 'Elixir',
            'nix': 'Nix', 'guix': 'Guix', 'wasm': 'WebAssembly',
            'supabase': 'Supabase', 'firebase': 'Firebase',
            'duckdb': 'DuckDB', 'clickhouse': 'ClickHouse',
        }
        parts = best_name.split('-')
        formatted_parts = [CASING_OVERRIDES.get(p, p.capitalize()) for p in parts]
        trend_name = ' '.join(formatted_parts)

        # Calculate momentum with source diversity and demand density
        weighted_scores = []
        for s in trend_signals:
            norm_score = normalized_scores.get(s['id'], 0.0)
            time_weight = calculate_time_decay(s['created_at'])
            weighted_scores.append(norm_score * time_weight)

        signal_count = len(trend_signals)
        engagement_score = sum(weighted_scores) / signal_count if signal_count > 0 else 0

        k = min(3, signal_count)
        topk_scores = sorted(weighted_scores, reverse=True)[:k]
        topk_mean = sum(topk_scores) / k if k > 0 else 0

        # Source diversity: multi-factor formula combining source breadth,
        # concentration penalty, and time spread.
        MAX_SOURCES = 7
        source_diversity_factor = _calculate_source_diversity(trend_signals, MAX_SOURCES)

        # Demand density from Layer 1 regex
        demand_count = 0
        for s in trend_signals:
            is_demand, _ = classify_demand_layer1(s.get('title', ''))
            if is_demand:
                demand_count += 1
        demand_ratio = demand_count / signal_count if signal_count > 0 else 0.0
        avg_demand_prob = demand_count / signal_count if signal_count > 0 else 0.0
        demand_density = avg_demand_prob * demand_ratio

        # Composite momentum: 50% engagement + 30% source diversity + 20% demand density
        momentum_score = 0.5 * engagement_score + 0.3 * source_diversity_factor + 0.2 * demand_density

        earliest_signal = min(trend_signals, key=lambda s: s['created_at'])
        first_seen = earliest_signal['created_at']

        trend_data.append({
            'keyword': trend_name,
            'signal_count': signal_count,
            'momentum_score': momentum_score,
            'topk_mean': topk_mean,
            'topk_used': k,
            'signal_ids': signal_ids,
            'first_seen': first_seen,
            'source_diversity_factor': source_diversity_factor,
            'demand_density': demand_density,
            'demand_signal_count': demand_count,
        })

    # Quality filter: reject non-trends and label quality
    filtered_data = []
    for trend in trend_data:
        keyword_lower = trend['keyword'].lower().replace(' ', '-')
        parts = keyword_lower.split('-')

        # Reject if the trend name is a known non-trend phrase
        if keyword_lower in NON_TREND_PHRASES or all(p in NON_TREND_PHRASES for p in parts):
            continue

        # Reject single-word trends that aren't tech terms
        if len(parts) == 1 and parts[0] not in TECH_TERMS:
            continue

        # Compute source diversity for quality labeling
        trend_signals_list = [s for s in unique_signals if s['id'] in trend['signal_ids']]
        sources = set(s.get('source', '') for s in trend_signals_list)
        trend['source_count'] = len(sources)
        trend['sources'] = list(sources)

        # Garbage cluster rejection — skip clusters that are mostly noise
        is_garbage, garbage_reasons = evaluate_cluster_quality(trend_signals_list)
        if is_garbage:
            print(f"Garbage rejected: '{trend['keyword']}' ({', '.join(garbage_reasons)})")
            continue

        # Quality label: high if multi-source and 3+ signals, medium if 2+ signals, low otherwise
        if len(sources) >= MIN_SOURCES_FOR_HIGH_QUALITY and trend['signal_count'] >= 3:
            trend['quality'] = 'high'
        elif trend['signal_count'] >= 2:
            trend['quality'] = 'medium'
        else:
            trend['quality'] = 'low'

        filtered_data.append(trend)

    filtered_data.sort(key=lambda x: x['momentum_score'], reverse=True)
    return filtered_data[:30]

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

def get_previous_trend_state(trend_id, current_snapshot_id):
    """
    Get the most recent previous appearance of this trend with metadata for comparability
    Uses trend_id (stable) not keyword (will change with embeddings)
    """
    try:
        # Get current snapshot's run_at time and scoring version
        current_snapshot = supabase.table('trend_snapshots').select('run_at, scoring_version').eq('id', current_snapshot_id).execute()
        if not current_snapshot.data:
            return None
        current_run_at = current_snapshot.data[0]['run_at']

        # Find previous snapshots before this one
        prev_snapshots = supabase.table('trend_snapshots').select('id, run_at, scoring_version').lt('run_at', current_run_at).order('run_at', desc=True).limit(10).execute()

        if not prev_snapshots.data:
            return None

        # Look for this trend_id in previous snapshots (most recent first)
        for prev_snapshot in prev_snapshots.data:
            prev_items = supabase.table('trend_snapshot_items').select('*').eq('snapshot_id', prev_snapshot['id']).eq('trend_id', trend_id).execute()

            if prev_items.data:
                # Calculate time gap
                from datetime import datetime
                current_time = datetime.fromisoformat(current_run_at.replace('Z', '+00:00'))
                prev_time = datetime.fromisoformat(prev_snapshot['run_at'].replace('Z', '+00:00'))
                time_gap_hours = (current_time - prev_time).total_seconds() / 3600

                return {
                    'snapshot_id': prev_snapshot['id'],
                    'momentum': prev_items.data[0]['momentum_score'],
                    'signals': prev_items.data[0]['signal_count'],
                    'top3_mean': prev_items.data[0].get('top3_mean', 0),
                    'scoring_version': prev_items.data[0].get('scoring_version', 'unknown'),
                    'time_gap_hours': time_gap_hours
                }

        return None
    except Exception as e:
        print(f"Error getting previous state for trend {trend_id}: {e}")
        return None

def calculate_lifecycle_stage(current_momentum, momentum_change_pct, signal_change, is_first_appearance,
                              acceleration_comparable, snapshots_seen, days_seen, time_gap_hours):
    """
    Determine lifecycle stage with explicit priority rules and reason tracking
    Returns (stage, confidence, reason, confidence_reasons)

    Rules applied in priority order to ensure mutual exclusivity
    """

    # Define thresholds (heuristics - should evolve with data)
    HIGH_MOMENTUM = 0.5
    MED_MOMENTUM = 0.3
    STRONG_ACCEL = 20  # %
    MOD_ACCEL = 10     # %

    confidence_reasons = []

    # Confidence ceiling: cap at 0.7 if insufficient observation diversity
    confidence_ceiling = 1.0
    if snapshots_seen < 3:
        confidence_reasons.append('few_snapshots')
        confidence_ceiling = min(confidence_ceiling, 0.7)
    if days_seen < 2:
        confidence_reasons.append('single_day_only')
        confidence_ceiling = min(confidence_ceiling, 0.6)

    # Base confidence starts lower
    base_confidence = 0.8

    # PRIORITY 1: First appearance
    if is_first_appearance:
        final_conf = min(0.9, confidence_ceiling)
        return ('emerging', final_conf, 'first_appearance', confidence_reasons)

    # PRIORITY 2: Acceleration not comparable (version mismatch or time gap issue)
    if not acceleration_comparable:
        confidence_reasons.append('acceleration_not_comparable')
        # Fall back to absolute momentum
        if current_momentum >= HIGH_MOMENTUM:
            return ('stable', 0.5, 'high_momentum_no_comparison', confidence_reasons)
        elif current_momentum >= MED_MOMENTUM:
            return ('stable', 0.5, 'med_momentum_no_comparison', confidence_reasons)
        else:
            return ('stable', 0.5, 'low_momentum_no_comparison', confidence_reasons)

    # PRIORITY 3: Peaking/Declining require ≥24h for high confidence (noise reduction)
    # Scale stable band by time gap: shorter gaps need tighter bands
    peaking_declining_threshold = MOD_ACCEL
    if time_gap_hours is not None and time_gap_hours < 24:
        # Require tighter stability for short gaps (reduce false peaking from noise)
        peaking_declining_threshold = MOD_ACCEL * 0.5  # 5% for <24h gaps
        confidence_reasons.append(f'short_gap_{time_gap_hours:.1f}h_tight_threshold')

    # PRIORITY 3a: Peaking (check before rising to avoid overlap)
    # High momentum + stable/slightly declining
    if current_momentum >= HIGH_MOMENTUM and abs(momentum_change_pct) <= peaking_declining_threshold:
        final_conf = min(base_confidence * 0.95, confidence_ceiling)
        return ('peaking', final_conf,
                f'high_momentum={current_momentum:.3f}_stable_accel={momentum_change_pct:+.1f}%',
                confidence_reasons)

    # PRIORITY 4: Rising (strong acceleration from medium+ base)
    if momentum_change_pct > STRONG_ACCEL and current_momentum >= MED_MOMENTUM:
        final_conf = min(base_confidence * 0.95, confidence_ceiling)
        return ('rising', final_conf,
                f'strong_accel={momentum_change_pct:+.1f}%_med_momentum={current_momentum:.3f}',
                confidence_reasons)

    # PRIORITY 5: Declining (strong deceleration from medium+ base)
    if momentum_change_pct < -STRONG_ACCEL and current_momentum >= MED_MOMENTUM:
        final_conf = min(base_confidence * 0.9, confidence_ceiling)
        return ('declining', final_conf,
                f'strong_decel={momentum_change_pct:+.1f}%_med_momentum={current_momentum:.3f}',
                confidence_reasons)

    # PRIORITY 6: Fading (low momentum + negative trend + shrinking signals)
    if current_momentum < MED_MOMENTUM and momentum_change_pct < -MOD_ACCEL:
        if signal_change is not None and signal_change < 0:
            final_conf = min(base_confidence * 0.9, confidence_ceiling)
            return ('fading', final_conf,
                    f'low_momentum={current_momentum:.3f}_decel={momentum_change_pct:+.1f}%_shrinking_signals={signal_change}',
                    confidence_reasons)
        else:
            final_conf = min(base_confidence * 0.7, confidence_ceiling)
            return ('fading', final_conf,
                    f'low_momentum={current_momentum:.3f}_decel={momentum_change_pct:+.1f}%',
                    confidence_reasons)

    # PRIORITY 7: Emerging (low momentum + positive acceleration + growing signals)
    if current_momentum < MED_MOMENTUM and momentum_change_pct > MOD_ACCEL:
        if signal_change is not None and signal_change > 0:
            final_conf = min(base_confidence * 0.85, confidence_ceiling)
            return ('emerging', final_conf,
                    f'low_momentum={current_momentum:.3f}_accel={momentum_change_pct:+.1f}%_growing_signals={signal_change}',
                    confidence_reasons)
        else:
            final_conf = min(base_confidence * 0.6, confidence_ceiling)
            return ('emerging', final_conf,
                    f'low_momentum={current_momentum:.3f}_accel={momentum_change_pct:+.1f}%',
                    confidence_reasons)

    # PRIORITY 8: Stable (everything else - moderate changes or unclear direction)
    final_conf = min(base_confidence * 0.7, confidence_ceiling)
    return ('stable', final_conf,
            f'momentum={current_momentum:.3f}_accel={momentum_change_pct:+.1f}%_default',
            confidence_reasons)

def calculate_acceleration_score(momentum_change_pct, signal_change):
    """
    Composite acceleration score combining momentum and signal changes
    Returns a score in range [-1, 1] (strictly enforced)

    Weights are versioned: 70% momentum change, 30% signal change
    """
    if momentum_change_pct is None:
        return 0.0

    # Normalize momentum change (cap at ±100% for bounded range)
    momentum_component = max(-1.0, min(1.0, momentum_change_pct / 100.0))

    # Normalize signal change (±10 signals = full weight)
    signal_component = 0.0
    if signal_change is not None:
        signal_component = max(-1.0, min(1.0, signal_change / 10.0))

    # Weighted combination (versioned in LIFECYCLE_VERSION)
    acceleration_score = 0.7 * momentum_component + 0.3 * signal_component

    # Strict bounds enforcement
    return max(-1.0, min(1.0, acceleration_score))

def count_historical_appearances(trend_id):
    """Count how many snapshots this trend has appeared in (by stable trend_id)"""
    try:
        items = supabase.table('trend_snapshot_items').select('snapshot_id').eq('trend_id', trend_id).execute()
        return len(items.data) if items.data else 0
    except:
        return 0

def count_distinct_days(trend_id):
    """Count distinct calendar days (prevents rerun inflation) - uses stable trend_id"""
    try:
        # Get all snapshot items for this trend
        items = supabase.table('trend_snapshot_items').select('snapshot_id').eq('trend_id', trend_id).execute()
        if not items.data:
            return 0

        snapshot_ids = [item['snapshot_id'] for item in items.data]

        # Get snapshot timestamps
        snapshots = supabase.table('trend_snapshots').select('run_at').in_('id', snapshot_ids).execute()
        if not snapshots.data:
            return 0

        # Extract unique dates (UTC-consistent)
        from datetime import datetime
        unique_dates = set()
        for snapshot in snapshots.data:
            dt = datetime.fromisoformat(snapshot['run_at'].replace('Z', '+00:00'))
            unique_dates.add(dt.date())

        return len(unique_dates)
    except Exception as e:
        print(f"Error counting distinct days for trend {trend_id}: {e}")
        return 0

def get_first_last_seen(trend_id):
    """Get first and last seen timestamps for this trend (uses stable trend_id, returns UTC timestamps)"""
    try:
        # Get all snapshot items for this trend
        items = supabase.table('trend_snapshot_items').select('snapshot_id').eq('trend_id', trend_id).execute()

        if not items.data:
            return None, None

        snapshot_ids = [item['snapshot_id'] for item in items.data]

        # Get snapshot timestamps (UTC)
        snapshots = supabase.table('trend_snapshots').select('run_at').in_('id', snapshot_ids).order('run_at').execute()

        if not snapshots.data:
            return None, None

        first_seen = snapshots.data[0]['run_at']
        last_seen = snapshots.data[-1]['run_at']

        return first_seen, last_seen
    except Exception as e:
        print(f"Error getting first/last seen for trend {trend_id}: {e}")
        return None, None

def save_lifecycle_history(snapshot_id, trend_id, trend_keyword, current_state, prev_state, current_scoring_version):
    """
    Save lifecycle tracking data with comprehensive guards for truthful acceleration

    Uses trend_id as stable identity (keywords will change with embeddings)
    Unique constraint: (snapshot_id, trend_id) ensures append-only, no duplicates

    Guards implemented:
    - Percent-change unstable near zero (prev momentum < 0.01 threshold)
    - Scoring version continuity (only compare same versions)
    - Minimum time gap enforcement (12 hours)
    - Distinct days tracking (prevents rerun inflation)
    - Confidence ceilings for insufficient history
    """
    try:
        # Initialize guard tracking
        acceleration_guards = []
        confidence_reasons = []
        acceleration_comparable = True

        # Get historical context early (needed for stage calculation) - uses stable trend_id
        snapshots_seen = count_historical_appearances(trend_id) + 1  # +1 for current
        days_seen = count_distinct_days(trend_id) + 1  # +1 for current day
        first_seen, last_seen = get_first_last_seen(trend_id)

        # Calculate metrics with guards
        momentum_change_pct = None
        signal_change = None
        time_gap_hours = None
        prev_scoring_version = None

        is_first_appearance = (prev_state is None)

        if prev_state:
            prev_scoring_version = prev_state.get('scoring_version', 'unknown')
            time_gap_hours = prev_state.get('time_gap_hours', 0)

            # GUARD 1: Scoring version continuity
            if prev_scoring_version != current_scoring_version:
                acceleration_guards.append('version_mismatch')
                confidence_reasons.append('scoring_formula_changed')
                acceleration_comparable = False

            # GUARD 2: Minimum time gap (12 hours)
            if time_gap_hours < 12:
                acceleration_guards.append(f'time_gap_too_small_{time_gap_hours:.1f}h')
                confidence_reasons.append('insufficient_time_separation')
                acceleration_comparable = False

            # GUARD 3: Previous momentum near zero (unstable percent change)
            MOMENTUM_FLOOR = 0.01  # Below this, use delta instead of percent
            if prev_state['momentum'] < MOMENTUM_FLOOR:
                acceleration_guards.append(f'prev_momentum_near_zero_{prev_state["momentum"]:.4f}')
                confidence_reasons.append('unstable_baseline')
                # Use absolute delta instead of percent
                momentum_change_pct = None  # Mark as not comparable
                acceleration_comparable = False
            else:
                # Safe to calculate percent change
                momentum_change_pct = ((current_state['momentum'] - prev_state['momentum']) / prev_state['momentum']) * 100

            # Signal change always safe (integer delta)
            signal_change = current_state['signals'] - prev_state['signals']

        # Determine lifecycle stage with all context (includes time_gap for threshold scaling)
        stage, confidence, lifecycle_reason, stage_confidence_reasons = calculate_lifecycle_stage(
            current_state['momentum'],
            momentum_change_pct,
            signal_change,
            is_first_appearance,
            acceleration_comparable,
            snapshots_seen,
            days_seen,
            time_gap_hours
        )

        # Merge confidence reasons
        confidence_reasons.extend(stage_confidence_reasons)

        # Calculate acceleration score (safe even if not comparable - will be 0)
        acceleration_score = calculate_acceleration_score(momentum_change_pct, signal_change)

        # Normalization metadata for auditability (versioned)
        ACCEL_NORM_DIVISOR = 10  # signal_change / 10
        ACCEL_MOMENTUM_WEIGHT = 0.7
        ACCEL_SIGNAL_WEIGHT = 0.3

        # Prepare data with all guards, metadata, and stable identity
        lifecycle_data = {
            'snapshot_id': snapshot_id,
            'trend_id': trend_id,  # Stable identity (source of truth)
            'trend_keyword': trend_keyword,  # Human-readable only
            'current_momentum': current_state['momentum'],
            'current_signals': current_state['signals'],
            'current_top3_mean': current_state.get('top3_mean'),
            'prev_momentum': prev_state['momentum'] if prev_state else None,
            'prev_signals': prev_state['signals'] if prev_state else None,
            'prev_snapshot_id': prev_state['snapshot_id'] if prev_state else None,
            'prev_scoring_version': prev_scoring_version,
            'time_gap_hours': time_gap_hours,
            'momentum_change_pct': momentum_change_pct,
            'signal_change': signal_change,
            'acceleration_score': acceleration_score,
            'acceleration_comparable': acceleration_comparable,
            'acceleration_guards': acceleration_guards if acceleration_guards else None,
            'lifecycle_stage': stage,
            'stage_confidence': confidence,
            'lifecycle_reason': lifecycle_reason,
            'confidence_reasons': confidence_reasons if confidence_reasons else None,
            'snapshots_seen': snapshots_seen,
            'days_seen': days_seen,
            'first_seen_at': first_seen,
            'last_seen_at': last_seen,
            'lifecycle_version': LIFECYCLE_VERSION,
            # Acceleration score normalization metadata (for auditability)
            'accel_norm_divisor': ACCEL_NORM_DIVISOR,
            'accel_momentum_weight': ACCEL_MOMENTUM_WEIGHT,
            'accel_signal_weight': ACCEL_SIGNAL_WEIGHT
        }

        supabase.table('trend_lifecycle_history').insert(lifecycle_data).execute()
    except Exception as e:
        print(f"Error saving lifecycle history for {trend_keyword}: {e}")

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
                trend.get('keyword', ''),
                source_diversity_factor=trend.get('source_diversity_factor'),
                demand_density=trend.get('demand_density'),
                demand_signal_count=trend.get('demand_signal_count'),
            )
            save_trend_evidence(snapshot_id, trend_id, trend['signal_ids'])

            # Compute and store stability score
            try:
                stability_data = compute_stability_score(supabase, trend_id, snapshot_id)
                update_snapshot_item_stability(supabase, snapshot_id, trend_id, stability_data)
            except Exception as e:
                print(f"Stability scoring failed for trend {trend_id}: {e}")

            # Compute and store negative signal detection (Layer 1 only)
            try:
                signal_dicts = [{'id': sid, 'title': '', 'content': '', 'source': '', 'content_type': 'other'} for sid in trend['signal_ids']]
                # Fetch actual titles for negative detection
                sig_resp = supabase.table('raw_signals').select('id, title, content, source').in_('id', trend['signal_ids'][:20]).execute()
                if sig_resp.data:
                    signal_dicts = sig_resp.data
                neg_result = detect_cluster_negative_signals(signal_dicts, use_llm=False)
                supabase.table('trend_snapshot_items') \
                    .update({
                        'negative_signal_ratio': neg_result['negative_signal_ratio'],
                        'negative_signal_count': neg_result['negative_signal_count'],
                    }) \
                    .eq('snapshot_id', snapshot_id) \
                    .eq('trend_id', trend_id) \
                    .execute()
            except Exception as e:
                print(f"Negative detection failed for trend {trend_id}: {e}")

            # Track lifecycle evolution with guards (uses stable trend_id)
            current_state = {
                'momentum': trend['momentum_score'],
                'signals': trend['signal_count'],
                'top3_mean': trend.get('topk_mean', 0.0)
            }
            prev_state = get_previous_trend_state(trend_id, snapshot_id)
            save_lifecycle_history(snapshot_id, trend_id, trend['keyword'], current_state, prev_state, SCORING_VERSION)

            saved_count += 1
        except Exception as e:
            print(f"Error saving trend '{trend['keyword']}': {e}")
    print(f"Saved {saved_count} trends to the database.")
    return saved_count

def save_trend_snapshot_item(snapshot_id, trend_id, momentum_score, signal_count, top3_mean=0.0, topk_used=0, trend_keyword='',
                            source_diversity_factor=None, demand_density=None, demand_signal_count=None):
    try:
        item_data = {
            'snapshot_id': snapshot_id,
            'trend_id': trend_id,
            'momentum_score': momentum_score,
            'signal_count': signal_count,
            'top3_mean': top3_mean,
            'topk_used': topk_used,
            'trend_keyword': trend_keyword,
            'scoring_version': SCORING_VERSION,
            'source_diversity_factor': source_diversity_factor,
            'demand_density': demand_density,
            'demand_signal_count': demand_signal_count,
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

  
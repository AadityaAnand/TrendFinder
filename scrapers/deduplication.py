import os
from dotenv import load_dotenv
from supabase import create_client, Client
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
import re
from rapidfuzz import fuzz

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

TRACKING_PARAMS = {'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
                   'ref', 'source', 'share', 'fbclid', 'gclid', 'mc_cid', 'mc_eid'}

WRAPPER_DOMAINS = {'news.ycombinator.com', 'reddit.com', 'twitter.com', 'x.com',
                   'facebook.com', 'linkedin.com'}

def clean_url(url):
    if not url:
        return None

    parsed = urlparse(url)
    parsed = parsed._replace(fragment='')

    if parsed.query:
        query_params = parse_qs(parsed.query, keep_blank_values=True)
        clean_params = {k: v for k, v in query_params.items() if k not in TRACKING_PARAMS}
        parsed = parsed._replace(query=urlencode(clean_params, doseq=True) if clean_params else '')

    if parsed.scheme == 'http':
        parsed = parsed._replace(scheme='https')

    return urlunparse(parsed)

def extract_canonical_url(signal):
    raw_url = signal.get('url', '')
    source = signal.get('source', '')

    if not raw_url:
        return None, 'no_url'

    url = clean_url(raw_url)
    if not url:
        return None, 'no_url'

    parsed = urlparse(url)
    domain = parsed.netloc.lower()
    path = parsed.path

    if 'github.com' in domain:
        match = re.match(r'^/([^/]+)/([^/]+?)(?:\.git)?(?:/.*)?$', path, re.IGNORECASE)
        if match:
            owner, repo = match.groups()
            return f"github.com/{owner.lower()}/{repo.lower()}", 'github_repo'

    if 'dev.to' in domain:
        match = re.match(r'^/([^/]+)/([^/]+)', path)
        if match:
            username, slug = match.groups()
            return f"dev.to/{username.lower()}/{slug.lower()}", 'article'

    if 'producthunt.com' in domain:
        match = re.match(r'^/posts/([^/?]+)', path)
        if match:
            slug = match.group(1)
            return f"producthunt.com/posts/{slug.lower()}", 'product'

    if 'indiehackers.com' in domain:
        match = re.match(r'^/post/([^/?]+)', path)
        if match:
            slug = match.group(1)
            return f"indiehackers.com/post/{slug.lower()}", 'article'

    if domain.endswith('.substack.com'):
        match = re.match(r'^/p/([^/?]+)', path)
        if match:
            slug = match.group(1)
            return f"{domain}/p/{slug.lower()}", 'article'

    if 'reddit.com' in domain:
        # Normalise reddit.com/r/{sub}/comments/{id}/{slug}/ → reddit.com/r/{sub}/comments/{id}
        match = re.match(r'^/r/([^/]+)/comments/([^/]+)', path)
        if match:
            sub, post_id = match.groups()
            return f"reddit.com/r/{sub.lower()}/comments/{post_id}", 'discussion'

    if domain in WRAPPER_DOMAINS:
        return None, 'wrapper'

    canonical = f"{domain}{path}".rstrip('/')
    return canonical, 'article' if source in ['hackernews', 'devto'] else 'other'

def fuzzy_match_titles(title1, title2):
    if not title1 or not title2:
        return 0.0
    t1 = title1.lower().strip()
    t2 = title2.lower().strip()
    return fuzz.token_sort_ratio(t1, t2) / 100.0

def find_duplicates(signals):
    groups = []
    processed = set()

    raw_url_groups = {}
    for signal in signals:
        canonical_url, url_type = extract_canonical_url(signal)

        if canonical_url is None and signal.get('url'):
            cleaned_raw = clean_url(signal.get('url'))
            if cleaned_raw:
                if cleaned_raw not in raw_url_groups:
                    raw_url_groups[cleaned_raw] = []
                raw_url_groups[cleaned_raw].append(signal)

    for url, group_signals in raw_url_groups.items():
        if len(group_signals) == 1:
            continue

        group_signals.sort(key=lambda s: s.get('created_at', ''))
        canonical = group_signals[0]
        duplicates = group_signals[1:]

        max_engagement = max(
            s.get('score', 0) + s.get('comments_count', 0)
            for s in group_signals
        )

        groups.append({
            'canonical_signal_id': canonical['id'],
            'duplicates': [s['id'] for s in duplicates],
            'match_type': 'url_exact',
            'similarities': [1.0] * len(duplicates),
            'max_engagement': max_engagement,
            'group_size': len(group_signals),
            'sources': list(set(s['source'] for s in group_signals))
        })

        processed.update([s['id'] for s in group_signals])

    url_groups = {}
    for signal in signals:
        if signal['id'] in processed:
            continue

        canonical_url, url_type = extract_canonical_url(signal)

        if canonical_url:
            if canonical_url not in url_groups:
                url_groups[canonical_url] = []
            url_groups[canonical_url].append(signal)

    for url, group_signals in url_groups.items():
        if len(group_signals) == 1:
            continue

        group_signals.sort(key=lambda s: s.get('created_at', ''))
        canonical = group_signals[0]
        duplicates = group_signals[1:]

        max_engagement = max(
            s.get('score', 0) + s.get('comments_count', 0)
            for s in group_signals
        )

        groups.append({
            'canonical_signal_id': canonical['id'],
            'duplicates': [s['id'] for s in duplicates],
            'match_type': 'url_exact',
            'similarities': [1.0] * len(duplicates),
            'max_engagement': max_engagement,
            'group_size': len(group_signals),
            'sources': list(set(s['source'] for s in group_signals))
        })

        processed.update([s['id'] for s in group_signals])

    remaining = [s for s in signals if s['id'] not in processed]

    canonical_urls = {}
    for signal in remaining:
        canonical_url, url_type = extract_canonical_url(signal)
        canonical_urls[signal['id']] = canonical_url

    for i, signal1 in enumerate(remaining):
        if signal1['id'] in processed:
            continue

        canonical_url1 = canonical_urls[signal1['id']]

        if canonical_url1 is not None:
            continue

        best_match = None
        best_similarity = 0.0

        for signal2 in remaining[i+1:]:
            if signal2['id'] in processed:
                continue

            canonical_url2 = canonical_urls[signal2['id']]

            if canonical_url2 is not None:
                continue

            similarity = fuzzy_match_titles(
                signal1.get('title', ''),
                signal2.get('title', '')
            )

            if similarity > best_similarity:
                best_similarity = similarity
                best_match = signal2

        if best_match and best_similarity >= 0.90:
            pair = sorted([signal1, best_match], key=lambda s: s.get('created_at', ''))
            canonical = pair[0]
            duplicate = pair[1]

            groups.append({
                'canonical_signal_id': canonical['id'],
                'duplicates': [duplicate['id']],
                'match_type': 'title_fuzzy',
                'similarities': [best_similarity],
                'max_engagement': max(
                    canonical.get('score', 0) + canonical.get('comments_count', 0),
                    duplicate.get('score', 0) + duplicate.get('comments_count', 0)
                ),
                'group_size': 2,
                'sources': [canonical['source'], duplicate['source']]
            })

            processed.add(canonical['id'])
            processed.add(duplicate['id'])

        elif best_match and 0.80 <= best_similarity < 0.90:
            print(f"  [CANDIDATE] {best_similarity:.2f} similarity: '{signal1['title'][:50]}' vs '{best_match['title'][:50]}'")

    return groups

def save_duplicate_groups(groups):
    try:
        supabase.table('signal_duplicates').delete().gte('id', 1).execute()
        print("  Cleared existing duplicate records")
    except Exception as e:
        print(f"  Warning: Could not clear existing duplicates: {e}")

    saved_count = 0
    cross_source_groups = 0

    for group in groups:
        canonical_id = group['canonical_signal_id']

        if len(set(group.get('sources', []))) > 1:
            cross_source_groups += 1

        for i, duplicate_id in enumerate(group['duplicates']):
            data = {
                'canonical_signal_id': canonical_id,
                'duplicate_signal_id': duplicate_id,
                'match_type': group['match_type'],
                'similarity_score': group['similarities'][i]
            }

            try:
                supabase.table('signal_duplicates').insert(data).execute()
                saved_count += 1
            except Exception as e:
                if 'duplicate key' not in str(e).lower():
                    print(f"  Error saving duplicate {duplicate_id}: {e}")

    print(f"  Saved {saved_count} duplicate relationships")
    print(f"  Cross-source groups: {cross_source_groups}/{len(groups)} ({cross_source_groups/len(groups)*100:.1f}%)")
    return saved_count

def main():
    print("=== Starting Deduplication ===")
    print(f"Supabase URL: {SUPABASE_URL[:30]}..." if SUPABASE_URL else "ERROR: No SUPABASE_URL")
    print(f"Supabase Key: {'[SET]' if SUPABASE_KEY else 'ERROR: No SUPABASE_KEY'}")

    print("\nFetching all signals...")
    try:
        response = supabase.table('raw_signals').select('*').execute()
        signals = response.data
        print(f"✓ Found {len(signals)} signals")

        if len(signals) == 0:
            print("WARNING: No signals found in database")
            return

    except Exception as e:
        print(f"ERROR fetching signals: {e}")
        import traceback
        traceback.print_exc()
        return

    print("\nFinding duplicates...")
    try:
        duplicate_groups = find_duplicates(signals)
        print(f"✓ Found {len(duplicate_groups)} duplicate groups")

        if len(duplicate_groups) > 0:
            print(f"  - First group example: {duplicate_groups[0]['match_type']}")
    except Exception as e:
        print(f"ERROR finding duplicates: {e}")
        import traceback
        traceback.print_exc()
        return

    print("\nSaving to database...")
    try:
        saved_count = save_duplicate_groups(duplicate_groups)
        print(f"✓ Saved {saved_count} duplicate relationships")
    except Exception as e:
        print(f"ERROR saving duplicates: {e}")
        import traceback
        traceback.print_exc()
        return

    # Calculate metrics
    total_duplicates = sum(len(g['duplicates']) for g in duplicate_groups)
    unique_signals = len(signals) - total_duplicates

    url_exact = sum(1 for g in duplicate_groups if g['match_type'] == 'url_exact')
    title_fuzzy = sum(1 for g in duplicate_groups if g['match_type'] == 'title_fuzzy')

    cross_source = sum(1 for g in duplicate_groups if len(set(g.get('sources', []))) > 1)

    print(f"\n=== Deduplication Summary ===")
    print(f"Total signals: {len(signals)}")
    print(f"Duplicate groups: {len(duplicate_groups)}")
    print(f"  - URL exact: {url_exact}")
    print(f"  - Title fuzzy: {title_fuzzy}")
    print(f"Total duplicates removed: {total_duplicates}")
    print(f"Unique signals: {unique_signals}")
    print(f"Reduction: {(total_duplicates / len(signals) * 100):.1f}%")
    print(f"\nCross-source dedup: {cross_source}/{len(duplicate_groups)} groups ({cross_source/len(duplicate_groups)*100:.1f}%)" if duplicate_groups else "\nCross-source dedup: 0/0 groups")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        import traceback
        traceback.print_exc()

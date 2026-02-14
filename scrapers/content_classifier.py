"""
Content-Type Classifier for raw signals.

Deterministic classifier that labels each incoming signal before clustering.
Consolidates narrative/noise patterns previously scattered across hypothesis_generator.py
and trend_detector.py.

Phase 1: Signal Purification — Task 1
"""

import re


# --- Content type constants ---

NON_OPPORTUNITY_TYPES = frozenset({
    'opinion', 'personal_story', 'career_advice', 'social_commentary'
})

PRODUCT_TYPES = frozenset({'product', 'technical'})

ALL_CONTENT_TYPES = frozenset({
    'product', 'technical', 'opinion', 'personal_story',
    'show_hn', 'ask_hn', 'career_advice', 'social_commentary', 'other'
})


# --- Shared pattern sets (consolidated from hypothesis_generator.py) ---

NARRATIVE_PATTERNS = [
    r'^(I|We|My)\b',
    r'\bunpopular opinion\b',
    r'\bstory[\s-]?time\b',
    r'\bconfession\b',
    r'\brant\b',
    r'\bjust launched\b',
    r'\bshow hn\b',
    r'\bask hn\b',
    r'\btil\b',
    r'\btoday i learned\b',
]
NARRATIVE_REGEX = re.compile('|'.join(NARRATIVE_PATTERNS), re.IGNORECASE)

GENERIC_NON_MARKET = {
    'junior developer', 'senior developer', 'tech interview', 'career advice',
    'salary', 'resume', 'job hunting', 'layoff', 'work life balance',
    'burnout', 'imposter syndrome', 'side project', 'weekend project',
    'meme', 'humor', 'funny', 'unpopular opinion', 'hot take',
}


# --- Classification patterns ---

SHOW_HN_RE = re.compile(r'^show\s+hn\b', re.IGNORECASE)
ASK_HN_RE = re.compile(r'^ask\s+hn\b', re.IGNORECASE)

CAREER_PATTERNS = [
    r'\b(?:career|salary|salaries|compensation|resume|cv)\b',
    r'\b(?:job\s+hunt(?:ing)?|job\s+search|hiring|fired|laid\s+off)\b',
    r'\b(?:interview(?:ing)?|whiteboard|leetcode|coding\s+interview)\b',
    r'\b(?:burnout|work[\s-]?life[\s-]?balance|imposter\s+syndrome)\b',
    r'\b(?:remote\s+work|return\s+to\s+office|rto|wfh)\b',
    r'\b(?:promotion|raise|negotiate|quit(?:ting)?|resign)\b',
    r'\b(?:manager|management|leadership)\s+(?:advice|tips|lessons)\b',
]
CAREER_REGEX = re.compile('|'.join(CAREER_PATTERNS), re.IGNORECASE)

PERSONAL_STORY_PATTERNS = [
    r'^(?:I|We|My)\s+(?:built|made|created|wrote|started|quit|left|joined|switched)',
    r'^(?:I|We)\s+(?:am|was|have been|decided|think|believe|feel)',
    r'\bstory[\s-]?time\b',
    r'\bconfession\b',
    r'\bmy\s+(?:journey|experience|story|take|thoughts)\b',
    r'^(?:How|Why)\s+I\s+',
    r'\bAMA\b',
]
PERSONAL_STORY_REGEX = re.compile('|'.join(PERSONAL_STORY_PATTERNS), re.IGNORECASE)

OPINION_PATTERNS = [
    r'\bunpopular\s+opinion\b',
    r'\bhot\s+take\b',
    r'\bthoughts\s+on\b',
    r'\bwhy\s+I\s+(?:think|believe|hate|love)\b',
    r'\brant\s+about\b',
    r'\bchange\s+my\s+mind\b',
    r'\boverrated\b',
    r'\bunderrated\b',
    r'\bis\s+(?:dead|dying|overrated|overhyped)\b',
    r'\b(?:love|hate)\s+(?:letter|it\s+or\s+hate)\b',
]
OPINION_REGEX = re.compile('|'.join(OPINION_PATTERNS), re.IGNORECASE)

SOCIAL_COMMENTARY_PATTERNS = [
    r'\b(?:society|societal|culture\s+war|political|politics)\b',
    r'\bethics\s+of\b',
    r'\bmoral(?:ity|ly)?\b',
    r'\b(?:capitalism|socialism|inequality|privilege)\b',
    r'\b(?:diversity|dei|discrimination|bias)\s+(?:in\s+tech|in\s+hiring)\b',
    r'\b(?:surveillance|privacy\s+rights|censorship)\b',
]
SOCIAL_COMMENTARY_REGEX = re.compile('|'.join(SOCIAL_COMMENTARY_PATTERNS), re.IGNORECASE)

PRODUCT_TITLE_PATTERNS = [
    r'\b(?:v\d+(?:\.\d+)*)\b',
    r'\b(?:launch(?:ed|ing)?|released?|announcing|shipped)\b',
    r'\b(?:open[\s-]?sourc(?:e|ed|ing))\b',
    r'\b(?:built\s+(?:with|using|in))\b',
    r'\b(?:github\.com|gitlab\.com|npmjs\.com|pypi\.org|crates\.io)\b',
]
PRODUCT_TITLE_REGEX = re.compile('|'.join(PRODUCT_TITLE_PATTERNS), re.IGNORECASE)

TECHNICAL_PATTERNS = [
    r'\b(?:benchmark(?:s|ing)?|performance|latency|throughput)\b',
    r'\b(?:architecture|design\s+pattern|system\s+design)\b',
    r'\b(?:tutorial|guide|walkthrough|deep\s+dive)\b',
    r'\b(?:bug|vulnerability|cve|security\s+(?:flaw|issue|patch))\b',
    r'\b(?:algorithm|data\s+structure|complexity|optimization)\b',
    r'\b(?:deploy(?:ment|ing)?|ci\/?cd|pipeline|infrastructure)\b',
    r'\b(?:api|sdk|library|framework|runtime|compiler)\b',
    r'\b(?:database|query|index|migration|schema)\b',
    r'\b(?:container|docker|kubernetes|k8s|helm)\b',
    r'\b(?:rust|golang|python|typescript|javascript|c\+\+|java|swift|kotlin)\b',
]
TECHNICAL_REGEX = re.compile('|'.join(TECHNICAL_PATTERNS), re.IGNORECASE)


def classify_content_type(signal: dict) -> str:
    """
    Classify a signal into one of the content types.

    Returns one of: 'product', 'technical', 'opinion', 'personal_story',
    'show_hn', 'ask_hn', 'career_advice', 'social_commentary', 'other'

    Classification priority (first match wins):
    1. show_hn / ask_hn (title prefix)
    2. career_advice (strong career patterns)
    3. social_commentary (societal/political)
    4. personal_story (first-person narrative)
    5. opinion (hot takes, rants)
    6. product (GitHub source, launch/release language, version numbers)
    7. technical (technical terms, benchmarks, architecture)
    8. other (default)
    """
    title = signal.get('title', '')
    source = signal.get('source', '')

    # 1. Show HN / Ask HN — highest priority, unambiguous
    if SHOW_HN_RE.search(title):
        return 'show_hn'
    if ASK_HN_RE.search(title):
        return 'ask_hn'

    # 2. Career advice — strong career/job patterns
    if CAREER_REGEX.search(title):
        return 'career_advice'

    # 3. Social commentary
    if SOCIAL_COMMENTARY_REGEX.search(title):
        return 'social_commentary'

    # 4. Personal story — first-person narratives
    if PERSONAL_STORY_REGEX.search(title):
        return 'personal_story'

    # 5. Opinion — hot takes, rants
    if OPINION_REGEX.search(title):
        return 'opinion'

    # 6. Product — GitHub repos are always product signals
    if source == 'github':
        return 'product'
    if PRODUCT_TITLE_REGEX.search(title):
        return 'product'

    # 7. Technical
    if TECHNICAL_REGEX.search(title):
        return 'technical'

    # 8. Default
    return 'other'


def is_non_opportunity_type(content_type: str) -> bool:
    """Check if a content type is non-opportunity (opinion, story, career, commentary)."""
    return content_type in NON_OPPORTUNITY_TYPES


def evaluate_cluster_quality(cluster_signals: list[dict]) -> tuple[bool, list[str]]:
    """
    Evaluate whether a cluster is garbage (non-opportunity noise).

    Returns (is_garbage, reasons).

    Rejection criteria:
    1. >60% non-opportunity content types
    2. No product/tool signals AND no GitHub sources
    3. All signals match known meme/noise patterns
    """
    if not cluster_signals:
        return True, ['empty_cluster']

    reasons = []
    total = len(cluster_signals)

    # Count content types
    type_counts: dict[str, int] = {}
    source_counts: dict[str, int] = {}
    for sig in cluster_signals:
        ct = sig.get('content_type', 'other')
        type_counts[ct] = type_counts.get(ct, 0) + 1
        src = sig.get('source', '')
        source_counts[src] = source_counts.get(src, 0) + 1

    # Criterion 1: >60% non-opportunity content
    non_opp_count = sum(type_counts.get(t, 0) for t in NON_OPPORTUNITY_TYPES)
    non_opp_ratio = non_opp_count / total
    if non_opp_ratio > 0.6:
        reasons.append(f'non_opportunity_content_{non_opp_count}/{total}_{non_opp_ratio:.0%}')

    # Criterion 2: No product/tool signals
    product_count = type_counts.get('product', 0) + type_counts.get('technical', 0)
    github_count = source_counts.get('github', 0)
    show_hn_count = type_counts.get('show_hn', 0)
    has_product_signal = product_count > 0 or github_count > 0 or show_hn_count > 0
    if not has_product_signal:
        reasons.append(f'no_product_signals_in_{total}_signals')

    # Criterion 3: All signals are self-promo Show HN with no real overlap
    if show_hn_count == total and total >= 2:
        # Check if signals share any meaningful overlap (same URLs)
        urls = set()
        for sig in cluster_signals:
            url = sig.get('url', '')
            if url:
                urls.add(url.split('?')[0].rstrip('/').lower())
        if len(urls) == total:
            reasons.append(f'all_show_hn_no_overlap_{total}_unique_urls')

    # A cluster is garbage if it has 2+ reasons, or the non-opportunity ratio alone is very high
    is_garbage = len(reasons) >= 2 or non_opp_ratio > 0.8
    return is_garbage, reasons


def is_narrative_title(title: str) -> bool:
    """Check if a title matches narrative patterns. Used by hypothesis_generator."""
    return bool(NARRATIVE_REGEX.search(title))


def is_generic_non_market(name: str) -> bool:
    """Check if a trend name matches generic non-market terms. Used by hypothesis_generator."""
    lower = name.lower().strip()
    for term in GENERIC_NON_MARKET:
        if term in lower:
            return True
    return False

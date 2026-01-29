"""
Phase 9: Competitive Landscape + Saturation Intelligence

Answers: "Is this already crowded, and if yes, what wedge is required?"
All signals are deterministic — no LLM used for competition claims.

Saturation components:
- Repo density (0.30)
- Alt-language frequency (0.25)
- Volume vs quality divergence (0.20)
- Cross-source redundancy (0.15)
- Search-intent proxy (0.10)
"""

import os
import re
import logging
import statistics
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

METHOD_VERSION = 'competition-v1'

# Saturation component weights
WEIGHTS = {
    'repo_density': 0.30,
    'alt_phrases': 0.25,
    'volume_vs_quality': 0.20,
    'cross_source_redundancy': 0.15,
    'search_intent': 0.10,
}

# Competition level thresholds
SATURATION_LOW = 0.30
SATURATION_HIGH = 0.60

# Guardrail thresholds
MIN_SIGNALS_FOR_ASSESSMENT = 3
MIN_SOURCE_TYPES = 2
MIN_SNAPSHOTS_FOR_COMPETITION = 3

# Alt-language patterns
ALT_PATTERNS = [
    r'\balternative\s+to\b',
    r'\bvs\.?\b',
    r'\bcomparison\b',
    r'\bbest\s+tools?\b',
    r'\bcompetitors?\b',
    r'\breplacement\s+for\b',
    r'\binstead\s+of\b',
    r'\bswitch(?:ing)?\s+from\b',
]
ALT_REGEX = re.compile('|'.join(ALT_PATTERNS), re.IGNORECASE)

# Search intent patterns
INTENT_PATTERNS = [
    r'\bhow\s+to\s+choose\b',
    r'\bwhich\s+tool\b',
    r'\bwhich\s+(?:is|are)\s+best\b',
    r'\bbuyer.?s?\s+guide\b',
    r'\btop\s+\d+\b',
    r'\bcompar(?:e|ing|ison)\b',
    r'\bpick(?:ing)?\s+(?:a|the)\b',
]
INTENT_REGEX = re.compile('|'.join(INTENT_PATTERNS), re.IGNORECASE)

# Wedge trigger patterns
WEDGE_PATTERNS = {
    'niche_vertical': [
        r'\bhealthcare\b', r'\bfinance\b', r'\blegal\b', r'\beduc(?:ation|ational)\b',
        r'\benterprise\b', r'\bgovernment\b', r'\bvertical\b', r'\bindustry-specific\b',
        r'\bsector\b', r'\bniche\b',
    ],
    'integration': [
        r'\bworks?\s+with\b', r'\bplugin\s+for\b', r'\bintegrat(?:e|es|ion)\b',
        r'\bconnect(?:s|or)?\s+(?:to|with)\b', r'\bapi\s+for\b', r'\bextension\b',
    ],
    'performance': [
        r'\bfaster\b', r'\blighter\b', r'\bscal(?:e|able|ability)\b',
        r'\bperformance\b', r'\bspeed\b', r'\blow\s+latency\b', r'\boptimiz\b',
    ],
    'compliance': [
        r'\bsoc\s?2\b', r'\bhipaa\b', r'\bgdpr\b', r'\bcomplian(?:t|ce)\b',
        r'\bsecurity\s+certif\b', r'\biso\s+27001\b', r'\bfedramp\b',
    ],
    'ux': [
        r'\bhard\s+to\s+use\b', r'\bconfusing\b', r'\bterrible\s+(?:ux|ui)\b',
        r'\busability\b', r'\bfrustrat\b', r'\bclunky\b', r'\bbetter\s+(?:ux|ui)\b',
    ],
    'distribution': [
        r'\bcommunity\b', r'\bopen\s+source\b', r'\bembedded\b',
        r'\bself[- ]host\b', r'\bmarketplace\b', r'\bfreemium\b',
    ],
}

_supabase: Optional[Client] = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase


# ============================================================
# SIGNAL EXTRACTION
# ============================================================

def extract_competitive_signals(
    trend_id: str,
    snapshot_id: str,
    trend_data: dict,
    signals: list[dict],
    trajectory: list[dict]
) -> list[dict]:
    """
    Extract all competitive signals for a trend.
    Returns list of signal dicts ready for DB insertion.
    """
    extracted = []

    corpus = _build_corpus(trend_data, signals)

    # 1. Repo density
    repo_signal = _compute_repo_density(signals)
    if repo_signal is not None:
        extracted.append({
            'snapshot_id': snapshot_id,
            'trend_id': trend_id,
            'signal_type': 'repo_density',
            'value': repo_signal['value'],
            'normalized_value': repo_signal['normalized'],
            'source': 'github',
            'notes': repo_signal['notes']
        })

    # 2. Alt-language frequency
    alt_signal = _compute_alt_frequency(corpus, len(signals))
    extracted.append({
        'snapshot_id': snapshot_id,
        'trend_id': trend_id,
        'signal_type': 'alt_phrases',
        'value': alt_signal['value'],
        'normalized_value': alt_signal['normalized'],
        'source': 'corpus',
        'notes': alt_signal['notes']
    })

    # 3. Volume vs quality divergence
    vq_signal = _compute_volume_vs_quality(trajectory)
    if vq_signal is not None:
        extracted.append({
            'snapshot_id': snapshot_id,
            'trend_id': trend_id,
            'signal_type': 'volume_vs_quality',
            'value': vq_signal['value'],
            'normalized_value': vq_signal['normalized'],
            'source': 'trajectory',
            'notes': vq_signal['notes']
        })

    # 4. Cross-source redundancy
    redundancy_signal = _compute_cross_source_redundancy(signals)
    if redundancy_signal is not None:
        extracted.append({
            'snapshot_id': snapshot_id,
            'trend_id': trend_id,
            'signal_type': 'cross_source_redundancy',
            'value': redundancy_signal['value'],
            'normalized_value': redundancy_signal['normalized'],
            'source': 'multi',
            'notes': redundancy_signal['notes']
        })

    # 5. Search intent proxy
    intent_signal = _compute_search_intent(corpus, len(signals))
    extracted.append({
        'snapshot_id': snapshot_id,
        'trend_id': trend_id,
        'signal_type': 'search_intent',
        'value': intent_signal['value'],
        'normalized_value': intent_signal['normalized'],
        'source': 'corpus',
        'notes': intent_signal['notes']
    })

    return extracted


def _build_corpus(trend_data: dict, signals: list[dict]) -> str:
    """Build searchable text corpus from trend and signals."""
    parts = []
    if trend_data.get('theme'):
        parts.append(trend_data['theme'])
    if trend_data.get('description'):
        parts.append(trend_data['description'])
    for s in signals:
        if s.get('title'):
            parts.append(s['title'])
        if s.get('summary'):
            parts.append(s['summary'])
    return ' '.join(parts).lower()


def _compute_repo_density(signals: list[dict]) -> Optional[dict]:
    """Count GitHub signals and compute star distribution."""
    github_signals = [s for s in signals if s.get('source') == 'github']

    if not github_signals:
        return None

    count = len(github_signals)

    # Extract star counts if available
    stars = []
    for s in github_signals:
        meta = s.get('metadata', {}) or {}
        star_count = meta.get('stars', 0) or meta.get('stargazers_count', 0)
        if star_count:
            stars.append(star_count)

    # Compute Gini-like coefficient (flat distribution = crowded)
    gini = 0.0
    if len(stars) >= 2:
        sorted_stars = sorted(stars)
        n = len(sorted_stars)
        total = sum(sorted_stars)
        if total > 0:
            cumulative = sum((2 * (i + 1) - n - 1) * sorted_stars[i] for i in range(n))
            gini = cumulative / (n * total)

    # Many repos + flat distribution (low gini) = crowded
    # Normalize: cap at 30 repos, invert gini
    density_factor = min(count / 30, 1.0)
    evenness_factor = 1.0 - gini  # Low gini = even = crowded

    normalized = 0.6 * density_factor + 0.4 * evenness_factor

    notes = f"{count} repos"
    if stars:
        notes += f", Gini={gini:.2f}"
        notes += f", stars range: {min(stars)}-{max(stars)}"

    return {
        'value': count,
        'normalized': round(min(1.0, normalized), 3),
        'notes': notes
    }


def _compute_alt_frequency(corpus: str, signal_count: int) -> dict:
    """Count alternative/comparison language frequency."""
    matches = ALT_REGEX.findall(corpus)
    count = len(matches)

    # Normalize per signal (density of competition language)
    per_signal = count / max(signal_count, 1)

    # Normalize: >0.5 per signal is very high competition language
    normalized = min(1.0, per_signal / 0.5)

    return {
        'value': count,
        'normalized': round(normalized, 3),
        'notes': f"{count} alt-phrases in {signal_count} signals ({per_signal:.2f}/signal)"
    }


def _compute_volume_vs_quality(trajectory: list[dict]) -> Optional[dict]:
    """Detect rising signal volume + falling quality (topK mean)."""
    if len(trajectory) < 3:
        return None

    recent = trajectory[-3:]
    signals = [t.get('signal_count', 0) or 0 for t in recent]
    topk = [t.get('top3_mean', 0) or 0 for t in recent]

    # Check for divergence: signals rising, quality falling
    signal_rising = signals[2] > signals[0]
    quality_falling = topk[2] < topk[0] and topk[0] > 0

    if not (signal_rising or quality_falling):
        return {'value': 0, 'normalized': 0.0,
                'notes': 'No volume/quality divergence'}

    # Compute divergence magnitude
    signal_growth = (signals[2] - signals[0]) / max(signals[0], 1)
    quality_drop = (topk[0] - topk[2]) / max(topk[0], 0.01) if quality_falling else 0

    divergence = (signal_growth + quality_drop) / 2

    normalized = min(1.0, divergence)

    return {
        'value': round(divergence, 3),
        'normalized': round(normalized, 3),
        'notes': f"Signal growth: {signal_growth:.1%}, quality drop: {quality_drop:.1%}"
    }


def _compute_cross_source_redundancy(signals: list[dict]) -> Optional[dict]:
    """Measure how many sources cover the same concept."""
    sources = set()
    for s in signals:
        src = s.get('source', 'unknown')
        sources.add(src)

    source_count = len(sources)

    if source_count < 2:
        return None

    # More sources = more established = potentially more crowded
    # Normalize: 5+ sources is high redundancy
    normalized = min(1.0, (source_count - 1) / 4)

    return {
        'value': source_count,
        'normalized': round(normalized, 3),
        'notes': f"Covered by {source_count} sources: {', '.join(sorted(sources))}"
    }


def _compute_search_intent(corpus: str, signal_count: int) -> dict:
    """Count buyer/shopping intent language."""
    matches = INTENT_REGEX.findall(corpus)
    count = len(matches)

    per_signal = count / max(signal_count, 1)
    normalized = min(1.0, per_signal / 0.3)

    return {
        'value': count,
        'normalized': round(normalized, 3),
        'notes': f"{count} intent phrases ({per_signal:.2f}/signal)"
    }


# ============================================================
# SATURATION SCORING
# ============================================================

def compute_saturation(signal_records: list[dict]) -> dict:
    """
    Compute weighted saturation score from extracted signals.

    Returns:
        {
            'saturation_score': float,
            'competition_level': str,
            'confidence': float,
            'confidence_reasons': list[str],
            'signals_used': int,
            'source_types_used': list[str]
        }
    """
    # Index signals by type
    by_type = {}
    source_types = set()

    for s in signal_records:
        stype = s.get('signal_type')
        by_type[stype] = s.get('normalized_value', 0) or 0
        if s.get('source'):
            source_types.add(s['source'])

    signals_used = len(by_type)
    source_types_list = sorted(source_types)
    confidence_reasons = []

    # Check guardrails
    uncertain = False

    if signals_used < MIN_SIGNALS_FOR_ASSESSMENT:
        uncertain = True
        confidence_reasons.append(f"Only {signals_used} signal types (need {MIN_SIGNALS_FOR_ASSESSMENT})")

    if len(source_types) < MIN_SOURCE_TYPES:
        uncertain = True
        confidence_reasons.append(f"Only {len(source_types)} source type(s) (need {MIN_SOURCE_TYPES})")

    # Compute weighted saturation
    weighted_sum = 0.0
    weight_sum = 0.0

    for signal_type, weight in WEIGHTS.items():
        if signal_type in by_type:
            weighted_sum += weight * by_type[signal_type]
            weight_sum += weight

    # Normalize for missing signals
    saturation_score = weighted_sum / weight_sum if weight_sum > 0 else 0.0

    # Compute confidence
    coverage = signals_used / len(WEIGHTS)  # How many signal types we have
    confidence = 0.5 + 0.5 * coverage  # 0.5 to 1.0 based on coverage

    if uncertain:
        confidence = min(confidence, 0.6)
        competition_level = 'uncertain'
        confidence_reasons.append("Assessment marked uncertain due to insufficient data")
    elif saturation_score < SATURATION_LOW:
        competition_level = 'low'
        confidence_reasons.append(f"Saturation {saturation_score:.2f} below low threshold ({SATURATION_LOW})")
    elif saturation_score <= SATURATION_HIGH:
        competition_level = 'moderate'
        confidence_reasons.append(f"Saturation {saturation_score:.2f} in moderate range")
    else:
        competition_level = 'high'
        confidence_reasons.append(f"Saturation {saturation_score:.2f} above high threshold ({SATURATION_HIGH})")

    return {
        'saturation_score': round(saturation_score, 3),
        'competition_level': competition_level,
        'confidence': round(confidence, 3),
        'confidence_reasons': confidence_reasons,
        'signals_used': signals_used,
        'source_types_used': source_types_list
    }


# ============================================================
# WEDGE DETECTION
# ============================================================

def detect_wedges(
    trend_id: str,
    snapshot_id: str,
    competition_level: str,
    corpus: str
) -> list[dict]:
    """
    Detect differentiation wedges (only when competition is high).

    Returns at most 2 wedges.
    """
    if competition_level != 'high':
        return []

    candidates = []

    for wedge_type, patterns in WEDGE_PATTERNS.items():
        regex = re.compile('|'.join(patterns), re.IGNORECASE)
        matches = regex.findall(corpus)

        if matches:
            # More matches = higher confidence
            match_count = len(matches)
            confidence = min(0.9, 0.5 + match_count * 0.1)

            candidates.append({
                'trend_id': trend_id,
                'snapshot_id': snapshot_id,
                'wedge_type': wedge_type,
                'trigger_reason': f"Found {match_count} trigger(s): {', '.join(set(m.lower().strip() for m in matches[:3]))}",
                'confidence': round(confidence, 3)
            })

    # Sort by confidence, take top 2
    candidates.sort(key=lambda x: x['confidence'], reverse=True)
    return candidates[:2]


# ============================================================
# MAIN COMPUTATION
# ============================================================

def compute_competitive_intelligence(trend_id: str, snapshot_id: str) -> dict:
    """
    Full competitive intelligence computation for a trend.
    """
    supabase = get_supabase()

    # Get trend data
    trend_response = supabase.table('detected_trends') \
        .select('id, theme, description') \
        .eq('id', trend_id) \
        .single() \
        .execute()

    trend_data = trend_response.data or {}

    # Get signals for this trend in this snapshot
    signals_response = supabase.table('trend_signals') \
        .select('title, summary, source, metadata') \
        .eq('trend_id', trend_id) \
        .execute()

    signals = signals_response.data or []

    # Get trajectory
    trajectory_response = supabase.table('trend_snapshot_items') \
        .select('momentum_score, signal_count, top3_mean') \
        .eq('trend_id', trend_id) \
        .order('snapshot_id', desc=True) \
        .limit(10) \
        .execute()

    trajectory = list(reversed(trajectory_response.data or []))

    # Extract competitive signals
    extracted_signals = extract_competitive_signals(
        trend_id, snapshot_id, trend_data, signals, trajectory
    )

    # Store signals
    if extracted_signals:
        supabase.table('competitive_signals').insert(extracted_signals).execute()

    # Compute saturation
    saturation = compute_saturation(extracted_signals)

    # Store competitive intelligence
    intel_record = {
        'snapshot_id': snapshot_id,
        'trend_id': trend_id,
        'saturation_score': saturation['saturation_score'],
        'competition_level': saturation['competition_level'],
        'confidence': saturation['confidence'],
        'confidence_reasons': saturation['confidence_reasons'],
        'signals_used': saturation['signals_used'],
        'source_types_used': saturation['source_types_used'],
        'method_version': METHOD_VERSION
    }

    supabase.table('trend_competitive_intelligence') \
        .upsert(intel_record, on_conflict='snapshot_id,trend_id') \
        .execute()

    # Detect wedges (only if high competition)
    corpus = _build_corpus(trend_data, signals)
    wedges = detect_wedges(
        trend_id, snapshot_id,
        saturation['competition_level'], corpus
    )

    if wedges:
        for wedge in wedges:
            supabase.table('trend_wedges') \
                .upsert(wedge, on_conflict='trend_id,snapshot_id,wedge_type') \
                .execute()

    return {
        'saturation': saturation,
        'wedges': wedges,
        'signals_extracted': len(extracted_signals)
    }


def compute_all_competitive_intelligence(snapshot_id: str) -> dict:
    """Compute competitive intelligence for all trends in a snapshot."""
    supabase = get_supabase()

    response = supabase.table('trend_snapshot_items') \
        .select('trend_id') \
        .eq('snapshot_id', snapshot_id) \
        .execute()

    trend_ids = [t['trend_id'] for t in (response.data or [])]

    results = {
        'total': len(trend_ids),
        'by_level': {},
        'wedges_found': 0,
        'errors': []
    }

    for trend_id in trend_ids:
        try:
            result = compute_competitive_intelligence(trend_id, snapshot_id)
            level = result['saturation']['competition_level']
            results['by_level'][level] = results['by_level'].get(level, 0) + 1
            results['wedges_found'] += len(result['wedges'])
        except Exception as e:
            results['errors'].append(f"{trend_id}: {str(e)}")

    return results


# ============================================================
# SCORING MODIFIERS
# ============================================================

def get_competition_modifier(competition_level: str) -> float:
    """Get opportunity score modifier based on competition level."""
    modifiers = {
        'high': -0.20,
        'moderate': -0.10,
        'low': 0.0,
        'uncertain': 0.0  # No penalty, but show warning
    }
    return modifiers.get(competition_level, 0.0)


def get_timing_override(
    timing_label: str,
    competition_level: str
) -> Optional[str]:
    """
    Check if competition level should override timing label.

    early_edge + high saturation → "early but crowded" (crowded label)
    """
    if timing_label == 'early_edge' and competition_level == 'high':
        return 'crowded'

    return None


def bulk_get_competition_data(trend_ids: list[str], snapshot_id: str) -> dict:
    """Get competition data for multiple trends at once."""
    supabase = get_supabase()

    if not trend_ids:
        return {}

    # Get competitive intelligence
    intel_response = supabase.table('trend_competitive_intelligence') \
        .select('trend_id, saturation_score, competition_level, confidence, confidence_reasons') \
        .in_('trend_id', trend_ids) \
        .eq('snapshot_id', snapshot_id) \
        .execute()

    # Get wedges
    wedge_response = supabase.table('trend_wedges') \
        .select('trend_id, wedge_type, trigger_reason, confidence') \
        .in_('trend_id', trend_ids) \
        .eq('snapshot_id', snapshot_id) \
        .execute()

    wedge_map: dict[str, list[dict]] = {}
    for w in (wedge_response.data or []):
        tid = w['trend_id']
        if tid not in wedge_map:
            wedge_map[tid] = []
        wedge_map[tid].append({
            'wedge_type': w['wedge_type'],
            'trigger_reason': w['trigger_reason'],
            'confidence': w['confidence']
        })

    result = {}
    for intel in (intel_response.data or []):
        tid = intel['trend_id']
        result[tid] = {
            'saturation_score': intel['saturation_score'],
            'competition_level': intel['competition_level'],
            'confidence': intel['confidence'],
            'confidence_reasons': intel['confidence_reasons'],
            'modifier': get_competition_modifier(intel['competition_level']),
            'wedges': wedge_map.get(tid, [])
        }

    return result


if __name__ == '__main__':
    supabase = get_supabase()
    response = supabase.table('trend_snapshots') \
        .select('id') \
        .order('created_at', desc=True) \
        .limit(1) \
        .single() \
        .execute()

    if response.data:
        snapshot_id = response.data['id']
        print(f"Computing competitive intelligence for snapshot {snapshot_id}")
        results = compute_all_competitive_intelligence(snapshot_id)
        print(f"Results: {results}")

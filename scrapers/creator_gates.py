"""
Creator qualification gates — determines if a trend cluster is a real content opportunity.

Called from opportunity_detector.py when the cluster has a majority of creator signals
(source_type='creator'). Applies 4 gates and stores results in creator_qualification table.
"""
import re
from datetime import datetime, timezone, timedelta


# ----- Signal type detection -------------------------------------------------

def get_cluster_signal_type(signals: list[dict]) -> str:
    """
    Returns 'developer', 'creator', or 'mixed' based on majority source_type.
    70%+ creator signals = 'creator'; 30%- = 'developer'; in between = 'mixed'.
    """
    if not signals:
        return "developer"
    counts: dict[str, int] = {}
    for s in signals:
        t = s.get("source_type", "developer")
        counts[t] = counts.get(t, 0) + 1
    total = sum(counts.values()) or 1
    creator_pct = counts.get("creator", 0) / total
    if creator_pct >= 0.7:
        return "creator"
    elif creator_pct <= 0.3:
        return "developer"
    return "mixed"


# ----- Gate helpers ----------------------------------------------------------

def _calculate_engagement_velocity(signals: list[dict]) -> float:
    """
    Calculate growth rate in engagement over time.
    Compares today's total score vs yesterday's total score.
    Returns the growth ratio (0.2 = 20% growth). Negative if declining.
    """
    now = datetime.now(timezone.utc)
    today_cutoff = now - timedelta(hours=24)
    yesterday_cutoff = now - timedelta(hours=48)

    today_score = 0
    yesterday_score = 0

    for s in signals:
        raw_ts = s.get("created_at", "")
        if not raw_ts:
            continue
        try:
            ts = datetime.fromisoformat(str(raw_ts).replace("Z", "+00:00"))
        except Exception:
            continue
        score = (s.get("score") or 0) + (s.get("comments_count") or 0)
        if ts >= today_cutoff:
            today_score += score
        elif ts >= yesterday_cutoff:
            yesterday_score += score

    if yesterday_score == 0:
        # No yesterday data — if today has data, treat as new (positive signal)
        return 0.3 if today_score > 0 else 0.0

    return (today_score - yesterday_score) / yesterday_score


def _count_format_replication(signals: list[dict]) -> int:
    """
    Count distinct format fingerprints across signals.
    A 'format' is detected by overlapping n-grams in titles or platform_data.format_type.
    Returns the count of signals that share a format pattern with at least one other.
    """
    # Collect title bigrams for each signal
    def get_bigrams(text: str) -> set:
        words = re.sub(r"[^\w\s]", "", text.lower()).split()
        return {(words[i], words[i + 1]) for i in range(len(words) - 1)} if len(words) >= 2 else set()

    # Group by format_type from platform_data first
    format_groups: dict[str, int] = {}
    for s in signals:
        pd = s.get("platform_data") or {}
        ft = pd.get("format_type", "")
        if ft:
            format_groups[ft] = format_groups.get(ft, 0) + 1

    # Find formats with 3+ signals
    replicated_formats = sum(1 for v in format_groups.values() if v >= 3)
    if replicated_formats >= 1:
        return sum(v for v in format_groups.values() if v >= 3)

    # Fallback: bigram overlap — count signals sharing 2+ bigrams with another
    bigram_sets = [(s, get_bigrams(s.get("title", ""))) for s in signals]
    replication_count = 0
    for i, (si, bi) in enumerate(bigram_sets):
        for j, (sj, bj) in enumerate(bigram_sets):
            if i >= j:
                continue
            if len(bi & bj) >= 2:
                replication_count += 1
                break  # count each signal at most once

    return replication_count


_PAIN_PATTERNS = re.compile(
    r"\b(how (do|can|to|should)|tutorial|need more|need this|when (will|is the next)|"
    r"anyone else|i wish|struggling with|can't figure|help with|looking for)\b",
    re.IGNORECASE,
)


def _detect_audience_pain(signals: list[dict]) -> int:
    """Count signals whose title contains audience pain / question patterns."""
    count = 0
    for s in signals:
        title = s.get("title", "")
        if _PAIN_PATTERNS.search(title):
            count += 1
    return count


_MONETIZATION_PATTERNS = re.compile(
    r"\b(sponsor|affiliate|course|merch|merchandise|product|brand deal|paid partner|"
    r"subscribe|membership|patreon|sell|revenue|income|earn|monetize)\b",
    re.IGNORECASE,
)


def _detect_monetization_signals(signals: list[dict]) -> float:
    """Return ratio of signals with monetization mentions."""
    if not signals:
        return 0.0
    hits = sum(
        1 for s in signals if _MONETIZATION_PATTERNS.search(s.get("title", ""))
    )
    return hits / len(signals)


# ----- Main gate check -------------------------------------------------------

def check_creator_gates(
    trend_id: str,
    signals: list[dict],
    snapshot_id: str,
    supabase,
) -> dict:
    """
    Run 4 creator-specific qualification gates.
    Stores results in creator_qualification table.

    Returns:
        {
            'qualified': bool,
            'gates': {
                'engagement_velocity': {'passed': bool, 'value': float},
                'format_replication':  {'passed': bool, 'value': int},
                'audience_pain':       {'passed': bool, 'value': int},
                'monetization':        {'passed': bool, 'value': float},
            }
        }
    """
    velocity = _calculate_engagement_velocity(signals)
    replication = _count_format_replication(signals)
    pain = _detect_audience_pain(signals)
    monetization = _detect_monetization_signals(signals)

    gate1_passed = velocity > 0.2             # 20% growth in 24h
    gate2_passed = replication >= 3           # at least 3 signals share a format
    gate3_passed = pain >= 2                  # at least 2 audience pain signals
    gate4_passed = monetization > 0.05        # at least ~1 in 20 signals mention monetization

    qualified = gate1_passed and (gate2_passed or gate3_passed) and gate4_passed

    gate_results = {
        "engagement_velocity": {"passed": gate1_passed, "value": round(velocity, 4)},
        "format_replication": {"passed": gate2_passed, "value": replication},
        "audience_pain": {"passed": gate3_passed, "value": pain},
        "monetization": {"passed": gate4_passed, "value": round(monetization, 4)},
    }

    try:
        supabase.table("creator_qualification").upsert(
            {
                "trend_id": trend_id,
                "snapshot_id": snapshot_id,
                "engagement_velocity": velocity,
                "format_replication_count": replication,
                "audience_pain_signals": pain,
                "monetization_potential": monetization,
                "qualified": qualified,
                "gate_results": gate_results,
            },
            on_conflict="trend_id,snapshot_id",
        ).execute()
    except Exception as e:
        print(f"[creator_gates] Failed to upsert creator_qualification: {e}")

    return {"qualified": qualified, "gates": gate_results}

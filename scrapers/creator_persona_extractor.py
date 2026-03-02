"""
Creator persona extractor — identifies creator type, niche, and audience from signals.

Mirrors persona_extractor.py but for creator-type signals.
Saves results to creator_personas table.
"""
import json
import re
from datetime import datetime, timezone


MIN_SIGNALS_FOR_LLM = 4

# Platform detection from source field
PLATFORM_MAP = {
    "youtube_creator": "youtube",
    "spotify": "spotify",
    "medium": "newsletter",
    "twitch": "twitch",
    "tiktok": "tiktok",
    "instagram": "instagram",
    "linkedin": "linkedin",
    "pinterest": "pinterest",
    "discord": "discord",
}

KNOWN_NICHES = [
    "gaming", "beauty", "fitness", "education", "finance", "lifestyle",
    "tech", "cooking", "travel", "music", "entertainment", "business",
    "parenting", "comedy", "sports", "fashion", "health", "art",
]

CONTENT_STYLES = [
    "tutorial", "vlog", "review", "educational", "entertaining",
    "inspirational", "challenge", "reaction", "commentary", "storytelling",
]

MONETIZATION_KEYWORDS = {
    "sponsorships": ["sponsor", "brand deal", "paid partnership"],
    "courses": ["course", "masterclass", "workshop", "bootcamp"],
    "affiliate": ["affiliate", "commission", "referral link"],
    "merchandise": ["merch", "merchandise", "shop"],
    "subscriptions": ["patreon", "membership", "subscribe", "premium"],
    "ads": ["ad revenue", "adsense", "monetize"],
    "products": ["product", "sell", "shop", "store"],
}


def _detect_primary_platform(signals: list[dict]) -> str:
    """Return the most common platform source in the signals."""
    counts: dict[str, int] = {}
    for s in signals:
        src = s.get("source", "")
        platform = PLATFORM_MAP.get(src, src)
        counts[platform] = counts.get(platform, 0) + 1
    if not counts:
        return "multi"
    return max(counts, key=lambda k: counts[k])


def _detect_niches(signals: list[dict]) -> list[str]:
    """Detect niches from signal titles via keyword matching."""
    all_text = " ".join(s.get("title", "") for s in signals).lower()
    detected = []
    for niche in KNOWN_NICHES:
        if niche in all_text:
            detected.append(niche)
    return detected[:5]  # cap to 5 most relevant


def _estimate_audience_size(signals: list[dict]) -> str:
    """
    Estimate audience size tier from engagement metrics.
    View counts / scores are normalized differently per platform.
    """
    scores = [s.get("score", 0) or 0 for s in signals]
    if not scores:
        return "micro"
    avg_score = sum(scores) / len(scores)
    # YouTube view_count // 1000 is stored as score
    # Twitch viewer_count // 100 is stored as score
    if avg_score > 500:
        return "macro"
    elif avg_score > 100:
        return "mid"
    elif avg_score > 10:
        return "micro"
    return "nano"


def _detect_content_styles(signals: list[dict]) -> list[str]:
    """Detect content styles from titles."""
    all_text = " ".join(s.get("title", "") for s in signals).lower()
    detected = []
    for style in CONTENT_STYLES:
        if style in all_text:
            detected.append(style)
    return detected[:4]


def _detect_monetization_methods(signals: list[dict]) -> list[str]:
    """Detect monetization methods mentioned in signal titles."""
    all_text = " ".join(s.get("title", "") for s in signals).lower()
    detected = []
    for method, keywords in MONETIZATION_KEYWORDS.items():
        if any(kw in all_text for kw in keywords):
            detected.append(method)
    return detected


def _extract_pain_points(signals: list[dict]) -> list[dict]:
    """
    Extract pain point phrases from signal titles.
    Returns list of {pain, evidence, count}.
    """
    pain_patterns = [
        (re.compile(r"how (do|can|to) (.{3,40})\b", re.IGNORECASE), "how-to gap"),
        (re.compile(r"(struggling|struggle) with (.{3,40})\b", re.IGNORECASE), "struggle"),
        (re.compile(r"(can't|cannot|can not) (.{3,40})\b", re.IGNORECASE), "blocker"),
        (re.compile(r"(need|want) (more|better) (.{3,40})\b", re.IGNORECASE), "unmet need"),
        (re.compile(r"(tired|sick) of (.{3,40})\b", re.IGNORECASE), "frustration"),
    ]
    pain_counts: dict[str, dict] = {}
    for s in signals:
        title = s.get("title", "")
        for pattern, pain_type in pain_patterns:
            m = pattern.search(title)
            if m:
                key = pain_type
                if key not in pain_counts:
                    pain_counts[key] = {"pain": pain_type, "evidence": title[:120], "count": 0}
                pain_counts[key]["count"] += 1

    return sorted(pain_counts.values(), key=lambda x: -x["count"])[:5]


def _llm_extract(signals: list[dict], trend_name: str, groq_client) -> dict | None:
    """Use LLM to extract creator persona from signals."""
    if groq_client is None:
        return None

    titles = [s.get("title", "") for s in signals[:20]]
    sources = list({s.get("source", "") for s in signals})

    prompt = f"""You are analyzing signals from content creator platforms to identify the creator persona for a trend called "{trend_name}".

Signals (titles from {', '.join(sources)}):
{json.dumps(titles, indent=2)}

Extract the creator persona. Return a JSON object with these exact keys:
- "primary_platform": string (youtube|tiktok|instagram|spotify|twitch|newsletter|linkedin|multi)
- "niches": array of strings from [gaming, beauty, fitness, education, finance, lifestyle, tech, cooking, travel, music, entertainment, business, comedy, sports, fashion, health, art]
- "audience_size": string (nano|micro|mid|macro|mega)
- "content_styles": array from [tutorial, vlog, review, educational, entertaining, inspirational, challenge, reaction, commentary, storytelling]
- "pain_points": array of {{pain: string, evidence: string, count: number}} — max 3 items
- "monetization_methods": array from [sponsorships, courses, affiliate, merchandise, subscriptions, ads, products]
- "confidence": object with each field name mapped to a 0.0-1.0 confidence score

If the signals don't contain enough information for a field, use an empty array or "unknown" and set confidence to 0.1.
Return only valid JSON, no markdown."""

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=800,
        )
        raw = response.choices[0].message.content.strip()
        # Strip markdown code fences if present
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        return json.loads(raw)
    except Exception as e:
        print(f"[creator_persona_extractor] LLM extraction failed: {e}")
        return None


def extract_creator_persona(
    signals: list[dict],
    trend_name: str,
    trend_id: str,
    snapshot_id: str,
    supabase,
    groq_client=None,
) -> dict:
    """
    Extract creator persona from signals using LLM (if available) with deterministic fallback.
    Saves result to creator_personas table.

    Returns the persona dict.
    """
    persona = None

    if len(signals) >= MIN_SIGNALS_FOR_LLM and groq_client is not None:
        persona = _llm_extract(signals, trend_name, groq_client)

    if persona is None:
        # Deterministic fallback
        persona = {
            "primary_platform": _detect_primary_platform(signals),
            "niches": _detect_niches(signals),
            "audience_size": _estimate_audience_size(signals),
            "content_styles": _detect_content_styles(signals),
            "pain_points": _extract_pain_points(signals),
            "monetization_methods": _detect_monetization_methods(signals),
            "confidence": {
                "primary_platform": 0.8,
                "niches": 0.5,
                "audience_size": 0.4,
                "content_styles": 0.5,
                "pain_points": 0.4,
                "monetization_methods": 0.5,
            },
        }

    # Save to DB
    try:
        supabase.table("creator_personas").upsert(
            {
                "trend_id": trend_id,
                "snapshot_id": snapshot_id,
                "primary_platform": persona.get("primary_platform"),
                "niches": persona.get("niches", []),
                "audience_size": persona.get("audience_size"),
                "content_styles": persona.get("content_styles", []),
                "pain_points": persona.get("pain_points", []),
                "monetization_methods": persona.get("monetization_methods", []),
                "confidence": persona.get("confidence", {}),
            },
            on_conflict="trend_id,snapshot_id",
        ).execute()
    except Exception as e:
        print(f"[creator_persona_extractor] Failed to upsert creator_personas: {e}")

    return persona

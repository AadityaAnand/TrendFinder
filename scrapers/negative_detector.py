"""
Negative Evidence Detector.

Two-layer negative sentiment detection for cluster signals.
Layer 1: Deterministic regex patterns
Layer 2: LLM-based classification (batched, gated)

Phase 2: Momentum & Qualification Upgrade — Task 4
"""

import re
import json
import logging
from typing import Optional

from groq import Groq

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_NAME = 'llama-3.3-70b-versatile'

# --- Layer 1: Deterministic negative patterns ---

NEGATIVE_PATTERNS = [
    r'\boverhyped\b',
    r'\bdoesn\'?t\s+scale\b',
    r'\bsecurity\s+(?:issue|flaw|vuln|hole|breach)',
    r'\bfailed\s+(?:attempt|migration|deployment|experiment)\b',
    r'\bnot\s+(?:ready|production|stable|mature)\b',
    r'\babandoned\b',
    r'\bdead\s+project\b',
    r'\bstay\s+away\b',
    r'\bregret(?:ted|ting)?\b',
    r'\bwaste\s+of\s+time\b',
    r'\bbug(?:gy|s|ridden)\b',
    r'\bunstable\b',
    r'\bunreliable\b',
    r'\bdowntime\b',
    r'\bdata\s+loss\b',
    r'\bbreaking\s+change\b',
    r'\bvapor\s?ware\b',
    r'\bscam\b',
    r'\bponzi\b',
    r'\bdisappoint(?:ed|ing|ment)\b',
    r'\bnightmare\b',
    r'\bhorrible\b',
    r'\bterrible\b',
    r'\bavoid\b',
    r'\bdon\'?t\s+(?:use|recommend|bother)\b',
    r'\bworse\s+than\b',
    r'\boverpriced\b',
    r'\bhidden\s+(?:cost|fee|catch)\b',
    r'\block[\s-]?in\b',
    r'\bvendor\s+lock\b',
]

NEGATIVE_REGEX = re.compile('|'.join(NEGATIVE_PATTERNS), re.IGNORECASE)


def detect_negative_layer1(title: str, content: str = '') -> tuple[bool, list[str]]:
    """
    Layer 1: Deterministic regex matching for negative sentiment.

    Returns (is_negative, matched_patterns).
    """
    matched = []

    for pattern in NEGATIVE_PATTERNS:
        regex = re.compile(pattern, re.IGNORECASE)
        if regex.search(title):
            matched.append(pattern)
        elif content and regex.search(content[:500]):
            matched.append(f'{pattern} (content)')

    return len(matched) > 0, matched


def detect_negative_llm_batch(
    signals: list[dict],
    groq_client: Groq,
) -> dict[str, float]:
    """
    Layer 2: LLM-based negative sentiment scoring.

    Returns {signal_id: negative_probability}.
    """
    if not signals:
        return {}

    batch = signals[:10]

    signal_lines = []
    for i, sig in enumerate(batch):
        title = sig.get('title', '')[:120]
        source = sig.get('source', 'unknown')
        signal_lines.append(f"{i+1}. [{source}] {title}")

    signals_text = '\n'.join(signal_lines)

    prompt = f"""Analyze these developer community signals for NEGATIVE SENTIMENT — criticism, warnings, failures, or problems with tools/technologies.

Signals:
{signals_text}

For each signal, estimate the probability (0.0 to 1.0) that it expresses negative sentiment about a technology:

High negative (0.7-1.0): Explicit criticism, warnings, failure reports, "don't use X"
Medium negative (0.3-0.7): Constructive criticism with problems, migration away from tool
Low negative (0.0-0.3): Neutral news, positive announcements, tutorials

IMPORTANT: Constructive feedback like "X has limitations" is medium, not high.

Respond with ONLY a JSON array of numbers (one per signal, same order):
[0.2, 0.8, 0.1, ...]"""

    try:
        response = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=MODEL_NAME,
            temperature=0.1,
            max_tokens=200
        )
        raw = response.choices[0].message.content.strip()

        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
            raw = raw.strip()

        probabilities = json.loads(raw)
        if not isinstance(probabilities, list):
            return {}

        result = {}
        for i, sig in enumerate(batch):
            if i < len(probabilities):
                prob = float(probabilities[i])
                result[sig['id']] = max(0.0, min(1.0, prob))

        return result
    except Exception as e:
        logger.warning(f"LLM negative detection error: {e}")
        return {}


def detect_cluster_negative_signals(
    signals: list[dict],
    use_llm: bool = True,
    groq_client: Optional[Groq] = None,
) -> dict:
    """
    Detect negative sentiment signals in a cluster.

    Returns:
        {
            'negative_signal_count': int,
            'negative_signal_ratio': float,
            'negative_examples': list[dict],
            'sentiment_label': str,  # 'positive', 'mixed', 'negative'
        }
    """
    if not signals:
        return {
            'negative_signal_count': 0,
            'negative_signal_ratio': 0.0,
            'negative_examples': [],
            'sentiment_label': 'positive',
        }

    total = len(signals)
    negative_count = 0
    negative_examples = []
    layer2_candidates = []

    # Layer 1: Deterministic regex
    for sig in signals:
        title = sig.get('title', '')
        content = sig.get('content', '')
        is_negative, patterns = detect_negative_layer1(title, content)
        if is_negative:
            negative_count += 1
            negative_examples.append({
                'title': title[:120],
                'source': sig.get('source', ''),
                'matched_patterns': patterns,
            })
        elif use_llm:
            content_type = sig.get('content_type', 'other')
            if content_type in ('technical', 'product', 'other'):
                layer2_candidates.append(sig)

    # Layer 2: LLM classification (only if Layer 1 found something)
    if use_llm and groq_client and negative_count > 0 and layer2_candidates:
        for i in range(0, len(layer2_candidates), 10):
            batch = layer2_candidates[i:i+10]
            llm_probs = detect_negative_llm_batch(batch, groq_client)
            for sig_id, prob in llm_probs.items():
                if prob >= 0.6:
                    negative_count += 1
                    sig = next((s for s in batch if s['id'] == sig_id), None)
                    if sig:
                        negative_examples.append({
                            'title': sig.get('title', '')[:120],
                            'source': sig.get('source', ''),
                            'matched_patterns': [f'llm_prob_{prob:.2f}'],
                        })

    ratio = negative_count / total if total > 0 else 0.0

    if ratio >= 0.4:
        sentiment_label = 'negative'
    elif ratio >= 0.15:
        sentiment_label = 'mixed'
    else:
        sentiment_label = 'positive'

    return {
        'negative_signal_count': negative_count,
        'negative_signal_ratio': round(ratio, 3),
        'negative_examples': negative_examples[:5],
        'sentiment_label': sentiment_label,
    }

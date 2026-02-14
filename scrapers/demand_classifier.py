"""
Two-layer demand signal classifier.

Layer 1: Expanded deterministic regex (title + content)
Layer 2: LLM-based demand probability scoring (batched)

Phase 1: Signal Purification — Task 4
"""

import os
import re
import json
import logging
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client, Client
from groq import Groq

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

MODEL_NAME = 'llama-3.3-70b-versatile'
DEMAND_CLASSIFIER_VERSION = 'demand-v2'


# --- Layer 1: Expanded deterministic regex ---

DEMAND_PATTERNS = [
    # Original patterns (from opportunity_detector.py)
    r'\bhow to\b',
    r'\blooking for\b',
    r'\bbenchmark\b',
    r'\bcomparison\b',
    r'\bmigrat(?:e|ion|ing)\b',
    r'\bproduction\b',
    r'\bscaling\b',
    r'\bpric(?:e|ing)\b',
    r'\blimitation[s]?\b',
    r'\bproblem[s]?\b',
    r'\bissue[s]?\b',
    r'\balternative\b',
    r'\bopen[- ]?source alternative\b',
    r'\bpain[- ]?point[s]?\b',
    r'\bfrustrat(?:ed|ing|ion)\b',
    r'\bwish(?:ing|ed)?\b',
    r'\bneed[s]?\b',
    r'\bwant[s]?\b',
    r'\breplace(?:ment)?\b',
    r'\bself[- ]?host(?:ed|ing)?\b',
    # New expanded patterns
    r'\bstruggl(?:e|es|ing)\b',
    r'\bworkaround\b',
    r'\bhack(?:y|ish)\b',
    r'\bbetter\s+(?:way|approach|tool|alternative)\b',
    r'\banyone\s+(?:using|tried|know)\b',
    r'\brecommend(?:ation)?s?\b',
    r'\bwhat\s+(?:do you|should I)\s+use\b',
    r'\btoo\s+(?:slow|expensive|complex|hard)\b',
    r'\bdoesn\'?t\s+(?:work|scale|support)\b',
    r'\bbreaking\s+change\b',
    r'\bdeprecated\b',
    r'\bbuggy\b',
    r'\bunreliable\b',
    r'\bmissing\s+feature\b',
    r'\bno\s+(?:good|decent|proper)\b',
]

DEMAND_REGEX = re.compile('|'.join(DEMAND_PATTERNS), re.IGNORECASE)


def classify_demand_layer1(title: str, content: str = '') -> tuple[bool, list[str]]:
    """
    Layer 1: Deterministic regex matching on title and content.

    Returns (is_demand, matched_patterns).
    """
    matched = []

    for pattern in DEMAND_PATTERNS:
        regex = re.compile(pattern, re.IGNORECASE)
        if regex.search(title):
            matched.append(pattern)
        elif content and regex.search(content[:500]):
            matched.append(f'{pattern} (content)')

    return len(matched) > 0, matched


def classify_demand_llm_batch(
    signals: list[dict],
    groq_client: Groq,
) -> dict[str, float]:
    """
    Layer 2: LLM-based demand probability scoring.

    Processes up to 10 signals per call. Returns {signal_id: probability}.
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

    prompt = f"""You are analyzing developer community signals to determine if they indicate MARKET DEMAND — meaning people are expressing a need, pain point, frustration, or desire for a solution.

Signals:
{signals_text}

For each signal, estimate the probability (0.0 to 1.0) that it represents genuine market demand.

High demand (0.7-1.0): Explicit pain points, "how to solve X", "need alternative to Y", "X is too expensive/slow"
Medium demand (0.3-0.7): Comparisons, benchmarks, migration discussions, production concerns
Low demand (0.0-0.3): General news, announcements, opinion pieces, tutorials

Respond with ONLY a JSON array of numbers (one per signal, same order):
[0.8, 0.3, 0.6, ...]"""

    try:
        response = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=MODEL_NAME,
            temperature=0.1,
            max_tokens=200
        )
        raw = response.choices[0].message.content.strip()

        # Strip markdown code blocks if present
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
            raw = raw.strip()

        probabilities = json.loads(raw)

        if not isinstance(probabilities, list):
            logger.warning("LLM demand response is not a list")
            return {}

        result = {}
        for i, sig in enumerate(batch):
            if i < len(probabilities):
                prob = float(probabilities[i])
                result[sig['id']] = max(0.0, min(1.0, prob))

        return result

    except (json.JSONDecodeError, ValueError) as e:
        logger.warning(f"Failed to parse LLM demand response: {e}")
        return {}
    except Exception as e:
        logger.error(f"LLM demand classification error: {e}")
        return {}


def classify_signals_demand(
    signals: list[dict],
    use_llm: bool = True,
    groq_client: Optional[Groq] = None,
) -> list[dict]:
    """
    Run two-layer demand classification on a list of signals.

    Returns list of dicts with demand scoring info:
    [{
        'signal_id': str,
        'layer1_match': bool,
        'layer1_patterns': list[str],
        'layer2_probability': float | None,
        'demand_probability': float,
    }]
    """
    results = []
    layer2_candidates = []

    # Layer 1: Deterministic regex
    for sig in signals:
        title = sig.get('title', '')
        content = sig.get('content', '')
        is_demand, patterns = classify_demand_layer1(title, content)

        result = {
            'signal_id': sig['id'],
            'layer1_match': is_demand,
            'layer1_patterns': patterns,
            'layer2_probability': None,
            'demand_probability': 1.0 if is_demand else 0.0,
        }
        results.append(result)

        # Collect candidates for Layer 2 (non-matches with opportunity content types)
        if not is_demand and use_llm:
            content_type = sig.get('content_type', 'other')
            if content_type in ('technical', 'product', 'other'):
                layer2_candidates.append(sig)

    # Layer 2: LLM batch classification (only if there are layer1 demand hits in this group)
    has_any_demand = any(r['layer1_match'] for r in results)
    if use_llm and groq_client and has_any_demand and layer2_candidates:
        # Process in batches of 10
        for i in range(0, len(layer2_candidates), 10):
            batch = layer2_candidates[i:i+10]
            llm_probs = classify_demand_llm_batch(batch, groq_client)

            for sig_id, prob in llm_probs.items():
                # Find and update the result for this signal
                for r in results:
                    if r['signal_id'] == sig_id:
                        r['layer2_probability'] = prob
                        r['demand_probability'] = prob
                        break

    return results


def compute_demand_density(demand_results: list[dict], total_signals: int) -> float:
    """
    Compute cluster-level demand density.

    demand_density = avg(demand_probability) * (demand_signal_count / total_signals)
    """
    if not demand_results or total_signals == 0:
        return 0.0

    demand_signal_count = sum(
        1 for r in demand_results
        if r['demand_probability'] >= 0.3
    )
    avg_probability = sum(r['demand_probability'] for r in demand_results) / len(demand_results)

    return avg_probability * (demand_signal_count / total_signals)


def save_demand_scores(
    supabase: Client,
    snapshot_id: str,
    demand_results: list[dict],
) -> int:
    """Save per-signal demand scores to signal_demand_scores table."""
    saved = 0
    for r in demand_results:
        try:
            data = {
                'snapshot_id': snapshot_id,
                'signal_id': r['signal_id'],
                'layer1_match': r['layer1_match'],
                'layer1_patterns': r['layer1_patterns'] if r['layer1_patterns'] else None,
                'layer2_probability': r['layer2_probability'],
                'layer2_model': MODEL_NAME if r['layer2_probability'] is not None else None,
                'demand_probability': r['demand_probability'],
            }
            supabase.table('signal_demand_scores') \
                .upsert(data, on_conflict='snapshot_id,signal_id') \
                .execute()
            saved += 1
        except Exception as e:
            logger.error(f"Error saving demand score for {r['signal_id']}: {e}")
    return saved

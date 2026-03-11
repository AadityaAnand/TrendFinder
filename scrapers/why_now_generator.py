"""
Phase 9d: "Why Now" Generator

Converts prediction outputs and time-series features into natural-language insights
for the "Why now" section of opportunity briefs.

Runs after prediction engine, before brief generation.
"""

import os
import json
import logging
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


def get_prediction(supabase: Client, snapshot_id: str, trend_id: str) -> Optional[dict]:
    resp = supabase.table('trend_predictions') \
        .select('growth_probability, predicted_direction, confidence_level, prediction_reasons, feature_vector') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .limit(1) \
        .execute()
    return resp.data[0] if resp.data else None


def get_trajectory(supabase: Client, trend_id: str) -> Optional[dict]:
    resp = supabase.table('trend_trajectories') \
        .select('weekly_growth_rate, acceleration, total_snapshots, current_stage, first_seen_at, last_seen_at') \
        .eq('trend_id', trend_id) \
        .limit(1) \
        .execute()
    return resp.data[0] if resp.data else None


def get_pain_phrases(supabase: Client, snapshot_id: str, trend_id: str, limit: int = 5) -> list[dict]:
    resp = supabase.table('cluster_pain_phrases') \
        .select('phrase, phrase_type, frequency') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .order('frequency', desc=True) \
        .limit(limit) \
        .execute()
    return resp.data or []


def generate_why_now(
    supabase: Client,
    snapshot_id: str,
    trend_id: str,
) -> tuple[str, str]:
    """
    Generate a "Why now" explanation based on prediction and trajectory data.

    Returns:
        (why_now_text, growth_indicator)
        growth_indicator is one of: 'accelerating', 'steady', 'declining', 'breakout'
    """
    prediction = get_prediction(supabase, snapshot_id, trend_id)
    trajectory = get_trajectory(supabase, trend_id)
    pain_phrases = get_pain_phrases(supabase, snapshot_id, trend_id)

    if not prediction and not trajectory:
        return ("This topic emerged recently. We're watching it closely as more signals arrive.", 'steady')

    growth_prob = prediction.get('growth_probability', 0) if prediction else 0
    direction = prediction.get('predicted_direction', 'steady') if prediction else 'steady'
    confidence = prediction.get('confidence_level', 'low') if prediction else 'low'
    features = prediction.get('feature_vector', {}) if prediction else {}

    growth_rate = trajectory.get('weekly_growth_rate') if trajectory else None
    acceleration = trajectory.get('acceleration') if trajectory else None
    total_snapshots = trajectory.get('total_snapshots', 0) if trajectory else 0
    stage = trajectory.get('current_stage') if trajectory else None

    source_count = features.get('source_count', 0)
    demand_density = features.get('demand_density', 0)

    # Build "Why now" text using priority rules
    parts = []

    # Priority 1: Breakout or high growth
    if direction == 'breakout':
        parts.append(
            f"This topic is showing breakout signals. "
            f"It has grown rapidly across {source_count} platform{'s' if source_count != 1 else ''}, "
            f"and our model gives it a {growth_prob:.0%} probability of significant continued growth."
        )

    elif growth_prob > 0.6:
        growth_pct = f"{growth_rate:.0%}" if growth_rate is not None else "rapidly"
        parts.append(
            f"This topic is growing {growth_pct} week over week. "
            f"Our model predicts a {growth_prob:.0%} chance of continued significant growth in the coming days."
        )

    elif growth_prob > 0.4:
        parts.append(
            f"There are early signs of momentum building. "
            f"Growth probability is at {growth_prob:.0%}, meaning this could become a significant trend."
        )

    # Priority 2: Acceleration
    if acceleration is not None and acceleration > 0.2 and (not parts or 'breakout' not in parts[0]):
        parts.append(
            "Growth is accelerating — the rate of new signals is increasing faster than before, "
            "suggesting this hasn't peaked yet."
        )
    elif acceleration is not None and acceleration < -0.2 and direction != 'declining':
        parts.append(
            "Note: while there is activity, growth has started to decelerate. "
            "The window for early movers may be narrowing."
        )

    # Priority 3: Source diversity (lead-lag)
    if source_count >= 3:
        parts.append(
            f"Discussions are spreading across {source_count} platforms, "
            f"which historically indicates a topic transitioning from niche to mainstream."
        )
    elif source_count == 2:
        parts.append(
            "The conversation has started spreading to a second platform — "
            "often an early sign of broader adoption."
        )

    # Priority 4: Demand signals
    if demand_density > 0.3:
        parts.append(
            "Strong demand signals are present — people are actively looking for solutions, "
            "asking for alternatives, or expressing frustration with current options."
        )
    elif demand_density > 0.1:
        parts.append(
            "Some demand signals are emerging, with people beginning to ask for tools or solutions."
        )

    # Priority 5: Pain phrases
    if pain_phrases:
        top_types = list(set(p.get('phrase_type', '') for p in pain_phrases[:3]))
        type_str = ', '.join(top_types)
        parts.append(
            f"We found {len(pain_phrases)} specific unmet need{'s' if len(pain_phrases) != 1 else ''} "
            f"({type_str}) in the discussions — concrete starting points for builders."
        )

    # Priority 6: Lifecycle stage context
    if stage == 'emerging' and total_snapshots <= 3:
        parts.append(
            f"This topic appeared {total_snapshots} day{'s' if total_snapshots != 1 else ''} ago "
            f"and is still in the emerging phase. Early movers have the biggest advantage here."
        )
    elif stage == 'rising':
        parts.append("The trend is actively rising — engagement and signal count are both increasing.")
    elif stage == 'peaking':
        parts.append(
            "This trend appears to be near its peak. If you're going to act, "
            "the window is now — it may plateau or decline soon."
        )

    # Default fallback
    if not parts:
        if total_snapshots > 0:
            parts.append(
                f"This topic has been tracked for {total_snapshots} snapshot{'s' if total_snapshots != 1 else ''}. "
                f"It's still early, but we're watching it closely. Check back for updates as more signals arrive."
            )
        else:
            parts.append(
                "This topic emerged recently. We're watching it closely as more signals arrive."
            )

    why_now_text = ' '.join(parts)

    # Growth indicator for UI
    growth_indicator = direction

    return why_now_text, growth_indicator


def get_latest_snapshot(supabase: Client) -> Optional[dict]:
    resp = supabase.table('trend_snapshots') \
        .select('id, run_at') \
        .order('run_at', desc=True) \
        .limit(1) \
        .execute()
    return resp.data[0] if resp.data else None


def run_why_now_generation(snapshot_id: str = None) -> dict:
    """Generate "Why now" text for all trends in snapshot and store on briefs."""
    logger.info("=" * 60)
    logger.info("WHY NOW GENERATION")
    logger.info("=" * 60)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    if not snapshot_id:
        snapshot = get_latest_snapshot(supabase)
        if not snapshot:
            logger.error("No snapshot found")
            return {'generated': 0, 'failed': 0}
        snapshot_id = snapshot['id']

    # Get all briefs for this snapshot
    briefs = supabase.table('opportunity_briefs') \
        .select('id, trend_id, snapshot_id') \
        .eq('snapshot_id', snapshot_id) \
        .execute()

    if not briefs.data:
        logger.info("No briefs found for this snapshot")
        return {'generated': 0, 'failed': 0}

    logger.info(f"Found {len(briefs.data)} briefs to update")

    stats = {'generated': 0, 'failed': 0}

    for brief in briefs.data:
        trend_id = brief['trend_id']

        why_now_text, growth_indicator = generate_why_now(supabase, snapshot_id, trend_id)

        # Also get pain phrases for the brief
        pain_phrases = get_pain_phrases(supabase, snapshot_id, trend_id)
        pain_json = json.dumps([
            {'phrase': p['phrase'], 'type': p['phrase_type'], 'frequency': p.get('frequency', 1)}
            for p in pain_phrases
        ])

        try:
            supabase.table('opportunity_briefs') \
                .update({
                    'why_now_prediction': why_now_text,
                    'growth_indicator': growth_indicator,
                    'pain_phrases': pain_json,
                }) \
                .eq('id', brief['id']) \
                .execute()
            stats['generated'] += 1
        except Exception as e:
            logger.error(f"Failed to update brief for trend {trend_id}: {e}")
            stats['failed'] += 1

    logger.info("=" * 60)
    logger.info(f"Generated: {stats['generated']}, Failed: {stats['failed']}")

    return stats


if __name__ == '__main__':
    result = run_why_now_generation()
    print(f"\n=== Why Now Generation Results ===")
    for k, v in result.items():
        print(f"{k}: {v}")

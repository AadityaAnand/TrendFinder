"""
Phase 3: Persona Extractor

Extracts structured persona data from cluster signals.
Uses LLM when ≥5 signals available; falls back to formatting
existing `who_it_affects` / `affected_persona` data otherwise.
"""

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

PERSONA_PROMPT_VERSION = 'persona-v1'
MODEL_NAME = 'llama-3.3-70b-versatile'

MIN_SIGNALS_FOR_LLM = 5


def _build_persona_prompt(
    signals: list[dict],
    concept_name: str,
    problem_statement: str,
) -> str:
    signal_lines = []
    for s in signals[:10]:
        source = s.get('source', 'unknown')
        title = (s.get('title') or '')[:120]
        if title:
            signal_lines.append(f'- [{source}] {title}')

    signals_text = '\n'.join(signal_lines) if signal_lines else '- No signals available'

    return f"""You are analyzing developer community signals to identify who is experiencing this problem.

Concept: "{concept_name}"
Problem: "{problem_statement}"

Evidence from developer communities:
{signals_text}

Based on these signals, identify the personas experiencing this problem.

Respond in this exact JSON format (no markdown, no code blocks):
{{
  "roles": ["role 1", "role 2"],
  "level": "beginner|intermediate|expert",
  "domain": "web-dev|ai-ml|devops|product|data|security|mobile|other",
  "pain_points": [
    {{"phrase": "short pain point description", "quote": "closest matching signal title or phrase", "source": "hn|github|reddit|devto"}},
    {{"phrase": "another pain point", "quote": "evidence quote", "source": "source"}}
  ]
}}

Rules:
- roles: 1-3 job titles or roles (e.g., "backend developer", "platform engineer")
- level: the typical technical sophistication of this persona
- domain: the primary technical domain
- pain_points: 2-4 specific frustrations grounded in the signals above
- quote: must be a short phrase from one of the signals above (not invented)
- Keep all text concise and specific"""


def _fallback_persona(
    who_it_affects: list,
    pain_signals: list,
    affected_persona: list,
) -> dict:
    """Build persona from existing structured data without LLM."""
    roles = []

    for item in (who_it_affects or []):
        if isinstance(item, str) and item.strip():
            roles.append(item.strip())

    if not roles:
        for item in (affected_persona or []):
            if isinstance(item, str) and item.strip():
                roles.append(item.strip())

    roles = roles[:3] if roles else ['developer']

    pain_points = []
    for sig in (pain_signals or [])[:3]:
        if isinstance(sig, str) and sig.strip():
            pain_points.append({
                'phrase': sig.strip()[:100],
                'quote': sig.strip()[:100],
                'source': 'unknown',
            })

    return {
        'roles': roles,
        'level': 'intermediate',
        'domain': 'other',
        'pain_points': pain_points,
        'confidence': 0.4,
        'prompt_version': None,
    }


def extract_persona(
    signals: list[dict],
    concept_name: str,
    problem_statement: str,
    existing_persona: list,
    who_it_affects: list,
    pain_signals: list,
    groq_client,
) -> dict:
    """
    Extract structured persona from signals.

    Uses LLM if ≥MIN_SIGNALS_FOR_LLM signals available.
    Falls back to formatting existing structured data otherwise.

    Returns:
        {
            roles: list[str],
            level: str,               # beginner/intermediate/expert
            domain: str,              # web-dev/ai-ml/devops/product/data/security/mobile/other
            pain_points: list[dict],  # [{phrase, quote, source}]
            confidence: float,        # 0.7 if LLM, 0.4 if fallback
            prompt_version: str|None,
            llm_prompt: str|None,     # stored for auditability
        }
    """
    if not concept_name:
        concept_name = 'Unknown concept'
    if not problem_statement:
        problem_statement = 'No problem statement available'

    # Use fallback if insufficient signals
    if len(signals) < MIN_SIGNALS_FOR_LLM or groq_client is None:
        logger.info(f"Persona fallback (insufficient signals: {len(signals)})")
        result = _fallback_persona(who_it_affects, pain_signals, existing_persona)
        result['llm_prompt'] = None
        return result

    prompt = _build_persona_prompt(signals, concept_name, problem_statement)

    try:
        response = groq_client.chat.completions.create(
            messages=[{'role': 'user', 'content': prompt}],
            model=MODEL_NAME,
            temperature=0.3,
            max_tokens=400,
        )
        raw = response.choices[0].message.content.strip()

        # Strip markdown if present
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
            raw = raw.strip()

        parsed = json.loads(raw)

        roles = [str(r)[:80] for r in (parsed.get('roles') or [])[:3]]
        if not roles:
            roles = ['developer']

        level = parsed.get('level', 'intermediate')
        if level not in ('beginner', 'intermediate', 'expert'):
            level = 'intermediate'

        domain = parsed.get('domain', 'other')
        valid_domains = ('web-dev', 'ai-ml', 'devops', 'product', 'data', 'security', 'mobile', 'other')
        if domain not in valid_domains:
            domain = 'other'

        raw_pain = parsed.get('pain_points') or []
        pain_points = []
        for pp in raw_pain[:4]:
            if isinstance(pp, dict):
                pain_points.append({
                    'phrase': str(pp.get('phrase', ''))[:120],
                    'quote': str(pp.get('quote', ''))[:150],
                    'source': str(pp.get('source', 'unknown'))[:30],
                })

        return {
            'roles': roles,
            'level': level,
            'domain': domain,
            'pain_points': pain_points,
            'confidence': 0.7,
            'prompt_version': PERSONA_PROMPT_VERSION,
            'llm_prompt': prompt,
        }

    except json.JSONDecodeError:
        logger.warning(f'Persona LLM returned invalid JSON for "{concept_name}"')
        result = _fallback_persona(who_it_affects, pain_signals, existing_persona)
        result['llm_prompt'] = prompt
        return result
    except Exception as e:
        logger.error(f'Persona LLM error for "{concept_name}": {e}')
        result = _fallback_persona(who_it_affects, pain_signals, existing_persona)
        result['llm_prompt'] = None
        return result

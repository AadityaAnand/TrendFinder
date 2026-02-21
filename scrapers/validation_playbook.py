"""
Phase 3: Validation Playbook Selector

12 playbook templates with a rule-based selector.
Templates use {concept_name} as a placeholder for customization.
"""

from typing import Optional


PLAYBOOK_LIBRARY = {
    'user_interviews': {
        'id': 'user_interviews',
        'title': 'User Interviews',
        'description': 'Reach out to {persona} on relevant communities (Slack groups, LinkedIn, Twitter) and ask 5-10 people about their current workflow around {concept_name}. Focus on: What do you do today? What frustrates you? What have you tried?',
        'success_criteria': '3 out of 5 interviews confirm the problem is a real blocker.',
        'effort': 'weekend',
        'platforms': ['LinkedIn', 'Twitter/X', 'Slack communities'],
    },
    'landing_page': {
        'id': 'landing_page',
        'title': 'Landing Page Email Capture',
        'description': 'Create a simple one-page site explaining {concept_name} and what you\'re building to solve it. Add an email capture form. Drive traffic via relevant subreddits, HN, and Twitter.',
        'success_criteria': '50+ email signups in 2 weeks indicates meaningful interest.',
        'effort': 'weekend',
        'platforms': ['Reddit', 'Hacker News', 'Twitter/X'],
    },
    'github_mvp': {
        'id': 'github_mvp',
        'title': 'GitHub MVP / Open Source Release',
        'description': 'Build the simplest possible working version of a tool or library for {concept_name}. Publish on GitHub with a clear README. Post to HN (Show HN), relevant subreddits, and dev.to.',
        'success_criteria': '100+ GitHub stars in the first month and active issue/PR engagement.',
        'effort': 'week',
        'platforms': ['GitHub', 'Hacker News', 'Reddit', 'dev.to'],
    },
    'reddit_ask': {
        'id': 'reddit_ask',
        'title': 'Reddit Problem Validation Post',
        'description': 'Post to 2-3 relevant subreddits asking about pain points with {concept_name}. Frame as "I\'m researching X — what\'s your biggest frustration with it?" Not a product pitch.',
        'success_criteria': '20+ upvotes and 10+ substantive comments confirm the problem resonates.',
        'effort': 'hours',
        'platforms': ['Reddit'],
    },
    'community_post': {
        'id': 'community_post',
        'title': 'Developer Community Post',
        'description': 'Write a technical article or post about {concept_name} — sharing your analysis or a prototype — on dev.to, Hashnode, or a relevant Discord/Slack community. Gauge reaction.',
        'success_criteria': 'Engagement rate >5% (comments, saves, shares) across posts.',
        'effort': 'hours',
        'platforms': ['dev.to', 'Hashnode', 'Discord communities'],
    },
    'waitlist': {
        'id': 'waitlist',
        'title': 'Waitlist Campaign',
        'description': 'Set up a waitlist page for your {concept_name} solution (Carrd or similar). Describe the core value proposition. Share in relevant communities and track signups over 2-4 weeks.',
        'success_criteria': '200+ waitlist signups indicates an addressable market.',
        'effort': 'weekend',
        'platforms': ['Product Hunt', 'Reddit', 'Twitter/X', 'HN'],
    },
    'paid_ads_test': {
        'id': 'paid_ads_test',
        'title': 'Paid Demand Test',
        'description': 'Run a small Google or Twitter ad campaign ($100-200 budget) targeting keywords around {concept_name}. Direct to a landing page. Measure click-through and email capture rates.',
        'success_criteria': 'CTR >3% and landing page conversion >10% at $100 spend.',
        'effort': 'weekend',
        'platforms': ['Google Ads', 'Twitter/X Ads'],
    },
    'prototype_demo': {
        'id': 'prototype_demo',
        'title': 'Clickable Prototype / Demo',
        'description': 'Build a Figma mockup or a no-code prototype showing your {concept_name} solution. Share with 10-15 target users via DMs or communities and ask for feedback.',
        'success_criteria': '10+ people ask "when can I use this?" or "how do I sign up?"',
        'effort': 'week',
        'platforms': ['Figma', 'Notion', 'DMs to target users'],
    },
    'discord_community': {
        'id': 'discord_community',
        'title': 'Discord / Slack Community',
        'description': 'Create a small Discord server around the problem that {concept_name} addresses. Invite people from relevant communities and forums. Observe what they talk about.',
        'success_criteria': '50 members in 2 weeks with organic conversation.',
        'effort': 'hours',
        'platforms': ['Discord', 'Slack'],
    },
    'indie_hacker_post': {
        'id': 'indie_hacker_post',
        'title': 'Indie Hackers / HN Post',
        'description': 'Write a transparent post on Indie Hackers or submit to HN sharing your research on {concept_name} — the problem, market signals, and what you\'re planning to build.',
        'success_criteria': '50+ upvotes and 5+ substantive comments validates the framing.',
        'effort': 'hours',
        'platforms': ['Indie Hackers', 'Hacker News'],
    },
    'pre_order': {
        'id': 'pre_order',
        'title': 'Pre-Order Campaign',
        'description': 'List a pre-order (e.g., via Gumroad, Stripe, or Lemon Squeezy) for your {concept_name} solution at an early-bird price. Share with warm audiences — newsletter, Twitter, communities.',
        'success_criteria': '10 paid pre-orders from people who don\'t know you personally.',
        'effort': 'week',
        'platforms': ['Gumroad', 'Stripe', 'Twitter/X', 'Newsletter'],
    },
    'maker_demo': {
        'id': 'maker_demo',
        'title': 'Live Demo / Product Hunt Ship',
        'description': 'Ship your early {concept_name} prototype on Product Hunt\'s "Ship" feature or post a Loom walkthrough in relevant communities. Ask for genuine feedback.',
        'success_criteria': '20+ people watch the demo and 5+ subscribe for updates.',
        'effort': 'week',
        'platforms': ['Product Hunt', 'Loom', 'Twitter/X'],
    },
}

# Category → preferred playbook IDs (ordered by priority)
CATEGORY_PREFERENCES = {
    'devtools':        ['github_mvp', 'community_post', 'reddit_ask'],
    'infrastructure':  ['github_mvp', 'community_post', 'user_interviews'],
    'ai-ml':           ['github_mvp', 'community_post', 'reddit_ask'],
    'saas':            ['landing_page', 'waitlist', 'paid_ads_test'],
    'content':         ['landing_page', 'waitlist', 'indie_hacker_post'],
    'data':            ['github_mvp', 'community_post', 'user_interviews'],
    'security':        ['community_post', 'user_interviews', 'reddit_ask'],
    'mobile':          ['landing_page', 'prototype_demo', 'waitlist'],
    'other':           ['landing_page', 'user_interviews', 'community_post'],
}

# Competition level adjustments
COMPETITION_ADJUSTMENTS = {
    'high':      ['reddit_ask'],       # Prioritize: validate differentiation first
    'low':       ['prototype_demo', 'paid_ads_test'],  # Prioritize: prove demand early
    'moderate':  [],
    'uncertain': [],
}

# Persona level adjustments
LEVEL_ADJUSTMENTS = {
    'expert':      ['github_mvp'],      # Experts engage via GitHub
    'beginner':    ['landing_page'],    # Beginners convert via landing pages
    'intermediate': [],
}


def select_playbooks(
    concept_name: str,
    category: str,
    persona_level: str,
    competition_level: str,
    n: int = 3,
) -> list[dict]:
    """
    Rule-based playbook selection. Returns n customized playbooks.

    Args:
        concept_name: Name of the concept (used to customize templates)
        category: detected_trends.concept_category
        persona_level: beginner/intermediate/expert
        competition_level: low/moderate/high/uncertain
        n: number of playbooks to return

    Returns:
        List of customized playbook dicts with {title, description, success_criteria, effort, platforms}
    """
    if not concept_name:
        concept_name = 'this concept'

    # Normalize inputs
    category = (category or 'other').lower()
    persona_level = (persona_level or 'intermediate').lower()
    competition_level = (competition_level or 'uncertain').lower()

    # Build ordered candidate list
    candidates = []

    # 1. Always start with user_interviews
    candidates.append('user_interviews')

    # 2. Add competition-specific playbooks
    for pid in COMPETITION_ADJUSTMENTS.get(competition_level, []):
        if pid not in candidates:
            candidates.append(pid)

    # 3. Add persona level-specific playbooks
    for pid in LEVEL_ADJUSTMENTS.get(persona_level, []):
        if pid not in candidates:
            candidates.append(pid)

    # 4. Add category preferences
    for pid in CATEGORY_PREFERENCES.get(category, CATEGORY_PREFERENCES['other']):
        if pid not in candidates:
            candidates.append(pid)

    # 5. Fill remaining slots with defaults
    defaults = ['landing_page', 'community_post', 'indie_hacker_post', 'prototype_demo']
    for pid in defaults:
        if pid not in candidates:
            candidates.append(pid)

    # Take top n
    selected_ids = candidates[:n]

    # Customize and return
    result = []
    for pid in selected_ids:
        playbook = PLAYBOOK_LIBRARY.get(pid)
        if not playbook:
            continue

        # Determine persona placeholder
        persona_placeholder = 'developers'
        if persona_level == 'expert':
            persona_placeholder = 'senior engineers'
        elif persona_level == 'beginner':
            persona_placeholder = 'developers new to this space'

        customized = {
            'id': playbook['id'],
            'title': playbook['title'],
            'description': playbook['description']
                .replace('{concept_name}', concept_name)
                .replace('{persona}', persona_placeholder),
            'success_criteria': playbook['success_criteria'],
            'effort': playbook['effort'],
            'platforms': playbook['platforms'],
        }
        result.append(customized)

    return result

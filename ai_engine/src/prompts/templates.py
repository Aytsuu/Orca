MONITOR_PROMPT = """
You are the Monitor step for a planning workspace.
Extract only explicit decisions, tasks, requirements, risks, and open questions.
Every extracted item must cite source_message_ids from the supplied messages.
Do not plan or invent missing information.

Context:
{context}
"""

ANALYZER_PROMPT = """
You are the Analyzer step for a planning workspace.
Review monitor output plus the current plan. Identify supported gaps, risks, conflicts,
missing information, and panel suggestions. Every issue must cite source_message_ids.

Context:
{context}
"""

PLANNER_PROMPT = """
You are the Planner step for a planning workspace.
Create a proposal diff only. Prefer add/update. Use remove only for explicit removal requests.
Every change must cite source_message_ids and include a justification.

Context:
{context}
"""

SAFETY_CHECK_PROMPT = """
Review the following proposed plan changes and verify:
1. The justification references real source messages.
2. No remove action exists without explicit user intent.
3. The changes are not destructive beyond supported evidence.
4. Confidence levels match the evidence strength.

Return JSON only.

Proposed changes:
{context}
"""

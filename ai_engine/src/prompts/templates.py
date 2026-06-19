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

When the discussion supports a new or updated phase, reason about the phase at two levels:
- the higher-level purpose, scope, or expected outcome of the phase
- the concrete actions that would belong under it
This distinction should help downstream planning produce phase descriptions that are distinct
from the task list rather than paraphrasing the same wording.

Context:
{context}
"""

RELEVANCE_PROMPT = """
You are a lightweight message relevance scorer for a planning workspace.
Decide whether the supplied new messages contain actionable planning information or
clarification that should trigger the planning pipeline.

Mark should_trigger=true when the messages likely add or change requirements, tasks,
owners, priorities, dates, risks, objectives, approvals, rejections, or materially
clarify earlier planning context.

Mark should_trigger=false when the messages are only filler, acknowledgements, social
chatter, accidental sends, greetings, typos, or otherwise provide no actionable planning value.

Be multilingual. Judge meaning from the content itself, not from English keywords.
Return JSON only.

Context:
{context}
"""

PLANNER_PROMPT = """
You are the Planner step for a planning workspace.
Create a proposal diff only. Prefer add/update. Use remove only for explicit removal requests.
Every change must cite source_message_ids and include a justification.
For each change, content must be either:
- an array of objects. Objects may include optional string fields title, description, detail,
  owner, status, priority, due_date, notes, and value. Objects may also include a tasks array
  using the same object shape for nested task items.
- an array of strings for simple list removals
- a short string for scalar section replacement

For phase changes:
- prefer returning title, description, and tasks explicitly
- description must summarize the phase purpose, scope, or intended outcome
- description must not be a clause-by-clause restatement of the task list
- tasks must be concrete, actionable items that belong under that phase
- use value only as a backward-compatible fallback when you cannot structure the phase better

Context:
{context}
"""

SAFETY_CHECK_PROMPT = """
Review the following proposed plan changes and verify:
1. The justification references real source messages.
2. No remove action exists without explicit user intent.
3. The changes are not destructive beyond supported evidence.
4. Confidence levels match the evidence strength.

Judge confidence from the evidence structure, not from rhetorical wording alone.
Do not treat phrases such as "directly reflects", "directly addresses", "clearly", or
similar strong wording as sufficient reason to fail a change when the cited evidence and
confidence level are otherwise compatible.

Use this rubric:
- high: multiple consistent citations, or a single explicit and unambiguous instruction
  that fully supports the change
- medium: a single citation with reasonable support, or several citations that support the
  change but still leave some interpretation
- low: indirect, weak, incomplete, or ambiguous support

Only mark a confidence mismatch when the cited evidence itself is materially stronger or
weaker than the assigned confidence level.

Return JSON only.

Proposed changes:
{context}
"""

# USAII Qualifier Submission - Idea Passed

## Problem Understanding

**What problem are you solving?**
We see it all the time: team projects that collapse before the finish line. Some lose sight of their original vision, some change halfway, and some stay as an incomplete plan. It's frustrating, a waste of time and energy, and the biggest impact, it destroys the team's confidence.

**Who experiences this problem?**
Kent and I have encountered this most of the time as students and developer interns, joining multiple hackathons.

**Why does this matter?**
It’s exhausting, it wastes valuable energy and resources. When execution fails, team confidence is usually the first thing to go.

## AI Thinking

**Why is AI the right approach?**
Tools like Trello and Notion can store tasks and notes, but they require team members to correctly categorize, connect, and surface relevant information up front — and to do so manually, at the right moment. They have no awareness of what a message means in the context of past decisions. The specific gap AI fills is **proactive, unprompted retrieval and reasoning**: recognizing that a current discussion relates to a prior decision or risk without the user knowing to search for it. Relationships between tasks and decisions in real team conversations are often implicit and emerge over time — rule-based tools cannot detect them. AI can monitor conversations, extract key decisions, detect unclear tasks, identify missing details, and turn scattered discussions into structured action plans. It can also identify weak points in the plan, synthesize context across sessions, highlight risks, and suggest improved workflows based on the team's actual goals.

**AI Capabilities**
- Agentic Workflow
- Generative AI

**Describe your AI-powered solution**
Our solution is an AI-powered team messaging platform where development teams can chat while an AI assistant analyzes conversations in real time. The AI reads new messages and retrieves relevant context from a persistent project memory — a structured store of confirmed decisions, finalized tasks, and past summaries — using semantic search before generating any output. It then suggests clearer tasks, timelines, priorities, and improved project plans.

**What triggers a suggestion vs. a summary:**
- **Suggestion** — triggered when a new message semantically overlaps with an unresolved item or known risk in project memory (e.g., a team member mentions a person or deadline linked to a prior blocker the AI has flagged).
- **Summary** — triggered on explicit user request, at the start of a new session, or when the AI detects that the active discussion has drifted significantly from the current sprint goal stored in memory.

## Responsible AI

**What could go wrong?**
The context window of AI models is limited, which may not be able to keep up with long conversations, especially in chat apps that allow sending media like files, photos, videos, and audio. This will significantly impact AI reliability.

**How would you reduce that risk?**
We can reduce this by chunking conversations into summaries, storing key decisions in a project memory, indexing media transcripts, and using retrieval before generating plans. The AI should cite sources and ask confirmation when context is incomplete.

## AI Signals

**Data Source :** User Input
**Build Type :** Mobile or Web Prototype

## Human Role

**Where should humans remain involved?**
Humans should make the final decision before the AI-generated plan becomes official. The AI can suggest summaries, tasks, risks, and timelines, but team members should confirm if the plan is accurate, realistic, and aligned with their actual goals before anyone follows it.

## Pitch

**We are building an AI-powered solution that helps teams strengthen project planning from idea to execution so they can detect weak plans, clarify priorities, and stay aligned before projects fail.**
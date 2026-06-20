# Minimum Viable Product

We will build a web prototype that lets teams discuss, plan, and track projects in a single place — powered by AI that reads conversations and turns them into structured plans.

---

## User Workflow

1. **Create a project** — set up project name, description, and details.
2. **Configure AI** — select what the AI is allowed to do and which tools it can access.
3. **Invite teammates** — bring collaborators into the project and assign their permissions.
4. **Discuss** — chat naturally with your team about ideas, requirements, and goals.
5. **Review AI output** — accept, edit, or reject AI-generated plans and tasks.

---

## Core Features

### Team Chat
- Familiar chat interface for discussing ideas, requirements, and goals.
- Supports any language — AI reads and understands multilingual conversations.
- Supports file uploads of any type: images, videos, audio, and documents.

### AI-Powered Planning
The AI continuously monitors conversations and handles the following:

| What the AI does | Details |
|---|---|
| **Extract** | Pulls out key decisions, tasks, and important details from chat. |
| **Identify gaps** | Flags unclear action items, missing information, and risks. |
| **Structure plans** | Converts discussions into plans with timelines, priorities, and responsibilities. |
| **Generate tasks** | Creates actionable tasks directly in the app — no need to switch to Notion or Trello. |
| **Use tools** | Accesses external services via preconfigured MCP servers based on project context. |

### Permission & Approval Controls
- The **project creator** has full permission to accept or reject AI-generated plans and edits by default.
- Permissions can be **delegated** to team members at any level of granularity:
  - Accept/reject only
  - Edit in addition to accept/reject
- AI changes are **never applied automatically** — all AI actions require user approval.

### Project Plan Tab
- **Restricted view**: Only team members with approval permissions see the plan first.
- **Sync on finalize**: Once the plan is approved, it is synced to all project members.
- **Read-only review**: Members without approval permissions are notified when the plan is finalized and can comment via chat.
- **Version history**: Plans can be reverted up to **3 times**. Reverting removes all comments and restores the previous version.

---

## AI Agents

Each project runs 4 specialized AI agents working in a pipeline:

| Agent | Role |
|---|---|
| **Monitor** | Watches conversations and extracts key decisions, tasks, and details. |
| **Analyzer** | Reviews the plan for gaps, risks, and unclear action items. |
| **Planner** | Generates a structured project plan from analyzed conversations. |
| **Updater** | Applies plan updates based on user feedback and approval. |

---

## AI Permissions

### What AI Can Do
- Analyze conversations and the project plan
- Generate plans, tasks, timelines, responsibilities, summaries, and insights
- Flag risks and surface missing information
- *(Stretch)* Access external tools via MCP servers
- *(Stretch)* Generate code snippets and documents (PDF, DOCX)

### What AI Cannot Do (without explicit user approval)
- Modify, edit, or delete any part of the project plan
- Archive, unarchive, or trash any project data

---

## UI Design

**Theme:** Clean, modern, Google-inspired interface with dark and light mode support.

**Responsive:** Desktop, tablet, and mobile layouts.

### Screens

**Homepage** — Project list view, inspired by NotebookLM.

**Project Interface** — Two main tabs:

- **Chat Tab** (3-column layout)
  | Column | Content |
  |---|---|
  | Left | Uploaded files and resources |
  | Center | Team chat |
  | Right | AI activity and suggestions |

- **Project Plan Tab** — Plan viewer with accept/reject controls, version history, and sync management.

**AI Settings** — Configure what the AI is allowed to do and which MCP tool servers it can access per project.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Astro + React + TypeScript + Tailwind CSS |
| Backend | FastAPI |
| Database | Supabase |
| AI Models | Free cloud models (TBD — shared across all projects) |

---

## Draft Timeline

- **Total duration:** 6 days across 2 developers working in parallel.
- **Target:** MVP feature-complete by **Day 3**, leaving 3 days for testing and debugging.
- **Standups:** Frequency determined by team preference.

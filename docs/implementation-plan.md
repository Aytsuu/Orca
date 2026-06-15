# Product Implementation Plan

> **Hackathon mode:** Authentication is deferred. Each browser session = one user. No login/signup needed until post-demo.

---

## Status Key

- `[ ]` Not started
- `[/]` In progress or partially complete
- `[x]` Complete
- `[-]` Deferred or intentionally out of scope for the current phase

---

## [x] Phase 0 - Project Setup

- [x] Initialize frontend repo (Astro + React + TypeScript + Tailwind)
- [x] Initialize backend repo (FastAPI, Python 3.11+)
- [x] Create Supabase project - get URL, anon key, service key
- [x] Create `.env` files for both frontend and backend
- [x] Confirm both dev servers run locally

---

## [x] Phase 1 - Database Schema

- [x] `project` table - id, name, description, created_at
- [x] `project_member` table - id, project_id, session_id, role (`creator` | `approver` | `member`), can_approve, can_edit
- [x] `chat_message` table - id, project_id, session_id, content, created_at
- [x] `uploaded_file` table - id, project_id, session_id, storage_path, mime_type, created_at
- [x] `agent_status` table - id, project_id, agent (`monitor` | `analyzer` | `planner` | `updater`), status, updated_at
- [x] `plan_proposal` table - id, project_id, status (`pending` | `approved` | `rejected` | `applied`), changes (jsonb), created_at
- [x] `project_plan` table - id, project_id, content (jsonb), version, finalized_at
- [x] `plan_version` table - id, project_id, content (jsonb), created_at *(max 3 reverts enforced in code)*
- [x] Enable Supabase Realtime on: `chat_message`, `agent_status`, `plan_proposal`, `project_plan`
- [x] Configure Supabase Storage bucket for file uploads

---

## [x] Phase 2 - API (FastAPI)

### Infrastructure
- [x] `main.py` - app setup, lifespan, router registration
- [x] `supabase_client.py` - async client factory
- [x] `config.py` - global settings via pydantic-settings
- [x] `exceptions.py` - base exception hierarchy

### Projects domain
- [x] `POST /api/v1/projects` - create project, auto-add creator session as `creator` member
- [x] `GET /api/v1/projects` - list projects for current session
- [x] `GET /api/v1/projects/{project_id}` - get single project

### Chat domain
- [x] `POST /api/v1/projects/{project_id}/messages` - persist message; Realtime delivers it
- [x] `GET /api/v1/projects/{project_id}/messages` - fetch message history
- [x] `GET /api/v1/projects/{project_id}/files/upload-url` - return signed Supabase Storage URL

### Members domain *(simplified - no real auth, use session_id)*
- [x] `POST /api/v1/projects/{project_id}/members` - add a session as a member with a role
- [x] `PATCH /api/v1/projects/{project_id}/members/{session_id}/permissions` - update can_approve / can_edit

### Plans domain
- [x] `GET /api/v1/projects/{project_id}/plan` - return current finalized plan
- [x] `GET /api/v1/projects/{project_id}/plan/proposal` - return pending proposal (approvers only)
- [x] `POST /api/v1/projects/{project_id}/plan/approve` - approve proposal items; trigger Updater
- [x] `POST /api/v1/projects/{project_id}/plan/reject` - reject proposal; mark as rejected
- [x] `POST /api/v1/projects/{project_id}/plan/revert` - revert to previous version (max 3)

### Agents domain
- [x] `GET /api/v1/projects/{project_id}/agents/status` - return agent pipeline status
- [x] `POST /api/v1/projects/{project_id}/agents/trigger` - manually trigger pipeline (approvers only)

---

## Phase 3 - AI Agent Pipeline

- [ ] Choose and wire up LLM client (free tier model - Gemini Flash or similar)
- [ ] Set up task queue (Arq or RQ) - pipeline must NOT run in BackgroundTasks
- [ ] **Monitor Agent** - extract decisions, tasks, key details from new messages; cite source message IDs
- [ ] **Analyzer Agent** - compare extractions against current plan; produce gap + risk report
- [ ] **Planner Agent** - generate plan diff proposal; write to `plan_proposal` table; set status to `pending`
- [ ] **Updater Agent** - apply only approved proposal items to `project_plan`; record version in `plan_version`
- [ ] Wire pipeline trigger: new message -> enqueue pipeline
- [ ] Agent status writes to `agent_status` table on each state transition (Realtime handles UI updates)

---

## [x] Phase 4 - Frontend

### Layout & Design System
- [x] Global CSS / Tailwind config - color palette, typography, dark mode
- [x] Page shell - sidebar nav, tab switching

### Homepage
- [x] Project list - card grid, "Create Project" button
- [x] Create Project modal - name, description fields

### Project Interface - Chat Tab
- [x] 3-column layout: Files (left) | Chat (center) | AI Activity (right)
- [x] Chat center: message list (Realtime subscription), message input, file attach button
- [x] Files left panel: uploaded file list, upload trigger
- [x] AI Activity right panel: agent status indicator, extracted items, gap/risk report, proposal preview

### Project Interface - Plan Tab
- [x] Plan viewer - renders current finalized plan content
- [x] Proposal diff view - shows pending changes with Accept / Reject controls per item (approvers only)
- [x] Version history - list of past versions with revert button (max 3)
- [x] "Plan finalized" notification for non-approver members

### Session Identity *(replaces auth)*
- [x] On first load, generate and persist a `session_id` to localStorage
- [x] Pass `session_id` as a header (`X-Session-Id`) on all API requests
- [x] Backend reads `X-Session-Id` to identify "current user"

---

## Phase 5 - Integration & Polish

- [ ] End-to-end flow: create project -> chat -> agent runs -> proposal appears -> approve -> plan updates
- [ ] Realtime: confirm messages, agent status, and plan updates all propagate to UI without refresh
- [ ] File upload flow: select file -> get signed URL -> upload to Supabase Storage -> persist record -> agent indexes it
- [ ] Error states: agent failure shown in AI Activity panel; empty states on all list views
- [ ] Responsive layout check (desktop + tablet minimum)
- [ ] Demo script walkthrough - verify all MVP user steps work end to end

---

## Deferred (Post-Hackathon)

- [-] Authentication (Supabase Auth - JWT, login, signup, session refresh)
- [-] Row Level Security (RLS) policies - replace session_id guards with `auth.uid()`
- [-] MCP tool server integration
- [-] PDF / DOCX export
- [-] Mobile layout

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

## Phase 2 - Backend (FastAPI)

### Infrastructure
- [ ] `main.py` - app setup, lifespan, router registration
- [ ] `supabase_client.py` - async client factory
- [ ] `config.py` - global settings via pydantic-settings
- [ ] `exceptions.py` - base exception hierarchy

### Projects domain
- [ ] `POST /api/v1/projects` - create project, auto-add creator session as `creator` member
- [ ] `GET /api/v1/projects` - list projects for current session
- [ ] `GET /api/v1/projects/{project_id}` - get single project

### Chat domain
- [ ] `POST /api/v1/projects/{project_id}/messages` - persist message; Realtime delivers it
- [ ] `GET /api/v1/projects/{project_id}/messages` - fetch message history
- [ ] `GET /api/v1/projects/{project_id}/files/upload-url` - return signed Supabase Storage URL

### Members domain *(simplified - no real auth, use session_id)*
- [ ] `POST /api/v1/projects/{project_id}/members` - add a session as a member with a role
- [ ] `PATCH /api/v1/projects/{project_id}/members/{session_id}/permissions` - update can_approve / can_edit

### Plans domain
- [ ] `GET /api/v1/projects/{project_id}/plan` - return current finalized plan
- [ ] `GET /api/v1/projects/{project_id}/plan/proposal` - return pending proposal (approvers only)
- [ ] `POST /api/v1/projects/{project_id}/plan/approve` - approve proposal items; trigger Updater
- [ ] `POST /api/v1/projects/{project_id}/plan/reject` - reject proposal; mark as rejected
- [ ] `POST /api/v1/projects/{project_id}/plan/revert` - revert to previous version (max 3)

### Agents domain
- [ ] `GET /api/v1/projects/{project_id}/agents/status` - return agent pipeline status
- [ ] `POST /api/v1/projects/{project_id}/agents/trigger` - manually trigger pipeline (approvers only)

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

## Phase 4 - Frontend

### Layout & Design System
- [/] Global CSS / Tailwind config - color palette, typography, dark mode
- [/] Page shell - sidebar nav, tab switching

### Homepage
- [/] Project list - card grid, "Create Project" button
- [/] Create Project modal - name, description fields

### Project Interface - Chat Tab
- [/] 3-column layout: Files (left) | Chat (center) | AI Activity (right)
- [/] Chat center: message list (Realtime subscription), message input, file attach button
- [/] Files left panel: uploaded file list, upload trigger
- [/] AI Activity right panel: agent status indicator, extracted items, gap/risk report, proposal preview

### Project Interface - Plan Tab
- [/] Plan viewer - renders current finalized plan content
- [/] Proposal diff view - shows pending changes with Accept / Reject controls per item (approvers only)
- [/] Version history - list of past versions with revert button (max 3)
- [/] "Plan finalized" notification for non-approver members

### Session Identity *(replaces auth)*
- [/] On first load, generate and persist a `session_id` to localStorage
- [/] Pass `session_id` as a header (`X-Session-Id`) on all API requests
- [/] Backend reads `X-Session-Id` to identify "current user"

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

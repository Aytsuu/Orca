# Backend API Guidelines

> Authoritative reference for all FastAPI backend development on this project.
> Derived from [`docs/mvp.md`](./mvp.md) and [`frameworks/fastapi-architecture.md`](../frameworks/fastapi-architecture.md).

---

## Table of Contents

1. [Tech Stack & Version Pins](#1-tech-stack--version-pins)
2. [Project Structure](#2-project-structure)
3. [Naming Conventions](#3-naming-conventions)
4. [API Design Principles](#4-api-design-principles)
5. [Domain Map](#5-domain-map)
6. [Async & Concurrency Rules](#6-async--concurrency-rules)
7. [Pydantic Schemas](#7-pydantic-schemas)
8. [Dependency Injection](#8-dependency-injection)
9. [Authentication & Permissions (Supabase Auth)](#9-authentication--permissions-supabase-auth)
10. [Database — Supabase Postgres](#10-database--supabase-postgres)
11. [Realtime Messaging — Supabase Realtime](#11-realtime-messaging--supabase-realtime)
12. [Background Work & AI Agents](#12-background-work--ai-agents)
13. [Error Handling](#13-error-handling)
14. [API Documentation](#14-api-documentation)
15. [Testing](#15-testing)
16. [Schema Migrations](#16-schema-migrations)
17. [Linting & Formatting](#17-linting--formatting)
18. [Anti-Patterns Checklist](#18-anti-patterns-checklist)
19. [Quick Reference](#19-quick-reference)

---

## 1. Tech Stack & Version Pins

Pin to these versions or newer. All code examples in this document assume them.

| Dependency        | Minimum | Notes                                                                          |
|-------------------|---------|--------------------------------------------------------------------------------|
| Python            | 3.11    | Required for `StrEnum` and `X \| Y` union syntax                              |
| FastAPI           | 0.115   | `Annotated[T, Depends(...)]` is the idiomatic form                             |
| Pydantic          | 2.7     | v1 APIs (`json_encoders`, `.dict()`) are removed                               |
| pydantic-settings | 2.4     | Lives in a separate package since Pydantic v2                                  |
| supabase-py       | 2.x     | Official Python client — async via `acreate_client` / `AsyncClient`           |
| httpx             | 0.27    | Used internally by supabase-py; also use `ASGITransport` for in-process tests |
| ruff              | 0.6     | Replaces black, isort, autoflake                                               |

**Supabase handles:**
- **PostgreSQL** — primary database, accessed via supabase-py or direct PostgREST queries
- **Auth** — user management, JWT issuance, session refresh, row-level security (RLS)
- **Realtime** — WebSocket broadcast for chat and agent status (frontend subscribes directly)

> **Do not add** raw SQLAlchemy sessions, Alembic, PyJWT, or `python-jose` to this project. Schema changes go through Supabase migrations (see §16).

---

## 2. Project Structure

Organize by **domain** (bounded context), not by file type.

```
src/
├── auth/                   # Supabase Auth integration (verify JWT, current user)
│   ├── router.py
│   ├── schemas.py
│   ├── service.py          # Wraps supabase.auth.*
│   ├── dependencies.py     # get_current_user — verifies Supabase JWT
│   ├── config.py
│   ├── constants.py
│   └── exceptions.py
├── projects/               # Project CRUD & settings
│   └── ...
├── chat/                   # File uploads; message persistence (Supabase Realtime handles delivery)
│   └── ...
├── plans/                  # Project plan tab, versioning, approval
│   └── ...
├── agents/                 # AI agent pipeline (Monitor → Analyzer → Planner → Updater)
│   └── ...
├── permissions/            # Permission delegation & approval controls
│   └── ...
├── config.py               # Global BaseSettings
├── models.py               # Shared Pydantic bases (no ORM models — use Supabase client)
├── exceptions.py           # Global exceptions & handlers
├── supabase_client.py      # Async Supabase client factory (replaces database.py)
└── main.py                 # FastAPI app + lifespan
```

### Cross-Domain Import Rule

Always use the **module-level name**, never deep-path or wildcard imports.

```python
# ✅ DO
from src.auth import constants as auth_constants
from src.notifications import service as notification_service
from src.plans.constants import ErrorCode as PlansErrorCode

# ❌ DON'T
from src.auth.service.user import get_user_by_id
from src.auth import *
```

---

## 3. Naming Conventions

### Routes & URLs

| Pattern          | Example                              |
|------------------|--------------------------------------|
| Plural nouns     | `/projects`, `/messages`, `/plans`   |
| Kebab-case       | `/project-plans`, `/ai-suggestions`  |
| Resource nesting | `/projects/{project_id}/members`     |
| No trailing slash| `/projects` not `/projects/`         |

### Database Tables

| Rule                          | Example                                     |
|-------------------------------|---------------------------------------------|
| `lower_snake_case`            | `project_plan`, `chat_message`              |
| Singular table names          | `project`, `user`, `plan_version`           |
| Group with prefix             | `plan_version`, `plan_comment`              |
| `_at` suffix for `datetime`   | `created_at`, `approved_at`                 |
| `_date` suffix for `date`     | `due_date`, `start_date`                    |
| Consistent FK names           | Always `project_id`, never `proj_id`        |

### Python Identifiers

| Construct         | Convention       | Example                    |
|-------------------|------------------|----------------------------|
| Variables/funcs   | `snake_case`     | `get_project_by_id`        |
| Classes           | `PascalCase`     | `ProjectCreate`, `PlanOut` |
| Constants         | `UPPER_SNAKE`    | `MAX_PLAN_VERSIONS = 3`    |
| Env vars          | `UPPER_SNAKE`    | `AUTH_JWT_SECRET`          |

---

## 4. API Design Principles

### HTTP Methods

| Intent              | Method   | Status Code |
|---------------------|----------|-------------|
| Retrieve resource   | `GET`    | `200`       |
| Create resource     | `POST`   | `201`       |
| Full update         | `PUT`    | `200`       |
| Partial update      | `PATCH`  | `200`       |
| Delete resource     | `DELETE` | `204`       |
| Approve/reject AI   | `POST`   | `200`       |

### Response Envelope

All responses follow a consistent shape. Use Pydantic `response_model` for validation.

```python
# Successful list response
{
  "data": [...],
  "meta": { "total": 42, "page": 1, "per_page": 20 }
}

# Single resource
{
  "data": { ... }
}

# Error response
{
  "error": {
    "code": "PLAN_NOT_FOUND",
    "message": "Project plan does not exist.",
    "detail": null
  }
}
```

### Pagination

Use cursor-based or offset pagination. Expose `page` and `per_page` as query params with sensible defaults.

```python
@router.get("/projects", response_model=ProjectListResponse)
async def list_projects(page: int = 1, per_page: int = Query(default=20, le=100)):
    ...
```

### Versioning

Prefix all routes with `/api/v1/`. Use FastAPI's `include_router` with a prefix.

```python
app.include_router(projects_router, prefix="/api/v1/projects", tags=["projects"])
```

---

## 5. Domain Map

Derived directly from the MVP feature set.

### `auth/`
- **Supabase Auth** handles registration, login, logout, token refresh, and email verification natively.
- FastAPI's role is limited to **verifying the Supabase JWT** on protected routes.
- `GET /api/v1/auth/me` — returns current user profile from Supabase Auth

### `projects/`
- CRUD for projects (name, description, details)
- Project members list
- `POST /api/v1/projects` — create project
- `GET /api/v1/projects/{project_id}` — get project

### `chat/`
- **Supabase Realtime** delivers chat messages to connected clients directly — no FastAPI WebSocket endpoint needed.
- FastAPI persists messages to the `chat_message` table; Realtime broadcasts the insert event automatically.
- File uploads (images, videos, audio, documents) go to **Supabase Storage** via a signed upload URL.
- `POST /api/v1/projects/{project_id}/messages` — persist a message (Realtime picks it up)
- `GET /api/v1/projects/{project_id}/files/upload-url` — return a signed Storage upload URL

### `permissions/`
- Invite team members and assign roles
- Delegate approval authority (accept/reject, or edit + accept/reject)
- `POST /api/v1/projects/{project_id}/members`
- `PATCH /api/v1/projects/{project_id}/members/{user_id}/permissions`

### `plans/`
- Read-only view for non-approvers; restricted view for approvers
- Accept, edit, or reject AI-generated plan proposals
- Version history (max **3 reverts** as per MVP)
- Sync to all members on finalization
- `GET /api/v1/projects/{project_id}/plan`
- `POST /api/v1/projects/{project_id}/plan/approve`
- `POST /api/v1/projects/{project_id}/plan/reject`
- `POST /api/v1/projects/{project_id}/plan/revert`

### `agents/`
- Internal trigger/status endpoints for the 4-agent pipeline
- **Monitor** → **Analyzer** → **Planner** → **Updater**
- Agents never apply changes without explicit user approval (MVP requirement)
- `GET /api/v1/projects/{project_id}/agents/status`

### `ai-settings/`
- Per-project AI permission configuration (what AI can/cannot do)
- MCP server configuration (stretch goal)
- `GET /api/v1/projects/{project_id}/ai-settings`
- `PATCH /api/v1/projects/{project_id}/ai-settings`

---

## 6. Async & Concurrency Rules

### Decision Table

| Route behavior                        | Use                                                    |
|---------------------------------------|--------------------------------------------------------|
| `await`-able non-blocking I/O         | `async def`                                            |
| Blocking I/O (no async client exists) | `def` — runs in threadpool                             |
| Sync library inside async route       | `async def` + `run_in_threadpool`                      |
| CPU-bound work (> 50 ms compute)      | Offload to Celery / Arq / RQ worker                    |

### Examples

```python
# ✅ Non-blocking async route
@router.get("/projects/{project_id}")
async def get_project(project: ProjectDep) -> ProjectOut:
    return project

# ✅ Sync route that calls a blocking library
@router.get("/export")
def export_pdf():
    pdf_bytes = legacy_pdf_lib.render(...)   # blocking — runs in threadpool
    return Response(content=pdf_bytes, media_type="application/pdf")

# ✅ Async route that must call a sync library
from fastapi.concurrency import run_in_threadpool

@router.post("/process")
async def process(data: ProcessIn):
    result = await run_in_threadpool(sync_ocr_lib.extract, data.file_bytes)
    return result

# ❌ Blocking call inside async route — NEVER do this
@router.get("/bad")
async def bad():
    time.sleep(5)           # blocks the entire event loop
    requests.get("https://...")   # blocks; use httpx.AsyncClient instead
```

### Threadpool Caveat

- Default Starlette threadpool size is **40**. Saturating it slows all sync routes.
- Threads cost more than coroutines — don't reach for `def` routes by default.

---

## 7. Pydantic Schemas

### Schema Naming

| Purpose          | Suffix     | Example              |
|------------------|------------|----------------------|
| Create payload   | `Create`   | `ProjectCreate`      |
| Update payload   | `Update`   | `ProjectUpdate`      |
| Response model   | `Out`      | `ProjectOut`         |
| Internal model   | *(none)*   | `ProjectInternal`    |

### Built-in Validators — Always Prefer Over Manual Checks

```python
from enum import StrEnum
from pydantic import AnyUrl, BaseModel, EmailStr, Field
from uuid import UUID


class AgentRole(StrEnum):
    MONITOR  = "monitor"
    ANALYZER = "analyzer"
    PLANNER  = "planner"
    UPDATER  = "updater"


class ProjectCreate(BaseModel):
    name:        str  = Field(min_length=1, max_length=128)
    description: str  = Field(min_length=1, max_length=2048)
    slug:        str  = Field(pattern=r"^[a-z0-9-]+$")


class InviteMember(BaseModel):
    email:       EmailStr
    can_edit:    bool = False
    can_approve: bool = False
```

### Custom Base Model

Use `@field_serializer` for datetime formatting. **Never** `json_encoders` (deprecated in Pydantic v2).

```python
from datetime import datetime
from zoneinfo import ZoneInfo
from pydantic import BaseModel, ConfigDict, field_serializer


class CustomModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    @field_serializer("*", when_used="json", check_fields=False)
    def _serialize_datetimes(self, value):
        if isinstance(value, datetime):
            if value.tzinfo is None:
                value = value.replace(tzinfo=ZoneInfo("UTC"))
            return value.strftime("%Y-%m-%dT%H:%M:%S%z")
        return value
```

### Domain-Scoped Settings

```python
# src/auth/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthConfig(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SUPABASE_", env_file=".env", extra="ignore")

    URL:         str   # SUPABASE_URL
    ANON_KEY:    str   # SUPABASE_ANON_KEY
    SERVICE_KEY: str   # SUPABASE_SERVICE_KEY (server-side only, never expose to clients)
    JWT_SECRET:  str   # SUPABASE_JWT_SECRET (from Supabase Dashboard → Settings → API)


auth_settings = AuthConfig()
```

> **Rule:** One `BaseSettings` subclass per domain. Never one god-settings object for the entire app.

---

## 8. Dependency Injection

### Always Use the `Annotated` Form

```python
from typing import Annotated
from fastapi import Depends

# ✅ Modern — idiomatic since FastAPI 0.95
ProjectDep = Annotated[Project, Depends(valid_project_id)]

@router.get("/projects/{project_id}")
async def get_project(project: ProjectDep) -> ProjectOut:
    return project

# ❌ Legacy default-arg form — avoid
@router.get("/projects/{project_id}")
async def get_project(project: Project = Depends(valid_project_id)):
    ...
```

### Validate Inside Dependencies

```python
async def valid_project_id(project_id: UUID) -> Project:
    project = await project_service.get_by_id(project_id)
    if not project:
        raise ProjectNotFound()
    return project
```

### Chain Dependencies for Reuse

```python
async def require_approval_permission(
    project: Annotated[Project, Depends(valid_project_id)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Project:
    if not current_user.can_approve_for(project):
        raise InsufficientPermissions()
    return project
```

### Dependency Rules

- Dependencies are **cached per request** — same `Depends(x)` called 5 times runs `x` only once.
- Prefer `async def` dependencies; sync deps run in the threadpool (wasted overhead for small checks).
- Share path variable names across endpoints for shared dependencies (e.g., always `project_id`).

---

## 9. Authentication & Permissions (Supabase Auth)

### How It Works

Supabase Auth issues JWTs signed with the project's `JWT_SECRET`. FastAPI **verifies** these tokens — it does not issue them. The frontend handles login/signup/refresh via the Supabase JS SDK.

```
Frontend (Supabase JS SDK)         FastAPI Backend
      │                                  │
      │── POST /auth/v1/token ──────▶ Supabase Auth (direct)
      │◀── { access_token, ... } ──────  │
      │                                  │
      │── GET /api/v1/projects ─────────▶│
      │   Authorization: Bearer <jwt>    │
      │                           verify JWT via supabase-py
      │◀── 200 { data: [...] } ──────────│
```

### Verifying the Supabase JWT in FastAPI

```python
# src/auth/dependencies.py
from typing import Annotated
from fastapi import Depends, Header
from src.supabase_client import get_supabase
from src.auth.exceptions import InvalidCredentials
from supabase import AsyncClient


async def get_current_user(
    authorization: str = Header(...),
    supabase: AsyncClient = Depends(get_supabase),
) -> dict:
    """Validates the Supabase JWT and returns the authenticated user."""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise InvalidCredentials()
    try:
        response = await supabase.auth.get_user(token)
        return response.user
    except Exception as exc:
        raise InvalidCredentials() from exc


CurrentUser = Annotated[dict, Depends(get_current_user)]
```

> **Never** manually decode Supabase JWTs with PyJWT or python-jose. Use `supabase.auth.get_user(token)` — it validates the token against Supabase's auth server and returns the full user object.

### Permission Model (from MVP)

The MVP defines a two-tier permission model stored in the `project_member` table:

| Role              | Can Chat | Can View Plan    | Can Approve/Reject | Can Edit Plan |
|-------------------|----------|------------------|--------------------|---------------|
| **Creator**       | ✅       | ✅ (always)      | ✅                 | ✅            |
| **Approver**      | ✅       | ✅ (before sync) | ✅                 | Optional      |
| **Member**        | ✅       | ✅ (after sync)  | ❌                 | ❌            |

- **AI changes are never applied automatically.** All AI outputs require an explicit approve/reject from a user with approval permissions.
- Approval permission can be delegated by the project creator at any granularity.
- Enforce permissions in **both** the FastAPI dependency layer and Supabase **Row Level Security (RLS)** policies.

### RLS Principle

Define RLS policies on Supabase tables so the database itself enforces data isolation, regardless of which client queries it. FastAPI permission guards are a second layer of defense.

```sql
-- Example: only project members can read messages
CREATE POLICY "Members can view messages"
  ON chat_message FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_member
      WHERE project_member.project_id = chat_message.project_id
        AND project_member.user_id = auth.uid()
    )
  );
```

### Implementing Permission Guards

```python
# src/permissions/dependencies.py
from typing import Annotated
from fastapi import Depends
from src.auth.dependencies import get_current_user
from src.projects.dependencies import valid_project_id

async def require_plan_approver(
    project: Annotated[Project, Depends(valid_project_id)],
    user:    Annotated[dict,    Depends(get_current_user)],
    supabase: AsyncClient = Depends(get_supabase),
) -> dict:
    result = await supabase.table("project_member").select("can_approve") \
        .eq("project_id", project["id"]) \
        .eq("user_id", user.id) \
        .single() \
        .execute()
    if not result.data or not result.data["can_approve"]:
        raise InsufficientPermissions()
    return user
```

---

## 10. Database — Supabase Postgres

### Client Factory

Use supabase-py's async client. Inject it as a FastAPI dependency.

```python
# src/supabase_client.py
from functools import lru_cache
from supabase import AsyncClient, acreate_client
from src.config import settings


@lru_cache
def _get_settings():
    return settings


async def get_supabase() -> AsyncClient:
    """Yields a per-request Supabase async client."""
    return await acreate_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_ANON_KEY,
    )


# For server-side operations that bypass RLS (use sparingly)
async def get_supabase_admin() -> AsyncClient:
    return await acreate_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_KEY,
    )


SupabaseDep = Annotated[AsyncClient, Depends(get_supabase)]
```

### Querying — PostgREST Client

Use the supabase-py table API for standard CRUD. Use raw SQL (via `supabase.rpc()`) for joins, aggregation, or complex queries.

```python
# ✅ Simple select
result = await supabase.table("project") \
    .select("id, name, description") \
    .eq("id", project_id) \
    .single() \
    .execute()
project = result.data

# ✅ Insert
result = await supabase.table("project") \
    .insert({"name": data.name, "owner_id": user.id}) \
    .execute()

# ✅ Complex query via RPC (Postgres function)
result = await supabase.rpc(
    "get_plan_with_versions",
    {"p_project_id": str(project_id)}
).execute()
```

> Prefer **Postgres functions via `rpc()`** for joins and aggregations — Postgres is faster than Python at data shaping. Hydrate the result into a Pydantic model for response validation only.

### Table Naming Conventions

| Rule                          | Example                                      |
|-------------------------------|----------------------------------------------|
| `lower_snake_case`            | `project_plan`, `plan_version`              |
| Singular table names          | `project`, `chat_message`, `plan_version`   |
| Group FK columns consistently | Always `project_id`, never `proj_id`         |
| `_at` for timestamp columns   | `created_at`, `finalized_at`, `reverted_at` |
| `_date` for date columns      | `due_date`                                   |

### Plan Version Rule (MVP constraint)

Plans can be reverted up to **3 times**. Enforce in the service layer.

```python
# src/plans/service.py
MAX_PLAN_VERSIONS = 3

async def revert_plan(project_id: UUID, supabase: AsyncClient) -> dict:
    result = await supabase.table("plan_version") \
        .select("id", count="exact") \
        .eq("project_id", str(project_id)) \
        .execute()
    if result.count >= MAX_PLAN_VERSIONS:
        raise MaxRevertsReached()
    # Perform the revert via an RPC to keep logic in Postgres
    return (await supabase.rpc("revert_plan", {"p_project_id": str(project_id)}).execute()).data
```

---

## 11. Realtime Messaging — Supabase Realtime

### Architecture

Supabase Realtime broadcasts Postgres change events (INSERT, UPDATE, DELETE) directly to subscribed clients over WebSocket. **FastAPI does not need to implement WebSocket endpoints for chat or agent status.**

```
User sends message
        │
        ▼
POST /api/v1/projects/{id}/messages   ← FastAPI persists to chat_message table
        │
        ▼
Supabase Realtime picks up INSERT event
        │
        ▼
Broadcasts to all subscribed project members (frontend WebSocket)
```

### FastAPI's Role

- **Persist** messages, plan updates, and agent status changes to the database.
- **Never** build a custom WebSocket server for real-time delivery — Supabase Realtime handles it.

### Frontend Subscription Pattern (reference only)

```typescript
// Frontend subscribes directly to Supabase Realtime
const channel = supabase
  .channel(`project:${projectId}`)
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'chat_message',
      filter: `project_id=eq.${projectId}` },
    (payload) => appendMessage(payload.new)
  )
  .subscribe()
```

### Agent Status Broadcasting

The AI agent pipeline updates an `agent_status` table row as each agent transitions state. Supabase Realtime delivers the UPDATE event to the frontend automatically — no polling needed.

---

## 12. Background Work & AI Agents

### BackgroundTasks vs. Task Queue

| Use `BackgroundTasks` when…             | Use Celery / Arq / RQ when…                   |
|-----------------------------------------|------------------------------------------------|
| Task is < 1 second                      | Task takes seconds to minutes                  |
| Silent failure is acceptable            | You need retries, dead-letter, or visibility   |
| In-process fire-and-forget (e.g., log)  | Task is CPU-heavy or uses a separate pool      |
| No scheduling needed                    | You need cron, ETA, or rate limiting           |

> **AI Agent pipeline** (Monitor → Analyzer → Planner → Updater) involves long-running LLM calls. These **must** use a task queue (Celery / Arq / RQ), not `BackgroundTasks`.

### Agent Pipeline Design

The MVP defines 4 specialized agents per project, running in a pipeline:

```
Chat message received
        │
        ▼
   [Monitor Agent]      ← watches conversations; extracts decisions, tasks, details
        │
        ▼
  [Analyzer Agent]      ← identifies gaps, risks, unclear action items
        │
        ▼
   [Planner Agent]      ← generates structured plan: timeline, priorities, ownership
        │
        ▼
   [Updater Agent]      ← applies changes ONLY after explicit user approval
```

### Agent Endpoint Pattern

```python
# src/agents/router.py
@router.get("/projects/{project_id}/agents/status")
async def get_agent_status(
    project: Annotated[Project, Depends(valid_project_id)],
    user:    Annotated[User,    Depends(get_current_user)],
) -> AgentStatusOut:
    return await agent_service.get_status(project.id)


@router.post("/projects/{project_id}/agents/trigger")
async def trigger_pipeline(
    project: Annotated[Project, Depends(valid_project_id)],
    user:    Annotated[User,    Depends(require_plan_approver)],
    bg:      BackgroundTasks,
) -> AcceptedResponse:
    # Enqueue long-running work in the task queue, not BackgroundTasks
    await agent_queue.enqueue_pipeline(project.id)
    return AcceptedResponse(message="Agent pipeline triggered.")
```

### Rules

- Agents **never mutate plan data directly**. All mutations route through the `Updater` agent, which stages a diff for human approval.
- Agent errors must be surfaced to users — do not swallow exceptions silently.

---

## 13. Error Handling

### Exception Hierarchy

Define domain-specific exceptions that map to HTTP status codes.

```python
# src/exceptions.py
from fastapi import HTTPException, status


class AppException(HTTPException):
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    detail:      str = "An unexpected error occurred."

    def __init__(self, detail: str | None = None):
        super().__init__(status_code=self.status_code, detail=detail or self.detail)


class NotFound(AppException):
    status_code = status.HTTP_404_NOT_FOUND
    detail      = "Resource not found."


class Forbidden(AppException):
    status_code = status.HTTP_403_FORBIDDEN
    detail      = "You do not have permission to perform this action."


class Conflict(AppException):
    status_code = status.HTTP_409_CONFLICT
    detail      = "Resource already exists."


class InvalidCredentials(AppException):
    status_code = status.HTTP_401_UNAUTHORIZED
    detail      = "Invalid or expired credentials."
```

### Domain-Specific Exceptions

```python
# src/plans/exceptions.py
from src.exceptions import NotFound, Forbidden


class PlanNotFound(NotFound):
    detail = "Project plan does not exist."


class MaxRevertsReached(Forbidden):
    detail = f"Plans can only be reverted up to {MAX_PLAN_VERSIONS} times."


class PlanAlreadyApproved(Conflict):
    detail = "This plan version has already been approved."
```

### Rules

- **Never catch bare `Exception`** around a route body — it hides bugs and converts 500s into silent 200s.
- Catch the **specific exception class** and raise `HTTPException` with a meaningful status code.
- Register a global exception handler in `main.py` for unhandled `AppException`.

---

## 14. API Documentation

### Environment-Gated Docs

```python
# src/main.py
from fastapi import FastAPI
from src.config import settings

SHOW_DOCS_IN = {"local", "staging"}
app_kwargs = {"title": "USAII API", "version": "1.0.0"}

if settings.ENVIRONMENT not in SHOW_DOCS_IN:
    app_kwargs["openapi_url"] = None   # disables /docs and /redoc in production

app = FastAPI(**app_kwargs)
```

### Document Every Endpoint

```python
from fastapi import APIRouter, status
from fastapi.responses import Response

router = APIRouter()


@router.post(
    "/projects/{project_id}/plan/approve",
    response_model=PlanOut,
    status_code=status.HTTP_200_OK,
    summary="Approve an AI-generated plan",
    description=(
        "Approves the pending AI-generated plan for the given project. "
        "Only users with approval permissions may call this endpoint. "
        "Once approved, the plan is synced to all project members."
    ),
    tags=["plans"],
    responses={
        status.HTTP_403_FORBIDDEN:  {"model": ErrorResponse, "description": "Not an approver"},
        status.HTTP_404_NOT_FOUND:  {"model": ErrorResponse, "description": "Plan not found"},
        status.HTTP_409_CONFLICT:   {"model": ErrorResponse, "description": "Plan already approved"},
    },
)
async def approve_plan(
    project: Annotated[Project, Depends(valid_project_id)],
    user:    Annotated[User,    Depends(require_plan_approver)],
) -> PlanOut:
    ...
```

---

## 15. Testing

### Async Client Setup

```python
import pytest
from httpx import AsyncClient, ASGITransport
from src.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_approve_plan(client: AsyncClient):
    resp = await client.post("/api/v1/projects/some-id/plan/approve")
    assert resp.status_code == 200
```

> **Do NOT use** `async_asgi_testclient` — it is unmaintained. Use `httpx.AsyncClient` + `ASGITransport`.

### Override Dependencies in Tests

```python
from src.auth.dependencies import get_current_user
from src.main import app


def fake_approver():
    return User(id="00000000-0000-0000-0000-000000000001", can_approve=True)


@pytest.fixture(autouse=True)
def _override_auth():
    app.dependency_overrides[get_current_user] = fake_approver
    yield
    app.dependency_overrides.clear()
```

### Override Supabase Auth in Tests

```python
from src.auth.dependencies import get_current_user
from src.supabase_client import get_supabase
from src.main import app


def fake_user():
    class FakeUser:
        id = "00000000-0000-0000-0000-000000000001"
        email = "test@example.com"
    return FakeUser()


@pytest.fixture(autouse=True)
def _override_auth():
    app.dependency_overrides[get_current_user] = fake_user
    yield
    app.dependency_overrides.clear()
```

### Testing Rules

- Use an **ephemeral Supabase project** (or local Supabase via `supabase start`) for integration tests — never mock the database.
- Use `dependency_overrides` to swap out `get_current_user` and `get_supabase` in unit tests.
- Test the **permission model** explicitly: verify that members without approval rights receive `403` from approve/reject endpoints.
- Test **RLS policies** separately at the database layer using the Supabase local dev CLI.

---

## 16. Schema Migrations

Supabase manages schema migrations — **do not use Alembic**.

### Workflow

```bash
# Create a new migration file
supabase migration new add_plan_version_table
# → creates supabase/migrations/20260613120000_add_plan_version_table.sql

# Apply locally
supabase db reset

# Push to remote Supabase project
supabase db push
```

### File Naming

Supabase auto-prefixes files with a timestamp. Use a descriptive slug:

```
supabase/migrations/
  20260613120000_initial_schema.sql
  20260614080000_add_plan_version_table.sql
  20260614120000_add_member_permissions.sql
  20260615090000_add_agent_status_table.sql
```

### Rules

- Every migration file must be **idempotent** where possible (`CREATE TABLE IF NOT EXISTS`, `DO $$ ... $$`).
- Include **both the DDL change and its RLS policy** in the same migration file.
- Never hand-edit the Supabase dashboard schema directly — all changes must go through migration files checked into version control.
- Run `supabase db reset` in CI to verify migrations apply cleanly from scratch.

---

## 17. Linting & Formatting

```shell
# Check and auto-fix
ruff check --fix src

# Format
ruff format src
```

- Ruff replaces black, isort, autoflake, and most of flake8 in one tool.
- Add to a **pre-commit hook** and run in **CI**.
- No PR should be merged with outstanding ruff errors.

---

## 18. Anti-Patterns Checklist

When reviewing a PR or diff, check for these. Each is a real failure mode.

| Anti-pattern | Why it's wrong | Fix |
|---|---|---|
| `requests.get(...)` inside `async def` | Blocks the event loop | Use `httpx.AsyncClient` or `run_in_threadpool` |
| `time.sleep` / `open()` / sync Supabase client inside `async def` | Blocks the loop | Use the async supabase-py client (`acreate_client`) |
| Manually decoding Supabase JWTs with PyJWT | Auth state may be stale; bypasses revocation | Use `supabase.auth.get_user(token)` |
| `from jose import jwt` or `import jwt` for Supabase tokens | python-jose unmaintained; bypasses Supabase session checks | `supabase.auth.get_user(token)` |
| Using `SUPABASE_SERVICE_KEY` in a route handler | Service key bypasses RLS — catastrophic if leaked | Only use service key in admin utilities or background workers, never in user-facing routes |
| Building WebSocket endpoints for chat delivery | Duplicates Supabase Realtime; operational overhead | Persist to DB; let Supabase Realtime broadcast inserts to the frontend |
| Using Alembic for schema changes | Conflicts with Supabase migration system | Use `supabase migration new` + `supabase db push` |
| Hand-editing schema in Supabase dashboard without a migration file | Change is not in version control | Always create a `.sql` migration file; commit it |  
| `from async_asgi_testclient import TestClient` | Unmaintained | `httpx.AsyncClient` + `ASGITransport` |
| `model_config = ConfigDict(json_encoders={...})` | Deprecated in Pydantic v2 | `@field_serializer` or `PlainSerializer` |
| `Field(ge=18, default=None)` | Constraint contradicts default | Choose required or optional — not both |
| `def get_user(id = Depends(...))` | Legacy default-arg form | `user: Annotated[User, Depends(...)]` |
| Catching bare `Exception` around a route body | Hides bugs; silent 500s | Catch specific class; raise `HTTPException` |
| `BackgroundTasks` for the AI agent pipeline | No retry; dies with worker | Use Celery / Arq / RQ |
| Returning a Pydantic model AND setting `response_model=` to same class | Model constructed twice | Return dict/ORM row and let `response_model` validate, or drop `response_model` |
| Deep-path cross-domain imports | Tight coupling | `from src.auth import service as auth_service` |
| One god `BaseSettings` for entire app | Hard to reason about | One `BaseSettings` per domain |
| Mocking Supabase in integration tests | Mock/prod divergence fires in prod | Use local Supabase (`supabase start`) + `dependency_overrides` for auth |
| Skipping RLS policies | Any direct DB access bypasses FastAPI guards | Define RLS on every table; treat it as the authoritative security layer |
| Agent directly mutating plan data | Violates MVP approval requirement | Stage diff; require explicit user approval |

---

## 19. Quick Reference

| Scenario | Solution |
|---|---|
| Non-blocking I/O | `async def` route with `await` |
| Blocking I/O (no async client) | `def` route (runs in threadpool) |
| Sync library inside async route | `await run_in_threadpool(fn, *args)` |
| CPU-intensive / long-running task | Celery / Arq / RQ worker process |
| AI agent pipeline | Task queue — never `BackgroundTasks` |
| Request validation against DB | Dependency that loads + validates + returns |
| Reuse validation across routes | Chain dependencies |
| Inject dependency (modern style) | `Annotated[T, Depends(...)]` |
| Per-request dep caching | Default behavior — same `Depends(x)` runs once |
| Per-domain config | One `BaseSettings` subclass per domain |
| Custom datetime serialization | `@field_serializer` |
| Fire-and-forget short in-process task | `BackgroundTasks` |
| Reliable / scheduled / heavy task | Celery / Arq / RQ |
| Verify a user's JWT | `supabase.auth.get_user(token)` — never decode manually |
| Database queries | `supabase.table("...").select(...).execute()` |
| Complex SQL (joins, aggregation) | `supabase.rpc("function_name", {...}).execute()` |
| Real-time chat delivery | Supabase Realtime — frontend subscribes directly; FastAPI only persists |
| File uploads | Supabase Storage — return signed upload URL from FastAPI |
| Schema changes | `supabase migration new` + `supabase db push` |
| HTTP test client | `httpx.AsyncClient` + `ASGITransport` |
| Swap dep in tests | `app.dependency_overrides[dep] = fake` |
| Integration test DB | Local Supabase (`supabase start`) |
| Lint + format | `ruff check --fix` + `ruff format` |
| Plan revert limit | Enforce `MAX_PLAN_VERSIONS = 3` in service layer |
| AI approval gate | All AI mutations require explicit user approval |
| Permission delegation | `project_member.can_approve` / `can_edit` flags + RLS policies |
| Docs in production | Disable with `openapi_url = None` |
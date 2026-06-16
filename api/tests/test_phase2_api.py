from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from src.agents.queue import get_queue_producer
from src.main import app
from src.supabase_client import get_supabase_admin


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class FakeStorageBucket:
    def __init__(self, bucket_name: str) -> None:
        self.bucket_name = bucket_name

    def create_signed_upload_url(self, path: str, options: dict | None = None) -> dict:
        return {
            "path": path,
            "token": f"token:{path}",
            "signed_url": f"https://storage.example/{self.bucket_name}/{path}",
            "options": options or {},
        }


class FakeStorage:
    def from_(self, bucket_name: str) -> FakeStorageBucket:
        return FakeStorageBucket(bucket_name)


class FakeExecuteResult:
    def __init__(self, data: list[dict]) -> None:
        self.data = data


class FakeTableQuery:
    def __init__(self, client: "FakeSupabase", table_name: str) -> None:
        self.client = client
        self.table_name = table_name
        self._action = "select"
        self._payload = None
        self._filters: list[tuple[str, object]] = []
        self._order: tuple[str, bool] | None = None
        self._limit: int | None = None

    def select(self, _: str = "*") -> "FakeTableQuery":
        self._action = "select"
        return self

    def insert(self, payload):
        self._action = "insert"
        self._payload = payload
        return self

    def update(self, payload: dict) -> "FakeTableQuery":
        self._action = "update"
        self._payload = payload
        return self

    def delete(self) -> "FakeTableQuery":
        self._action = "delete"
        return self

    def eq(self, column: str, value: object) -> "FakeTableQuery":
        self._filters.append((column, value))
        return self

    def order(self, column: str, desc: bool = False) -> "FakeTableQuery":
        self._order = (column, desc)
        return self

    def limit(self, value: int) -> "FakeTableQuery":
        self._limit = value
        return self

    async def execute(self) -> FakeExecuteResult:
        rows = self.client.tables[self.table_name]
        if self._action == "insert":
            payloads = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted = []
            for payload in payloads:
                row = self.client.insert_row(self.table_name, payload)
                inserted.append(deepcopy(row))
            return FakeExecuteResult(inserted)

        matched = [row for row in rows if self._matches(row)]

        if self._action == "update":
            updated = []
            for row in matched:
                row.update(deepcopy(self._payload))
                updated.append(deepcopy(row))
            return FakeExecuteResult(updated)

        if self._action == "delete":
            deleted = [deepcopy(row) for row in matched]
            self.client.tables[self.table_name] = [row for row in rows if row not in matched]
            return FakeExecuteResult(deleted)

        selected = [deepcopy(row) for row in matched]
        if self._order:
            column, desc = self._order
            selected.sort(key=lambda row: row.get(column), reverse=desc)
        if self._limit is not None:
            selected = selected[: self._limit]
        return FakeExecuteResult(selected)

    def _matches(self, row: dict) -> bool:
        return all(str(row.get(column)) == str(value) for column, value in self._filters)


class FakeSupabase:
    def __init__(self) -> None:
        self.storage = FakeStorage()
        self.tables = {
            "project": [],
            "project_member": [],
            "chat_message": [],
            "uploaded_file": [],
            "agent_status": [],
            "agent_run": [],
            "project_memory": [],
            "conversation_summary": [],
            "agent_artifact": [],
            "project_llm_usage": [],
            "plan_proposal": [],
            "project_plan": [],
            "plan_version": [],
        }

    def table(self, table_name: str) -> FakeTableQuery:
        return FakeTableQuery(self, table_name)

    def insert_row(self, table_name: str, payload: dict) -> dict:
        row = deepcopy(payload)
        row.setdefault("id", str(uuid4()))
        if table_name == "project":
            row.setdefault("created_at", _iso_now())
        if table_name == "project_member":
            row.setdefault("created_at", _iso_now())
        if table_name == "chat_message":
            row.setdefault("created_at", _iso_now())
        if table_name == "uploaded_file":
            row.setdefault("created_at", _iso_now())
        if table_name == "agent_status":
            row.setdefault("updated_at", _iso_now())
        if table_name == "plan_proposal":
            row.setdefault("created_at", _iso_now())
        if table_name == "agent_run":
            row.setdefault("created_at", _iso_now())
            row.setdefault("new_message_ids", [])
            row.setdefault("new_file_ids", [])
        if table_name == "project_memory":
            row.setdefault("created_at", _iso_now())
            row.setdefault("updated_at", _iso_now())
        if table_name == "conversation_summary":
            row.setdefault("created_at", _iso_now())
        if table_name == "agent_artifact":
            row.setdefault("created_at", _iso_now())
        if table_name == "project_llm_usage":
            row.setdefault("call_count", 0)
        if table_name == "project_plan":
            row.setdefault("version", 1)
            row.setdefault("finalized_at", None)
        if table_name == "plan_version":
            row.setdefault("created_at", _iso_now())
        self.tables[table_name].append(row)
        return row


@pytest.fixture
def fake_supabase() -> FakeSupabase:
    return FakeSupabase()


class FakeQueueProducer:
    def __init__(self) -> None:
        self.enqueued_run_ids: list[str] = []

    def enqueue_run(self, run_id: str) -> str:
        self.enqueued_run_ids.append(run_id)
        return f"job:{run_id}"


@pytest.fixture
def fake_queue_producer() -> FakeQueueProducer:
    return FakeQueueProducer()


@pytest.fixture(autouse=True)
def override_dependencies(fake_supabase: FakeSupabase, fake_queue_producer: FakeQueueProducer):
    async def _get_supabase_admin() -> FakeSupabase:
        return fake_supabase

    def _get_queue_producer() -> FakeQueueProducer:
        return fake_queue_producer

    app.dependency_overrides[get_supabase_admin] = _get_supabase_admin
    app.dependency_overrides[get_queue_producer] = _get_queue_producer
    yield
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        yield async_client


@pytest.mark.asyncio
async def test_create_and_list_projects(client: AsyncClient):
    create_response = await client.post(
        "/api/v1/projects",
        headers={"X-Session-Id": "alpha"},
        json={"name": "Orca", "description": "Planning workspace"},
    )

    assert create_response.status_code == 201
    created = create_response.json()["data"]
    assert created["membership"]["role"] == "creator"

    list_response = await client.get("/api/v1/projects", headers={"X-Session-Id": "alpha"})

    assert list_response.status_code == 200
    assert len(list_response.json()["data"]) == 1


@pytest.mark.asyncio
async def test_messages_and_upload_url_require_membership(
    client: AsyncClient,
    fake_supabase: FakeSupabase,
    fake_queue_producer: FakeQueueProducer,
):
    project = fake_supabase.insert_row("project", {"name": "Alpha", "description": "A"})
    fake_supabase.insert_row(
        "project_member",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "role": "creator",
            "can_approve": True,
            "can_edit": True,
        },
    )

    post_message = await client.post(
        f"/api/v1/projects/{project['id']}/messages",
        headers={"X-Session-Id": "alpha"},
        json={"content": "Ship the API this week."},
    )
    assert post_message.status_code == 201
    assert len(fake_supabase.tables["agent_run"]) == 1
    assert fake_queue_producer.enqueued_run_ids == [fake_supabase.tables["agent_run"][0]["id"]]

    history = await client.get(
        f"/api/v1/projects/{project['id']}/messages",
        headers={"X-Session-Id": "alpha"},
    )
    assert history.status_code == 200
    assert history.json()["data"][0]["content"] == "Ship the API this week."

    upload_url = await client.get(
        f"/api/v1/projects/{project['id']}/files/upload-url",
        headers={"X-Session-Id": "alpha"},
        params={"filename": "brief.pdf", "mime_type": "application/pdf"},
    )
    assert upload_url.status_code == 200
    assert upload_url.json()["data"]["bucket"] == "orca-uploads"


@pytest.mark.asyncio
async def test_member_management_requires_approver(
    client: AsyncClient,
    fake_supabase: FakeSupabase,
):
    project = fake_supabase.insert_row("project", {"name": "Alpha", "description": "A"})
    fake_supabase.insert_row(
        "project_member",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "role": "creator",
            "can_approve": True,
            "can_edit": True,
        },
    )

    add_member_response = await client.post(
        f"/api/v1/projects/{project['id']}/members",
        headers={"X-Session-Id": "alpha"},
        json={"session_id": "beta", "role": "member"},
    )
    assert add_member_response.status_code == 201

    patch_member_response = await client.patch(
        f"/api/v1/projects/{project['id']}/members/beta/permissions",
        headers={"X-Session-Id": "alpha"},
        json={"can_approve": True, "can_edit": True},
    )
    assert patch_member_response.status_code == 200
    assert patch_member_response.json()["data"]["can_approve"] is True


@pytest.mark.asyncio
async def test_plan_approval_applies_changes_and_revert(
    client: AsyncClient,
    fake_supabase: FakeSupabase,
):
    project = fake_supabase.insert_row("project", {"name": "Alpha", "description": "A"})
    fake_supabase.insert_row(
        "project_member",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "role": "creator",
            "can_approve": True,
            "can_edit": True,
        },
    )
    fake_supabase.insert_row(
        "project_plan",
        {
            "project_id": project["id"],
            "content": {"tasks": [{"title": "Initial"}]},
            "version": 1,
            "finalized_at": _iso_now(),
        },
    )
    fake_supabase.insert_row(
        "plan_proposal",
        {
            "project_id": project["id"],
            "status": "pending",
            "changes": [{"section": "tasks", "action": "add", "content": [{"title": "Next"}]}],
        },
    )

    approve = await client.post(
        f"/api/v1/projects/{project['id']}/plan/approve",
        headers={"X-Session-Id": "alpha"},
        json={"approved_change_indexes": [0]},
    )
    assert approve.status_code == 200
    assert approve.json()["data"]["version"] == 2
    assert approve.json()["data"]["content"]["tasks"][1]["title"] == "Next"
    updater_status = next(
        row for row in fake_supabase.tables["agent_status"] if row["agent"] == "updater"
    )
    assert updater_status["status"] == "completed"

    revert = await client.post(
        f"/api/v1/projects/{project['id']}/plan/revert",
        headers={"X-Session-Id": "alpha"},
    )
    assert revert.status_code == 200
    assert revert.json()["data"]["content"]["tasks"] == [{"title": "Initial"}]


@pytest.mark.asyncio
async def test_agents_status_and_trigger(
    client: AsyncClient,
    fake_supabase: FakeSupabase,
    fake_queue_producer: FakeQueueProducer,
):
    project = fake_supabase.insert_row("project", {"name": "Alpha", "description": "A"})
    fake_supabase.insert_row(
        "project_member",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "role": "creator",
            "can_approve": True,
            "can_edit": True,
        },
    )

    status_response = await client.get(
        f"/api/v1/projects/{project['id']}/agents/status",
        headers={"X-Session-Id": "alpha"},
    )
    assert status_response.status_code == 200
    assert len(status_response.json()["data"]) == 4

    trigger_response = await client.post(
        f"/api/v1/projects/{project['id']}/agents/trigger",
        headers={"X-Session-Id": "alpha"},
    )
    assert trigger_response.status_code == 202
    assert trigger_response.json()["data"]["status"] == "queued"
    assert len(fake_supabase.tables["agent_run"]) == 1
    assert fake_queue_producer.enqueued_run_ids == [fake_supabase.tables["agent_run"][0]["id"]]


@pytest.mark.asyncio
async def test_trigger_reuses_active_run_for_new_messages(
    client: AsyncClient,
    fake_supabase: FakeSupabase,
    fake_queue_producer: FakeQueueProducer,
):
    project = fake_supabase.insert_row("project", {"name": "Alpha", "description": "A"})
    fake_supabase.insert_row(
        "project_member",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "role": "creator",
            "can_approve": True,
            "can_edit": True,
        },
    )
    active_run = fake_supabase.insert_row(
        "agent_run",
        {
            "project_id": project["id"],
            "triggered_by": "alpha",
            "status": "running",
            "new_message_ids": [],
        },
    )

    first_message = await client.post(
        f"/api/v1/projects/{project['id']}/messages",
        headers={"X-Session-Id": "alpha"},
        json={"content": "Need frontend QA owner."},
    )

    assert first_message.status_code == 201
    assert len(fake_supabase.tables["agent_run"]) == 1
    assert fake_supabase.tables["agent_run"][0]["id"] == active_run["id"]
    assert (
        first_message.json()["data"]["id"]
        in fake_supabase.tables["agent_run"][0]["new_message_ids"]
    )
    assert fake_queue_producer.enqueued_run_ids == []

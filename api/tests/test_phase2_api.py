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
            "project_invitation": [],
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
        if table_name == "project_invitation":
            row.setdefault("created_at", _iso_now())
            row.setdefault("redeemed_at", None)
            row.setdefault("redeemed_by_session_id", None)
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
        self.enqueued_runs: list[dict[str, object]] = []

    def enqueue_run(self, run_id: str, *, delay_seconds: int | None = None) -> str:
        self.enqueued_run_ids.append(run_id)
        self.enqueued_runs.append({"run_id": run_id, "delay_seconds": delay_seconds})
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
async def test_project_creation_creates_default_member_invitation(
    client: AsyncClient,
    fake_supabase: FakeSupabase,
):
    create_response = await client.post(
        "/api/v1/projects",
        headers={"X-Session-Id": "alpha"},
        json={"name": "Orca", "description": "Planning workspace"},
    )

    assert create_response.status_code == 201
    assert len(fake_supabase.tables["project_invitation"]) == 1
    invitation = fake_supabase.tables["project_invitation"][0]
    assert invitation["invitee_email"] == "__default__"
    assert invitation["can_edit"] is True

    project_id = create_response.json()["data"]["id"]
    default_invitation = await client.get(
        f"/api/v1/projects/{project_id}/member-invitations/default",
        headers={"X-Session-Id": "alpha"},
    )
    assert default_invitation.status_code == 200
    assert default_invitation.json()["data"]["token"] == invitation["token"]


@pytest.mark.asyncio
async def test_project_creation_initializes_base_project_plan(
    client: AsyncClient,
    fake_supabase: FakeSupabase,
):
    create_response = await client.post(
        "/api/v1/projects",
        headers={"X-Session-Id": "alpha"},
        json={"name": "Orca", "description": "Planning workspace"},
    )

    assert create_response.status_code == 201
    assert len(fake_supabase.tables["project_plan"]) == 1

    project = create_response.json()["data"]
    project_plan = fake_supabase.tables["project_plan"][0]
    assert project_plan["project_id"] == project["id"]
    assert project_plan["version"] == 1
    assert project_plan["finalized_at"] is None
    assert project_plan["content"] == {
        "title": "Orca",
        "description": "Planning workspace",
        "objectives": [],
        "stakeholders": [],
        "phases": [],
        "global_risks": [],
    }

    get_plan = await client.get(
        f"/api/v1/projects/{project['id']}/plan",
        headers={"X-Session-Id": "alpha"},
    )
    assert get_plan.status_code == 200
    assert get_plan.json()["data"]["title"] == "Orca"
    assert get_plan.json()["data"]["description"] == "Planning workspace"


@pytest.mark.asyncio
async def test_get_update_delete_and_list_members_for_project(
    client: AsyncClient,
    fake_supabase: FakeSupabase,
):
    project = fake_supabase.insert_row("project", {"name": "Alpha", "description": "A"})
    creator = fake_supabase.insert_row(
        "project_member",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "role": "creator",
            "can_approve": True,
            "can_edit": True,
        },
    )
    collaborator = fake_supabase.insert_row(
        "project_member",
        {
            "project_id": project["id"],
            "session_id": "beta",
            "role": "member",
            "can_approve": False,
            "can_edit": True,
        },
    )

    get_response = await client.get(
        f"/api/v1/projects/{project['id']}",
        headers={"X-Session-Id": "alpha"},
    )
    assert get_response.status_code == 200
    assert get_response.json()["data"]["name"] == "Alpha"

    members_response = await client.get(
        f"/api/v1/projects/{project['id']}/members",
        headers={"X-Session-Id": "alpha"},
    )
    assert members_response.status_code == 200
    assert [member["id"] for member in members_response.json()["data"]] == [
        creator["id"],
        collaborator["id"],
    ]

    patch_response = await client.patch(
        f"/api/v1/projects/{project['id']}",
        headers={"X-Session-Id": "alpha"},
        json={"name": "Alpha Prime", "description": "Updated"},
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["data"]["name"] == "Alpha Prime"
    assert fake_supabase.tables["project"][0]["description"] == "Updated"

    delete_response = await client.delete(
        f"/api/v1/projects/{project['id']}",
        headers={"X-Session-Id": "alpha"},
    )
    assert delete_response.status_code == 204
    assert fake_supabase.tables["project"] == []
    assert fake_supabase.tables["project_member"] == []


@pytest.mark.asyncio
async def test_update_and_delete_project_require_approver(
    client: AsyncClient,
    fake_supabase: FakeSupabase,
):
    project = fake_supabase.insert_row("project", {"name": "Alpha", "description": "A"})
    fake_supabase.insert_row(
        "project_member",
        {
            "project_id": project["id"],
            "session_id": "beta",
            "role": "member",
            "can_approve": False,
            "can_edit": True,
        },
    )

    patch_response = await client.patch(
        f"/api/v1/projects/{project['id']}",
        headers={"X-Session-Id": "beta"},
        json={"name": "Blocked Rename"},
    )
    assert patch_response.status_code == 403

    delete_response = await client.delete(
        f"/api/v1/projects/{project['id']}",
        headers={"X-Session-Id": "beta"},
    )
    assert delete_response.status_code == 403


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
    assert fake_queue_producer.enqueued_runs == [
        {"run_id": fake_supabase.tables["agent_run"][0]["id"], "delay_seconds": 8}
    ]

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
async def test_filler_message_is_persisted_without_triggering_agents(
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
        json={"content": "the"},
    )

    assert post_message.status_code == 201
    assert len(fake_supabase.tables["chat_message"]) == 1
    assert fake_supabase.tables["agent_run"] == []
    assert fake_queue_producer.enqueued_runs == []


@pytest.mark.asyncio
async def test_non_english_message_still_triggers_agents_when_not_obvious_filler(
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
        json={"content": "可以"},
    )

    assert post_message.status_code == 201
    assert len(fake_supabase.tables["agent_run"]) == 1
    assert fake_queue_producer.enqueued_runs == [
        {"run_id": fake_supabase.tables["agent_run"][0]["id"], "delay_seconds": 8}
    ]


@pytest.mark.asyncio
async def test_finalize_and_list_uploaded_files(
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

    upload_url = await client.get(
        f"/api/v1/projects/{project['id']}/files/upload-url",
        headers={"X-Session-Id": "alpha"},
        params={"filename": "brief.pdf", "mime_type": "application/pdf"},
    )
    assert upload_url.status_code == 200
    upload_data = upload_url.json()["data"]

    finalize_upload = await client.post(
        f"/api/v1/projects/{project['id']}/files",
        headers={"X-Session-Id": "alpha"},
        json={
            "filename": "brief.pdf",
            "mime_type": "application/pdf",
            "storage_path": upload_data["storage_path"],
            "size_bytes": 2048,
        },
    )

    assert finalize_upload.status_code == 201
    uploaded = finalize_upload.json()["data"]
    assert uploaded["filename"] == "brief.pdf"
    assert uploaded["size_bytes"] == 2048
    assert len(fake_supabase.tables["agent_run"]) == 1
    assert fake_supabase.tables["agent_run"][0]["new_file_ids"] == [uploaded["id"]]
    assert fake_queue_producer.enqueued_run_ids == [fake_supabase.tables["agent_run"][0]["id"]]

    files_response = await client.get(
        f"/api/v1/projects/{project['id']}/files",
        headers={"X-Session-Id": "alpha"},
    )
    assert files_response.status_code == 200
    assert files_response.json()["data"] == [uploaded]


@pytest.mark.asyncio
async def test_file_finalization_rejects_storage_path_outside_project_scope(
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

    response = await client.post(
        f"/api/v1/projects/{project['id']}/files",
        headers={"X-Session-Id": "alpha"},
        json={
            "filename": "brief.pdf",
            "mime_type": "application/pdf",
            "storage_path": f"other-project/alpha/{uuid4()}-brief.pdf",
            "size_bytes": 2048,
        },
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_activity_endpoints_return_latest_artifacts_and_latest_proposal(
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

    older_run = fake_supabase.insert_row(
        "agent_run",
        {"project_id": project["id"], "triggered_by": "alpha", "status": "completed"},
    )
    latest_run = fake_supabase.insert_row(
        "agent_run",
        {"project_id": project["id"], "triggered_by": "alpha", "status": "completed"},
    )
    fake_supabase.insert_row(
        "agent_artifact",
        {
            "run_id": older_run["id"],
            "project_id": project["id"],
            "agent": "planner",
            "payload": {"summary": "old summary", "changes": []},
            "created_at": "2026-06-16T10:00:00+00:00",
        },
    )
    latest_planner_artifact = fake_supabase.insert_row(
        "agent_artifact",
        {
            "run_id": latest_run["id"],
            "project_id": project["id"],
            "agent": "planner",
            "payload": {"summary": "latest summary", "changes": [{"id": "chg-1"}]},
            "created_at": "2026-06-16T11:00:00+00:00",
        },
    )
    latest_analyzer_artifact = fake_supabase.insert_row(
        "agent_artifact",
        {
            "run_id": latest_run["id"],
            "project_id": project["id"],
            "agent": "analyzer",
            "payload": {
                "gaps": [
                    {
                        "title": "Owner missing",
                        "detail": "Assign an owner",
                        "severity": "major",
                    }
                ]
            },
            "created_at": "2026-06-16T11:01:00+00:00",
        },
    )
    older_proposal = fake_supabase.insert_row(
        "plan_proposal",
        {
            "project_id": project["id"],
            "status": "superseded",
            "changes": [{"id": "old"}],
            "created_at": "2026-06-16T10:00:00+00:00",
        },
    )
    latest_proposal = fake_supabase.insert_row(
        "plan_proposal",
        {
            "project_id": project["id"],
            "status": "pending",
            "changes": [{"id": "new"}],
            "created_at": "2026-06-16T11:05:00+00:00",
        },
    )

    artifacts_response = await client.get(
        f"/api/v1/projects/{project['id']}/agents/artifacts/latest",
        headers={"X-Session-Id": "alpha"},
    )
    assert artifacts_response.status_code == 200
    artifacts = artifacts_response.json()["data"]
    assert [artifact["id"] for artifact in artifacts] == [
        latest_analyzer_artifact["id"],
        latest_planner_artifact["id"],
    ]

    latest_proposal_response = await client.get(
        f"/api/v1/projects/{project['id']}/plan/proposals/latest",
        headers={"X-Session-Id": "alpha"},
    )
    assert latest_proposal_response.status_code == 200
    assert latest_proposal_response.json()["data"]["id"] == latest_proposal["id"]
    assert latest_proposal_response.json()["data"]["status"] == "pending"
    assert older_proposal["id"] != latest_proposal["id"]


@pytest.mark.asyncio
async def test_agent_activity_endpoint_and_promote_actions(
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
    latest_run = fake_supabase.insert_row(
        "agent_run",
        {"project_id": project["id"], "triggered_by": "alpha", "status": "completed"},
    )
    planner_artifact = fake_supabase.insert_row(
        "agent_artifact",
        {
            "run_id": latest_run["id"],
            "project_id": project["id"],
            "agent": "planner",
            "payload": {
                "summary": "Planner finished a draft.",
                "changes": [
                    {
                        "id": "chg-1",
                        "action": "add",
                        "section": "phases",
                        "content": [{"title": "Discovery"}],
                        "justification": "Need a first phase.",
                        "source_message_ids": ["m1"],
                        "confidence": "medium",
                    },
                    {
                        "id": "chg-2",
                        "action": "update",
                        "section": "description",
                        "content": "Updated description",
                        "justification": "Clarify scope.",
                        "source_message_ids": ["m1"],
                        "confidence": "medium",
                    },
                ],
            },
        },
    )

    activity_response = await client.get(
        f"/api/v1/projects/{project['id']}/agents/activity",
        headers={"X-Session-Id": "alpha"},
    )
    assert activity_response.status_code == 200
    activity_items = activity_response.json()["data"]
    proposal_items = [item for item in activity_items if item["kind"] == "proposal_change"]
    assert len(proposal_items) == 2
    assert proposal_items[0]["actionable"] is True
    assert proposal_items[0]["proposal_change"]["id"] == "chg-1"
    assert any(item["id"] == f"planner-summary:{planner_artifact['id']}" for item in activity_items)

    promote_one = await client.post(
        f"/api/v1/projects/{project['id']}/agents/activity/planner-change:{planner_artifact['id']}:chg-1/promote",
        headers={"X-Session-Id": "alpha"},
    )
    assert promote_one.status_code == 200
    assert promote_one.json()["data"]["change_ids"] == ["chg-1"]
    pending_proposal = fake_supabase.tables["plan_proposal"][0]
    assert [change["id"] for change in pending_proposal["changes"]] == ["chg-1"]

    promote_all = await client.post(
        f"/api/v1/projects/{project['id']}/agents/activity/promote-all",
        headers={"X-Session-Id": "alpha"},
    )
    assert promote_all.status_code == 200
    assert promote_all.json()["data"]["change_ids"] == ["chg-2"]
    assert [change["id"] for change in fake_supabase.tables["plan_proposal"][0]["changes"]] == [
        "chg-1",
        "chg-2",
    ]


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
async def test_create_and_accept_project_invitation(
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

    create_invitation = await client.post(
        f"/api/v1/projects/{project['id']}/member-invitations",
        headers={"X-Session-Id": "alpha"},
        json={
            "invitee_name": "Beta User",
            "invitee_email": "beta@example.com",
            "role": "member",
            "can_approve": False,
            "can_edit": True,
        },
    )

    assert create_invitation.status_code == 201
    token = create_invitation.json()["data"]["token"]
    assert token

    accept_invitation = await client.post(
        f"/api/v1/member-invitations/{token}/accept",
        headers={"X-Session-Id": "beta"},
    )

    assert accept_invitation.status_code == 200
    accepted = accept_invitation.json()["data"]
    assert accepted["project_id"] == project["id"]
    assert accepted["member"]["session_id"] == "beta"
    assert accepted["member"]["can_edit"] is True
    assert fake_supabase.tables["project_invitation"][0]["redeemed_by_session_id"] == "beta"


@pytest.mark.asyncio
async def test_redeemed_invitation_cannot_be_used_by_another_session(
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
    invitation = fake_supabase.insert_row(
        "project_invitation",
        {
            "project_id": project["id"],
            "token": "invite-token",
            "invitee_name": "Beta User",
            "invitee_email": "beta@example.com",
            "role": "member",
            "can_approve": False,
            "can_edit": False,
            "created_by_session_id": "alpha",
            "redeemed_at": _iso_now(),
            "redeemed_by_session_id": "beta",
        },
    )
    fake_supabase.insert_row(
        "project_member",
        {
            "project_id": project["id"],
            "session_id": "beta",
            "role": "member",
            "can_approve": False,
            "can_edit": False,
        },
    )

    response = await client.post(
        f"/api/v1/member-invitations/{invitation['token']}/accept",
        headers={"X-Session-Id": "gamma"},
    )

    assert response.status_code == 409


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
    assert len(fake_supabase.tables["agent_run"]) == 2
    assert fake_supabase.tables["agent_run"][0]["id"] == active_run["id"]
    follow_up_run = fake_supabase.tables["agent_run"][1]
    assert follow_up_run["status"] == "queued"
    assert first_message.json()["data"]["id"] in follow_up_run["new_message_ids"]
    assert fake_queue_producer.enqueued_run_ids == [follow_up_run["id"]]


@pytest.mark.asyncio
async def test_get_plan_returns_enriched_shape_without_breaking_legacy_fields(
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
            "content": {
                "title": "Runway Q3 Launch",
                "description": "AI-generated plan",
                "objectives": ["Reduce churn"],
                "stakeholders": [
                    {
                        "user_id": "u1",
                        "name": "Jan Doe",
                        "role": "Tech Lead",
                        "initials": "JD",
                    }
                ],
                "phases": [
                    {
                        "id": "phase-1",
                        "title": "Phase 1",
                        "goal": "Ship foundation",
                        "timeframe": "Day 1-2",
                        "tasks": [],
                        "gaps": [],
                    }
                ],
                "global_risks": [],
            },
            "version": 3,
            "finalized_at": _iso_now(),
        },
    )

    response = await client.get(
        f"/api/v1/projects/{project['id']}/plan",
        headers={"X-Session-Id": "alpha"},
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["content"]["title"] == "Runway Q3 Launch"
    assert payload["version"] == 3
    assert payload["title"] == "Runway Q3 Launch"
    assert payload["objectives"] == ["Reduce churn"]
    assert payload["phases"][0]["id"] == "phase-1"
    assert payload["global_risks"] == []


@pytest.mark.asyncio
async def test_manual_plan_mutations_create_versions_and_surface_conflicts(
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
            "content": {
                "title": "Initial",
                "description": "Draft",
                "objectives": [],
                "stakeholders": [],
                "phases": [
                    {
                        "id": "phase-1",
                        "title": "Phase 1",
                        "goal": "Ship",
                        "timeframe": "Week 1",
                        "tasks": [
                            {
                                "id": "task-1",
                                "title": "Existing task",
                                "priority": "medium",
                                "attachments": [],
                                "acceptance_criteria": [],
                            }
                        ],
                        "gaps": [],
                    }
                ],
                "global_risks": [],
            },
            "version": 1,
            "finalized_at": _iso_now(),
        },
    )
    fake_supabase.insert_row(
        "plan_proposal",
        {
            "project_id": project["id"],
            "status": "pending",
            "changes": [
                {
                    "id": "chg-task-1",
                    "action": "update",
                    "section": "tasks",
                    "targetId": "task-1",
                    "title": "Raise priority",
                    "detail": "Needs urgent follow-up",
                    "sourceQuote": "please prioritize this",
                }
            ],
        },
    )

    patch_meta = await client.patch(
        f"/api/v1/projects/{project['id']}/plan",
        headers={"X-Session-Id": "alpha"},
        json={
            "title": "Updated title",
            "description": "Updated description",
            "objectives": ["Ship MVP"],
            "stakeholders": [
                {
                    "user_id": "u1",
                    "name": "Jan Doe",
                    "role": "Tech Lead",
                    "initials": "JD",
                }
            ],
        },
    )

    assert patch_meta.status_code == 200
    assert patch_meta.json()["data"]["title"] == "Updated title"
    assert patch_meta.json()["meta"]["conflicts"] == []

    patch_task = await client.patch(
        f"/api/v1/projects/{project['id']}/plan/phases/phase-1/tasks/task-1",
        headers={"X-Session-Id": "alpha"},
        json={"priority": "high"},
    )

    assert patch_task.status_code == 200
    assert patch_task.json()["data"]["priority"] == "high"
    assert patch_task.json()["meta"]["conflicts"] == ["chg-task-1"]

    versions = await client.get(
        f"/api/v1/projects/{project['id']}/plan/versions",
        headers={"X-Session-Id": "alpha"},
    )

    assert versions.status_code == 200
    version_items = versions.json()["data"]
    assert version_items[0]["status"] == "current"
    assert version_items[0]["version"] == 3
    assert version_items[1]["status"] == "archived"
    assert version_items[1]["version"] == 2
    assert version_items[2]["version"] == 1


@pytest.mark.asyncio
async def test_phase_task_attachment_and_delete_phase_guards(
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
    uploaded_file = fake_supabase.insert_row(
        "uploaded_file",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "filename": "brief.pdf",
            "mime_type": "application/pdf",
            "storage_path": f"{project['id']}/alpha/brief.pdf",
            "size_bytes": 2048,
        },
    )

    create_phase = await client.post(
        f"/api/v1/projects/{project['id']}/plan/phases",
        headers={"X-Session-Id": "alpha"},
        json={"title": "Phase 1", "goal": "Ship", "timeframe": "Week 1"},
    )
    assert create_phase.status_code == 201
    phase_id = create_phase.json()["data"]["id"]

    create_task = await client.post(
        f"/api/v1/projects/{project['id']}/plan/phases/{phase_id}/tasks",
        headers={"X-Session-Id": "alpha"},
        json={
            "title": "Write API tests",
            "owner": "@jan",
            "due": "2026-06-20",
            "priority": "high",
            "description": "Cover critical plan flows",
            "acceptance_criteria": ["Tests fail first", "Tests pass second"],
        },
    )
    assert create_task.status_code == 201
    task_id = create_task.json()["data"]["id"]

    attach_file = await client.post(
        f"/api/v1/projects/{project['id']}/plan/phases/{phase_id}/tasks/{task_id}/attachments",
        headers={"X-Session-Id": "alpha"},
        json={"uploaded_file_id": uploaded_file["id"]},
    )

    assert attach_file.status_code == 201
    attachment = attach_file.json()["data"]
    assert attachment["uploaded_file_id"] == uploaded_file["id"]
    assert attachment["filename"] == "brief.pdf"

    blocked_delete = await client.delete(
        f"/api/v1/projects/{project['id']}/plan/phases/{phase_id}",
        headers={"X-Session-Id": "alpha"},
    )
    assert blocked_delete.status_code == 400
    assert blocked_delete.json()["error"]["detail"]["task_count"] == 1

    force_delete = await client.delete(
        f"/api/v1/projects/{project['id']}/plan/phases/{phase_id}",
        headers={"X-Session-Id": "alpha"},
        params={"force": "true"},
    )
    assert force_delete.status_code == 200
    assert force_delete.json()["data"]["id"] == phase_id


@pytest.mark.asyncio
async def test_change_level_accept_reject_and_stale_guard_are_backward_compatible(
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
            "content": {
                "title": "Initial",
                "description": "Draft",
                "objectives": [],
                "stakeholders": [],
                "phases": [
                    {
                        "id": "phase-1",
                        "title": "Phase 1",
                        "goal": "Ship",
                        "timeframe": "Week 1",
                        "tasks": [],
                        "gaps": [],
                    }
                ],
                "global_risks": [],
            },
            "version": 1,
            "finalized_at": _iso_now(),
        },
    )
    proposal = fake_supabase.insert_row(
        "plan_proposal",
        {
            "project_id": project["id"],
            "status": "pending",
            "changes": [
                {
                    "id": "chg-add-task",
                    "action": "add",
                    "section": "tasks",
                    "targetId": "phase-1",
                    "title": "Add QA task",
                    "detail": "Need QA coverage",
                    "content": [
                        {
                            "id": "task-qa",
                            "title": "Add QA owner",
                            "priority": "high",
                            "attachments": [],
                            "acceptance_criteria": [],
                        }
                    ],
                    "sourceQuote": "we need a QA owner",
                },
                {
                    "id": "chg-stale-task",
                    "action": "update",
                    "section": "tasks",
                    "targetId": "missing-task",
                    "title": "Stale task",
                    "detail": "This target was removed manually",
                    "content": {"priority": "critical"},
                    "sourceQuote": "raise the priority",
                },
            ],
        },
    )

    accept_one = await client.patch(
        f"/api/v1/projects/{project['id']}/plan/proposal/changes/chg-add-task/accept",
        headers={"X-Session-Id": "alpha"},
    )

    assert accept_one.status_code == 200
    assert accept_one.json()["data"]["version"] == 2
    assert accept_one.json()["data"]["phases"][0]["tasks"][0]["id"] == "task-qa"

    approve_stale = await client.post(
        f"/api/v1/projects/{project['id']}/plan/approve",
        headers={"X-Session-Id": "alpha"},
        json={"change_ids": ["chg-stale-task"]},
    )

    assert approve_stale.status_code == 200
    assert approve_stale.json()["data"]["version"] == 3
    latest_proposal = next(
        row for row in fake_supabase.tables["plan_proposal"] if row["id"] == proposal["id"]
    )
    assert latest_proposal["status"] == "applied"
    assert latest_proposal["changes"][0]["id"] == "chg-stale-task"
    assert latest_proposal["changes"][0]["state"] == "stale"

    rejected_proposal = fake_supabase.insert_row(
        "plan_proposal",
        {
            "project_id": project["id"],
            "status": "pending",
            "changes": [
                {
                    "id": "chg-reject",
                    "action": "add",
                    "section": "risks",
                    "targetId": "root",
                    "title": "Add risk",
                    "detail": "Need a fallback plan",
                    "content": [{"id": "risk-1", "description": "Fallback missing"}],
                    "sourceQuote": "add a fallback risk",
                }
            ],
        },
    )

    reject_one = await client.patch(
        f"/api/v1/projects/{project['id']}/plan/proposal/changes/chg-reject/reject",
        headers={"X-Session-Id": "alpha"},
    )

    assert reject_one.status_code == 200
    assert reject_one.json()["data"]["status"] == "rejected"
    latest_rejected = next(
        row for row in fake_supabase.tables["plan_proposal"] if row["id"] == rejected_proposal["id"]
    )
    assert latest_rejected["status"] == "rejected"

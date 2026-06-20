from __future__ import annotations

from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from test_phase2_api import FakeQueueProducer, FakeSupabase

from src.agents.queue import get_queue_producer
from src.main import app
from src.supabase_client import get_supabase_admin


@pytest.fixture
def fake_supabase() -> FakeSupabase:
    return FakeSupabase()


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
async def test_finalize_upload_and_list_files(
    client: AsyncClient,
    fake_supabase: FakeSupabase,
    fake_queue_producer: FakeQueueProducer,
) -> None:
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

    finalize_response = await client.post(
        f"/api/v1/projects/{project['id']}/files",
        headers={"X-Session-Id": "alpha"},
        json={
            "filename": "brief.pdf",
            "mime_type": "application/pdf",
            "storage_path": f"{project['id']}/alpha/{uuid4()}-brief.pdf",
            "size_bytes": 2048,
        },
    )

    assert finalize_response.status_code == 201
    uploaded = finalize_response.json()["data"]
    assert uploaded["filename"] == "brief.pdf"
    assert uploaded["size_bytes"] == 2048
    assert uploaded["purpose"] == "source"
    assert uploaded["is_ai_context"] is True
    assert fake_queue_producer.enqueued_run_ids == [fake_supabase.tables["agent_run"][0]["id"]]

    files_response = await client.get(
        f"/api/v1/projects/{project['id']}/files",
        headers={"X-Session-Id": "alpha"},
    )

    assert files_response.status_code == 200
    assert files_response.json()["data"] == [uploaded]


@pytest.mark.asyncio
async def test_finalize_upload_rejects_out_of_scope_storage_path(
    client: AsyncClient,
    fake_supabase: FakeSupabase,
) -> None:
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
async def test_chat_upload_requires_explicit_source_promotion_to_enqueue(
    client: AsyncClient,
    fake_supabase: FakeSupabase,
    fake_queue_producer: FakeQueueProducer,
) -> None:
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

    chat_upload = await client.post(
        f"/api/v1/projects/{project['id']}/files",
        headers={"X-Session-Id": "alpha"},
        json={
            "filename": "demo.mov",
            "mime_type": "video/quicktime",
            "storage_path": f"{project['id']}/alpha/{uuid4()}-demo.mov",
            "size_bytes": 8192,
            "purpose": "chat",
        },
    )

    assert chat_upload.status_code == 201
    uploaded = chat_upload.json()["data"]
    assert uploaded["is_ai_context"] is False
    assert fake_queue_producer.enqueued_run_ids == []

    promote_response = await client.post(
        f"/api/v1/projects/{project['id']}/files/{uploaded['id']}/add-to-sources",
        headers={"X-Session-Id": "alpha"},
    )

    assert promote_response.status_code == 200
    promoted = promote_response.json()["data"]
    assert promoted["purpose"] == "source"
    assert promoted["is_ai_context"] is True
    assert fake_queue_producer.enqueued_run_ids == []


@pytest.mark.asyncio
async def test_latest_activity_endpoints_return_latest_rows(
    client: AsyncClient,
    fake_supabase: FakeSupabase,
) -> None:
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
    fake_supabase.insert_row(
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

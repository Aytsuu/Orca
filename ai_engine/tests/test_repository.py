from __future__ import annotations

import pytest

from src.repository import (
    claim_agent_run,
    create_plan_proposal,
    get_project_ai_cursor,
    update_project_ai_cursor,
)


@pytest.mark.asyncio
async def test_claim_agent_run_transitions_only_queued_runs(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    queued = fake_supabase.insert_row(
        "agent_run",
        {"project_id": project["id"], "triggered_by": "alpha", "status": "queued"},
    )
    completed = fake_supabase.insert_row(
        "agent_run",
        {"project_id": project["id"], "triggered_by": "alpha", "status": "completed"},
    )

    claimed = await claim_agent_run(fake_supabase, queued["id"])
    not_claimed = await claim_agent_run(fake_supabase, completed["id"])

    assert claimed is not None
    assert claimed["status"] == "running"
    assert claimed["started_at"]
    assert not_claimed is None


@pytest.mark.asyncio
async def test_create_plan_proposal_appends_to_existing_pending_proposal(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    existing = fake_supabase.insert_row(
        "plan_proposal",
        {
            "project_id": project["id"],
            "status": "pending",
            "changes": [
                {
                    "id": "chg-1",
                    "section": "tasks",
                    "action": "add",
                    "content": [{"title": "Existing task"}],
                }
            ],
        },
    )

    created = await create_plan_proposal(
        fake_supabase,
        project_id=project["id"],
        changes=[
            {
                "id": "chg-2",
                "section": "tasks",
                "action": "add",
                "content": [{"title": "New task"}],
            }
        ],
    )

    assert created["id"] == existing["id"]
    assert created["status"] == "pending"
    assert [change["id"] for change in created["changes"]] == ["chg-1", "chg-2"]
    assert len(fake_supabase.tables["plan_proposal"]) == 1


@pytest.mark.asyncio
async def test_project_ai_cursor_reads_and_updates_last_processed_message_at(fake_supabase) -> None:
    project = fake_supabase.insert_row(
        "project",
        {"name": "Alpha", "last_processed_message_at": None},
    )

    assert await get_project_ai_cursor(fake_supabase, project["id"]) is None

    updated = await update_project_ai_cursor(
        fake_supabase,
        project_id=project["id"],
        last_processed_message_at="2026-06-29T10:00:00+00:00",
    )

    assert updated == "2026-06-29T10:00:00+00:00"
    assert await get_project_ai_cursor(fake_supabase, project["id"]) == "2026-06-29T10:00:00+00:00"

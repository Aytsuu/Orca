from __future__ import annotations

import pytest

from src.repository import claim_agent_run


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

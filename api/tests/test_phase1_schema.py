from __future__ import annotations

from pathlib import Path


def load_phase1_migration() -> str:
    migrations_dir = Path(__file__).resolve().parents[2] / "supabase" / "migrations"
    matches = sorted(migrations_dir.glob("*_phase_1_database_schema.sql"))

    assert matches, "Expected a Phase 1 migration file in supabase/migrations."

    return matches[-1].read_text(encoding="utf-8")


def load_phase3_migration() -> str:
    migrations_dir = Path(__file__).resolve().parents[2] / "supabase" / "migrations"
    matches = sorted(migrations_dir.glob("*_phase_3_ai_engine.sql"))

    assert matches, "Expected a Phase 3 migration file in supabase/migrations."

    return matches[-1].read_text(encoding="utf-8")


def test_phase1_migration_defines_required_tables() -> None:
    migration_sql = load_phase1_migration()

    expected_tables = {
        "project",
        "project_member",
        "chat_message",
        "uploaded_file",
        "agent_status",
        "plan_proposal",
        "project_plan",
        "plan_version",
    }

    for table_name in expected_tables:
        assert f"create table if not exists public.{table_name}" in migration_sql.lower()


def test_phase1_migration_wires_realtime_and_storage() -> None:
    migration_sql = load_phase1_migration().lower()

    for table_name in {
        "chat_message",
        "agent_status",
        "plan_proposal",
        "project_plan",
    }:
        assert f"alter publication supabase_realtime add table public.{table_name}" in migration_sql

    assert "insert into storage.buckets" in migration_sql
    assert "orca-uploads" in migration_sql


def test_phase1_migration_enables_row_level_security() -> None:
    migration_sql = load_phase1_migration().lower()

    for table_name in {
        "project",
        "project_member",
        "chat_message",
        "uploaded_file",
        "agent_status",
        "plan_proposal",
        "project_plan",
        "plan_version",
    }:
        assert f"alter table public.{table_name} enable row level security" in migration_sql


def test_phase3_migration_defines_required_tables() -> None:
    migration_sql = load_phase3_migration().lower()

    expected_tables = {
        "agent_run",
        "project_memory",
        "conversation_summary",
        "agent_artifact",
        "project_llm_usage",
    }

    for table_name in expected_tables:
        assert f"create table if not exists public.{table_name}" in migration_sql


def test_phase3_migration_extends_plan_proposal_status_and_realtime() -> None:
    migration_sql = load_phase3_migration().lower()

    assert (
        "alter type public.plan_proposal_status add value if not exists 'superseded'"
        in migration_sql
    )
    assert "alter publication supabase_realtime add table public.agent_artifact" in migration_sql


def test_phase3_migration_enables_row_level_security() -> None:
    migration_sql = load_phase3_migration().lower()

    for table_name in {
        "agent_run",
        "project_memory",
        "conversation_summary",
        "agent_artifact",
        "project_llm_usage",
    }:
        assert f"alter table public.{table_name} enable row level security" in migration_sql

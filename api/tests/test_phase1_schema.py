from __future__ import annotations

from pathlib import Path


def load_phase1_migration() -> str:
    migrations_dir = Path(__file__).resolve().parents[2] / "supabase" / "migrations"
    matches = sorted(migrations_dir.glob("*_phase_1_database_schema.sql"))

    assert matches, "Expected a Phase 1 migration file in supabase/migrations."

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

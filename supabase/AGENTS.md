# Agent Instructions — supabase/

This is the Supabase project directory containing database migrations, CLI configuration, and schema management files.

## Architecture Reference

Read these files before making any structural, migration, schema, or database configuration changes:

| Topic | File |
|---|---|
| Core Principles & Security | [`context-factory/baas/supabase/01-core-principles-and-security.md`](../context-factory/baas/supabase/01-core-principles-and-security.md) |
| Client Setup & Instantiation | [`context-factory/baas/supabase/02-client-setup.md`](../context-factory/baas/supabase/02-client-setup.md) |
| Database Schema & RLS | [`context-factory/baas/supabase/03-database-and-schema.md`](../context-factory/baas/supabase/03-database-and-schema.md) |
| Storage & Buckets | [`context-factory/baas/supabase/04-storage.md`](../context-factory/baas/supabase/04-storage.md) |
| CLI Commands & MCP | [`context-factory/baas/supabase/05-cli-and-mcp.md`](../context-factory/baas/supabase/05-cli-and-mcp.md) |
| Postgres Best Practices | [`context-factory/baas/supabase/06-postgres-best-practices.md`](../context-factory/baas/supabase/06-postgres-best-practices.md) |
| Anti-Patterns (Refuse to generate) | [`context-factory/baas/supabase/07-anti-patterns.md`](../context-factory/baas/supabase/07-anti-patterns.md) |
| Quick Reference | [`context-factory/baas/supabase/08-quick-reference.md`](../context-factory/baas/supabase/08-quick-reference.md) |

## Non-Negotiable Rules

- **Strict Key Separation:** Never expose the `service_role` key in public clients or `PUBLIC_` env vars. Service key access is reserved strictly for `ai_engine`.
- **Enable RLS Everywhere:** Every table created in any exposed schema must have RLS enabled.
- **Hackathon Session Authentication:** Access control currently checks `session_id` via the `X-Session-Id` header rather than `auth.uid()`.
- **Views Require Invoker Security:** Always use `WITH (security_invoker = true)` on `CREATE VIEW` statements (Postgres 15+) so they respect underlying RLS policies.
- **UPDATE Pairings:** An UPDATE policy must always be paired with a SELECT policy. Otherwise, updates silently succeed but return 0 rows.
- **No `apply_migration` for Iteration:** Do not iterate on database changes using `apply_migration`. Run raw queries via `execute_sql` (MCP) or `supabase db query` (CLI), then create migrations.
- **Migration File Creation:** Always generate migration files using CLI: `supabase migration new <descriptive_name>`. Do not write filenames manually.
- **Realtime Cleanup:** Always unsubscribe from Realtime channels on component unmount or cleanup.

## Stack & Environment Configuration

- **CLI Tooling:** Supabase CLI v2.x
- **Realtime Publication Tables:** `chat_message`, `agent_status`, `plan_proposal`, `project_plan`, `agent_artifact`
- **Authorized Service Key Location:** `ai_engine/src/config.py` (referenced as `SUPABASE_SERVICE_KEY`)

# FastAPI — Migrations (Alembic)
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

- Migrations must be static and reversible.
- Use the async template: `alembic init -t async migrations`
- Descriptive filenames:
  ```ini
  # alembic.ini
  file_template = %%(year)d-%%(month).2d-%%(day).2d_%%(slug)s
  ```
  → `2026-04-14_add_post_content_idx.py`

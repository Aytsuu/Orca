# FastAPI — Linting
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

```shell
ruff check --fix src
ruff format src
```

Add to a pre-commit hook or run in CI. Ruff replaces black + isort + autoflake + most of flake8.

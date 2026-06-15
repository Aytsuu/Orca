# Orca AI Engine

Monorepo package for the Orca agent pipeline.

This app is intentionally separate from `backend/` so the API layer and the
agent execution layer can evolve independently while staying in one repository.

## Scope

`ai_engine` will own:

- agent implementations (`monitor`, `analyzer`, `planner`, `updater`)
- queue and pipeline orchestration
- prompt templates and model-facing logic
- proposal generation and plan update workflows

`backend` should remain responsible for:

- HTTP APIs
- request validation
- session handling
- persistence entrypoints
- enqueueing agent work

## Local setup

```powershell
cd ai_engine
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e .[dev]
```

## Package layout

```text
src/
  agents/
  config.py
  llm/
  pipelines/
  prompts/
  tasks/
```

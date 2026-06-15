# Orca Backend

Minimal FastAPI scaffold for the Orca implementation plan.

## Requirements

- Python `3.11+`
- A virtual environment

## Local setup

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e .[dev]
uvicorn src.main:app --reload --host 127.0.0.1 --port 8000
```

The app exposes:

- `GET /health`
- OpenAPI docs at `/docs` when `APP_ENV=local` or `APP_ENV=staging`

## Environment

Copy `.env.example` to `.env` and fill in the Supabase values for your project.


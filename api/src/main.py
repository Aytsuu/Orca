from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import get_settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


settings = get_settings()

app = FastAPI(
    title="Orca Backend",
    version="0.1.0",
    lifespan=lifespan,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "status": "ok",
        "environment": settings.app_env,
        "supabaseConfigured": bool(settings.supabase_url and settings.supabase_client_key),
    }


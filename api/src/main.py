from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.agents.router import router as agents_router
from src.chat.router import router as chat_router
from src.config import get_settings
from src.exceptions import AppException
from src.invitations.router import router as invitations_router
from src.members.router import router as members_router
from src.models import ErrorBody, ErrorEnvelope
from src.plans.router import router as plans_router
from src.projects.router import router as projects_router


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


@app.exception_handler(AppException)
async def app_exception_handler(_: object, exc: AppException) -> JSONResponse:
    payload = ErrorEnvelope(
        error=ErrorBody(
            code=exc.error_code,
            message=exc.message,
            detail=exc.extra_detail,
        )
    )
    return JSONResponse(status_code=exc.status_code, content=payload.model_dump(mode="json"))


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "status": "ok",
        "environment": settings.app_env,
        "supabaseConfigured": bool(settings.supabase_url and settings.supabase_client_key),
    }


app.include_router(projects_router, prefix="/api/v1/projects")
app.include_router(chat_router, prefix="/api/v1/projects")
app.include_router(members_router, prefix="/api/v1/projects")
app.include_router(plans_router, prefix="/api/v1/projects")
app.include_router(agents_router, prefix="/api/v1/projects")
app.include_router(invitations_router, prefix="/api/v1")

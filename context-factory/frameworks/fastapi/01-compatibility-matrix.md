# FastAPI — Compatibility Matrix
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

Pin to these versions or newer. Examples in this file assume them.

| Dependency        | Minimum   | Notes                                                |
|-------------------|-----------|------------------------------------------------------|
| Python            | 3.11      | Required for `StrEnum` and `X \| Y` union syntax     |
| FastAPI           | 0.115     | `Annotated[T, Depends(...)]` is the idiomatic form   |
| Pydantic          | 2.7       | v1 APIs (`json_encoders`, `.dict()`) are removed     |
| pydantic-settings | 2.4       | Lives in a separate package since Pydantic v2        |
| SQLAlchemy        | 2.0       | Use the async API (`AsyncSession`, `async_sessionmaker`) |
| Alembic           | 1.13      | Async-aware migrations                               |
| httpx             | 0.27      | Use `ASGITransport` for in-process tests             |
| PyJWT             | 2.9       | Use this, not the unmaintained `python-jose`         |
| ruff              | 0.6       | Replaces black, isort, autoflake                     |

# FastAPI — Quick Reference
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

| Scenario                             | Solution                                          |
|--------------------------------------|---------------------------------------------------|
| Non-blocking I/O                     | `async def` route with `await`                    |
| Blocking I/O (no async client)       | `def` route (sync, runs in threadpool)            |
| Sync library inside async route      | `await run_in_threadpool(fn, *args)`              |
| CPU-intensive work                   | Celery / Arq / RQ worker process                  |
| Request validation against DB        | Dependency that loads + validates + returns       |
| Reuse validation across routes       | Chain dependencies                                |
| Inject dependency in modern style    | `Annotated[T, Depends(...)]`                      |
| Per-request dep caching              | Default behavior — same `Depends(x)` runs once    |
| Per-domain config                    | One `BaseSettings` subclass per domain            |
| Custom datetime serialization        | `@field_serializer`                               |
| Fire-and-forget short task           | `BackgroundTasks`                                 |
| Reliable / scheduled / heavy task    | Celery / Arq / RQ                                 |
| JWT decode                           | `PyJWT` (`import jwt`)                            |
| Async DB                             | SQLAlchemy 2.0 async (`AsyncSession`)             |
| HTTP test client                     | `httpx.AsyncClient` + `ASGITransport`             |
| Swap dep in tests                    | `app.dependency_overrides[dep] = fake`            |
| Lint + format                        | `ruff check --fix` + `ruff format`                |

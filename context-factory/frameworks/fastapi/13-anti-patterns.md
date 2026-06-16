# FastAPI — Anti-Patterns
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

If you're an agent reviewing a diff, check for these. Each is a real failure mode.

| Anti-pattern | Why it's wrong | Fix |
|---|---|---|
| `requests.get(...)` inside `async def` | Blocks the event loop. `requests` is sync. | Use `httpx.AsyncClient` or `await run_in_threadpool(requests.get, ...)`. |
| `time.sleep` / `open()` / sync DB driver inside `async def` | Same — blocks the loop. | Use the async equivalent (`asyncio.sleep`, `aiofiles`, async driver). |
| `from jose import jwt` | `python-jose` is unmaintained. | `import jwt` (PyJWT). |
| `from async_asgi_testclient import TestClient` | Unmaintained. | `httpx.AsyncClient` + `ASGITransport`. |
| `model_config = ConfigDict(json_encoders={...})` | Deprecated in Pydantic v2. | `@field_serializer` or `Annotated[T, PlainSerializer(...)]`. |
| `Field(ge=18, default=None)` | Constraint contradicts the default. | Pick required or optional, not both. |
| `def get_user(id: int = Depends(...))` (default-arg form) | Legacy; gotchas with default values. | `user: Annotated[User, Depends(...)]`. |
| Catching `Exception` around a route's body | Hides bugs and turns 500s into silent 200s. | Catch the specific exception class; raise `HTTPException` with a meaningful status. |
| `BackgroundTasks` for anything you'd page on | No retry, dies with the worker. | Use Celery / Arq / RQ. |
| Calling a sync ORM session inside `async def` | Blocks the loop, may deadlock the pool. | Use `AsyncSession`. |
| Returning a Pydantic model and *also* setting `response_model=` to that same class | Model gets constructed twice (validate + serialize). | Either return a `dict`/ORM row and let `response_model` validate, or drop `response_model` and trust the return type. |
| Importing across domains via deep paths (`from src.auth.service.user import ...`) | Tight coupling, hard to refactor. | `from src.auth import service as auth_service`. |
| Reusing one `BaseSettings` for the whole app | Hard to reason about, every domain reads every var. | One `BaseSettings` per domain. |
| Mocking the database in integration tests | Mock/prod divergence eventually fires in prod. | Use a real DB (testcontainers, ephemeral schema) and `dependency_overrides` for auth/external services. |

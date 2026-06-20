# FastAPI — Async Routes
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

## Decision Rule

| Route does this                        | Use         |
|----------------------------------------|-------------|
| `await`-able non-blocking I/O          | `async def` |
| Blocking I/O (no async client exists)  | `def` (sync, runs in threadpool) |
| Mix of both                            | `async def` + `run_in_threadpool` for the blocking part |
| CPU-bound work (>50 ms compute)        | Offload to a worker process (Celery / RQ / Arq) |

## Do / Don't

```python
# DON'T — blocking call inside async route freezes the entire event loop
@router.get("/bad")
async def bad():
    time.sleep(10)            # blocks every request on this worker
    return {"ok": True}

# DO — sync route lets FastAPI run it in a threadpool
@router.get("/sync-ok")
def sync_ok():
    time.sleep(10)            # blocks one threadpool worker, not the loop
    return {"ok": True}

# DO — async route with awaitable sleep
@router.get("/async-ok")
async def async_ok():
    await asyncio.sleep(10)   # yields control, loop keeps serving requests
    return {"ok": True}

# DO — async route that has to call a sync library
from fastapi.concurrency import run_in_threadpool

@router.get("/wrap")
async def wrap():
    result = await run_in_threadpool(legacy_sync_client.fetch, "id")
    return result
```

## Threadpool Caveats

- Default Starlette threadpool size is 40. Saturating it slows every sync route.
- Threads cost more than coroutines. Don't use sync routes "just because."

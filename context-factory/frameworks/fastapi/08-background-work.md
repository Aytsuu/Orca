# FastAPI — Background Work
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

## BackgroundTasks vs Worker Queue

| Use BackgroundTasks when…                | Use Celery / Arq / RQ when…                |
|------------------------------------------|---------------------------------------------|
| Task is < 1 second                       | Task takes seconds to minutes              |
| Failure can be silently dropped          | You need retries, dead-letter, or visibility|
| Task is in-process (send email, log row) | Task is CPU-heavy or needs a separate pool |
| You don't need scheduling                | You need cron, ETA, or rate limiting       |

```python
from fastapi import BackgroundTasks

@router.post("/signup")
async def signup(data: SignupIn, bg: BackgroundTasks):
    user = await service.create_user(data)
    bg.add_task(send_welcome_email, user.email)   # fire-and-forget, in-process
    return user
```

> BackgroundTasks run **after the response is sent, in the same worker process**. If the worker dies, the task is lost. There is no retry. Don't use them for anything you'd page on.

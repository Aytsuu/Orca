# FastAPI — Dependencies
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

## Use Annotated, Not Default-Arg `Depends(...)`

`Annotated[T, Depends(...)]` is the idiomatic form since FastAPI 0.95 and avoids gotchas with default values.

```python
# DO — modern Annotated form
from typing import Annotated
from fastapi import Depends

PostDep = Annotated[dict, Depends(valid_post_id)]

@router.get("/posts/{post_id}")
async def get_post(post: PostDep):
    return post

# Avoid — default-argument form (still works, but legacy)
@router.get("/posts/{post_id}")
async def get_post(post: dict = Depends(valid_post_id)):
    return post
```

## Validate Inside Dependencies (Not Just Inject)

```python
async def valid_post_id(post_id: UUID4) -> dict:
    post = await service.get_by_id(post_id)
    if not post:
        raise PostNotFound()
    return post
```

## Chain Dependencies for Reuse

```python
async def valid_owned_post(
    post: Annotated[dict, Depends(valid_post_id)],
    token_data: Annotated[dict, Depends(parse_jwt_data)],
) -> dict:
    if post["creator_id"] != token_data["user_id"]:
        raise UserNotOwner()
    return post
```

## Rules

- Dependencies are **cached per request**. Same `Depends(x)` called 5 times in one request → `x` runs once.
- Prefer `async def` dependencies. Sync deps run in the threadpool — wasted overhead for small CPU-only checks.
- Use **the same path-variable name** across endpoints when you want to share a dependency (e.g. `profile_id` in both `/profiles/{profile_id}` and `/creators/{profile_id}`).

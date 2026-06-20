from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from uuid import uuid4


class ProjectLock(Protocol):
    async def release(self) -> None: ...


class ProjectLockManager(Protocol):
    async def acquire(self, project_id: str) -> ProjectLock | None: ...


@dataclass
class RedisProjectLock:
    redis: object
    key: str
    token: str

    async def release(self) -> None:
        current = await self.redis.get(self.key)
        if isinstance(current, bytes):
            current = current.decode()
        if current == self.token:
            await self.redis.delete(self.key)


class RedisProjectLockManager:
    def __init__(self, redis_url: str, *, ttl_seconds: int = 300) -> None:
        self._redis_url = redis_url
        self._ttl_seconds = ttl_seconds
        self._redis = None

    async def _client(self):
        if self._redis is None:
            from redis.asyncio import Redis

            self._redis = Redis.from_url(self._redis_url)
        return self._redis

    async def acquire(self, project_id: str) -> ProjectLock | None:
        redis = await self._client()
        key = f"pipeline_lock:{project_id}"
        token = str(uuid4())
        acquired = await redis.set(key, token, nx=True, ex=self._ttl_seconds)
        if not acquired:
            return None
        return RedisProjectLock(redis=redis, key=key, token=token)

from __future__ import annotations

import asyncio
import time


class RateLimiter:
    def __init__(self, rpm: int = 15) -> None:
        self._rpm = max(1, rpm)
        self._capacity = float(self._rpm)
        self._tokens = float(self._rpm)
        self._last_refill = time.monotonic()
        self._lock = asyncio.Lock()

    def _refill(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_refill
        self._last_refill = now
        refill_rate = self._rpm / 60
        self._tokens = min(self._capacity, self._tokens + (elapsed * refill_rate))

    async def acquire(self) -> None:
        async with self._lock:
            while True:
                self._refill()
                if self._tokens >= 1:
                    self._tokens -= 1
                    return
                deficit = 1 - self._tokens
                await asyncio.sleep(deficit / (self._rpm / 60))

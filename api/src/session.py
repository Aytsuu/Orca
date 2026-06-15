from __future__ import annotations

from typing import Annotated

from fastapi import Header


async def get_session_id(x_session_id: Annotated[str, Header(alias="X-Session-Id")]) -> str:
    return x_session_id.strip()

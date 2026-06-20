# FastAPI — Authentication (JWT)
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

Use **`PyJWT`**, not `python-jose` (unmaintained).

```python
import jwt  # PyJWT
from jwt.exceptions import InvalidTokenError

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    except InvalidTokenError as exc:
        raise InvalidCredentials() from exc
```

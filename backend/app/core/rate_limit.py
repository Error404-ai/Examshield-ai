"""
Rate limiting (in-memory sliding window, ASGI middleware)

- Authenticated requests are counted per user (JWT "sub"), everything else per IP.
  Counting per user matters for a college pilot: a whole lab sits behind one
  NAT address, so per-IP limits on exam traffic would lock out the room.
- Login/register are unauthenticated, so they are counted per IP. Keep those
  limits generous enough for a lab logging in at the same time.
- State lives in this process only. That is fine for a single Render instance;
  with several instances, move the counters to Redis.
"""

import time
from collections import defaultdict, deque
from typing import Deque, Dict, List, Tuple

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.security import SecurityUtils

# (method, path prefix, max requests, window in seconds) - first match wins
RULES: List[Tuple[str, str, int, int]] = [
    ("POST", "/api/auth/login", 30, 60),
    ("POST", "/api/auth/register", 10, 60),
    ("POST", "/api/admin/questions/generate", 10, 60),  # paid Gemini calls
    ("POST", "/api/student/sessions/submit", 10, 60),
]
DEFAULT_LIMIT: Tuple[int, int] = (240, 60)  # ~4 requests/second per user

EXEMPT_PATHS = {"/api/health", "/"}
SWEEP_EVERY = 500


def _client_id(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        payload = SecurityUtils.verify_token(auth[7:])
        if payload and payload.get("sub"):
            return f"u:{payload['sub']}"
    # Render sits behind a proxy, so the real client is the first X-Forwarded-For entry
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return f"ip:{forwarded.split(',')[0].strip()}"
    return f"ip:{request.client.host if request.client else 'unknown'}"


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, rules=RULES, default=DEFAULT_LIMIT, enabled: bool = True):
        super().__init__(app)
        self.rules = rules
        self.default = default
        self.enabled = enabled
        self.hits: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)
        self._requests_since_sweep = 0

    def _rule_for(self, method: str, path: str) -> Tuple[str, int, int]:
        for rule_method, prefix, limit, window in self.rules:
            if method == rule_method and path.startswith(prefix):
                return f"{rule_method}:{prefix}", limit, window
        return "default", self.default[0], self.default[1]

    def _sweep(self, now: float) -> None:
        stale = [k for k, q in self.hits.items() if not q or now - q[-1] > 120]
        for key in stale:
            del self.hits[key]

    async def dispatch(self, request: Request, call_next):
        # Preflight and health checks must never be throttled
        if not self.enabled or request.method == "OPTIONS" or request.url.path in EXEMPT_PATHS:
            return await call_next(request)

        rule_id, limit, window = self._rule_for(request.method, request.url.path)
        now = time.monotonic()
        queue = self.hits[(_client_id(request), rule_id)]

        while queue and now - queue[0] >= window:
            queue.popleft()

        if len(queue) >= limit:
            retry_after = max(1, int(window - (now - queue[0])) + 1)
            return JSONResponse(
                status_code=429,
                content={
                    "success": False,
                    "detail": "Too many requests. Please wait a moment and try again.",
                },
                headers={"Retry-After": str(retry_after)},
            )

        queue.append(now)

        self._requests_since_sweep += 1
        if self._requests_since_sweep >= SWEEP_EVERY:
            self._requests_since_sweep = 0
            self._sweep(now)

        return await call_next(request)
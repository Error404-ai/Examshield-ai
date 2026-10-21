import time

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.rate_limit import RateLimitMiddleware
from app.core.security import SecurityUtils


def make_client(rules, default=(1000, 60)):
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware, rules=rules, default=default)

    @app.post("/api/auth/login")
    async def login():
        return {"ok": True}

    @app.get("/api/health")
    async def health():
        return {"ok": True}

    @app.get("/api/thing")
    async def thing():
        return {"ok": True}

    return TestClient(app)


def bearer(user_id):
    return {"Authorization": f"Bearer {SecurityUtils.create_access_token({'sub': user_id})}"}


def test_blocks_after_limit_with_retry_after():
    c = make_client([("POST", "/api/auth/login", 3, 60)])
    assert [c.post("/api/auth/login").status_code for _ in range(3)] == [200, 200, 200]
    r = c.post("/api/auth/login")
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) >= 1
    assert "Too many requests" in r.json()["detail"]


def test_limit_applies_per_rule_only():
    c = make_client([("POST", "/api/auth/login", 1, 60)])
    c.post("/api/auth/login")
    assert c.post("/api/auth/login").status_code == 429
    assert c.get("/api/thing").status_code == 200


def test_health_is_never_limited():
    c = make_client([], default=(1, 60))
    assert all(c.get("/api/health").status_code == 200 for _ in range(5))


def test_preflight_is_not_counted():
    c = make_client([], default=(2, 60))
    for _ in range(10):
        assert c.options("/api/thing").status_code != 429
    assert c.get("/api/thing").status_code == 200


def test_authenticated_users_have_separate_buckets():
    c = make_client([], default=(2, 60))
    a, b = bearer("user-a"), bearer("user-b")
    assert [c.get("/api/thing", headers=a).status_code for _ in range(3)] == [200, 200, 429]
    # same IP, different user: not affected
    assert c.get("/api/thing", headers=b).status_code == 200


def test_window_expires():
    c = make_client([("POST", "/api/auth/login", 1, 1)])
    assert c.post("/api/auth/login").status_code == 200
    assert c.post("/api/auth/login").status_code == 429
    time.sleep(1.2)
    assert c.post("/api/auth/login").status_code == 200
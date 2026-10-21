"""
Shared fixtures. The API tests run the real FastAPI app against an in-memory
Mongo (mongomock-motor), so no Atlas connection is needed.
"""

import os

# Must be set before app.main is imported
os.environ["RATE_LIMIT_ENABLED"] = "false"

import pytest
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

from app.core.database import get_db
from app.main import app
from app.routes import auth as auth_routes


@pytest.fixture()
def db():
    return AsyncMongoMockClient()["examshield_test"]


@pytest.fixture()
def client(db, monkeypatch):
    app.dependency_overrides[get_db] = lambda: db
    monkeypatch.setattr(auth_routes, "ADMIN_EMAILS", {"admin@test.dev", "admin2@test.dev"})
    # base_url must be an allowed host or TrustedHostMiddleware answers 400.
    # No `with` block on purpose: it would run the lifespan and try to reach Atlas.
    yield TestClient(app, base_url="http://localhost")
    app.dependency_overrides.clear()


@pytest.fixture()
def make_user(client):
    def _make(email, name="Test User", password="secret123"):
        r = client.post(
            "/api/auth/register",
            json={"name": name, "email": email, "password": password, "confirm_password": password},
        )
        assert r.status_code == 200, r.text
        r = client.post("/api/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    return _make
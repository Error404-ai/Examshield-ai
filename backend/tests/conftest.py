"""Shared fixtures for API tests against an in-memory Mongo database."""

import os
from datetime import datetime
from types import SimpleNamespace

os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["JWT_SECRET_KEY"] = "examshield-test-secret-key-32-characters-long"
os.environ["DEBUG"] = "true"

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app.core.database import get_db
from app.core.security import SecurityUtils
from app.main import app


@pytest.fixture()
def db():
    return AsyncMongoMockClient()["examshield_test"]


@pytest.fixture()
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    try:
        # Avoid the lifespan: these tests don't need a real Atlas connection.
        yield TestClient(app, base_url="http://localhost")
    finally:
        app.dependency_overrides.clear()


@pytest.fixture()
def make_user(client):
    def _make(email, name="Test User", password="secret123"):
        response = client.post(
            "/api/auth/register",
            json={
                "name": name,
                "email": email,
                "password": password,
                "confirm_password": password,
            },
        )
        assert response.status_code == 200, response.text
        user_id = response.json()["user"]["id"]

        # Test helpers create trusted admin accounts directly, rather than
        # relying on email allowlisting during public registration.
        role = "admin" if email in {"admin@test.dev", "admin2@test.dev"} else "student"
        token = SecurityUtils.create_access_token(
            {"sub": user_id, "email": email, "role": role}
        )
        return {"Authorization": f"Bearer {token}"}

    return _make


@pytest.fixture()
async def http(db):
    app.dependency_overrides[get_db] = lambda: db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://localhost"
        ) as async_client:
            yield async_client
    finally:
        app.dependency_overrides.clear()


def alerts(count, severity="high"):
    now = datetime.utcnow().isoformat() + "Z"
    return [
        {
            "alert_type": "multiple_faces",
            "severity": severity,
            "description": "Multiple faces detected",
            "timestamp": now,
        }
        for _ in range(count)
    ]


@pytest.fixture()
async def world(db):
    admin_id, other_admin_id, student_id, student2_id, exam_id = (
        ObjectId() for _ in range(5)
    )
    await db.users.insert_many([
        {"_id": admin_id, "name": "Admin", "email": "admin@example.com", "role": "admin"},
        {"_id": other_admin_id, "name": "Other Admin", "email": "other@example.com", "role": "admin"},
        {"_id": student_id, "name": "Student", "email": "student@example.com", "role": "student"},
        {"_id": student2_id, "name": "Student 2", "email": "student2@example.com", "role": "student"},
    ])
    await db.exams.insert_one({
        "_id": exam_id,
        "created_by": str(admin_id),
        "title": "Integrity test exam",
    })

    def make_auth(user_id, email, role):
        token = SecurityUtils.create_access_token(
            {"sub": str(user_id), "email": email, "role": role}
        )
        return {"Authorization": f"Bearer {token}"}

    world = SimpleNamespace(
        admin=make_auth(admin_id, "admin@example.com", "admin"),
        other_admin=make_auth(other_admin_id, "other@example.com", "admin"),
        student=make_auth(student_id, "student@example.com", "student"),
        student2=make_auth(student2_id, "student2@example.com", "student"),
        exam_id=str(exam_id),
    )

    async def make_session(
        alert_list=None, status="submitted", student="student", integrity=None
    ):
        student_oid = student2_id if student == "student2" else student_id
        result = await db.sessions.insert_one({
            "exam_id": str(exam_id),
            "student_id": str(student_oid),
            "status": status,
            "proctoring_alerts": alert_list or [],
            "integrity": integrity or {"decision": None, "history": []},
        })
        return str(result.inserted_id)

    world.make_session = make_session
    return world

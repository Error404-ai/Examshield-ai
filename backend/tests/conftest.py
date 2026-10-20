"""
Shared fixtures. The routes run against an in-memory Mongo (mongomock-motor),
so no Atlas connection is needed. app.main is imported but its lifespan never
runs, because the client below doesn't use `with`.
"""

from datetime import datetime
from types import SimpleNamespace

import pytest
import pytest_asyncio
from bson import ObjectId
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app.core.database import get_db
from app.core.security import SecurityUtils
from app.main import app


def headers_for(user_id: str, role: str, email: str) -> dict:
    token = SecurityUtils.create_access_token({"sub": user_id, "email": email, "role": role})
    return {"Authorization": f"Bearer {token}"}


def alerts(n: int, severity: str = "critical") -> list:
    return [
        {
            "alert_type": "multiple_faces",
            "severity": severity,
            "description": "More than one person detected in the camera",
            "timestamp": "2026-01-01T10:00:00Z",
        }
        for _ in range(n)
    ]


@pytest.fixture
def db():
    database = AsyncMongoMockClient()["examshield_test"]
    app.dependency_overrides[get_db] = lambda: database
    yield database
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def http(db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost") as client:
        yield client


@pytest_asyncio.fixture
async def world(db):
    """Two admins, two students, one exam owned by the first admin"""
    ids = {name: str(ObjectId()) for name in ("admin", "other_admin", "student", "student2")}
    for name, uid in ids.items():
        await db.users.insert_one({
            "_id": ObjectId(uid),
            "name": name.replace("_", " ").title(),
            "email": f"{name}@example.com",
            "role": "admin" if "admin" in name else "student",
        })
    exam = await db.exams.insert_one({
        "title": "Data Structures Midterm",
        "created_by": ids["admin"],
        "is_published": True,
        "duration": 30,
    })
    exam_id = str(exam.inserted_id)

    async def make_session(student="student", status="submitted", alert_list=None, integrity=None, **extra):
        doc = {
            "exam_id": exam_id,
            "student_id": ids[student],
            "status": status,
            "started_at": datetime(2026, 1, 1, 10, 0),
            "submitted_at": datetime(2026, 1, 1, 10, 20),
            "percentage": 80.0,
            "proctoring_alerts": alert_list if alert_list is not None else [],
            "proctoring_counts": {},
            **extra,
        }
        if integrity is not None:
            doc["integrity"] = integrity
        result = await db.sessions.insert_one(doc)
        return str(result.inserted_id)

    return SimpleNamespace(
        ids=ids,
        exam_id=exam_id,
        make_session=make_session,
        admin=headers_for(ids["admin"], "admin", "admin@example.com"),
        other_admin=headers_for(ids["other_admin"], "admin", "other_admin@example.com"),
        student=headers_for(ids["student"], "student", "student@example.com"),
        student2=headers_for(ids["student2"], "student", "student2@example.com"),
    )

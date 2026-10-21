from datetime import datetime, timezone

from bson import ObjectId
import pytest
from fastapi import HTTPException

from app.core.distributed_rate_limit import check_distributed_rate_limit
from app.routes.proctoring import session_alerts


@pytest.mark.asyncio
async def test_limit_is_shared_by_calls_using_the_same_database(db):
    now = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc)

    await check_distributed_rate_limit(db, "ai-generation:admin-1", 2, 3600, now)
    await check_distributed_rate_limit(db, "ai-generation:admin-1", 2, 3600, now)

    with pytest.raises(HTTPException) as error:
        await check_distributed_rate_limit(db, "ai-generation:admin-1", 2, 3600, now)

    assert error.value.status_code == 429
    assert int(error.value.headers["Retry-After"]) > 0


@pytest.mark.asyncio
async def test_rate_limit_isolated_by_key_and_window(db):
    now = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc)

    await check_distributed_rate_limit(db, "ai-generation:admin-1", 1, 3600, now)
    await check_distributed_rate_limit(db, "ai-generation:admin-2", 1, 3600, now)
    await check_distributed_rate_limit(db, "ai-generation:admin-1", 1, 3600, now.replace(hour=13))


@pytest.mark.asyncio
async def test_session_alert_detail_includes_integrity_data(db):
    admin_id, student_id, exam_id, session_id = (ObjectId() for _ in range(4))
    await db.exams.insert_one(
        {"_id": exam_id, "created_by": str(admin_id), "title": "Practice exam"}
    )
    await db.users.insert_one(
        {"_id": student_id, "name": "Student", "email": "student@example.test"}
    )
    await db.sessions.insert_one(
        {
            "_id": session_id,
            "exam_id": str(exam_id),
            "student_id": str(student_id),
            "status": "submitted",
            "proctoring_alerts": [
                {
                    "severity": "high",
                    "alert_type": "multiple_faces",
                    "timestamp": "2026-10-21T12:00:00Z",
                }
                for _ in range(3)
            ],
            "integrity": {"decision": None},
        }
    )

    detail = await session_alerts(
        str(session_id),
        admin={"user_id": str(admin_id)},
        db=db,
    )

    assert detail["integrity_status"] == "pending"
    assert detail["integrity"]["history"] == []

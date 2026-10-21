from datetime import datetime, timedelta, timezone

from bson import ObjectId
import pytest
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

import app.core.database as database_module
from app.core.distributed_rate_limit import check_distributed_rate_limit
from app.routes.proctoring import exam_alerts, session_alerts
from app.routes.admin import ManualGradeIn, grade_attempt_answer, review_attempt
from app.routes.student import StartIn, start_exam


@pytest.mark.asyncio
async def test_ongoing_session_index_is_unique_only_for_ongoing_attempts(db, monkeypatch):
    monkeypatch.setattr(database_module, "db", db)
    await database_module.create_indexes()

    student_id, exam_id = "student-1", "exam-1"
    await db.sessions.insert_one(
        {"student_id": student_id, "exam_id": exam_id, "status": "ongoing"}
    )
    with pytest.raises(DuplicateKeyError):
        await db.sessions.insert_one(
            {"student_id": student_id, "exam_id": exam_id, "status": "ongoing"}
        )

    await db.sessions.insert_one(
        {"student_id": student_id, "exam_id": exam_id, "status": "submitted"}
    )
    indexes = await db.sessions.index_information()
    assert indexes["uniq_ongoing_session_per_student_exam"]["unique"] is True
    assert indexes["uniq_ongoing_session_per_student_exam"]["partialFilterExpression"] == {
        "status": "ongoing"
    }


@pytest.mark.asyncio
async def test_index_creation_fails_if_duplicate_ongoing_sessions_exist(db, monkeypatch):
    monkeypatch.setattr(database_module, "db", db)
    await db.sessions.insert_many([
        {"student_id": "student-1", "exam_id": "exam-1", "status": "ongoing"},
        {"student_id": "student-1", "exam_id": "exam-1", "status": "ongoing"},
    ])

    with pytest.raises(RuntimeError, match="Duplicate ongoing exam sessions"):
        await database_module.create_indexes()


@pytest.mark.asyncio
async def test_start_exam_reuses_session_after_concurrent_duplicate_key(db):
    student_id, exam_id, session_id = (ObjectId() for _ in range(3))
    now = datetime.utcnow()
    await db.exams.insert_one({
        "_id": exam_id,
        "is_published": True,
        "duration": 60,
    })
    await db.questions.insert_one({"exam_id": str(exam_id)})
    await db.sessions.insert_one({
        "_id": session_id,
        "student_id": str(student_id),
        "exam_id": str(exam_id),
        "status": "ongoing",
        "started_at": now,
        "expires_at": now + timedelta(minutes=60),
    })

    class RacingSessions:
        def __getattr__(self, name):
            return getattr(db.sessions, name)

        async def find_one_and_update(self, *args, **kwargs):
            raise DuplicateKeyError("another request created the ongoing session")

    class RacingDatabase:
        exams = db.exams
        questions = db.questions
        sessions = RacingSessions()

    result = await start_exam(
        str(exam_id),
        StartIn(consent=True),
        user={"user_id": str(student_id)},
        db=RacingDatabase(),
    )

    assert result["session_id"] == str(session_id)


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


@pytest.mark.asyncio
async def test_exam_alerts_are_scoped_and_ordered_by_recency(db):
    admin_id, student_id, exam_id, other_exam_id = (ObjectId() for _ in range(4))
    await db.exams.insert_many([
        {"_id": exam_id, "created_by": str(admin_id), "title": "Target exam"},
        {"_id": other_exam_id, "created_by": str(admin_id), "title": "Other exam"},
    ])
    await db.users.insert_one({"_id": student_id, "name": "Student"})
    await db.sessions.insert_many([
        {
            "_id": ObjectId(),
            "exam_id": str(exam_id),
            "student_id": str(student_id),
            "proctoring_alerts": [
                {
                    "alert_type": "tab_switch",
                    "severity": "medium",
                    "description": "Switched tabs",
                    "timestamp": "2026-10-21T12:00:00Z",
                },
                {
                    "alert_type": "phone_detected",
                    "severity": "high",
                    "description": "Phone detected",
                    "timestamp": "2026-10-21T12:05:00Z",
                },
            ],
        },
        {
            "_id": ObjectId(),
            "exam_id": str(other_exam_id),
            "student_id": str(student_id),
            "proctoring_alerts": [
                {
                    "alert_type": "eyes_closed",
                    "severity": "low",
                    "description": "Eyes closed",
                    "timestamp": "2026-10-21T12:10:00Z",
                },
            ],
        },
    ])

    result = await exam_alerts(
        str(exam_id),
        admin={"user_id": str(admin_id)},
        db=db,
    )

    assert result["exam_title"] == "Target exam"
    assert [alert["alert_type"] for alert in result["alerts"]] == [
        "phone_detected",
        "tab_switch",
    ]
    assert all(alert["student_name"] == "Student" for alert in result["alerts"])
    assert all("session_id" in alert for alert in result["alerts"])


@pytest.mark.asyncio
async def test_admin_attempt_review_returns_answers_and_manual_grading_updates_totals(db):
    admin_id, student_id, exam_id, session_id, question_id = (
        ObjectId() for _ in range(5)
    )
    await db.exams.insert_one({
        "_id": exam_id,
        "created_by": str(admin_id),
        "title": "Written exam",
        "passing_marks": 3,
    })
    await db.users.insert_one({
        "_id": student_id,
        "name": "Student",
        "email": "student@example.test",
    })
    await db.questions.insert_one({
        "_id": question_id,
        "correct_answer": "A correct explanation",
        "rubric": "Include both key concepts",
        "options": [],
    })
    await db.sessions.insert_one({
        "_id": session_id,
        "exam_id": str(exam_id),
        "student_id": str(student_id),
        "status": "submitted",
        "score": 1,
        "total_marks": 5,
        "percentage": 20,
        "passed": False,
        "grading_status": "done",
        "answers": [{
            "question_id": str(question_id),
            "question_type": "short_answer",
            "question_text": "Explain the concept",
            "selected_answer": "Student's response",
            "correct_answer": "A correct explanation",
            "marks": 5,
            "marks_awarded": 1,
            "is_correct": False,
            "grading": "ai",
            "needs_review": True,
        }],
        "proctoring_alerts": [],
    })
    admin = {"user_id": str(admin_id)}

    detail = await review_attempt(str(session_id), admin=admin, db=db)
    answer = detail["session"]["answers"][0]
    assert detail["session"]["exam_title"] == "Written exam"
    assert answer["selected_answer"] == "Student's response"
    assert answer["rubric"] == "Include both key concepts"
    assert detail["session"]["proctoring_alerts"] == []

    graded = await grade_attempt_answer(
        str(session_id),
        str(question_id),
        ManualGradeIn(marks=3.5, note="Good explanation"),
        admin=admin,
        db=db,
    )
    assert graded == {
        "score": 3.5,
        "total_marks": 5,
        "percentage": 70.0,
        "passed": True,
        "grading_status": "done",
    }

    updated = await db.sessions.find_one({"_id": session_id})
    assert updated["answers"][0]["grading"] == "manual"
    assert updated["answers"][0]["examiner_note"] == "Good explanation"

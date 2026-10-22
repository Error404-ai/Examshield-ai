"""Index creation: one ongoing session per student and exam"""

import pytest
from pymongo.errors import DuplicateKeyError

import app.core.database as database_module


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
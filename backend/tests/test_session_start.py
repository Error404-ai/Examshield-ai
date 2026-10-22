"""Starting an exam: a concurrent request must resume the same session"""

from datetime import datetime, timedelta

from bson import ObjectId
import pytest
from pymongo.errors import DuplicateKeyError

from app.routes.student import StartIn, start_exam


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
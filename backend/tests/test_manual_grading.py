"""Admin attempt review and manual grading of written answers"""

from bson import ObjectId
import pytest

from app.routes.admin import ManualGradeIn, grade_attempt_answer, review_attempt


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
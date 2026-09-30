"""
ExamShield AI - Admin Routes
Exam creation, questions, publishing, results
All routes require an authenticated admin.
"""

from fastapi import APIRouter, HTTPException, Depends, status
import logging

from app.core.database import get_db
from app.core.security import require_role
from app.core.utils import to_json, parse_object_id
from app.models.schemas import ExamCreate, ExamUpdate, QuestionCreate, QuestionType
from app.services.exam_service import ExamService
from app.services.result_service import ResultService

logger = logging.getLogger(__name__)
router = APIRouter()

admin_only = Depends(require_role("admin"))


async def _get_owned_exam(db, exam_id: str, admin_id: str) -> dict:
    """Fetch an exam and make sure this admin created it."""
    oid = parse_object_id(exam_id, "exam ID")
    exam = await db["exams"].find_one({"_id": oid})
    if not exam or exam.get("created_by") != admin_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam not found")
    return exam


# ─── Dashboard ───────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def get_admin_dashboard(current_user: dict = admin_only, db=Depends(get_db)):
    admin_id = current_user["user_id"]

    exam_ids = []
    published = 0
    async for e in db["exams"].find({"created_by": admin_id}, {"is_published": 1}):
        exam_ids.append(str(e["_id"]))
        if e.get("is_published"):
            published += 1

    return {
        "success": True,
        "stats": {
            "total_exams": len(exam_ids),
            "published_exams": published,
            "total_students": await db["users"].count_documents({"role": "student"}),
            "total_sessions": await db["sessions"].count_documents(
                {"exam_id": {"$in": exam_ids}}
            ),
        },
    }


# ─── Exams ───────────────────────────────────────────────────────────────────

@router.post("/exams")
async def create_exam(
    payload: ExamCreate,
    current_user: dict = admin_only,
    db=Depends(get_db),
):
    exam_id = await ExamService(db).create_exam(payload, current_user["user_id"])
    return {"success": True, "message": "Exam created", "exam_id": exam_id}


@router.get("/exams")
async def list_exams(current_user: dict = admin_only, db=Depends(get_db)):
    exams = await ExamService(db).list_exams_by_admin(current_user["user_id"])
    return {"success": True, "exams": to_json(exams)}


@router.get("/exams/{exam_id}")
async def get_exam(exam_id: str, current_user: dict = admin_only, db=Depends(get_db)):
    exam = await _get_owned_exam(db, exam_id, current_user["user_id"])
    questions = await ExamService(db).get_questions(exam_id)  # admin sees answers
    return {"success": True, "exam": to_json(exam), "questions": to_json(questions)}


@router.put("/exams/{exam_id}")
async def update_exam(
    exam_id: str,
    payload: ExamUpdate,
    current_user: dict = admin_only,
    db=Depends(get_db),
):
    await _get_owned_exam(db, exam_id, current_user["user_id"])
    await ExamService(db).update_exam(exam_id, current_user["user_id"], payload)
    return {"success": True, "message": "Exam updated"}


@router.post("/exams/{exam_id}/publish")
async def publish_exam(exam_id: str, current_user: dict = admin_only, db=Depends(get_db)):
    parse_object_id(exam_id, "exam ID")
    outcome = await ExamService(db).publish_exam(exam_id, current_user["user_id"])
    if outcome == "not_found":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam not found")
    if outcome == "no_questions":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Add at least one question before publishing")
    return {"success": True, "message": "Exam published"}


@router.delete("/exams/{exam_id}")
async def delete_exam(exam_id: str, current_user: dict = admin_only, db=Depends(get_db)):
    await _get_owned_exam(db, exam_id, current_user["user_id"])
    await ExamService(db).delete_exam(exam_id, current_user["user_id"])
    return {"success": True, "message": "Exam deleted"}


# ─── Questions ───────────────────────────────────────────────────────────────

@router.post("/questions")
async def add_question(
    payload: QuestionCreate,
    current_user: dict = admin_only,
    db=Depends(get_db),
):
    await _get_owned_exam(db, payload.exam_id, current_user["user_id"])

    if payload.question_type in (QuestionType.MCQ, QuestionType.TRUE_FALSE):
        if payload.correct_answer not in (payload.options or []):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Correct answer must be one of the options",
            )

    question_id = await ExamService(db).add_question(payload)
    return {"success": True, "question_id": question_id}


@router.delete("/questions/{question_id}")
async def delete_question(question_id: str, current_user: dict = admin_only, db=Depends(get_db)):
    oid = parse_object_id(question_id, "question ID")
    q = await db["questions"].find_one({"_id": oid}, {"exam_id": 1})
    if not q:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found")
    await _get_owned_exam(db, q["exam_id"], current_user["user_id"])
    await ExamService(db).delete_question(question_id)
    return {"success": True, "message": "Question deleted"}


# ─── Results ─────────────────────────────────────────────────────────────────

@router.get("/exams/{exam_id}/results")
async def get_exam_results(exam_id: str, current_user: dict = admin_only, db=Depends(get_db)):
    exam = await _get_owned_exam(db, exam_id, current_user["user_id"])
    data = await ResultService(db).get_exam_results(exam_id)
    data["exam_title"] = exam.get("title", "")
    return to_json(data)
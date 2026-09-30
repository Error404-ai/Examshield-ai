"""
ExamShield AI - Admin Routes
Exam creation, question management, publishing and results
"""

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.security import require_role

logger = logging.getLogger(__name__)
router = APIRouter()

# One shared dependency instance: only users whose JWT role is "admin" get in
admin_only = require_role("admin")


# ─── Schemas (match frontend/src/types) ──────────────────────────────────────

class ExamCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    instructions: str = ""
    duration: int = Field(..., gt=0, le=300)  # minutes
    total_marks: int = Field(0, ge=0)
    passing_marks: int = Field(0, ge=0)


class ExamUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    instructions: Optional[str] = None
    duration: Optional[int] = Field(None, gt=0, le=300)
    total_marks: Optional[int] = Field(None, ge=0)
    passing_marks: Optional[int] = Field(None, ge=0)
    is_published: Optional[bool] = None


class QuestionCreate(BaseModel):
    exam_id: str
    question_text: str = Field(..., min_length=1)
    question_type: str = "mcq"
    options: Optional[List[str]] = None
    correct_answer: str
    marks: int = Field(1, gt=0)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _oid(value: str, label: str = "ID") -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid {label}")


def _clean(doc: Dict) -> Dict:
    """Turn top-level ObjectIds into strings so the doc is JSON-safe"""
    return {k: (str(v) if isinstance(v, ObjectId) else v) for k, v in doc.items()}


async def _get_owned_exam(db, exam_id: str, admin_id: str) -> Dict:
    exam = await db["exams"].find_one(
        {"_id": _oid(exam_id, "exam ID"), "created_by": admin_id}
    )
    if not exam:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam not found")
    return exam


# ─── Dashboard ───────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def get_admin_dashboard(admin: dict = Depends(admin_only), db=Depends(get_db)):
    admin_id = admin["user_id"]
    return {
        "success": True,
        "stats": {
            "total_exams": await db["exams"].count_documents({"created_by": admin_id}),
            "published_exams": await db["exams"].count_documents(
                {"created_by": admin_id, "is_published": True}
            ),
            "total_students": await db["users"].count_documents({"role": "student"}),
            "total_sessions": await db["exam_sessions"].count_documents({}),
        },
    }


# ─── Exams ───────────────────────────────────────────────────────────────────

@router.post("/exams")
async def create_exam(
    data: ExamCreate, admin: dict = Depends(admin_only), db=Depends(get_db)
):
    if data.passing_marks > data.total_marks and data.total_marks > 0:
        raise HTTPException(400, "Passing marks cannot exceed total marks")

    doc = {
        **data.model_dump(),
        "created_by": admin["user_id"],
        "is_published": False,
        "created_at": _now(),
        "updated_at": _now(),
    }
    result = await db["exams"].insert_one(doc)
    return {"success": True, "exam_id": str(result.inserted_id)}


@router.get("/exams")
async def list_exams(admin: dict = Depends(admin_only), db=Depends(get_db)):
    exams = (
        await db["exams"]
        .find({"created_by": admin["user_id"]})
        .sort("created_at", -1)
        .to_list(length=None)
    )
    return {"success": True, "exams": [_clean(e) for e in exams]}


@router.get("/exams/{exam_id}")
async def get_exam(exam_id: str, admin: dict = Depends(admin_only), db=Depends(get_db)):
    exam = await _get_owned_exam(db, exam_id, admin["user_id"])
    questions = await db["questions"].find({"exam_id": exam_id}).to_list(length=None)
    return {
        "success": True,
        "exam": _clean(exam),
        "questions": [_clean(q) for q in questions],
    }


@router.put("/exams/{exam_id}")
async def update_exam(
    exam_id: str,
    data: ExamUpdate,
    admin: dict = Depends(admin_only),
    db=Depends(get_db),
):
    await _get_owned_exam(db, exam_id, admin["user_id"])

    fields = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    fields["updated_at"] = _now()
    await db["exams"].update_one({"_id": _oid(exam_id)}, {"$set": fields})
    return {"success": True, "message": "Exam updated"}


@router.post("/exams/{exam_id}/publish")
async def publish_exam(exam_id: str, admin: dict = Depends(admin_only), db=Depends(get_db)):
    await _get_owned_exam(db, exam_id, admin["user_id"])

    if await db["questions"].count_documents({"exam_id": exam_id}) == 0:
        raise HTTPException(400, "Add at least one question before publishing")

    await db["exams"].update_one(
        {"_id": _oid(exam_id)},
        {"$set": {"is_published": True, "updated_at": _now()}},
    )
    return {"success": True, "message": "Exam published"}


@router.delete("/exams/{exam_id}")
async def delete_exam(exam_id: str, admin: dict = Depends(admin_only), db=Depends(get_db)):
    await _get_owned_exam(db, exam_id, admin["user_id"])
    await db["exams"].delete_one({"_id": _oid(exam_id)})
    await db["questions"].delete_many({"exam_id": exam_id})
    return {"success": True, "message": "Exam deleted"}


# ─── Questions ───────────────────────────────────────────────────────────────

@router.post("/questions")
async def add_question(
    data: QuestionCreate, admin: dict = Depends(admin_only), db=Depends(get_db)
):
    await _get_owned_exam(db, data.exam_id, admin["user_id"])

    if data.question_type in ("mcq", "true_false"):
        if not data.options or len(data.options) < 2:
            raise HTTPException(400, "Choice questions need at least 2 options")
        if data.correct_answer not in data.options:
            raise HTTPException(400, "Correct answer must be one of the options")

    doc = {**data.model_dump(), "created_at": _now()}
    result = await db["questions"].insert_one(doc)
    return {"success": True, "question_id": str(result.inserted_id)}


@router.delete("/questions/{question_id}")
async def delete_question(
    question_id: str, admin: dict = Depends(admin_only), db=Depends(get_db)
):
    question = await db["questions"].find_one({"_id": _oid(question_id, "question ID")})
    if not question:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found")

    await _get_owned_exam(db, question["exam_id"], admin["user_id"])
    await db["questions"].delete_one({"_id": question["_id"]})
    return {"success": True, "message": "Question deleted"}


# ─── Results ─────────────────────────────────────────────────────────────────

@router.get("/exams/{exam_id}/results")
async def get_exam_results(
    exam_id: str, admin: dict = Depends(admin_only), db=Depends(get_db)
):
    exam = await _get_owned_exam(db, exam_id, admin["user_id"])
    results = await db["results"].find({"exam_id": exam_id}).to_list(length=None)

    cleaned = []
    for r in results:
        r = _clean(r)
        r["percentage"] = r.get("percentage", r.get("score_percentage", 0))
        cleaned.append(r)

    total = len(cleaned)
    passed = sum(1 for r in cleaned if r.get("passed"))
    avg = sum(r["percentage"] for r in cleaned) / total if total else 0

    return {
        "success": True,
        "exam_title": exam.get("title", ""),
        "total_attempts": total,
        "passed": passed,
        "failed": total - passed,
        "average_score": round(avg, 2),
        "results": cleaned,
    }
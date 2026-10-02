"""
ExamShield AI - Admin Routes
Matches frontend adminService (services/examService.ts).
Data model: exams / questions / sessions as separate collections.
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.security import require_role
from app.core.utils import oid, clean
from app.models.schemas import ExamUpdate, QuestionCreate, SessionStatus

logger = logging.getLogger(__name__)
router = APIRouter()

admin_only = require_role("admin")


class ExamIn(BaseModel):
    """Looser than ExamCreate: totals are filled in after questions are added"""
    title: str = Field(..., min_length=3, max_length=200)
    description: str = ""
    duration: int = Field(..., gt=0, le=300)
    total_marks: int = Field(0, ge=0)
    passing_marks: int = Field(0, ge=0)


async def _owned_exam(db, exam_id: str, admin_id: str) -> dict:
    exam = await db.exams.find_one({"_id": oid(exam_id), "created_by": admin_id})
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    return exam


async def _sync_total_marks(db, exam_id: str) -> None:
    rows = await db.questions.aggregate([
        {"$match": {"exam_id": exam_id}},
        {"$group": {"_id": None, "total": {"$sum": "$marks"}}},
    ]).to_list(1)
    total = rows[0]["total"] if rows else 0
    await db.exams.update_one({"_id": oid(exam_id)}, {"$set": {"total_marks": total}})


# ─── Dashboard ───────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def dashboard(admin=Depends(admin_only), db=Depends(get_db)):
    aid = admin["user_id"]
    exam_ids = [str(e["_id"]) async for e in db.exams.find({"created_by": aid}, {"_id": 1})]
    return {
        "success": True,
        "stats": {
            "total_exams": len(exam_ids),
            "published_exams": await db.exams.count_documents(
                {"created_by": aid, "is_published": True}
            ),
            "total_students": await db.users.count_documents({"role": "student"}),
            "total_sessions": await db.sessions.count_documents(
                {"exam_id": {"$in": exam_ids}}
            ),
        },
    }


# ─── Exams ───────────────────────────────────────────────────────────────────

@router.post("/exams")
async def create_exam(body: ExamIn, admin=Depends(admin_only), db=Depends(get_db)):
    now = datetime.utcnow()
    doc = {
        **body.model_dump(),
        "created_by": admin["user_id"],
        "is_published": False,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.exams.insert_one(doc)
    return {"success": True, "exam_id": str(result.inserted_id)}


@router.get("/exams")
async def list_exams(admin=Depends(admin_only), db=Depends(get_db)):
    exams = await db.exams.find({"created_by": admin["user_id"]}).sort("created_at", -1).to_list(None)
    return {"success": True, "exams": [clean(e) for e in exams]}


@router.get("/exams/{exam_id}")
async def get_exam(exam_id: str, admin=Depends(admin_only), db=Depends(get_db)):
    exam = await _owned_exam(db, exam_id, admin["user_id"])
    questions = await db.questions.find({"exam_id": exam_id}).sort("created_at", 1).to_list(None)
    return {
        "success": True,
        "exam": clean(exam),
        "questions": [clean(q) for q in questions],  # admin sees correct answers
    }


@router.put("/exams/{exam_id}")
async def update_exam(exam_id: str, body: ExamUpdate, admin=Depends(admin_only), db=Depends(get_db)):
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status_code=400, detail="Nothing to update")
    fields["updated_at"] = datetime.utcnow()
    result = await db.exams.update_one(
        {"_id": oid(exam_id), "created_by": admin["user_id"]}, {"$set": fields}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Exam not found")
    return {"success": True, "message": "Exam updated"}


@router.delete("/exams/{exam_id}")
async def delete_exam(exam_id: str, admin=Depends(admin_only), db=Depends(get_db)):
    result = await db.exams.delete_one({"_id": oid(exam_id), "created_by": admin["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Exam not found")
    await db.questions.delete_many({"exam_id": exam_id})
    return {"success": True, "message": "Exam deleted"}


@router.post("/exams/{exam_id}/publish")
async def publish_exam(exam_id: str, admin=Depends(admin_only), db=Depends(get_db)):
    await _owned_exam(db, exam_id, admin["user_id"])
    if await db.questions.count_documents({"exam_id": exam_id}) == 0:
        raise HTTPException(status_code=400, detail="Add at least one question before publishing")
    await db.exams.update_one(
        {"_id": oid(exam_id)},
        {"$set": {"is_published": True, "updated_at": datetime.utcnow()}},
    )
    return {"success": True, "message": "Exam published"}


# ─── Questions ───────────────────────────────────────────────────────────────

@router.post("/questions")
async def add_question(body: QuestionCreate, admin=Depends(admin_only), db=Depends(get_db)):
    await _owned_exam(db, body.exam_id, admin["user_id"])
    if body.options and body.correct_answer not in body.options:
        raise HTTPException(status_code=400, detail="Correct answer must be one of the options")

    doc = body.model_dump(mode="json")
    doc["created_at"] = datetime.utcnow()
    result = await db.questions.insert_one(doc)
    await _sync_total_marks(db, body.exam_id)
    return {"success": True, "question_id": str(result.inserted_id)}

@router.put("/questions/{question_id}")
async def update_question(question_id: str, body: QuestionCreate, admin=Depends(admin_only), db=Depends(get_db)):
    question = await db.questions.find_one({"_id": oid(question_id)})
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    await _owned_exam(db, question["exam_id"], admin["user_id"])
    if body.options and body.correct_answer not in body.options:
        raise HTTPException(status_code=400, detail="Correct answer must be one of the options")

    doc = body.model_dump(mode="json")
    doc["exam_id"] = question["exam_id"]  # can't move a question to another exam
    doc["updated_at"] = datetime.utcnow()
    await db.questions.update_one({"_id": question["_id"]}, {"$set": doc})
    await _sync_total_marks(db, question["exam_id"])
    return {"success": True, "message": "Question updated"}


@router.delete("/questions/{question_id}")
async def delete_question(question_id: str, admin=Depends(admin_only), db=Depends(get_db)):
    question = await db.questions.find_one({"_id": oid(question_id)})
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    await _owned_exam(db, question["exam_id"], admin["user_id"])
    await db.questions.delete_one({"_id": question["_id"]})
    await _sync_total_marks(db, question["exam_id"])
    return {"success": True, "message": "Question deleted"}


# ─── Results ─────────────────────────────────────────────────────────────────

@router.get("/exams/{exam_id}/results")
async def exam_results(exam_id: str, admin=Depends(admin_only), db=Depends(get_db)):
    exam = await _owned_exam(db, exam_id, admin["user_id"])
    done = [SessionStatus.SUBMITTED.value, SessionStatus.EXPIRED.value]
    sessions = await db.sessions.find({"exam_id": exam_id, "status": {"$in": done}}).to_list(None)

    students = {}
    for sid in {s["student_id"] for s in sessions}:
        user = await db.users.find_one({"_id": oid(sid)}, {"name": 1, "email": 1})
        students[sid] = user or {}

    results = []
    for s in sessions:
        row = clean(s)
        row.pop("answers", None)
        row["student_name"] = students[s["student_id"]].get("name", "Unknown")
        row["student_email"] = students[s["student_id"]].get("email", "")
        results.append(row)

    total = len(results)
    passed = sum(1 for r in results if r.get("passed"))
    avg = sum(r.get("percentage", 0) for r in results) / total if total else 0
    return {
        "success": True,
        "exam_title": exam["title"],
        "total_attempts": total,
        "passed": passed,
        "failed": total - passed,
        "average_score": round(avg, 2),
        "results": results,
    }
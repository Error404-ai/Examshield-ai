"""
ExamShield AI - Admin Routes
Matches frontend adminService (services/examService.ts).
Data model: exams / questions / sessions as separate collections.
"""

import logging
from datetime import datetime, timedelta
from typing import Annotated, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StringConstraints, model_validator
from pymongo.errors import OperationFailure

from app.core import database
from app.core.database import get_db
from app.core.distributed_rate_limit import check_distributed_rate_limit
from app.core.security import require_role
from app.core.utils import oid, clean
from app.models.schemas import ExamUpdate, QuestionCreate, QuestionType, SessionStatus
from app.services.ai_service import AIGenerationError, AIUnavailable, generate_questions

logger = logging.getLogger(__name__)
router = APIRouter()

admin_only = require_role("admin")

# Shared MongoDB counter limits AI generations across backend instances.
GEN_LIMIT_PER_HOUR = 20


class ExamIn(BaseModel):
    """Looser than ExamCreate: totals are filled in after questions are added"""
    title: str = Field(..., min_length=3, max_length=200)
    description: str = ""
    duration: int = Field(..., gt=0, le=300)
    total_marks: int = Field(0, ge=0)
    passing_marks: int = Field(0, ge=0)


class GenerateIn(BaseModel):
    topic: str = Field(..., min_length=3, max_length=200)
    count: int = Field(5, ge=1, le=15)
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    context: str = Field("", max_length=6000)


# ─── Save an exam and all its questions in one go ────────────────────────────

class QuestionDraft(BaseModel):
    id: Optional[str] = None  # present for questions that already exist
    question_text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=1000)]
    options: List[str] = Field(..., min_length=2, max_length=6)
    correct_answer: str
    marks: int = Field(..., gt=0, le=100)

    @model_validator(mode="after")
    def check_options(self) -> "QuestionDraft":
        options = [o.strip() for o in self.options]
        if any(not o for o in options):
            raise ValueError("Options cannot be empty")
        if len({o.lower() for o in options}) != len(options):
            raise ValueError("Options must be different from each other")
        answer = self.correct_answer.strip()
        if answer not in options:
            raise ValueError("Correct answer must be one of the options")
        self.options = options
        self.correct_answer = answer
        return self


class ExamFullIn(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=200)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] = ""
    duration: int = Field(..., gt=0, le=300)
    passing_percentage: int = Field(40, ge=0, le=100)
    is_published: bool = False
    questions: List[QuestionDraft] = Field(..., min_length=1, max_length=200)


def _totals(body: ExamFullIn) -> tuple:
    total = sum(q.marks for q in body.questions)
    passing = (total * body.passing_percentage + 99) // 100  # integer ceil
    return total, passing


def _question_doc(exam_id: str, q: QuestionDraft) -> dict:
    return {
        "exam_id": exam_id,
        "question_text": q.question_text,
        "question_type": QuestionType.MCQ.value,
        "options": q.options,
        "correct_answer": q.correct_answer,
        "marks": q.marks,
    }


async def _transact(work):
    """
    Run work(session) inside a MongoDB transaction (auto-retries transient errors).
    A standalone local mongod has no transaction support (error code 20); in that
    case the work runs without one so local development keeps working. Atlas
    always supports transactions.
    """
    try:
        async with await database.client.start_session() as session:
            return await session.with_transaction(work)
    except OperationFailure as exc:
        if exc.code == 20:
            logger.warning("MongoDB transactions unavailable (standalone server); saving without one")
            return await work(None)
        raise


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

@router.post("/exams/full")
async def create_exam_full(body: ExamFullIn, admin=Depends(admin_only), db=Depends(get_db)):
    """Create an exam with all its questions atomically (all saved, or nothing)"""
    now = datetime.utcnow()
    total, passing = _totals(body)

    async def work(session):
        result = await db.exams.insert_one(
            {
                "title": body.title,
                "description": body.description,
                "duration": body.duration,
                "total_marks": total,
                "passing_marks": passing,
                "is_published": body.is_published,
                "created_by": admin["user_id"],
                "created_at": now,
                "updated_at": now,
            },
            session=session,
        )
        exam_id = str(result.inserted_id)
        # Mongo stores milliseconds, so offset by 1 ms each to keep the order stable
        docs = [
            {**_question_doc(exam_id, q), "created_at": now + timedelta(milliseconds=i)}
            for i, q in enumerate(body.questions)
        ]
        await db.questions.insert_many(docs, session=session)
        return exam_id

    exam_id = await _transact(work)
    return {"success": True, "exam_id": exam_id}


@router.put("/exams/{exam_id}/full")
async def update_exam_full(
    exam_id: str, body: ExamFullIn, admin=Depends(admin_only), db=Depends(get_db)
):
    """
    Replace an exam's details and question list atomically.
    Questions with an id are updated, questions without one are added, and
    existing questions missing from the list are deleted.
    """
    await _owned_exam(db, exam_id, admin["user_id"])
    now = datetime.utcnow()
    total, passing = _totals(body)

    sent_ids = [q.id for q in body.questions if q.id]
    if len(set(sent_ids)) != len(sent_ids):
        raise HTTPException(status_code=400, detail="The same question appears twice")

    async def work(session):
        existing = {
            str(q["_id"])
            async for q in db.questions.find({"exam_id": exam_id}, {"_id": 1}, session=session)
        }
        if any(i not in existing for i in sent_ids):
            raise HTTPException(status_code=400, detail="A question does not belong to this exam")

        gone = [oid(i) for i in existing if i not in set(sent_ids)]
        if gone:
            await db.questions.delete_many({"_id": {"$in": gone}}, session=session)

        for i, q in enumerate(body.questions):
            doc = _question_doc(exam_id, q)
            if q.id:
                doc["updated_at"] = now
                await db.questions.update_one({"_id": oid(q.id)}, {"$set": doc}, session=session)
            else:
                doc["created_at"] = now + timedelta(milliseconds=i)
                await db.questions.insert_one(doc, session=session)

        await db.exams.update_one(
            {"_id": oid(exam_id)},
            {"$set": {
                "title": body.title,
                "description": body.description,
                "duration": body.duration,
                "total_marks": total,
                "passing_marks": passing,
                "is_published": body.is_published,
                "updated_at": now,
            }},
            session=session,
        )

    await _transact(work)
    return {"success": True, "message": "Exam saved"}


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

@router.post("/questions/generate")
async def generate_ai_questions(body: GenerateIn, admin=Depends(admin_only), db=Depends(get_db)):
    """Draft multiple-choice questions with AI. Nothing is saved; the admin reviews first."""
    await check_distributed_rate_limit(
        db,
        f"ai-generation:{admin['user_id']}",
        GEN_LIMIT_PER_HOUR,
        3600,
    )
    try:
        questions = await generate_questions(
            topic=body.topic.strip(),
            count=body.count,
            difficulty=body.difficulty,
            context=body.context,
        )
    except AIUnavailable:
        raise HTTPException(
            status_code=503,
            detail="AI generation isn't configured on the server (missing GEMINI_API_KEY).",
        )
    except AIGenerationError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return {"success": True, "questions": questions}


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


# ─── Analytics ───────────────────────────────────────────────────────────────

@router.get("/exams/{exam_id}/analytics")
async def exam_analytics(exam_id: str, admin=Depends(admin_only), db=Depends(get_db)):
    exam = await _owned_exam(db, exam_id, admin["user_id"])
    done = [SessionStatus.SUBMITTED.value, SessionStatus.EXPIRED.value]
    sessions = await db.sessions.find({"exam_id": exam_id, "status": {"$in": done}}).to_list(None)
    questions = await db.questions.find({"exam_id": exam_id}).sort("created_at", 1).to_list(None)

    attempts = len(sessions)
    percentages = [s.get("percentage", 0) for s in sessions]
    passed = sum(1 for s in sessions if s.get("passed"))

    # Score distribution in 10% buckets
    buckets = [0] * 10
    for p in percentages:
        buckets[min(int(p // 10), 9)] += 1
    distribution = [
        {"label": f"{i * 10}-{i * 10 + 10}", "count": buckets[i]} for i in range(10)
    ]

    # Time taken
    minutes = [
        (s["submitted_at"] - s["started_at"]).total_seconds() / 60
        for s in sessions
        if isinstance(s.get("submitted_at"), datetime) and isinstance(s.get("started_at"), datetime)
    ]

    # Per-question performance
    stats = {str(q["_id"]): {"correct": 0, "answered": 0} for q in questions}
    for s in sessions:
        for a in s.get("answers", []):
            st = stats.get(a.get("question_id"))
            if st is None:
                continue
            if a.get("selected_answer"):
                st["answered"] += 1
            if a.get("is_correct"):
                st["correct"] += 1

    question_rows = []
    for q in questions:
        st = stats[str(q["_id"])]
        question_rows.append({
            "question_id": str(q["_id"]),
            "question_text": q.get("question_text", ""),
            "marks": q.get("marks", 1),
            "correct_pct": round(st["correct"] / attempts * 100, 1) if attempts else 0,
            "skipped": attempts - st["answered"],
        })
    question_rows.sort(key=lambda r: r["correct_pct"])  # hardest first

    flagged = sum(
        1
        for s in sessions
        if any(a.get("severity") in ("high", "critical") for a in s.get("proctoring_alerts", []))
    )

    return {
        "success": True,
        "exam_title": exam["title"],
        "attempts": attempts,
        "passed": passed,
        "failed": attempts - passed,
        "pass_rate": round(passed / attempts * 100, 1) if attempts else 0,
        "average_score": round(sum(percentages) / attempts, 1) if attempts else 0,
        "highest": round(max(percentages), 1) if attempts else 0,
        "lowest": round(min(percentages), 1) if attempts else 0,
        "average_minutes": round(sum(minutes) / len(minutes), 1) if minutes else 0,
        "flagged_sessions": flagged,
        "distribution": distribution,
        "questions": question_rows,
    }
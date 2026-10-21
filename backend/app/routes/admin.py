"""
ExamShield AI - Admin Routes
Matches frontend adminService (services/examService.ts).
Data model: exams / questions / sessions as separate collections.
"""

import logging
import time
from datetime import datetime
from typing import Dict, List, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.security import require_role
from app.core.utils import appeal_out, oid, clean
from app.models.schemas import ExamUpdate, QuestionCreate, SessionStatus
from app.services.ai_service import AIGenerationError, AIUnavailable, generate_questions
from app.services.grading_service import OPEN_STATES, WRITTEN_TYPES, compute_totals, grade_session

logger = logging.getLogger(__name__)
router = APIRouter()

admin_only = require_role("admin")

# Simple in-memory limit on AI generations per admin
GEN_LIMIT_PER_HOUR = 20
_gen_calls: Dict[str, List[float]] = {}


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


class GradeAnswerIn(BaseModel):
    marks: float = Field(..., ge=0)
    note: str = Field("", max_length=500)


def _check_gen_rate(admin_id: str) -> None:
    now = time.time()
    recent = [t for t in _gen_calls.get(admin_id, []) if now - t < 3600]
    if len(recent) >= GEN_LIMIT_PER_HOUR:
        raise HTTPException(
            status_code=429,
            detail="You've reached the hourly limit for AI generation. Try again later.",
        )
    recent.append(now)
    _gen_calls[admin_id] = recent


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


@router.get("/sessions/{session_id}/review")
async def review_session(session_id: str, admin=Depends(admin_only), db=Depends(get_db)):
    session = await db.sessions.find_one({"_id": oid(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    exam = await db.exams.find_one(
        {"_id": oid(session["exam_id"]), "created_by": admin["user_id"]}
    )
    if not exam:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("status") == SessionStatus.ONGOING.value:
        raise HTTPException(status_code=409, detail="This attempt has not been submitted")

    student = await db.users.find_one({"_id": oid(session["student_id"])}, {"name": 1, "email": 1}) or {}
    answer_ids = [oid(a["question_id"]) for a in session.get("answers", []) if a.get("question_id")]
    questions = {}
    if answer_ids:
        async for question in db.questions.find({"_id": {"$in": answer_ids}}):
            questions[str(question["_id"])] = question

    answers = []
    for answer in session.get("answers", []):
        row = dict(answer)
        question = questions.get(answer.get("question_id"), {})
        row.setdefault("question_type", question.get("question_type", ""))
        row.setdefault("question_text", question.get("question_text", ""))
        row.setdefault("correct_answer", question.get("correct_answer", ""))
        row["rubric"] = question.get("rubric", "")
        answers.append(row)

    result = clean(session)
    result.update(
        exam_title=exam.get("title", "Deleted exam"),
        student_name=student.get("name", "Unknown"),
        student_email=student.get("email", ""),
        answers=answers,
    )
    return {"success": True, "session": result}


@router.put("/sessions/{session_id}/answers/{question_id}/grade")
async def grade_answer(
    session_id: str,
    question_id: str,
    body: GradeAnswerIn,
    admin=Depends(admin_only),
    db=Depends(get_db),
):
    session = await db.sessions.find_one({"_id": oid(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    exam = await db.exams.find_one(
        {"_id": oid(session["exam_id"]), "created_by": admin["user_id"]}
    )
    if not exam:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("status") == SessionStatus.ONGOING.value:
        raise HTTPException(status_code=409, detail="This attempt has not been submitted")

    answer = next((a for a in session.get("answers", []) if a.get("question_id") == question_id), None)
    if not answer:
        raise HTTPException(status_code=404, detail="Answer not found")
    if answer.get("question_type") not in WRITTEN_TYPES:
        raise HTTPException(status_code=400, detail="Only written answers can be manually graded")
    if body.marks > answer.get("marks", 0):
        raise HTTPException(status_code=422, detail="Marks cannot exceed the question maximum")

    answer.update(
        marks_awarded=body.marks,
        is_correct=body.marks >= answer.get("marks", 0),
        grading="manual",
        examiner_note=body.note.strip(),
        needs_review=False,
    )
    has_open = any(a.get("grading") in OPEN_STATES for a in session.get("answers", []))
    fields = {
        "answers": session["answers"],
        **compute_totals(session["answers"], exam.get("passing_marks", 0)),
        "grading_status": "failed" if has_open else "done",
        "grading_error": session.get("grading_error", "") if has_open else "",
        "review_needed": any(a.get("needs_review") for a in session["answers"]),
    }
    await db.sessions.update_one({"_id": session["_id"]}, {"$set": fields})
    return {"success": True, **{k: fields[k] for k in ("score", "total_marks", "percentage", "passed", "grading_status")}}


@router.post("/sessions/{session_id}/regrade")
async def regrade_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    admin=Depends(admin_only),
    db=Depends(get_db),
):
    session = await db.sessions.find_one({"_id": oid(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    exam = await db.exams.find_one(
        {"_id": oid(session["exam_id"]), "created_by": admin["user_id"]}
    )
    if not exam:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("status") == SessionStatus.ONGOING.value:
        raise HTTPException(status_code=409, detail="This attempt has not been submitted")
    if session.get("grading_status") != "failed":
        raise HTTPException(status_code=409, detail="Only failed grading can be retried")

    await db.sessions.update_one(
        {"_id": session["_id"], "grading_status": "failed"},
        {"$set": {"grading_status": "pending", "grading_error": ""}},
    )
    background_tasks.add_task(grade_session, db, session["_id"])
    return {"success": True, "grading_status": "pending"}


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
            "pending_appeals": await db.sessions.count_documents(
                {"exam_id": {"$in": exam_ids}, "appeal.status": "pending"}
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

@router.post("/questions/generate")
async def generate_ai_questions(body: GenerateIn, admin=Depends(admin_only)):
    """Draft multiple-choice questions with AI. Nothing is saved; the admin reviews first."""
    _check_gen_rate(admin["user_id"])
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
        row.pop("draft_answers", None)
        row["appeal"] = appeal_out(s.get("appeal"))
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

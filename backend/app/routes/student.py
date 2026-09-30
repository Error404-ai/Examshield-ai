"""
ExamShield AI - Student Routes
Exam access, sessions, submission and results
"""

from datetime import datetime, timedelta
import logging

from fastapi import APIRouter, HTTPException, Depends, status
from pymongo.errors import DuplicateKeyError

from app.core.database import get_db
from app.core.security import require_role
from app.core.utils import to_json, parse_object_id
from app.models.schemas import SessionStatus, SessionSubmit
from app.services.exam_service import ExamService
from app.services.result_service import ResultService

logger = logging.getLogger(__name__)
router = APIRouter()

student_only = Depends(require_role("student"))

# Timer auto-submit and network lag can land slightly after expiry
SUBMIT_GRACE_SECONDS = 60


def _remaining_seconds(session: dict) -> int:
    return max(0, int((session["expires_at"] - datetime.utcnow()).total_seconds()))


# ─── Dashboard ───────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def student_dashboard(current_user: dict = student_only, db=Depends(get_db)):
    student_id = current_user["user_id"]
    submitted = {"student_id": student_id, "status": SessionStatus.SUBMITTED.value}

    available = await db["exams"].count_documents({"is_published": True})
    attempted = await db["sessions"].count_documents(submitted)
    passed = await db["sessions"].count_documents({**submitted, "passed": True})

    return {
        "success": True,
        "stats": {
            "available_exams": available,
            "attempted": attempted,
            "passed": passed,
            "failed": attempted - passed,
        },
    }


# ─── Exams ───────────────────────────────────────────────────────────────────

@router.get("/exams")
async def list_available_exams(current_user: dict = student_only, db=Depends(get_db)):
    student_id = current_user["user_id"]

    exams = await db["exams"].find({"is_published": True}).sort("created_at", -1).to_list(length=None)

    session_status = {}
    async for s in db["sessions"].find({"student_id": student_id}, {"exam_id": 1, "status": 1}):
        session_status[s["exam_id"]] = s["status"]

    out = []
    for exam in exams:
        eid = str(exam["_id"])
        out.append({
            **exam,
            "attempted": eid in session_status,
            "session_status": session_status.get(eid),
        })
    return {"success": True, "exams": to_json(out)}


@router.get("/exams/{exam_id}")
async def get_exam_details(exam_id: str, current_user: dict = student_only, db=Depends(get_db)):
    """Exam plus questions, without correct answers"""
    oid = parse_object_id(exam_id, "exam ID")
    exam = await db["exams"].find_one({"_id": oid, "is_published": True})
    if not exam:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam not found")

    questions = await ExamService(db).get_questions(exam_id, strip_answers=True)
    return {"success": True, "exam": to_json(exam), "questions": to_json(questions)}


# ─── Start / resume ──────────────────────────────────────────────────────────

@router.post("/exams/{exam_id}/start")
async def start_exam(exam_id: str, current_user: dict = student_only, db=Depends(get_db)):
    """
    Start an exam session, or resume an ongoing one.
    One attempt per student per exam.
    """
    student_id = current_user["user_id"]
    oid = parse_object_id(exam_id, "exam ID")

    exam = await db["exams"].find_one({"_id": oid, "is_published": True})
    if not exam:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam not found")

    session = await db["sessions"].find_one({"student_id": student_id, "exam_id": exam_id})

    if session is None:
        now = datetime.utcnow()
        doc = {
            "student_id": student_id,
            "exam_id": exam_id,
            "status": SessionStatus.ONGOING.value,
            "started_at": now,
            "expires_at": now + timedelta(minutes=exam.get("duration", 0)),
            "submitted_at": None,
            "score": 0,
            "total_marks": exam.get("total_marks", 0),
            "percentage": 0,
            "passed": False,
            "answers": [],
            "proctoring_alerts": [],
        }
        try:
            result = await db["sessions"].insert_one(doc)
            doc["_id"] = result.inserted_id
            session = doc
        except DuplicateKeyError:  # double-click / two tabs
            session = await db["sessions"].find_one({"student_id": student_id, "exam_id": exam_id})

    if session["status"] != SessionStatus.ONGOING.value:
        raise HTTPException(status.HTTP_409_CONFLICT, "You have already attempted this exam")

    if _remaining_seconds(session) == 0 and datetime.utcnow() > session["expires_at"] + timedelta(seconds=SUBMIT_GRACE_SECONDS):
        await db["sessions"].update_one(
            {"_id": session["_id"]},
            {"$set": {"status": SessionStatus.EXPIRED.value}},
        )
        raise HTTPException(status.HTTP_409_CONFLICT, "Time for this exam has run out")

    return {
        "success": True,
        "session_id": str(session["_id"]),
        "duration_minutes": exam.get("duration", 0),
        "started_at": to_json(session["started_at"]),
        "remaining_seconds": _remaining_seconds(session),
    }


# ─── Submit ──────────────────────────────────────────────────────────────────

@router.post("/sessions/submit")
async def submit_exam(payload: SessionSubmit, current_user: dict = student_only, db=Depends(get_db)):
    student_id = current_user["user_id"]
    sid = parse_object_id(payload.session_id, "session ID")

    session = await db["sessions"].find_one({"_id": sid, "student_id": student_id})
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session["status"] != SessionStatus.ONGOING.value:
        raise HTTPException(status.HTTP_409_CONFLICT, "This exam was already submitted")

    now = datetime.utcnow()
    if now > session["expires_at"] + timedelta(seconds=SUBMIT_GRACE_SECONDS):
        await db["sessions"].update_one(
            {"_id": sid}, {"$set": {"status": SessionStatus.EXPIRED.value}}
        )
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Time is up, this session has expired")

    graded = await ExamService(db).calculate_score(
        session["exam_id"], [a.dict() for a in payload.answers]
    )

    # Filter on status so a double-submit can't grade twice
    updated = await db["sessions"].update_one(
        {"_id": sid, "status": SessionStatus.ONGOING.value},
        {"$set": {
            "status": SessionStatus.SUBMITTED.value,
            "submitted_at": now,
            "score": graded["score"],
            "total_marks": graded["total_marks"],
            "percentage": graded["percentage"],
            "passed": graded["passed"],
            "answers": graded["graded_answers"],
        }},
    )
    if updated.matched_count == 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "This exam was already submitted")

    return {
        "success": True,
        "result": {
            "score": graded["score"],
            "total_marks": graded["total_marks"],
            "percentage": graded["percentage"],
            "passed": graded["passed"],
            "passing_marks": graded["passing_marks"],
        },
    }


# ─── Results ─────────────────────────────────────────────────────────────────

@router.get("/results")
async def get_all_student_results(current_user: dict = student_only, db=Depends(get_db)):
    results = await ResultService(db).get_student_results(current_user["user_id"])
    return {"success": True, "count": len(results), "results": to_json(results)}


@router.get("/results/{session_id}")
async def get_result_detail(session_id: str, current_user: dict = student_only, db=Depends(get_db)):
    session = await ResultService(db).get_session_detail(session_id, current_user["user_id"])
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Result not found")
    if session["status"] != SessionStatus.SUBMITTED.value:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This exam has not been submitted yet")
    return {"success": True, "result": to_json(session)}
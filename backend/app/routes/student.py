"""
ExamShield AI - Student Routes
Matches frontend studentService (services/examService.ts).
Grading is done server-side; correct answers never leave the server
until the session is submitted.
"""

import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.utils import oid, clean
from app.models.schemas import SessionStatus, SessionSubmit

logger = logging.getLogger(__name__)
router = APIRouter()

ONGOING = SessionStatus.ONGOING.value
DONE = [SessionStatus.SUBMITTED.value, SessionStatus.EXPIRED.value]
LATE_GRACE_SECONDS = 60


# ─── Dashboard ───────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def student_dashboard(user=Depends(get_current_user), db=Depends(get_db)):
    sid = user["user_id"]
    attempted = await db.sessions.count_documents({"student_id": sid, "status": {"$in": DONE}})
    passed = await db.sessions.count_documents(
        {"student_id": sid, "status": {"$in": DONE}, "passed": True}
    )
    return {
        "success": True,
        "stats": {
            "available_exams": await db.exams.count_documents({"is_published": True}),
            "attempted": attempted,
            "passed": passed,
            "failed": attempted - passed,
        },
    }


# ─── Exams ───────────────────────────────────────────────────────────────────

@router.get("/exams")
async def list_available_exams(user=Depends(get_current_user), db=Depends(get_db)):
    sid = user["user_id"]
    exams = await db.exams.find({"is_published": True}).sort("created_at", -1).to_list(None)

    status_by_exam = {}
    async for s in db.sessions.find({"student_id": sid}, {"exam_id": 1, "status": 1}):
        # a finished session wins over an ongoing one
        if s["exam_id"] not in status_by_exam or s["status"] in DONE:
            status_by_exam[s["exam_id"]] = s["status"]

    out = []
    for e in exams:
        row = clean(e)
        st = status_by_exam.get(row["_id"])
        row["attempted"] = st is not None
        row["session_status"] = st
        out.append(row)
    return {"success": True, "exams": out}


@router.get("/exams/{exam_id}")
async def get_exam_details(exam_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    exam = await db.exams.find_one({"_id": oid(exam_id), "is_published": True})
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    questions = await db.questions.find({"exam_id": exam_id}).sort("created_at", 1).to_list(None)
    safe = []
    for q in questions:
        q = clean(q)
        q.pop("correct_answer", None)  # never send answers before submission
        safe.append(q)
    return {"success": True, "exam": clean(exam), "questions": safe}


# ─── Session lifecycle ───────────────────────────────────────────────────────

@router.post("/exams/{exam_id}/start")
async def start_exam(exam_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    sid = user["user_id"]
    exam = await db.exams.find_one({"_id": oid(exam_id), "is_published": True})
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if await db.questions.count_documents({"exam_id": exam_id}) == 0:
        raise HTTPException(status_code=400, detail="This exam has no questions yet")
    if await db.sessions.find_one({"student_id": sid, "exam_id": exam_id, "status": {"$in": DONE}}):
        raise HTTPException(status_code=400, detail="You have already attempted this exam")

    now = datetime.utcnow()
    # Atomic "resume or create": a refresh or a double request returns the same session
    session = await db.sessions.find_one_and_update(
        {"student_id": sid, "exam_id": exam_id, "status": ONGOING},
        {"$setOnInsert": {
            "started_at": now,
            "expires_at": now + timedelta(minutes=exam["duration"]),
            "proctoring_alerts": [],
        }},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )

    remaining = max(0, int((session["expires_at"] - now).total_seconds()))
    return {
        "success": True,
        "session_id": str(session["_id"]),
        "duration_minutes": exam["duration"],
        "started_at": session["started_at"].isoformat() + "Z",
        "remaining_seconds": remaining,
    }


@router.post("/sessions/submit")
async def submit_session(payload: SessionSubmit, user=Depends(get_current_user), db=Depends(get_db)):
    sid = user["user_id"]
    session = await db.sessions.find_one({"_id": oid(payload.session_id), "student_id": sid})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["status"] != ONGOING:
        raise HTTPException(status_code=400, detail="This exam was already submitted")

    exam = await db.exams.find_one({"_id": oid(session["exam_id"])})
    if not exam:
        raise HTTPException(status_code=404, detail="Exam no longer exists")

    questions = [q async for q in db.questions.find({"exam_id": session["exam_id"]}).sort("created_at", 1)]
    given = {a.question_id: a.selected_answer for a in payload.answers}

    score, total, graded = 0, 0, []
    for q in questions:
        qid = str(q["_id"])
        marks = q.get("marks", 1)
        selected = given.get(qid, "")
        correct = bool(selected) and selected.strip().lower() == q["correct_answer"].strip().lower()
        total += marks
        score += marks if correct else 0
        graded.append({
            "question_id": qid,
            "question_text": q.get("question_text", ""),
            "selected_answer": selected,
            "correct_answer": q["correct_answer"],
            "is_correct": correct,
            "marks": marks,
            "marks_awarded": marks if correct else 0,
        })

    now = datetime.utcnow()
    late = now > session["expires_at"] + timedelta(seconds=LATE_GRACE_SECONDS)
    percentage = round(score / total * 100, 2) if total else 0
    passed = score >= exam.get("passing_marks", 0)

    result = {
        "status": SessionStatus.EXPIRED.value if late else SessionStatus.SUBMITTED.value,
        "score": score,
        "total_marks": total,
        "percentage": percentage,
        "passed": passed,
        "answers": graded,
        "submitted_at": now,
    }
    # Only flips an ongoing session, so a double-click can't grade twice
    updated = await db.sessions.update_one(
        {"_id": session["_id"], "status": ONGOING}, {"$set": result}
    )
    if updated.matched_count == 0:
        raise HTTPException(status_code=400, detail="This exam was already submitted")

    return {
        "success": True,
        "result": {
            "score": score,
            "total_marks": total,
            "percentage": percentage,
            "passed": passed,
            "passing_marks": exam.get("passing_marks", 0),
        },
    }


# ─── Results ─────────────────────────────────────────────────────────────────

@router.get("/results")
async def my_results(user=Depends(get_current_user), db=Depends(get_db)):
    sessions = await db.sessions.find(
        {"student_id": user["user_id"], "status": {"$in": DONE}}
    ).sort("submitted_at", -1).to_list(None)

    results = []
    for s in sessions:
        row = clean(s)
        row.pop("answers", None)
        exam = await db.exams.find_one({"_id": oid(s["exam_id"])}, {"title": 1})
        row["exam_title"] = exam["title"] if exam else "Deleted exam"
        results.append(row)
    return {"success": True, "results": results}


@router.get("/results/{session_id}")
async def result_detail(session_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    s = await db.sessions.find_one(
        {"_id": oid(session_id), "student_id": user["user_id"], "status": {"$in": DONE}}
    )
    if not s:
        raise HTTPException(status_code=404, detail="Result not found")
    exam = await db.exams.find_one({"_id": oid(s["exam_id"])}, {"title": 1})
    result = clean(s)
    result["exam_title"] = exam["title"] if exam else "Deleted exam"
    return {"success": True, "result": result}
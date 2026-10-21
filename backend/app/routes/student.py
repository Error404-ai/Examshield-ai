"""
ExamShield AI - Student Routes
Matches frontend studentService (services/examService.ts).
Grading is done server-side; correct answers never leave the server
until the session is submitted.

Grading: multiple-choice and true/false answers are marked at once. Written
answers (short answer / essay) are saved as grading="pending" and scored by AI in
the background (services/grading_service.py); the result shows grading_status
until that finishes.

Recovery: answers are autosaved to the session (draft_answers), so a refresh
or a dropped connection does not lose work. The draft is deleted on submit.

Privacy: students see the proctoring events recorded for their own attempt
(so they can appeal), but never the suspicion score or recommendation.
"""

import logging
from datetime import datetime, timedelta

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pymongo import ReturnDocument

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.utils import appeal_out, clean, oid
from app.models.schemas import (
    AppealIn,
    DraftSave,
    SessionStatus,
    SessionSubmit,
    StartIn,
)
from app.services.grading_service import WRITTEN_TYPES, grade_session

logger = logging.getLogger(__name__)
router = APIRouter()

ONGOING = SessionStatus.ONGOING.value
DONE = [SessionStatus.SUBMITTED.value, SessionStatus.EXPIRED.value]
LATE_GRACE_SECONDS = 60

MAX_DRAFT_ANSWERS = 500
MAX_ANSWER_CHARS = 20000

# Fields that never go to the student
_PRIVATE_FIELDS = (
    "draft_answers",
    "draft_saved_at",
    "expires_at",
    "consented_at",
    "proctoring_counts",
    "review_needed",
    "grading_error",
)

# Per-answer fields that stay with the examiner
_PRIVATE_ANSWER_FIELDS = ("confidence", "needs_review", "reviewed_by")


def _student_view(session: dict) -> dict:
    """A session as the student may see it: no counts, no timers, events renamed"""
    row = clean(session)
    for key in _PRIVATE_FIELDS:
        row.pop(key, None)
    if "answers" in row:
        row["answers"] = [
            {k: v for k, v in a.items() if k not in _PRIVATE_ANSWER_FIELDS}
            for a in row["answers"]
        ]
    row["integrity_events"] = row.pop("proctoring_alerts", [])
    row["appeal"] = appeal_out(session.get("appeal"))
    return row


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
        q.pop("rubric", None)          # the marking guide stays on the server too
        safe.append(q)
    return {"success": True, "exam": clean(exam), "questions": safe}


# ─── Session lifecycle ───────────────────────────────────────────────────────

@router.post("/exams/{exam_id}/start")
async def start_exam(
    exam_id: str, body: StartIn, user=Depends(get_current_user), db=Depends(get_db)
):
    """Start a session, or resume the ongoing one (same session, saved draft, tab count)."""
    if not body.consent:
        raise HTTPException(
            status_code=400, detail="You must accept the proctoring notice to start the exam"
        )

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
            "consented_at": now,
            "proctoring_alerts": [],
            "draft_answers": {},
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
        "draft_answers": session.get("draft_answers") or {},
        "tab_switch_count": (session.get("proctoring_counts") or {}).get("tab_switch", 0),
    }


@router.put("/sessions/{session_id}/answers")
async def save_draft(
    session_id: str, body: DraftSave, user=Depends(get_current_user), db=Depends(get_db)
):
    """Autosave the student's current answers. Replaces the previous draft."""
    if len(body.answers) > MAX_DRAFT_ANSWERS:
        raise HTTPException(status_code=400, detail="Too many answers")

    # Only real question ids become keys in the saved document
    drafts = {
        a.question_id: a.selected_answer[:MAX_ANSWER_CHARS]
        for a in body.answers
        if ObjectId.is_valid(a.question_id)
    }
    now = datetime.utcnow()
    result = await db.sessions.update_one(
        {
            "_id": oid(session_id),
            "student_id": user["user_id"],
            "status": ONGOING,
            "expires_at": {"$gt": now - timedelta(seconds=LATE_GRACE_SECONDS)},
        },
        {"$set": {"draft_answers": drafts, "draft_saved_at": now}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=409, detail="This session is no longer active")
    return {"success": True}


@router.post("/sessions/submit")
async def submit_session(
    payload: SessionSubmit,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
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
    # The saved draft fills any gap; answers sent with the submit win
    given = {
        **(session.get("draft_answers") or {}),
        **{a.question_id: a.selected_answer for a in payload.answers},
    }

    score, total, graded = 0, 0, []
    needs_ai = False
    for q in questions:
        qid = str(q["_id"])
        marks = q.get("marks", 1)
        qtype = q.get("question_type", "mcq")
        selected = given.get(qid, "")
        total += marks

        entry = {
            "question_id": qid,
            "question_type": qtype,
            "question_text": q.get("question_text", ""),
            "selected_answer": selected,
            "correct_answer": q["correct_answer"],
            "marks": marks,
        }

        if qtype in WRITTEN_TYPES:
            # Scored by AI after submit. A blank answer needs no AI: it is simply 0.
            if selected.strip():
                entry.update(is_correct=False, marks_awarded=0, grading="pending")
                needs_ai = True
            else:
                entry.update(is_correct=False, marks_awarded=0, grading="none")
        else:
            correct = bool(selected) and selected.strip().lower() == q["correct_answer"].strip().lower()
            score += marks if correct else 0
            entry.update(is_correct=correct, marks_awarded=marks if correct else 0, grading="none")

        graded.append(entry)

    now = datetime.utcnow()
    late = now > session["expires_at"] + timedelta(seconds=LATE_GRACE_SECONDS)
    percentage = round(score / total * 100, 2) if total else 0
    passed = score >= exam.get("passing_marks", 0)  # provisional while written answers are pending

    result = {
        "status": SessionStatus.EXPIRED.value if late else SessionStatus.SUBMITTED.value,
        "score": score,
        "total_marks": total,
        "percentage": percentage,
        "passed": passed,
        "answers": graded,
        "submitted_at": now,
        "grading_status": "pending" if needs_ai else "done",
        "review_needed": False,
    }
    # Only flips an ongoing session, so a double-click can't grade twice.
    # The draft has served its purpose, so it is removed.
    updated = await db.sessions.update_one(
        {"_id": session["_id"], "status": ONGOING},
        {"$set": result, "$unset": {"draft_answers": "", "draft_saved_at": ""}},
    )
    if updated.matched_count == 0:
        raise HTTPException(status_code=400, detail="This exam was already submitted")

    if needs_ai:
        background_tasks.add_task(grade_session, db, session["_id"])

    return {
        "success": True,
        "result": {
            "score": score,
            "total_marks": total,
            "percentage": percentage,
            "passed": passed,
            "passing_marks": exam.get("passing_marks", 0),
            "grading_pending": needs_ai,
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
        row = _student_view(s)
        row.pop("answers", None)
        row.pop("integrity_events", None)  # list view stays light
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
    result = _student_view(s)
    result["exam_title"] = exam["title"] if exam else "Deleted exam"
    return {"success": True, "result": result}


@router.post("/results/{session_id}/appeal")
async def file_appeal(
    session_id: str, body: AppealIn, user=Depends(get_current_user), db=Depends(get_db)
):
    """One appeal per finished attempt, only by the student who took it."""
    result = await db.sessions.update_one(
        {
            "_id": oid(session_id),
            "student_id": user["user_id"],
            "status": {"$in": DONE},
            "appeal": {"$exists": False},
        },
        {"$set": {"appeal": {
            "message": body.message.strip(),
            "status": "pending",
            "created_at": datetime.utcnow(),
            "admin_note": "",
            "resolved_at": None,
        }}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=400, detail="Result not found, or it was already appealed")
    return {"success": True}
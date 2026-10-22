"""
ExamShield AI - Proctoring Routes
Browser-side AI (MediaPipe) detects violations and reports short events here.
Events are stored on the session document (sessions.proctoring_alerts).
Admins review them per exam / per session.

Scoring (severity weights, thresholds, recommendation) lives in
services/integrity_logic.py, the single backend copy. The frontend mirror is
frontend/src/services/policy.ts.
"""

import logging
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo import ReturnDocument

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.core.utils import oid
from app.models.schemas import AlertSeverity, SessionStatus
from app.services.integrity_logic import (
    derive_status,
    iso,
    public_integrity,
    recommendation,
    suspicion,
)

logger = logging.getLogger(__name__)
router = APIRouter()

admin_only = require_role("admin")

ONGOING = SessionStatus.ONGOING.value
MAX_ALERTS_PER_SESSION = 500
# Keep equal to MAX_TAB_SWITCHES in frontend/src/services/policy.ts.
# The server only flags the session; the browser performs the auto-submit.
MAX_TAB_SWITCHES = 3

EventType = Literal[
    "tab_switch",
    "fullscreen_exit",
    "face_not_detected",
    "multiple_faces",
    "looking_away",
    "eyes_closed",
    "camera_blocked",
    "phone_detected",
]


class ProctoringEventIn(BaseModel):
    session_id: str
    alert_type: EventType
    severity: AlertSeverity
    description: str = Field("", max_length=300)


# ─── Student: report an event ────────────────────────────────────────────────

@router.post("/events")
async def log_event(
    body: ProctoringEventIn,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    alert = {
        "alert_type": body.alert_type,
        "severity": body.severity.value,
        "description": body.description,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

    # Only the owner of an ongoing session can add events to it
    session = await db.sessions.find_one_and_update(
        {"_id": oid(body.session_id), "student_id": user["user_id"], "status": ONGOING},
        {
            "$push": {
                "proctoring_alerts": {"$each": [alert], "$slice": -MAX_ALERTS_PER_SESSION}
            },
            "$inc": {f"proctoring_counts.{body.alert_type}": 1},
        },
        return_document=ReturnDocument.AFTER,
        projection={"proctoring_counts": 1, "tab_limit_reached": 1},
    )
    if not session:
        raise HTTPException(status_code=404, detail="Active session not found")

    counts = session.get("proctoring_counts", {})
    tab_count = counts.get("tab_switch", 0)
    limit_reached = tab_count >= MAX_TAB_SWITCHES

    # Record the breach once so the admin can see the limit was hit
    if limit_reached and not session.get("tab_limit_reached"):
        await db.sessions.update_one(
            {"_id": session["_id"]}, {"$set": {"tab_limit_reached": True}}
        )

    return {
        "success": True,
        "tab_switch_count": tab_count,
        "limit_reached": limit_reached,
    }


# ─── Admin: all sessions of one exam, with proctoring summary ────────────────

@router.get("/exams/{exam_id}/sessions")
async def exam_sessions(exam_id: str, admin=Depends(admin_only), db=Depends(get_db)):
    exam = await db.exams.find_one(
        {"_id": oid(exam_id), "created_by": admin["user_id"]}, {"title": 1}
    )
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    sessions = await db.sessions.find({"exam_id": exam_id}, {"answers": 0}).to_list(None)

    users = {}
    student_ids = list({s["student_id"] for s in sessions})
    if student_ids:
        async for u in db.users.find(
            {"_id": {"$in": [oid(i) for i in student_ids]}}, {"name": 1, "email": 1}
        ):
            users[str(u["_id"])] = u

    rows = []
    for s in sessions:
        alerts = s.get("proctoring_alerts", [])
        score = suspicion(alerts)
        student = users.get(s["student_id"], {})
        rows.append({
            "session_id": str(s["_id"]),
            "student_id": s["student_id"],
            "student_name": student.get("name", "Unknown"),
            "student_email": student.get("email", ""),
            "status": s.get("status"),
            "score": s.get("score"),
            "total_marks": s.get("total_marks"),
            "percentage": s.get("percentage"),
            "passed": s.get("passed"),
            "started_at": iso(s.get("started_at")),
            "submitted_at": iso(s.get("submitted_at")),
            "total_alerts": len(alerts),
            "counts": s.get("proctoring_counts", {}),
            "tab_limit_reached": bool(s.get("tab_limit_reached")),
            "suspicion_score": score,
            "recommendation": recommendation(score),
        })

    # Most suspicious first
    rows.sort(key=lambda r: (-r["suspicion_score"], r["started_at"] or ""))

    return {"success": True, "exam_title": exam["title"], "sessions": rows}


# ─── Admin: latest alerts for one exam ──────────────────────────────────────

@router.get("/exams/{exam_id}/alerts")
async def exam_alerts(exam_id: str, admin=Depends(admin_only), db=Depends(get_db)):
    exam = await db.exams.find_one(
        {"_id": oid(exam_id), "created_by": admin["user_id"]}, {"title": 1}
    )
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    rows = await db.sessions.aggregate([
        {"$match": {"exam_id": exam_id, "proctoring_alerts.0": {"$exists": True}}},
        {"$unwind": "$proctoring_alerts"},
        {"$sort": {"proctoring_alerts.timestamp": -1}},
        {"$limit": 10},
        {
            "$project": {
                "_id": 0,
                "session_id": {"$toString": "$_id"},
                "student_id": 1,
                "alert_type": "$proctoring_alerts.alert_type",
                "severity": "$proctoring_alerts.severity",
                "description": "$proctoring_alerts.description",
                "timestamp": "$proctoring_alerts.timestamp",
            }
        },
    ]).to_list(10)

    student_ids = {row["student_id"] for row in rows}
    students = {}
    if student_ids:
        async for student in db.users.find(
            {"_id": {"$in": [oid(student_id) for student_id in student_ids]}},
            {"name": 1},
        ):
            students[str(student["_id"])] = student.get("name", "Unknown")

    alerts = [
        {
            **row,
            "student_name": students.get(row["student_id"], "Unknown"),
        }
        for row in rows
    ]
    return {"success": True, "exam_title": exam["title"], "alerts": alerts}


# ─── Admin: alert timeline of one session ────────────────────────────────────

@router.get("/sessions/{session_id}/alerts")
async def session_alerts(session_id: str, admin=Depends(admin_only), db=Depends(get_db)):
    session = await db.sessions.find_one({"_id": oid(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Admins can only see sessions of their own exams
    exam = await db.exams.find_one(
        {"_id": oid(session["exam_id"]), "created_by": admin["user_id"]}, {"title": 1}
    )
    if not exam:
        raise HTTPException(status_code=404, detail="Session not found")

    student = await db.users.find_one({"_id": oid(session["student_id"])}, {"name": 1, "email": 1})
    alerts = session.get("proctoring_alerts", [])
    score = suspicion(alerts)
    integrity = session.get("integrity") or {}

    return {
        "success": True,
        "session_id": session_id,
        "exam_title": exam["title"],
        "student_name": (student or {}).get("name", "Unknown"),
        "student_email": (student or {}).get("email", ""),
        "total_alerts": len(alerts),
        "counts": session.get("proctoring_counts", {}),
        "tab_limit_reached": bool(session.get("tab_limit_reached")),
        "suspicion_score": score,
        "recommendation": recommendation(score),
        "alerts": alerts,
        "integrity_status": None if session.get("status") == ONGOING else derive_status(session),
        "integrity": public_integrity(integrity, admin=True),
    }
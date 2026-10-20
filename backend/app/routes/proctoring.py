"""
ExamShield AI - Proctoring Routes
Browser-side AI (MediaPipe) detects violations and reports short events here.
Events are stored on the session document (sessions.proctoring_alerts).
Admins review them per exam / per session; integrity decisions live in routes/integrity.py.
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

# "phone_detected" is emitted by the browser (useProctoring) but used to be missing
# here, so every phone event was rejected with a 422 and never saved.
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


# ─── Helpers ─────────────────────────────────────────────────────────────────
def _integrity_status(session: dict):
    """Integrity decisions are only available after the student submits."""
    return None if session.get("status") == ONGOING else derive_status(session)


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
        projection={"proctoring_counts": 1},
    )
    if not session:
        raise HTTPException(status_code=404, detail="Active session not found")

    counts = session.get("proctoring_counts", {})
    return {"success": True, "tab_switch_count": counts.get("tab_switch", 0)}


# ─── Admin: all sessions of one exam, with proctoring summary ────────────────

@router.get("/exams/{exam_id}/sessions")
async def exam_sessions(exam_id: str, admin=Depends(admin_only), db=Depends(get_db)):
    exam = await db.exams.find_one(
        {"_id": oid(exam_id), "created_by": admin["user_id"]}, {"title": 1}
    )
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    sessions = await db.sessions.find(
        {"exam_id": exam_id}, {"answers": 0, "draft_answers": 0}
    ).to_list(None)

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
            "suspicion_score": score,
            "recommendation": recommendation(score),
            "integrity_status": _integrity_status(s),
        })

    # Most suspicious first
    rows.sort(key=lambda r: (-r["suspicion_score"], r["started_at"] or ""))

    return {"success": True, "exam_title": exam["title"], "sessions": rows}


# ─── Admin: alert timeline of one session ────────────────────────────────────

async def _owned_session(db, session_id: str, admin_id: str, projection=None):
    """Session of one of this admin's exams, or 404 (same answer for both cases)"""
    session = await db.sessions.find_one({"_id": oid(session_id)}, projection)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    exam = await db.exams.find_one(
        {"_id": oid(session["exam_id"]), "created_by": admin_id}, {"title": 1}
    )
    if not exam:
        raise HTTPException(status_code=404, detail="Session not found")
    return session, exam


@router.get("/sessions/{session_id}/alerts")
async def session_alerts(session_id: str, admin=Depends(admin_only), db=Depends(get_db)):
    session, exam = await _owned_session(
        db, session_id, admin["user_id"], {"answers": 0, "draft_answers": 0}
    )

    student = await db.users.find_one({"_id": oid(session["student_id"])}, {"name": 1, "email": 1})
    alerts = session.get("proctoring_alerts", [])
    score = suspicion(alerts)

    return {
        "success": True,
        "session_id": session_id,
        "exam_title": exam["title"],
        "student_name": (student or {}).get("name", "Unknown"),
        "student_email": (student or {}).get("email", ""),
        "total_alerts": len(alerts),
        "counts": session.get("proctoring_counts", {}),
        "suspicion_score": score,
        "recommendation": recommendation(score),
        "integrity_status": _integrity_status(session),
        "integrity": public_integrity(session.get("integrity") or {}, admin=True),
        "alerts": alerts,
    }

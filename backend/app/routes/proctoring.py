"""
ExamShield AI - Proctoring Routes
The AI (MediaPipe face detection) runs in the student's browser and sends only
small event records here. No video frames are uploaded or stored.

Events are saved on the exam session document (sessions.proctoring_alerts),
so they live and die with the session.
"""

import logging
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pymongo import ReturnDocument

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.core.utils import oid
from app.models.schemas import SessionStatus

logger = logging.getLogger(__name__)
router = APIRouter()

admin_only = require_role("admin")

MAX_TAB_SWITCHES = 5        # at this many tab switches the exam is ended
MAX_STORED_EVENTS = 500     # per session, oldest are dropped first

EventType = Literal["tab_switch", "no_face", "multiple_faces", "looking_away", "camera_off"]

# Severity and wording are decided by the server, not the browser
EVENT_INFO = {
    "tab_switch": ("high", "Student left the exam tab"),
    "no_face": ("high", "No face detected in the camera"),
    "multiple_faces": ("critical", "More than one person detected"),
    "looking_away": ("medium", "Student looked away from the screen"),
    "camera_off": ("critical", "Camera was turned off"),
}

SEVERITY_WEIGHTS = {"critical": 25, "high": 10, "medium": 3, "low": 1}


class ProctoringEventIn(BaseModel):
    session_id: str
    alert_type: EventType


def _iso(value) -> str:
    """Stored as naive UTC datetimes"""
    return value.isoformat() + "Z" if isinstance(value, datetime) else str(value)


# ─── Student: log one event ──────────────────────────────────────────────────

@router.post("/event")
async def log_event(
    body: ProctoringEventIn,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    severity, description = EVENT_INFO[body.alert_type]
    event = {
        "alert_type": body.alert_type,
        "severity": severity,
        "description": description,
        "timestamp": datetime.utcnow(),
    }

    update = {
        "$push": {"proctoring_alerts": {"$each": [event], "$slice": -MAX_STORED_EVENTS}}
    }
    if body.alert_type == "tab_switch":
        update["$inc"] = {"tab_switches": 1}

    # Only the student's own, still-running session can receive events
    session = await db.sessions.find_one_and_update(
        {
            "_id": oid(body.session_id),
            "student_id": user["user_id"],
            "status": SessionStatus.ONGOING.value,
        },
        update,
        return_document=ReturnDocument.AFTER,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Active session not found")

    tab_switches = session.get("tab_switches", 0)
    terminate = tab_switches >= MAX_TAB_SWITCHES
    if terminate and not session.get("proctoring_terminated"):
        await db.sessions.update_one(
            {"_id": session["_id"]}, {"$set": {"proctoring_terminated": True}}
        )
        logger.warning(f"Session {body.session_id} ended by proctoring (tab switches)")

    return {"success": True, "tab_switch_count": tab_switches, "terminate": terminate}


# ─── Admin: report for one session ───────────────────────────────────────────

@router.get("/report/{session_id}")
async def get_report(session_id: str, admin=Depends(admin_only), db=Depends(get_db)):
    session = await db.sessions.find_one({"_id": oid(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Admins can only see sessions of their own exams
    owned = await db.exams.find_one(
        {"_id": oid(session["exam_id"]), "created_by": admin["user_id"]}, {"_id": 1}
    )
    if not owned:
        raise HTTPException(status_code=404, detail="Session not found")

    events = session.get("proctoring_alerts", [])
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for e in events:
        sev = e.get("severity", "low")
        counts[sev] = counts.get(sev, 0) + 1

    score = min(100, sum(SEVERITY_WEIGHTS[s] * n for s, n in counts.items()))
    if score < 20:
        recommendation = "approve"
    elif score < 50:
        recommendation = "review"
    else:
        recommendation = "reject"

    report = {
        "session_id": session_id,
        "total_events": len(events),
        "critical_incidents": counts["critical"],
        "high_incidents": counts["high"],
        "medium_incidents": counts["medium"],
        "low_incidents": counts["low"],
        "tab_switches": session.get("tab_switches", 0),
        "terminated_by_proctoring": bool(session.get("proctoring_terminated")),
        "suspicion_score": score,
        "recommendation": recommendation,
        "generated_at": _iso(datetime.utcnow()),
        "alerts": [
            {
                "alert_type": e.get("alert_type"),
                "severity": e.get("severity"),
                "description": e.get("description"),
                "timestamp": _iso(e.get("timestamp")),
            }
            for e in events[-100:]
        ],
    }
    return {"success": True, "report": report}
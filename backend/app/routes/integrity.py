"""
ExamShield AI - Integrity Review Routes
Admins work a queue of flagged sessions across all their exams and confirm or
dismiss each flag. A confirmed flag can be appealed by the student, and the
admin then upholds or overturns it. Every step is written to the session's
integrity.history so there is an audit trail.
"""

import logging
from datetime import datetime
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from pymongo import ReturnDocument

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.core.utils import oid
from app.models.schemas import SessionStatus
from app.services.integrity_logic import (
    HIDDEN_FROM_STUDENT,
    NOTE_MAX,
    appeal_block_reason,
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


# ─── Request bodies ──────────────────────────────────────────────────────────

class DecisionIn(BaseModel):
    decision: Literal["confirmed", "dismissed"]
    note: str = Field("", max_length=NOTE_MAX)

    @field_validator("note")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @model_validator(mode="after")
    def _confirmed_needs_note(self):
        if self.decision == "confirmed" and len(self.note) < 5:
            raise ValueError("Add a short note explaining why the flag is confirmed")
        return self


class AppealIn(BaseModel):
    message: str = Field(..., max_length=NOTE_MAX)

    @field_validator("message")
    @classmethod
    def _min_length(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 20:
            raise ValueError("Please explain your appeal in at least 20 characters")
        return v


class ResolveIn(BaseModel):
    outcome: Literal["upheld", "overturned"]
    note: str = Field(..., max_length=NOTE_MAX)

    @field_validator("note")
    @classmethod
    def _need_note(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 5:
            raise ValueError("Add a short note for the student")
        return v


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _entry(action: str, by: str, role: str, note: str, at: datetime) -> Dict[str, Any]:
    return {"action": action, "by": by, "role": role, "note": note, "at": at}


async def _owned_session(db, session_id: str, admin: Dict[str, Any]):
    """The session plus its exam, only if the exam belongs to this admin"""
    session = await db.sessions.find_one({"_id": oid(session_id)}, {"answers": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    exam = await db.exams.find_one(
        {"_id": oid(session["exam_id"]), "created_by": admin["user_id"]}, {"title": 1}
    )
    if not exam:
        raise HTTPException(status_code=404, detail="Session not found")
    return session, exam


async def _own_finished_session(db, session_id: str, user: Dict[str, Any]):
    """A student's own submitted session. Anything not confirmed against them is a 404."""
    session = await db.sessions.find_one(
        {"_id": oid(session_id), "student_id": user["user_id"], "status": {"$ne": ONGOING}},
        {"answers": 0},
    )
    if not session or derive_status(session) in HIDDEN_FROM_STUDENT:
        raise HTTPException(status_code=404, detail="Nothing to show for this attempt")
    return session


def _student_view(session: Dict[str, Any], now: datetime) -> Dict[str, Any]:
    info = public_integrity(session.get("integrity") or {}, admin=False)
    alerts = session.get("proctoring_alerts", [])
    reason = appeal_block_reason(session, now)
    return {
        "flagged": True,
        "status": derive_status(session),
        "decision_note": info["decision_note"],
        "decided_at": info["decided_at"],
        "appeal": info["appeal"],
        "appeal_deadline": info["appeal_deadline"],
        "can_appeal": reason is None,
        "appeal_block_reason": reason,
        "total_alerts": len(alerts),
        "counts": session.get("proctoring_counts", {}),
        "alerts": [
            {k: a.get(k) for k in ("alert_type", "severity", "description", "timestamp")}
            for a in alerts
        ],
    }


# ─── Admin: the queue ────────────────────────────────────────────────────────

@router.get("/queue")
async def queue(
    status: Literal["pending", "appealed", "resolved", "all"] = "pending",
    exam_id: Optional[str] = None,
    admin=Depends(admin_only),
    db=Depends(get_db),
):
    exams = {
        str(e["_id"]): e["title"]
        async for e in db.exams.find({"created_by": admin["user_id"]}, {"title": 1})
    }
    if exam_id is not None and exam_id not in exams:
        raise HTTPException(status_code=404, detail="Exam not found")
    exam_ids = [exam_id] if exam_id else list(exams)

    counts = {"pending": 0, "appealed": 0, "resolved": 0, "all": 0}
    if not exam_ids:
        return {"success": True, "counts": counts, "rows": []}

    # Sessions still in progress are not reviewable yet
    sessions = await db.sessions.find(
        {"exam_id": {"$in": exam_ids}, "status": {"$ne": ONGOING}}, {"answers": 0}
    ).to_list(None)

    picked = []
    for s in sessions:
        st = derive_status(s)
        if st == "clear":
            continue
        bucket = st if st in ("pending", "appealed") else "resolved"
        counts[bucket] += 1
        counts["all"] += 1
        if status == "all" or status == bucket:
            picked.append((s, st))

    users: Dict[str, Any] = {}
    student_ids = list({s["student_id"] for s, _ in picked})
    if student_ids:
        async for u in db.users.find(
            {"_id": {"$in": [oid(i) for i in student_ids]}}, {"name": 1, "email": 1}
        ):
            users[str(u["_id"])] = u

    rows = []
    for s, st in picked:
        alerts = s.get("proctoring_alerts", [])
        score = suspicion(alerts)
        integrity = s.get("integrity") or {}
        appeal = integrity.get("appeal") or {}
        student = users.get(s["student_id"], {})
        rows.append({
            "session_id": str(s["_id"]),
            "exam_id": s["exam_id"],
            "exam_title": exams.get(s["exam_id"], "Deleted exam"),
            "student_id": s["student_id"],
            "student_name": student.get("name", "Unknown"),
            "student_email": student.get("email", ""),
            "status": st,
            "session_status": s.get("status"),
            "percentage": s.get("percentage"),
            "submitted_at": iso(s.get("submitted_at")),
            "total_alerts": len(alerts),
            "counts": s.get("proctoring_counts", {}),
            "suspicion_score": score,
            "recommendation": recommendation(score),
            "decided_at": iso(integrity.get("decided_at")),
            "appeal_submitted_at": iso(appeal.get("submitted_at")),
        })

    # Open appeals first, then the highest risk, then the oldest submission
    rows.sort(key=lambda r: (r["status"] != "appealed", -r["suspicion_score"], r["submitted_at"] or ""))
    return {"success": True, "counts": counts, "rows": rows}


# ─── Admin: decide a flag ────────────────────────────────────────────────────

@router.post("/sessions/{session_id}/decision")
async def decide(
    session_id: str,
    body: DecisionIn,
    admin=Depends(admin_only),
    db=Depends(get_db),
):
    session, _ = await _owned_session(db, session_id, admin)
    if session.get("status") == ONGOING:
        raise HTTPException(status_code=409, detail="Wait until the student submits before deciding")
    if derive_status(session) != "pending":
        raise HTTPException(status_code=409, detail="This session has no flag waiting for a decision")

    now = datetime.utcnow()
    who = admin.get("email") or admin["user_id"]
    # The filter makes it a compare-and-set: two admins (or a double click) can't both decide
    updated = await db.sessions.find_one_and_update(
        {"_id": session["_id"], "status": {"$ne": ONGOING}, "integrity.decision": None},
        {
            "$set": {
                "integrity.decision": body.decision,
                "integrity.decision_note": body.note,
                "integrity.decided_by": who,
                "integrity.decided_at": now,
            },
            "$push": {"integrity.history": _entry(body.decision, who, "admin", body.note, now)},
        },
        return_document=ReturnDocument.AFTER,
        projection={"integrity": 1},
    )
    if not updated:
        raise HTTPException(status_code=409, detail="This flag was already decided")

    logger.info(f"Integrity: {who} {body.decision} session {session_id}")
    return {
        "success": True,
        "status": derive_status(updated),
        "integrity": public_integrity(updated["integrity"], admin=True),
    }


# ─── Admin: answer an appeal ─────────────────────────────────────────────────

@router.post("/sessions/{session_id}/appeal/resolve")
async def resolve_appeal(
    session_id: str,
    body: ResolveIn,
    admin=Depends(admin_only),
    db=Depends(get_db),
):
    session, _ = await _owned_session(db, session_id, admin)
    if derive_status(session) != "appealed":
        raise HTTPException(status_code=409, detail="There is no open appeal on this session")

    now = datetime.utcnow()
    who = admin.get("email") or admin["user_id"]
    updated = await db.sessions.find_one_and_update(
        {"_id": session["_id"], "integrity.appeal.status": "open"},
        {
            "$set": {
                "integrity.appeal.status": body.outcome,
                "integrity.appeal.response_note": body.note,
                "integrity.appeal.resolved_by": who,
                "integrity.appeal.resolved_at": now,
            },
            "$push": {"integrity.history": _entry(body.outcome, who, "admin", body.note, now)},
        },
        return_document=ReturnDocument.AFTER,
        projection={"integrity": 1},
    )
    if not updated:
        raise HTTPException(status_code=409, detail="This appeal was already answered")

    logger.info(f"Integrity: {who} {body.outcome} appeal on session {session_id}")
    return {
        "success": True,
        "status": derive_status(updated),
        "integrity": public_integrity(updated["integrity"], admin=True),
    }


# ─── Student: see a confirmed flag and appeal it ─────────────────────────────

@router.get("/my/{session_id}")
async def my_integrity(session_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    """
    Students only hear about a flag once an examiner has confirmed it.
    Pending and dismissed flags look the same as no flag at all.
    """
    session = await db.sessions.find_one(
        {"_id": oid(session_id), "student_id": user["user_id"], "status": {"$ne": ONGOING}},
        {"answers": 0},
    )
    if not session or derive_status(session) in HIDDEN_FROM_STUDENT:
        return {"success": True, "flagged": False}
    return {"success": True, **_student_view(session, datetime.utcnow())}


@router.post("/my/{session_id}/appeal")
async def appeal(
    session_id: str,
    body: AppealIn,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    session = await _own_finished_session(db, session_id, user)
    now = datetime.utcnow()
    reason = appeal_block_reason(session, now)
    if reason:
        raise HTTPException(status_code=409, detail=reason)

    who = user.get("email") or user["user_id"]
    updated = await db.sessions.find_one_and_update(
        {
            "_id": session["_id"],
            "student_id": user["user_id"],
            "integrity.decision": "confirmed",
            "integrity.appeal": None,
        },
        {
            "$set": {
                "integrity.appeal": {
                    "message": body.message,
                    "submitted_at": now,
                    "status": "open",
                    "response_note": None,
                    "resolved_by": None,
                    "resolved_at": None,
                }
            },
            "$push": {"integrity.history": _entry("appealed", who, "student", body.message, now)},
        },
        return_document=ReturnDocument.AFTER,
        projection={"answers": 0},
    )
    if not updated:
        raise HTTPException(status_code=409, detail="This flag has already been appealed.")

    logger.info(f"Integrity: student {user['user_id']} appealed session {session_id}")
    return {"success": True, **_student_view(updated, now)}

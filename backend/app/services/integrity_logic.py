"""
Integrity Logic
Pure helpers for the integrity review workflow. No database or web imports,
so the rules can be tested on their own.

A session's integrity state lives in one sub-document, created on the first decision:

    sessions.integrity = {
        decision: "confirmed" | "dismissed" | None,
        decision_note, decided_by, decided_at,
        appeal: None | {message, submitted_at, status: open|upheld|overturned,
                        response_note, resolved_by, resolved_at},
        history: [{action, by, role, note, at}],
    }

The status shown in the UI is derived from it, never stored:

    clear      no flag (suspicion score below the review threshold)
    pending    flagged, waiting for an examiner decision
    dismissed  examiner dismissed the flag (student is never told)
    confirmed  examiner confirmed the flag (student can appeal)
    appealed   student appealed, waiting for the examiner
    upheld     examiner kept the flag after the appeal
    overturned examiner removed the flag after the appeal
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

# Weights used for the suspicion score shown to admins
SEVERITY_WEIGHT = {"low": 1, "medium": 3, "high": 8, "critical": 15}
APPROVE_BELOW = 20
REVIEW_BELOW = 50

APPEAL_WINDOW_DAYS = 7
NOTE_MAX = 1000

# Statuses a student must not see (nothing was confirmed against them)
HIDDEN_FROM_STUDENT = {"clear", "pending", "dismissed"}


def suspicion(alerts: List[Dict[str, Any]]) -> int:
    return min(100, sum(SEVERITY_WEIGHT.get(a.get("severity"), 0) for a in alerts))


def recommendation(score: int) -> str:
    if score < APPROVE_BELOW:
        return "approve"
    if score < REVIEW_BELOW:
        return "review"
    return "reject"


def iso(value: Any) -> Optional[str]:
    """Naive-UTC datetime -> ISO string with Z (None if missing)"""
    return value.isoformat() + "Z" if isinstance(value, datetime) else None


def derive_status(session: Dict[str, Any]) -> str:
    integrity = session.get("integrity") or {}
    decision = integrity.get("decision")

    if not decision:
        score = suspicion(session.get("proctoring_alerts", []))
        return "clear" if recommendation(score) == "approve" else "pending"
    if decision == "dismissed":
        return "dismissed"

    appeal = integrity.get("appeal")
    if not appeal:
        return "confirmed"
    outcome = appeal.get("status")
    return outcome if outcome in ("upheld", "overturned") else "appealed"


def appeal_deadline(integrity: Dict[str, Any]) -> Optional[datetime]:
    decided_at = integrity.get("decided_at")
    if isinstance(decided_at, datetime):
        return decided_at + timedelta(days=APPEAL_WINDOW_DAYS)
    return None


def appeal_block_reason(session: Dict[str, Any], now: datetime) -> Optional[str]:
    """None when the student may appeal now, otherwise a short reason"""
    status = derive_status(session)
    if status in ("appealed", "upheld", "overturned"):
        return "This flag has already been appealed."
    if status != "confirmed":
        return "There is no confirmed flag on this attempt."
    deadline = appeal_deadline(session.get("integrity") or {})
    if deadline and now > deadline:
        return "The appeal window for this flag has closed."
    return None


def public_integrity(integrity: Dict[str, Any], *, admin: bool) -> Dict[str, Any]:
    """JSON-safe view. Students never see who decided or the internal history."""
    appeal = integrity.get("appeal")
    out: Dict[str, Any] = {
        "decision": integrity.get("decision"),
        "decision_note": integrity.get("decision_note", ""),
        "decided_at": iso(integrity.get("decided_at")),
        "appeal_deadline": iso(appeal_deadline(integrity)),
        "appeal": None,
    }
    if appeal:
        out["appeal"] = {
            "message": appeal.get("message", ""),
            "submitted_at": iso(appeal.get("submitted_at")),
            "status": appeal.get("status", "open"),
            "response_note": appeal.get("response_note"),
            "resolved_at": iso(appeal.get("resolved_at")),
        }
        if admin:
            out["appeal"]["resolved_by"] = appeal.get("resolved_by")
    if admin:
        out["decided_by"] = integrity.get("decided_by")
        out["history"] = [
            {**h, "at": iso(h.get("at"))} for h in integrity.get("history", [])
        ]
    return out

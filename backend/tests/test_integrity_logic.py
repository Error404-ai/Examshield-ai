"""Pure rules: scoring, derived status and the appeal window (no database)"""

from datetime import datetime, timedelta

from app.services.integrity_logic import (
    APPEAL_WINDOW_DAYS,
    appeal_block_reason,
    derive_status,
    public_integrity,
    recommendation,
    suspicion,
)

NOW = datetime(2026, 3, 1, 12, 0)


def alert(severity):
    return {"severity": severity}


def test_suspicion_weights_and_cap():
    assert suspicion([]) == 0
    assert suspicion([alert("low"), alert("medium"), alert("high"), alert("critical")]) == 27
    assert suspicion([alert("critical")] * 20) == 100
    assert suspicion([alert("bogus")]) == 0


def test_recommendation_thresholds():
    assert recommendation(19) == "approve"
    assert recommendation(20) == "review"
    assert recommendation(49) == "review"
    assert recommendation(50) == "reject"


def test_status_clear_and_pending():
    assert derive_status({"proctoring_alerts": [alert("low")]}) == "clear"
    assert derive_status({"proctoring_alerts": [alert("critical")] * 2}) == "pending"


def test_status_after_decisions():
    flagged = {"proctoring_alerts": [alert("critical")] * 4}
    assert derive_status({**flagged, "integrity": {"decision": "dismissed"}}) == "dismissed"
    assert derive_status({**flagged, "integrity": {"decision": "confirmed"}}) == "confirmed"
    base = {"decision": "confirmed", "appeal": {"status": "open"}}
    assert derive_status({**flagged, "integrity": base}) == "appealed"
    for outcome in ("upheld", "overturned"):
        integ = {"decision": "confirmed", "appeal": {"status": outcome}}
        assert derive_status({**flagged, "integrity": integ}) == outcome


def test_decision_wins_even_if_alerts_drop():
    # A decided session keeps its status regardless of the alert list
    assert derive_status({"proctoring_alerts": [], "integrity": {"decision": "confirmed"}}) == "confirmed"


def test_appeal_window():
    decided = NOW - timedelta(days=APPEAL_WINDOW_DAYS - 1)
    open_session = {"integrity": {"decision": "confirmed", "decided_at": decided}}
    assert appeal_block_reason(open_session, NOW) is None

    late = {"integrity": {"decision": "confirmed", "decided_at": NOW - timedelta(days=APPEAL_WINDOW_DAYS + 1)}}
    assert "closed" in appeal_block_reason(late, NOW)


def test_appeal_blocked_when_not_confirmed_or_already_appealed():
    assert appeal_block_reason({"proctoring_alerts": []}, NOW) is not None
    appealed = {"integrity": {"decision": "confirmed", "decided_at": NOW, "appeal": {"status": "open"}}}
    assert "already" in appeal_block_reason(appealed, NOW)


def test_student_view_hides_admin_fields():
    integ = {
        "decision": "confirmed",
        "decision_note": "Second face on camera",
        "decided_by": "admin@example.com",
        "decided_at": NOW,
        "history": [{"action": "confirmed", "by": "admin@example.com", "role": "admin", "note": "", "at": NOW}],
        "appeal": {"message": "That was my sibling", "submitted_at": NOW, "status": "upheld", "resolved_by": "admin@example.com"},
    }
    student = public_integrity(integ, admin=False)
    assert "decided_by" not in student and "history" not in student
    assert "resolved_by" not in student["appeal"]

    admin = public_integrity(integ, admin=True)
    assert admin["decided_by"] == "admin@example.com"
    assert admin["history"][0]["at"].endswith("Z")

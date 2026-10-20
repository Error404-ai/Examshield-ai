"""Integrity review routes: queue, decisions, student visibility, appeals"""

from datetime import datetime, timedelta

from tests.conftest import alerts

Q = "/api/integrity/queue"


# ─── Queue ───────────────────────────────────────────────────────────────────

async def test_queue_lists_only_flagged_finished_sessions(http, world):
    flagged = await world.make_session(alert_list=alerts(4))
    await world.make_session(student="student2", alert_list=alerts(1, "low"))  # clear
    await world.make_session(alert_list=alerts(4), status="ongoing")  # not submitted yet

    res = await http.get(Q, headers=world.admin)
    assert res.status_code == 200
    body = res.json()
    assert [r["session_id"] for r in body["rows"]] == [flagged]
    assert body["rows"][0]["status"] == "pending"
    assert body["rows"][0]["student_name"] == "Student"
    assert body["counts"] == {"pending": 1, "appealed": 0, "resolved": 0, "all": 1}


async def test_queue_is_scoped_to_the_admins_own_exams(http, world):
    await world.make_session(alert_list=alerts(4))
    res = await http.get(Q, headers=world.other_admin)
    assert res.status_code == 200
    assert res.json()["rows"] == []


async def test_queue_requires_admin(http, world):
    assert (await http.get(Q, headers=world.student)).status_code == 403
    assert (await http.get(Q)).status_code in (401, 403)


async def test_queue_rejects_someone_elses_exam_filter(http, world):
    res = await http.get(Q, params={"exam_id": world.exam_id}, headers=world.other_admin)
    assert res.status_code == 404


async def test_open_appeals_sort_first(http, world):
    pending = await world.make_session(alert_list=alerts(6))
    appealed = await world.make_session(
        student="student2",
        alert_list=alerts(4),
        integrity={
            "decision": "confirmed",
            "decided_at": datetime.utcnow(),
            "appeal": {"status": "open", "message": "x" * 25, "submitted_at": datetime.utcnow()},
        },
    )
    res = await http.get(Q, params={"status": "all"}, headers=world.admin)
    assert [r["session_id"] for r in res.json()["rows"]] == [appealed, pending]


# ─── Decisions ───────────────────────────────────────────────────────────────

async def test_confirm_needs_a_note(http, world):
    sid = await world.make_session(alert_list=alerts(4))
    res = await http.post(
        f"/api/integrity/sessions/{sid}/decision",
        json={"decision": "confirmed", "note": ""},
        headers=world.admin,
    )
    assert res.status_code == 422


async def test_confirm_records_decision_and_history(http, world):
    sid = await world.make_session(alert_list=alerts(4))
    res = await http.post(
        f"/api/integrity/sessions/{sid}/decision",
        json={"decision": "confirmed", "note": "A second person sat next to the student"},
        headers=world.admin,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "confirmed"
    assert body["integrity"]["decided_by"] == "admin@example.com"
    assert body["integrity"]["history"][0]["action"] == "confirmed"


async def test_a_flag_can_only_be_decided_once(http, world):
    sid = await world.make_session(alert_list=alerts(4))
    url = f"/api/integrity/sessions/{sid}/decision"
    first = await http.post(url, json={"decision": "dismissed"}, headers=world.admin)
    assert first.status_code == 200
    second = await http.post(url, json={"decision": "confirmed", "note": "changed my mind"}, headers=world.admin)
    assert second.status_code == 409


async def test_cannot_decide_an_unflagged_or_ongoing_session(http, world):
    clear = await world.make_session(alert_list=alerts(1, "low"))
    ongoing = await world.make_session(student="student2", alert_list=alerts(4), status="ongoing")
    for sid in (clear, ongoing):
        res = await http.post(
            f"/api/integrity/sessions/{sid}/decision", json={"decision": "dismissed"}, headers=world.admin
        )
        assert res.status_code == 409


async def test_other_admin_cannot_decide(http, world):
    sid = await world.make_session(alert_list=alerts(4))
    res = await http.post(
        f"/api/integrity/sessions/{sid}/decision", json={"decision": "dismissed"}, headers=world.other_admin
    )
    assert res.status_code == 404


async def test_session_detail_includes_integrity(http, world):
    sid = await world.make_session(alert_list=alerts(4))
    res = await http.get(f"/api/proctoring/sessions/{sid}/alerts", headers=world.admin)
    assert res.status_code == 200
    assert res.json()["integrity_status"] == "pending"
    assert res.json()["integrity"]["history"] == []


# ─── Student visibility ──────────────────────────────────────────────────────

async def test_student_sees_nothing_while_pending_or_dismissed(http, world):
    sid = await world.make_session(alert_list=alerts(4))
    mine = f"/api/integrity/my/{sid}"
    assert (await http.get(mine, headers=world.student)).json() == {"success": True, "flagged": False}

    await http.post(f"/api/integrity/sessions/{sid}/decision", json={"decision": "dismissed"}, headers=world.admin)
    assert (await http.get(mine, headers=world.student)).json()["flagged"] is False


async def test_student_sees_a_confirmed_flag(http, world):
    sid = await world.make_session(alert_list=alerts(4))
    await http.post(
        f"/api/integrity/sessions/{sid}/decision",
        json={"decision": "confirmed", "note": "Second face on camera"},
        headers=world.admin,
    )
    res = await http.get(f"/api/integrity/my/{sid}", headers=world.student)
    body = res.json()
    assert body["flagged"] is True and body["status"] == "confirmed"
    assert body["decision_note"] == "Second face on camera"
    assert body["can_appeal"] is True
    assert len(body["alerts"]) == 4
    assert "history" not in body and "decided_by" not in body


async def test_student_cannot_read_another_students_flag(http, world):
    sid = await world.make_session(alert_list=alerts(4))
    await http.post(
        f"/api/integrity/sessions/{sid}/decision",
        json={"decision": "confirmed", "note": "Second face on camera"},
        headers=world.admin,
    )
    res = await http.get(f"/api/integrity/my/{sid}", headers=world.student2)
    assert res.json()["flagged"] is False


# ─── Appeals ─────────────────────────────────────────────────────────────────

async def confirmed_session(http, world):
    sid = await world.make_session(alert_list=alerts(4))
    await http.post(
        f"/api/integrity/sessions/{sid}/decision",
        json={"decision": "confirmed", "note": "Second face on camera"},
        headers=world.admin,
    )
    return sid


APPEAL = "That was my brother walking past the door, he did not help me."


async def test_student_can_appeal_once(http, world):
    sid = await confirmed_session(http, world)
    url = f"/api/integrity/my/{sid}/appeal"

    first = await http.post(url, json={"message": APPEAL}, headers=world.student)
    assert first.status_code == 200
    assert first.json()["status"] == "appealed"

    second = await http.post(url, json={"message": APPEAL}, headers=world.student)
    assert second.status_code == 409


async def test_short_appeal_is_rejected(http, world):
    sid = await confirmed_session(http, world)
    res = await http.post(f"/api/integrity/my/{sid}/appeal", json={"message": "no"}, headers=world.student)
    assert res.status_code == 422


async def test_cannot_appeal_a_pending_or_dismissed_flag(http, world):
    pending = await world.make_session(alert_list=alerts(4))
    res = await http.post(f"/api/integrity/my/{pending}/appeal", json={"message": APPEAL}, headers=world.student)
    assert res.status_code == 404


async def test_appeal_window_closes(http, world):
    sid = await world.make_session(
        alert_list=alerts(4),
        integrity={
            "decision": "confirmed",
            "decision_note": "old",
            "decided_at": datetime.utcnow() - timedelta(days=8),
        },
    )
    res = await http.post(f"/api/integrity/my/{sid}/appeal", json={"message": APPEAL}, headers=world.student)
    assert res.status_code == 409
    assert "closed" in res.json()["detail"]


async def test_other_student_cannot_appeal(http, world):
    sid = await confirmed_session(http, world)
    res = await http.post(f"/api/integrity/my/{sid}/appeal", json={"message": APPEAL}, headers=world.student2)
    assert res.status_code == 404


async def test_admin_overturns_an_appeal(http, world):
    sid = await confirmed_session(http, world)
    await http.post(f"/api/integrity/my/{sid}/appeal", json={"message": APPEAL}, headers=world.student)

    res = await http.post(
        f"/api/integrity/sessions/{sid}/appeal/resolve",
        json={"outcome": "overturned", "note": "Checked the timeline, agree it was a passer-by"},
        headers=world.admin,
    )
    assert res.status_code == 200
    assert res.json()["status"] == "overturned"
    actions = [h["action"] for h in res.json()["integrity"]["history"]]
    assert actions == ["confirmed", "appealed", "overturned"]

    mine = (await http.get(f"/api/integrity/my/{sid}", headers=world.student)).json()
    assert mine["status"] == "overturned"
    assert mine["appeal"]["response_note"].startswith("Checked")


async def test_resolve_without_an_open_appeal_conflicts(http, world):
    sid = await confirmed_session(http, world)
    res = await http.post(
        f"/api/integrity/sessions/{sid}/appeal/resolve",
        json={"outcome": "upheld", "note": "Nothing to resolve"},
        headers=world.admin,
    )
    assert res.status_code == 409


# ─── Proctoring event type fix ───────────────────────────────────────────────

async def test_phone_detected_events_are_accepted(http, world):
    sid = await world.make_session(status="ongoing")
    res = await http.post(
        "/api/proctoring/events",
        json={"session_id": sid, "alert_type": "phone_detected", "severity": "high", "description": "phone"},
        headers=world.student,
    )
    assert res.status_code == 200, res.text

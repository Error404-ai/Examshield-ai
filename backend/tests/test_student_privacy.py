"""A student's result must never reveal proctoring or integrity-review data.

Pending and dismissed flags have to look the same as no flag. The only way a student
learns about a flag is /api/integrity/my/{session_id}, after an examiner confirmed it.
"""

from datetime import datetime

from tests.conftest import alerts

HIDDEN_KEYS = (
    "integrity",
    "integrity_events",
    "proctoring_alerts",
    "proctoring_counts",
    "tab_limit_reached",
    "appeal",
)


async def dismissed_session(world):
    now = datetime.utcnow()
    return await world.make_session(
        alert_list=alerts(4),
        integrity={
            "decision": "dismissed",
            "decision_note": "Looked like a false alarm",
            "decided_by": "admin@example.com",
            "decided_at": now,
            "history": [
                {"action": "dismissed", "by": "admin@example.com", "role": "admin", "note": "x", "at": now}
            ],
        },
    )


def assert_nothing_leaked(res):
    assert res.status_code == 200
    text = res.text
    # Nothing the examiner wrote, and nothing that shows a review happened
    assert "admin@example.com" not in text
    assert "false alarm" not in text
    assert "multiple_faces" not in text
    return res.json()


async def test_result_detail_hides_integrity_data(http, world):
    sid = await dismissed_session(world)
    res = await http.get(f"/api/student/results/{sid}", headers=world.student)
    result = assert_nothing_leaked(res)["result"]
    for key in HIDDEN_KEYS:
        assert key not in result


async def test_results_list_hides_integrity_data(http, world):
    await dismissed_session(world)
    res = await http.get("/api/student/results", headers=world.student)
    rows = assert_nothing_leaked(res)["results"]
    assert len(rows) == 1
    for key in HIDDEN_KEYS:
        assert key not in rows[0]


async def test_pending_flag_is_invisible_in_the_result(http, world):
    # Flagged (score >= 20) but no decision yet
    sid = await world.make_session(alert_list=alerts(4))
    res = await http.get(f"/api/student/results/{sid}", headers=world.student)
    result = assert_nothing_leaked(res)["result"]
    for key in HIDDEN_KEYS:
        assert key not in result


async def test_old_student_appeal_route_is_gone(http, world):
    sid = await world.make_session(alert_list=alerts(4))
    res = await http.post(
        f"/api/student/results/{sid}/appeal",
        json={"message": "This should not be accepted any more."},
        headers=world.student,
    )
    assert res.status_code in (404, 405)
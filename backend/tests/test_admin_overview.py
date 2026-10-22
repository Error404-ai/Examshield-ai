"""One request feeds the whole admin dashboard (replaces the per-exam / per-session fan-out)"""

from tests.conftest import alerts

URL = "/api/admin/dashboard/overview"


async def test_overview_aggregates_everything_in_one_call(http, world, db):
    await db.sessions.insert_many([
        {"exam_id": world.exam_id, "student_id": "s1", "status": "submitted",
         "percentage": 80, "passed": True, "proctoring_alerts": alerts(2, "high")},
        {"exam_id": world.exam_id, "student_id": "s2", "status": "submitted",
         "percentage": 40, "passed": False, "proctoring_alerts": alerts(1, "critical")},
        {"exam_id": world.exam_id, "student_id": "s3", "status": "ongoing",
         "proctoring_alerts": alerts(1, "low")},
    ])

    res = await http.get(URL, headers=world.admin)
    assert res.status_code == 200
    body = res.json()

    # Only finished sessions count towards attempts and scores
    assert body["exams"][world.exam_id] == {"attempts": 2, "passed": 1, "avg": 60.0}
    # Alerts count from every session, including the one still in progress
    assert body["severity"] == {"critical": 1, "high": 2, "medium": 0, "low": 1}
    assert len(body["recent_alerts"]) == 4
    assert {"session_id", "alert_type", "severity", "description", "timestamp"} <= set(body["recent_alerts"][0])


async def test_exam_without_sessions_shows_zeros(http, world):
    body = (await http.get(URL, headers=world.admin)).json()
    assert body["exams"] == {world.exam_id: {"attempts": 0, "passed": 0, "avg": 0}}
    assert body["severity"] == {"critical": 0, "high": 0, "medium": 0, "low": 0}
    assert body["recent_alerts"] == []


async def test_only_the_six_latest_alerts_are_returned(http, world):
    await world.make_session(alert_list=alerts(10))
    body = (await http.get(URL, headers=world.admin)).json()
    assert len(body["recent_alerts"]) == 6
    assert sum(body["severity"].values()) == 10


async def test_overview_is_scoped_to_the_admins_own_exams(http, world):
    await world.make_session(alert_list=alerts(3))
    body = (await http.get(URL, headers=world.other_admin)).json()
    assert body["exams"] == {}
    assert body["recent_alerts"] == []
    assert sum(body["severity"].values()) == 0


async def test_overview_requires_admin(http, world):
    assert (await http.get(URL, headers=world.student)).status_code == 403
    assert (await http.get(URL)).status_code in (401, 403)
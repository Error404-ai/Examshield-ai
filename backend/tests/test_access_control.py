from tests.test_api_flow import _build_published_exam


def test_admin_routes_need_a_token(client):
    assert client.get("/api/admin/dashboard").status_code in (401, 403)


def test_student_cannot_use_admin_routes(client, make_user):
    student = make_user("stu@test.dev")
    assert client.get("/api/admin/dashboard", headers=student).status_code == 403
    r = client.post("/api/admin/exams", headers=student, json={"title": "Sneaky exam", "duration": 10})
    assert r.status_code == 403


def test_client_cannot_self_register_as_admin(client):
    r = client.post("/api/auth/register", json={
        "name": "Mallory", "email": "mallory@test.dev", "role": "admin",
        "password": "secret123", "confirm_password": "secret123",
    })
    assert r.status_code == 200
    login = client.post("/api/auth/login", json={"email": "mallory@test.dev", "password": "secret123"})
    assert login.json()["user"]["role"] == "student"


def test_allowlisted_email_becomes_admin(client):
    client.post("/api/auth/register", json={
        "name": "Admin One", "email": "admin@test.dev",
        "password": "secret123", "confirm_password": "secret123",
    })
    login = client.post("/api/auth/login", json={"email": "admin@test.dev", "password": "secret123"})
    assert login.json()["user"]["role"] == "admin"


def test_admin_cannot_touch_another_admins_exam(client, make_user):
    owner = make_user("admin@test.dev")
    other = make_user("admin2@test.dev")
    exam_id = _build_published_exam(client, owner)
    assert client.get(f"/api/admin/exams/{exam_id}", headers=other).status_code == 404
    assert client.delete(f"/api/admin/exams/{exam_id}", headers=other).status_code == 404
    assert client.get(f"/api/admin/exams/{exam_id}/results", headers=other).status_code == 404


def test_unpublished_exam_is_hidden_from_students(client, make_user):
    admin = make_user("admin@test.dev")
    student = make_user("stu@test.dev")
    exam_id = client.post("/api/admin/exams", headers=admin,
                          json={"title": "Draft exam", "duration": 20}).json()["exam_id"]
    assert client.get("/api/student/exams", headers=student).json()["exams"] == []
    assert client.get(f"/api/student/exams/{exam_id}", headers=student).status_code == 404


def test_login_errors(client, make_user):
    make_user("stu@test.dev")
    bad = client.post("/api/auth/login", json={"email": "stu@test.dev", "password": "wrong-pass"})
    assert bad.status_code == 401
    dup = client.post("/api/auth/register", json={
        "name": "Again", "email": "stu@test.dev",
        "password": "secret123", "confirm_password": "secret123",
    })
    assert dup.status_code == 400
    mismatch = client.post("/api/auth/register", json={
        "name": "Mismatch", "email": "new@test.dev",
        "password": "secret123", "confirm_password": "nope-nope",
    })
    assert mismatch.status_code == 422
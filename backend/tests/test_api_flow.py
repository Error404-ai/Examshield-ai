"""End-to-end API tests: admin builds an exam, student takes it, grading is server-side."""


def _build_published_exam(client, admin):
    r = client.post(
        "/api/admin/exams", headers=admin,
        json={"title": "Python Basics", "description": "", "duration": 30},
    )
    assert r.status_code == 200, r.text
    exam_id = r.json()["exam_id"]

    questions = [
        {"exam_id": exam_id, "question_text": "What is 2 + 2?", "question_type": "mcq",
         "options": ["3", "4"], "correct_answer": "4", "marks": 2},
        {"exam_id": exam_id, "question_text": "Capital of France?", "question_type": "mcq",
         "options": ["Paris", "Rome"], "correct_answer": "Paris", "marks": 3},
    ]
    for q in questions:
        assert client.post("/api/admin/questions", headers=admin, json=q).status_code == 200

    assert client.put(f"/api/admin/exams/{exam_id}", headers=admin, json={"passing_marks": 3}).status_code == 200
    assert client.post(f"/api/admin/exams/{exam_id}/publish", headers=admin).status_code == 200
    return exam_id


def test_full_exam_flow(client, make_user):
    admin = make_user("admin@test.dev", "Admin One")
    student = make_user("stu@test.dev", "Student One")
    exam_id = _build_published_exam(client, admin)

    # total marks are recalculated from the questions
    detail = client.get(f"/api/admin/exams/{exam_id}", headers=admin).json()
    assert detail["exam"]["total_marks"] == 5

    # student sees the exam, but never the answers
    exams = client.get("/api/student/exams", headers=student).json()["exams"]
    assert len(exams) == 1 and exams[0]["attempted"] is False
    exam_view = client.get(f"/api/student/exams/{exam_id}", headers=student).json()
    assert len(exam_view["questions"]) == 2
    assert all("correct_answer" not in q for q in exam_view["questions"])

    # starting twice resumes the same session
    s1 = client.post(f"/api/student/exams/{exam_id}/start", headers=student).json()
    s2 = client.post(f"/api/student/exams/{exam_id}/start", headers=student).json()
    assert s1["session_id"] == s2["session_id"]
    session_id = s1["session_id"]

    # answer one right, one wrong
    by_text = {q["question_text"]: q["_id"] for q in exam_view["questions"]}
    submit = client.post(
        "/api/student/sessions/submit", headers=student,
        json={"session_id": session_id, "answers": [
            {"question_id": by_text["What is 2 + 2?"], "selected_answer": "4"},
            {"question_id": by_text["Capital of France?"], "selected_answer": "Rome"},
        ]},
    )
    assert submit.status_code == 200, submit.text
    result = submit.json()["result"]
    assert (result["score"], result["total_marks"], result["percentage"]) == (2, 5, 40.0)
    assert result["passed"] is False  # passing marks = 3

    # a second submit is rejected
    again = client.post("/api/student/sessions/submit", headers=student,
                        json={"session_id": session_id, "answers": []})
    assert again.status_code == 400

    # result detail has the graded review
    review = client.get(f"/api/student/results/{session_id}", headers=student).json()["result"]
    graded = {a["question_id"]: a for a in review["answers"]}
    assert graded[by_text["What is 2 + 2?"]]["is_correct"] is True
    assert graded[by_text["Capital of France?"]]["is_correct"] is False

    stats = client.get("/api/student/dashboard", headers=student).json()["stats"]
    assert (stats["attempted"], stats["passed"], stats["failed"]) == (1, 0, 1)

    # a finished exam cannot be restarted
    restart = client.post(f"/api/student/exams/{exam_id}/start", headers=student)
    assert restart.status_code == 400


def test_unanswered_questions_score_zero(client, make_user):
    admin = make_user("admin@test.dev")
    student = make_user("stu@test.dev")
    exam_id = _build_published_exam(client, admin)
    session_id = client.post(f"/api/student/exams/{exam_id}/start", headers=student).json()["session_id"]
    r = client.post("/api/student/sessions/submit", headers=student,
                    json={"session_id": session_id, "answers": []})
    assert r.json()["result"]["score"] == 0
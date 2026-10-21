import pytest
from pydantic import ValidationError

from app.models.schemas import ExamCreate, QuestionCreate, UserCreate


def test_passing_marks_cannot_exceed_total():
    with pytest.raises(ValidationError):
        ExamCreate(title="Midterm", duration=30, total_marks=10, passing_marks=11)


def test_mcq_needs_two_options():
    with pytest.raises(ValidationError):
        QuestionCreate(
            exam_id="e1", question_text="Pick one", question_type="mcq",
            options=["only"], correct_answer="only", marks=1,
        )


def test_true_false_needs_exactly_two_options():
    with pytest.raises(ValidationError):
        QuestionCreate(
            exam_id="e1", question_text="Is it true?", question_type="true_false",
            options=["True", "False", "Maybe"], correct_answer="True", marks=1,
        )


def test_password_confirmation_must_match():
    with pytest.raises(ValidationError):
        UserCreate(name="Asha", email="a@b.co", password="secret123", confirm_password="different")


def test_valid_question_passes():
    q = QuestionCreate(
        exam_id="e1", question_text="What is 2 + 2?", question_type="mcq",
        options=["3", "4"], correct_answer="4", marks=2,
        rubric="Explain the reasoning.",
    )
    assert q.marks == 2
    assert q.rubric == "Explain the reasoning."
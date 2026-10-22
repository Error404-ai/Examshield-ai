"""_parse_grades: the server, not the model, decides what counts as a valid grade"""

import json

import pytest

from app.services.grading_service import _parse_grades

ITEMS = [
    {"question_id": "q1", "max_marks": 5},
    {"question_id": "q2", "max_marks": 2},
]


def reply(*rows):
    return json.dumps(list(rows))


def row(qid="q1", marks=3, **extra):
    return {"question_id": qid, "marks": marks, "feedback": "ok", "confidence": "high", **extra}


def test_valid_reply_is_parsed():
    out = _parse_grades(reply(row("q1", 4), row("q2", 1.5)), ITEMS)
    assert out == {
        "q1": {"marks": 4.0, "feedback": "ok", "confidence": "high"},
        "q2": {"marks": 1.5, "feedback": "ok", "confidence": "high"},
    }


# ─── Marks are clamped and snapped to half marks ─────────────────────────────

def test_marks_above_the_maximum_are_clamped():
    out = _parse_grades(reply(row("q1", 99), row("q2", 2.1)), ITEMS)
    assert out["q1"]["marks"] == 5.0
    assert out["q2"]["marks"] == 2.0


def test_negative_marks_become_zero():
    assert _parse_grades(reply(row("q1", -3)), ITEMS)["q1"]["marks"] == 0.0


@pytest.mark.parametrize("given, expected", [(2.2, 2.0), (2.3, 2.5), (2.6, 2.5), (2.8, 3.0), (4.9, 5.0)])
def test_marks_snap_to_the_nearest_half(given, expected):
    assert _parse_grades(reply(row("q1", given)), ITEMS)["q1"]["marks"] == expected


@pytest.mark.parametrize("bad", ["3", True, None, [3], {"v": 3}])
def test_non_numeric_marks_are_dropped(bad):
    assert _parse_grades(reply(row("q1", bad)), ITEMS) == {}


def test_nan_and_infinity_cannot_escape_the_range():
    # json.loads accepts NaN and Infinity, so the clamp has to cope with them
    text = '[{"question_id":"q1","marks":NaN},{"question_id":"q2","marks":Infinity}]'
    out = _parse_grades(text, ITEMS)
    assert out["q1"]["marks"] == 0.0
    assert out["q2"]["marks"] == 2.0


# ─── Malformed replies ───────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "text",
    ["", "no json at all", "[", "][", "[1, 2", "[1, 2]", "{}", "[{'question_id': 'q1', 'marks': 3}]"],
)
def test_unusable_replies_give_no_grades(text):
    assert _parse_grades(text, ITEMS) == {}


def test_markdown_fences_and_chatter_are_ignored():
    text = "Here are the grades:\n```json\n" + reply(row("q1", 3)) + "\n```\nHope this helps!"
    assert _parse_grades(text, ITEMS)["q1"]["marks"] == 3.0


def test_non_object_rows_are_skipped_but_valid_rows_survive():
    out = _parse_grades(reply(1, "x", None, row("q1", 2)), ITEMS)
    assert list(out) == ["q1"]


# ─── Ids ─────────────────────────────────────────────────────────────────────

def test_unknown_question_ids_are_dropped():
    out = _parse_grades(reply(row("q1", 1), row("q999", 5), row("", 5)), ITEMS)
    assert list(out) == ["q1"]


def test_first_grade_for_an_id_wins():
    out = _parse_grades(reply(row("q1", 1), row("q1", 5)), ITEMS)
    assert out["q1"]["marks"] == 1.0


# ─── Confidence and feedback ─────────────────────────────────────────────────

def test_bad_or_missing_confidence_becomes_low():
    out = _parse_grades(reply(row("q1", 3, confidence="certain"), row("q2", 1, confidence=None)), ITEMS)
    assert out["q1"]["confidence"] == "low"
    assert out["q2"]["confidence"] == "low"


def test_missing_feedback_is_an_empty_string():
    out = _parse_grades(json.dumps([{"question_id": "q1", "marks": 1}]), ITEMS)
    assert out["q1"] == {"marks": 1.0, "feedback": "", "confidence": "low"}


def test_feedback_is_trimmed_and_capped():
    out = _parse_grades(reply(row("q1", 3, feedback="  " + "x" * 500 + "  ")), ITEMS)
    assert out["q1"]["feedback"] == "x" * 300
"""
Exam Service
Business logic for exam lifecycle management.

Conventions:
- Methods return bool / Optional / a status string for "not found" style outcomes.
- Methods raise ValueError for invalid input (routes map it to HTTP 400).
- Anything an admin changes is checked against created_by, so one admin
  can't touch another admin's exams or questions.
"""

from datetime import datetime
from typing import Dict, List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.schemas import ExamCreate, ExamUpdate, QuestionCreate


def _oid(value) -> Optional[ObjectId]:
    """Parse an ObjectId; None if it's malformed (instead of raising)"""
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        return None


def _check_answer(payload: QuestionCreate) -> None:
    if payload.options and payload.correct_answer not in payload.options:
        raise ValueError("Correct answer must be one of the options")


class ExamService:
    """Handles all exam-related business logic"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    # ---------- Helpers ----------

    async def _owns_exam(self, exam_id: str, admin_id: str) -> bool:
        oid = _oid(exam_id)
        if oid is None:
            return False
        found = await self.db.exams.find_one({"_id": oid, "created_by": admin_id}, {"_id": 1})
        return found is not None

    async def _recalc_total_marks(self, exam_id: str) -> None:
        oid = _oid(exam_id)
        if oid is None:
            return
        rows = await self.db.questions.aggregate([
            {"$match": {"exam_id": exam_id}},
            {"$group": {"_id": None, "total": {"$sum": "$marks"}}},
        ]).to_list(1)
        total = rows[0]["total"] if rows else 0
        await self.db.exams.update_one(
            {"_id": oid},
            {"$set": {"total_marks": total, "updated_at": datetime.utcnow()}},
        )

    # ---------- Exams ----------

    async def create_exam(self, exam_data: ExamCreate, admin_id: str) -> str:
        now = datetime.utcnow()
        exam_doc = {
            **exam_data.model_dump(),
            "created_by": admin_id,
            "is_published": False,
            "created_at": now,
            "updated_at": now,
        }
        result = await self.db.exams.insert_one(exam_doc)
        return str(result.inserted_id)

    async def get_exam_by_id(self, exam_id: str) -> Optional[Dict]:
        oid = _oid(exam_id)
        if oid is None:
            return None
        return await self.db.exams.find_one({"_id": oid})

    async def list_exams_by_admin(self, admin_id: str) -> List[Dict]:
        cursor = self.db.exams.find({"created_by": admin_id}).sort("created_at", -1)
        return [e async for e in cursor]

    async def update_exam(self, exam_id: str, admin_id: str, update_data: ExamUpdate) -> bool:
        oid = _oid(exam_id)
        if oid is None:
            return False
        fields = update_data.model_dump(exclude_none=True)
        if not fields:
            raise ValueError("Nothing to update")
        fields["updated_at"] = datetime.utcnow()
        result = await self.db.exams.update_one(
            {"_id": oid, "created_by": admin_id},
            {"$set": fields},
        )
        return result.matched_count > 0

    async def publish_exam(self, exam_id: str, admin_id: str) -> str:
        """
        Returns "ok", "not_found" or "no_questions".
        An exam with no questions can't be published.
        """
        if not await self._owns_exam(exam_id, admin_id):
            return "not_found"
        if await self.db.questions.count_documents({"exam_id": exam_id}) == 0:
            return "no_questions"
        await self.db.exams.update_one(
            {"_id": _oid(exam_id)},
            {"$set": {"is_published": True, "updated_at": datetime.utcnow()}},
        )
        return "ok"

    async def delete_exam(self, exam_id: str, admin_id: str) -> bool:
        oid = _oid(exam_id)
        if oid is None:
            return False
        result = await self.db.exams.delete_one({"_id": oid, "created_by": admin_id})
        if result.deleted_count > 0:
            await self.db.questions.delete_many({"exam_id": exam_id})
            return True
        return False

    # ---------- Questions ----------

    async def add_question(self, question_data: QuestionCreate, admin_id: str) -> Optional[str]:
        """Returns the new question id, or None if the exam isn't found / isn't yours"""
        if not await self._owns_exam(question_data.exam_id, admin_id):
            return None
        _check_answer(question_data)

        doc = question_data.model_dump(mode="json")
        doc["created_at"] = datetime.utcnow()
        result = await self.db.questions.insert_one(doc)
        await self._recalc_total_marks(question_data.exam_id)
        return str(result.inserted_id)

    async def update_question(self, question_id: str, admin_id: str, payload: QuestionCreate) -> bool:
        """Returns False if the question isn't found / isn't yours"""
        qid = _oid(question_id)
        if qid is None:
            return False
        question = await self.db.questions.find_one({"_id": qid})
        if not question or not await self._owns_exam(question["exam_id"], admin_id):
            return False
        _check_answer(payload)

        doc = payload.model_dump(mode="json")
        doc["exam_id"] = question["exam_id"]  # a question can't be moved to another exam
        doc["updated_at"] = datetime.utcnow()
        await self.db.questions.update_one({"_id": qid}, {"$set": doc})
        await self._recalc_total_marks(question["exam_id"])
        return True

    async def delete_question(self, question_id: str, admin_id: str) -> bool:
        qid = _oid(question_id)
        if qid is None:
            return False
        question = await self.db.questions.find_one({"_id": qid})
        if not question or not await self._owns_exam(question["exam_id"], admin_id):
            return False
        await self.db.questions.delete_one({"_id": qid})
        await self._recalc_total_marks(question["exam_id"])
        return True

    async def get_questions(self, exam_id: str, strip_answers: bool = False) -> List[Dict]:
        cursor = self.db.questions.find({"exam_id": exam_id}).sort("created_at", 1)
        questions = []
        async for q in cursor:
            if strip_answers:
                q.pop("correct_answer", None)
            questions.append(q)
        return questions

    # ---------- Grading ----------

    async def calculate_score(self, exam_id: str, answers: List[Dict]) -> Dict:
        """
        Auto-grade a submission. Every question on the exam is graded,
        so unanswered questions show up in the review as 0 marks.
        """
        questions = await self.get_questions(exam_id)
        given = {a["question_id"]: (a.get("selected_answer") or "") for a in answers}

        score = 0
        total = 0
        graded = []
        for q in questions:
            qid = str(q["_id"])
            marks = q.get("marks", 1)
            selected = given.get(qid, "")
            correct = q.get("correct_answer", "")
            is_correct = bool(selected.strip()) and selected.strip().lower() == correct.strip().lower()

            total += marks
            if is_correct:
                score += marks
            graded.append({
                "question_id": qid,
                "question_text": q.get("question_text", ""),
                "selected_answer": selected,
                "correct_answer": correct,
                "is_correct": is_correct,
                "marks": marks,
                "marks_awarded": marks if is_correct else 0,
            })

        exam = await self.get_exam_by_id(exam_id)
        passing_marks = exam.get("passing_marks", 0) if exam else 0
        percentage = round((score / total) * 100, 2) if total > 0 else 0

        return {
            "score": score,
            "total_marks": total,
            "passing_marks": passing_marks,
            "percentage": percentage,
            "passed": score >= passing_marks,
            "graded_answers": graded,
        }
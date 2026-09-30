"""
Exam Service
Business logic for exam lifecycle management
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from typing import Optional, List, Dict
from datetime import datetime

from app.models.schemas import ExamCreate, ExamUpdate, QuestionCreate


class ExamService:
    """Handles all exam-related business logic"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    # ---------- Exams ----------

    async def create_exam(self, exam_data: ExamCreate, admin_id: str) -> str:
        now = datetime.utcnow()
        exam_doc = {
            **exam_data.dict(),
            "created_by": admin_id,
            "is_published": False,
            "created_at": now,
            "updated_at": now,
        }
        result = await self.db.exams.insert_one(exam_doc)
        return str(result.inserted_id)

    async def get_exam_by_id(self, exam_id: str) -> Optional[Dict]:
        return await self.db.exams.find_one({"_id": ObjectId(exam_id)})

    async def list_exams_by_admin(self, admin_id: str) -> List[Dict]:
        cursor = self.db.exams.find({"created_by": admin_id}).sort("created_at", -1)
        return [e async for e in cursor]

    async def update_exam(self, exam_id: str, admin_id: str, update_data: ExamUpdate) -> bool:
        fields = {k: v for k, v in update_data.dict().items() if v is not None}
        fields["updated_at"] = datetime.utcnow()
        result = await self.db.exams.update_one(
            {"_id": ObjectId(exam_id), "created_by": admin_id},
            {"$set": fields},
        )
        return result.matched_count > 0

    async def publish_exam(self, exam_id: str, admin_id: str) -> str:
        """
        Returns "ok", "not_found" or "no_questions".
        An exam with no questions can't be published.
        """
        exam = await self.db.exams.find_one(
            {"_id": ObjectId(exam_id), "created_by": admin_id}
        )
        if not exam:
            return "not_found"
        if await self.db.questions.count_documents({"exam_id": exam_id}) == 0:
            return "no_questions"
        await self.db.exams.update_one(
            {"_id": ObjectId(exam_id)},
            {"$set": {"is_published": True, "updated_at": datetime.utcnow()}},
        )
        return "ok"

    async def delete_exam(self, exam_id: str, admin_id: str) -> bool:
        result = await self.db.exams.delete_one(
            {"_id": ObjectId(exam_id), "created_by": admin_id}
        )
        if result.deleted_count > 0:
            await self.db.questions.delete_many({"exam_id": exam_id})
            return True
        return False

    # ---------- Questions ----------

    async def _recalc_total_marks(self, exam_id: str) -> None:
        total = 0
        async for q in self.db.questions.find({"exam_id": exam_id}, {"marks": 1}):
            total += q.get("marks", 1)
        await self.db.exams.update_one(
            {"_id": ObjectId(exam_id)},
            {"$set": {"total_marks": total, "updated_at": datetime.utcnow()}},
        )

    async def add_question(self, question_data: QuestionCreate) -> str:
        doc = question_data.dict()
        doc["question_type"] = getattr(doc["question_type"], "value", doc["question_type"])
        doc["created_at"] = datetime.utcnow()
        result = await self.db.questions.insert_one(doc)
        await self._recalc_total_marks(question_data.exam_id)
        return str(result.inserted_id)

    async def delete_question(self, question_id: str) -> Optional[str]:
        """Returns the exam_id the question belonged to, or None if not found."""
        q = await self.db.questions.find_one_and_delete({"_id": ObjectId(question_id)})
        if not q:
            return None
        await self._recalc_total_marks(q["exam_id"])
        return q["exam_id"]

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
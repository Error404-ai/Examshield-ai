"""
Exam Service
Business logic for exam lifecycle management
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from typing import Optional, List, Dict
from datetime import datetime

from app.schemas import ExamCreate, ExamUpdate, QuestionCreate, SessionStatus


class ExamService:
    """Handles all exam-related business logic"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def create_exam(self, exam_data: ExamCreate, admin_id: str) -> str:
        exam_doc = {
            **exam_data.dict(),
            "created_by": admin_id,
            "is_published": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        result = await self.db.exams.insert_one(exam_doc)
        return str(result.inserted_id)

    async def get_exam_by_id(self, exam_id: str) -> Optional[Dict]:
        exam = await self.db.exams.find_one({"_id": ObjectId(exam_id)})
        if exam:
            exam["_id"] = str(exam["_id"])
        return exam

    async def update_exam(self, exam_id: str, admin_id: str, update_data: ExamUpdate) -> bool:
        fields = {k: v for k, v in update_data.dict().items() if v is not None}
        fields["updated_at"] = datetime.utcnow()
        result = await self.db.exams.update_one(
            {"_id": ObjectId(exam_id), "created_by": admin_id},
            {"$set": fields}
        )
        return result.matched_count > 0

    async def delete_exam(self, exam_id: str, admin_id: str) -> bool:
        result = await self.db.exams.delete_one(
            {"_id": ObjectId(exam_id), "created_by": admin_id}
        )
        if result.deleted_count > 0:
            await self.db.questions.delete_many({"exam_id": exam_id})
            return True
        return False

    async def add_question(self, question_data: QuestionCreate) -> str:
        doc = {**question_data.dict(), "created_at": datetime.utcnow()}
        result = await self.db.questions.insert_one(doc)
        return str(result.inserted_id)

    async def get_questions(self, exam_id: str, strip_answers: bool = False) -> List[Dict]:
        cursor = self.db.questions.find({"exam_id": exam_id})
        questions = []
        async for q in cursor:
            q["_id"] = str(q["_id"])
            if strip_answers:
                q.pop("correct_answer", None)
            questions.append(q)
        return questions

    async def calculate_score(self, exam_id: str, answers: List[Dict]) -> Dict:
        """Auto-grade submitted answers"""
        cursor = self.db.questions.find({"exam_id": exam_id})
        questions = {str(q["_id"]): q async for q in cursor}

        score = 0
        graded = []
        for answer in answers:
            question = questions.get(answer["question_id"])
            if not question:
                continue
            is_correct = answer["selected_answer"].strip().lower() == question["correct_answer"].strip().lower()
            if is_correct:
                score += question.get("marks", 1)
            graded.append({
                "question_id": answer["question_id"],
                "selected_answer": answer["selected_answer"],
                "correct_answer": question["correct_answer"],
                "is_correct": is_correct,
                "marks_awarded": question.get("marks", 1) if is_correct else 0
            })

        exam = await self.db.exams.find_one({"_id": ObjectId(exam_id)})
        total_marks = exam["total_marks"]
        passing_marks = exam["passing_marks"]
        percentage = round((score / total_marks) * 100, 2) if total_marks > 0 else 0

        return {
            "score": score,
            "total_marks": total_marks,
            "passing_marks": passing_marks,
            "percentage": percentage,
            "passed": score >= passing_marks,
            "graded_answers": graded
        }
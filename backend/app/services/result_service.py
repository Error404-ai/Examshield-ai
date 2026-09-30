"""
Result Service
Business logic for session results and analytics
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from bson.errors import InvalidId
from typing import List, Dict, Optional

from app.models.schemas import SessionStatus


class ResultService:
    """Handles result retrieval and analytics"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def _exam_title(self, exam_id: str) -> str:
        try:
            exam = await self.db.exams.find_one({"_id": ObjectId(exam_id)}, {"title": 1})
        except (InvalidId, TypeError):
            return "Unknown"
        return exam["title"] if exam else "Unknown"

    async def get_student_results(self, student_id: str) -> List[Dict]:
        cursor = self.db.sessions.find({
            "student_id": student_id,
            "status": SessionStatus.SUBMITTED.value,
        }).sort("submitted_at", -1)
        results = []
        async for session in cursor:
            session["exam_title"] = await self._exam_title(session["exam_id"])
            session.pop("answers", None)
            results.append(session)
        return results

    async def get_exam_results(self, exam_id: str) -> Dict:
        cursor = self.db.sessions.find({
            "exam_id": exam_id,
            "status": SessionStatus.SUBMITTED.value,
        })
        results = []
        async for session in cursor:
            student = None
            try:
                student = await self.db.users.find_one({"_id": ObjectId(session["student_id"])})
            except (InvalidId, TypeError):
                pass
            session["student_name"] = student["name"] if student else "Unknown"
            session["student_email"] = student["email"] if student else "Unknown"
            session.pop("answers", None)
            results.append(session)

        total = len(results)
        passed = sum(1 for r in results if r.get("passed"))
        avg = sum(r.get("percentage", 0) for r in results) / total if total > 0 else 0

        return {
            "total_attempts": total,
            "passed": passed,
            "failed": total - passed,
            "average_score": round(avg, 2),
            "results": results,
        }

    async def get_session_detail(self, session_id: str, student_id: Optional[str] = None) -> Optional[Dict]:
        try:
            query = {"_id": ObjectId(session_id)}
        except (InvalidId, TypeError):
            return None
        if student_id:
            query["student_id"] = student_id
        session = await self.db.sessions.find_one(query)
        if session:
            session["exam_title"] = await self._exam_title(session["exam_id"])
        return session
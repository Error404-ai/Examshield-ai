"""
ExamShield AI - Student Routes
Exam access, submission, and results endpoints
"""

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import List
import logging
from app.core.database import get_db
from app.core.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# Exams a student is allowed to see (adjust once admin.py's exam fields are confirmed)
PUBLISHED_FILTER = {"$or": [{"is_published": True}, {"is_active": True}]}


# Pydantic Models
class ExamDetailResponse(BaseModel):
    """Detailed exam response"""
    id: str
    title: str
    description: str
    instructions: str
    duration_minutes: int
    total_questions: int
    questions: List[dict]


class StartExamRequest(BaseModel):
    """Start exam request"""
    exam_id: str


class ExamSessionResponse(BaseModel):
    """Exam session response"""
    session_id: str
    exam_id: str
    student_id: str
    start_time: str
    end_time: str
    duration_minutes: int


class SubmitAnswerRequest(BaseModel):
    """Submit answer request"""
    session_id: str
    question_id: str
    answer: str


class ExamResultResponse(BaseModel):
    """Exam result response"""
    session_id: str
    student_id: str
    exam_id: str
    total_questions: int
    correct_answers: int
    score_percentage: float
    passed: bool
    submitted_at: str
    proctoring_alerts: List[dict]


# Routes
@router.get("/dashboard")
async def student_dashboard(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    """Dashboard counts for the logged-in student"""
    try:
        student_id = current_user["user_id"]

        available = await db["exams"].count_documents(PUBLISHED_FILTER)
        attempted = await db["results"].count_documents({"student_id": student_id})
        passed = await db["results"].count_documents(
            {"student_id": student_id, "passed": True}
        )

        return {
            "success": True,
            "stats": {
                "available_exams": available,
                "attempted": attempted,
                "passed": passed,
                "failed": attempted - passed,
            },
        }
    except Exception as e:
        logger.error(f"Error building student dashboard: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load dashboard"
        )


@router.get("/exams")
async def list_available_exams(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Get list of available exams for the logged-in student
    """
    try:
        student_id = current_user["user_id"]

        exams = await db["exams"].find(PUBLISHED_FILTER).to_list(length=None)

        attempted_docs = await db["results"].find(
            {"student_id": student_id}, {"exam_id": 1}
        ).to_list(length=None)
        attempted_ids = {str(r.get("exam_id")) for r in attempted_docs}

        return {
            "success": True,
            "exams": [
                {
                    "_id": str(exam["_id"]),
                    "title": exam.get("title", ""),
                    "description": exam.get("description", ""),
                    "duration": exam.get("duration", exam.get("duration_minutes", 0)),
                    "total_marks": exam.get("total_marks", 0),
                    "passing_marks": exam.get("passing_marks", 0),
                    "is_published": exam.get("is_published", exam.get("is_active", True)),
                    "created_by": str(exam.get("created_by", "")),
                    "created_at": str(exam.get("created_at", "")),
                    "updated_at": str(exam.get("updated_at", "")),
                    "attempted": str(exam["_id"]) in attempted_ids,
                }
                for exam in exams
            ],
        }

    except Exception as e:
        logger.error(f"Error fetching exams: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch exams"
        )


@router.get("/exams/{exam_id}", response_model=ExamDetailResponse)
async def get_exam_details(exam_id: str, db = Depends(get_db)):
    """
    Get detailed exam information

    - **exam_id**: MongoDB ObjectId of the exam
    """
    try:
        from bson.objectid import ObjectId

        exams_col = db["exams"]
        exam = await exams_col.find_one({"_id": ObjectId(exam_id)})

        if not exam:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Exam not found"
            )

        return {
            "id": str(exam["_id"]),
            "title": exam["title"],
            "description": exam["description"],
            "instructions": exam.get("instructions", ""),
            "duration_minutes": exam["duration_minutes"],
            "total_questions": len(exam.get("questions", [])),
            "questions": exam.get("questions", [])
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching exam details: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch exam details"
        )


@router.post("/exams/{exam_id}/start", response_model=ExamSessionResponse)
async def start_exam(exam_id: str, db = Depends(get_db)):
    """
    Start an exam session

    - **exam_id**: MongoDB ObjectId of the exam

    Returns session details including session_id for proctoring
    """
    try:
        # TODO: Get authenticated student_id from JWT
        student_id = "placeholder_student_id"

        sessions_col = db["exam_sessions"]

        # Create new exam session
        session_doc = {
            "exam_id": exam_id,
            "student_id": student_id,
            "start_time": None,
            "end_time": None,
            "status": "active",
            "answers": [],
            "proctoring_alerts": []
        }

        result = await sessions_col.insert_one(session_doc)

        return {
            "session_id": str(result.inserted_id),
            "exam_id": exam_id,
            "student_id": student_id,
            "start_time": str(session_doc["start_time"]),
            "end_time": str(session_doc["end_time"]),
            "duration_minutes": 60
        }

    except Exception as e:
        logger.error(f"Error starting exam: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start exam"
        )


@router.post("/exams/{exam_id}/submit")
async def submit_answers(exam_id: str, answers: List[SubmitAnswerRequest], db = Depends(get_db)):
    """
    Submit exam answers

    - **exam_id**: MongoDB ObjectId of the exam
    - **answers**: List of question-answer pairs
    """
    try:
        return {
            "success": True,
            "message": "Answers submitted successfully",
            "todo": "Implement answer submission and scoring"
        }

    except Exception as e:
        logger.error(f"Error submitting answers: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit answers"
        )


@router.get("/results/{session_id}", response_model=ExamResultResponse)
async def get_exam_results(session_id: str, db = Depends(get_db)):
    """
    Get exam results for a completed session

    - **session_id**: MongoDB ObjectId of the exam session
    """
    try:
        from bson.objectid import ObjectId

        results_col = db["results"]
        result = await results_col.find_one({"session_id": ObjectId(session_id)})

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Result not found"
            )

        return {
            "session_id": str(result["session_id"]),
            "student_id": result["student_id"],
            "exam_id": result["exam_id"],
            "total_questions": result["total_questions"],
            "correct_answers": result["correct_answers"],
            "score_percentage": result["score_percentage"],
            "passed": result["passed"],
            "submitted_at": str(result.get("submitted_at", "")),
            "proctoring_alerts": result.get("proctoring_alerts", [])
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching results: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch results"
        )


@router.get("/results")
async def get_all_student_results(db = Depends(get_db)):
    """
    Get all results for authenticated student
    """
    try:
        # TODO: Get authenticated student_id from JWT
        student_id = "placeholder_student_id"

        results_col = db["results"]
        results = await results_col.find({"student_id": student_id}).to_list(length=None)

        return {
            "success": True,
            "count": len(results),
            "results": results
        }

    except Exception as e:
        logger.error(f"Error fetching student results: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch results"
        )
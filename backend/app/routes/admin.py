"""
ExamShield AI - Admin Routes
Exam creation, management, and analytics
"""

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import List, Optional
import logging
from app.core.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter()


# Pydantic Models
class Question(BaseModel):
    """Question model"""
    question_text: str
    question_type: str
    options: Optional[List[str]] = None
    correct_answer: str
    marks: int = 1


class CreateExamRequest(BaseModel):
    """Create exam request"""
    title: str
    description: str
    instructions: str
    duration_minutes: int
    passing_percentage: float = 40.0
    questions: List[Question]


class UpdateExamRequest(BaseModel):
    """Update exam request"""
    title: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    duration_minutes: Optional[int] = None
    passing_percentage: Optional[float] = None
    questions: Optional[List[Question]] = None


class ExamStatsResponse(BaseModel):
    """Exam statistics response"""
    exam_id: str
    title: str
    total_attempts: int
    average_score: float
    pass_rate: float
    total_students: int


# Routes
@router.post("/exams", response_model=dict)
async def create_exam(exam_data: CreateExamRequest, db = Depends(get_db)):
    """
    Create a new exam
    
    - **title**: Exam title
    - **description**: Exam description
    - **instructions**: Exam instructions
    - **duration_minutes**: Duration in minutes
    - **passing_percentage**: Passing score percentage (0-100)
    - **questions**: List of questions with answers
    """
    try:
        # TODO: Get authenticated admin_id from JWT
        admin_id = "placeholder_admin_id"
        
        exams_col = db["exams"]
        
        # Prepare exam document
        exam_doc = {
            "title": exam_data.title,
            "description": exam_data.description,
            "instructions": exam_data.instructions,
            "duration_minutes": exam_data.duration_minutes,
            "passing_percentage": exam_data.passing_percentage,
            "created_by": admin_id,
            "created_at": None,
            "updated_at": None,
            "is_active": True,
            "questions": [q.dict() for q in exam_data.questions],
            "total_marks": sum(q.marks for q in exam_data.questions)
        }
        
        result = await exams_col.insert_one(exam_doc)
        
        return {
            "success": True,
            "message": "Exam created successfully",
            "exam_id": str(result.inserted_id)
        }
        
    except Exception as e:
        logger.error(f"Error creating exam: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create exam"
        )


@router.get("/exams")
async def list_exams(db = Depends(get_db)):
    """
    Get all exams created by admin
    """
    try:
        # TODO: Get authenticated admin_id from JWT
        admin_id = "placeholder_admin_id"
        
        exams_col = db["exams"]
        exams = await exams_col.find({"created_by": admin_id}).to_list(length=None)
        
        return {
            "success": True,
            "count": len(exams),
            "exams": [
                {
                    "id": str(exam["_id"]),
                    "title": exam["title"],
                    "description": exam["description"],
                    "duration_minutes": exam["duration_minutes"],
                    "total_questions": len(exam.get("questions", [])),
                    "is_active": exam.get("is_active", True),
                    "created_at": str(exam.get("created_at", ""))
                }
                for exam in exams
            ]
        }
        
    except Exception as e:
        logger.error(f"Error fetching exams: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch exams"
        )


@router.put("/exams/{exam_id}")
async def update_exam(exam_id: str, exam_data: UpdateExamRequest, db = Depends(get_db)):
    """
    Update exam details
    
    - **exam_id**: MongoDB ObjectId of the exam
    """
    try:
        from bson.objectid import ObjectId
        
        exams_col = db["exams"]
        
        # Prepare update data
        update_data = {}
        for key, value in exam_data.dict(exclude_unset=True).items():
            if value is not None:
                if key == "questions":
                    update_data[key] = [q.dict() for q in value]
                else:
                    update_data[key] = value
        
        result = await exams_col.update_one(
            {"_id": ObjectId(exam_id)},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Exam not found"
            )
        
        return {
            "success": True,
            "message": "Exam updated successfully",
            "modified_count": result.modified_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating exam: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update exam"
        )


@router.delete("/exams/{exam_id}")
async def delete_exam(exam_id: str, db = Depends(get_db)):
    """
    Delete an exam
    
    - **exam_id**: MongoDB ObjectId of the exam
    """
    try:
        from bson.objectid import ObjectId
        
        exams_col = db["exams"]
        
        result = await exams_col.delete_one({"_id": ObjectId(exam_id)})
        
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Exam not found"
            )
        
        return {
            "success": True,
            "message": "Exam deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting exam: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete exam"
        )


@router.get("/exams/{exam_id}/results")
async def get_exam_results(exam_id: str, db = Depends(get_db)):
    """
    Get all results for a specific exam
    
    - **exam_id**: MongoDB ObjectId of the exam
    """
    try:
        results_col = db["results"]
        results = await results_col.find({"exam_id": exam_id}).to_list(length=None)
        
        # Calculate statistics
        total_attempts = len(results)
        if total_attempts > 0:
            avg_score = sum(r["score_percentage"] for r in results) / total_attempts
            passed = sum(1 for r in results if r["passed"])
            pass_rate = (passed / total_attempts) * 100
        else:
            avg_score = 0
            pass_rate = 0
        
        return {
            "success": True,
            "exam_id": exam_id,
            "total_attempts": total_attempts,
            "average_score": round(avg_score, 2),
            "pass_rate": round(pass_rate, 2),
            "results": results
        }
        
    except Exception as e:
        logger.error(f"Error fetching exam results: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch results"
        )


@router.get("/exams/{exam_id}/analytics")
async def get_exam_analytics(exam_id: str, db = Depends(get_db)):
    """
    Get detailed analytics for an exam
    
    Includes:
    - Question difficulty
    - Most answered questions
    - Common wrong answers
    - Proctoring violations
    """
    try:
        return {
            "exam_id": exam_id,
            "message": "Analytics endpoint",
            "todo": "Implement analytics generation"
        }
        
    except Exception as e:
        logger.error(f"Error fetching analytics: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch analytics"
        )


@router.get("/dashboard")
async def get_admin_dashboard(db = Depends(get_db)):
    """
    Get admin dashboard statistics
    
    Shows overview of:
    - Total exams
    - Total students
    - Average pass rate
    - Recent results
    """
    try:
        return {
            "message": "Admin dashboard endpoint",
            "todo": "Implement dashboard statistics"
        }
        
    except Exception as e:
        logger.error(f"Error fetching dashboard: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch dashboard"
        )
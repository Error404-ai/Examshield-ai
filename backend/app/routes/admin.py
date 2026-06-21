"""
Admin Routes
Exam creation, management, and results overview
"""

from fastapi import APIRouter, HTTPException, status, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from typing import Dict, List
from datetime import datetime

from app.schemas import ExamCreate, ExamUpdate, ExamResponse, QuestionCreate
from app.core.database import get_db
from app.core.security import SecurityUtils

router = APIRouter()


def require_admin(current_user: Dict = Depends(SecurityUtils.get_current_user)):
    """Dependency: ensure user is admin"""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


# ============ Exam Management ============

@router.post("/exams", response_model=Dict)
async def create_exam(
    exam_data: ExamCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """Create a new exam"""
    try:
        exam_doc = {
            **exam_data.dict(),
            "created_by": current_user.get("user_id"),
            "is_published": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }

        result = await db.exams.insert_one(exam_doc)
        exam_id = str(result.inserted_id)

        return {
            "success": True,
            "message": "Exam created successfully",
            "exam_id": exam_id
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create exam: {str(e)}"
        )


@router.get("/exams", response_model=Dict)
async def get_all_exams(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """Get all exams created by this admin"""
    try:
        cursor = db.exams.find({"created_by": current_user.get("user_id")})
        exams = []
        async for exam in cursor:
            exam["_id"] = str(exam["_id"])
            exams.append(exam)

        return {"success": True, "exams": exams, "count": len(exams)}

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch exams: {str(e)}"
        )


@router.get("/exams/{exam_id}", response_model=Dict)
async def get_exam(
    exam_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """Get a specific exam with its questions"""
    try:
        exam = await db.exams.find_one({"_id": ObjectId(exam_id)})
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

        exam["_id"] = str(exam["_id"])

        # Fetch questions
        cursor = db.questions.find({"exam_id": exam_id})
        questions = []
        async for q in cursor:
            q["_id"] = str(q["_id"])
            questions.append(q)

        return {"success": True, "exam": exam, "questions": questions}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch exam: {str(e)}"
        )


@router.put("/exams/{exam_id}", response_model=Dict)
async def update_exam(
    exam_id: str,
    exam_data: ExamUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """Update an exam"""
    try:
        update_fields = {k: v for k, v in exam_data.dict().items() if v is not None}
        update_fields["updated_at"] = datetime.utcnow()

        result = await db.exams.update_one(
            {"_id": ObjectId(exam_id), "created_by": current_user.get("user_id")},
            {"$set": update_fields}
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

        return {"success": True, "message": "Exam updated successfully"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update exam: {str(e)}"
        )


@router.delete("/exams/{exam_id}", response_model=Dict)
async def delete_exam(
    exam_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """Delete an exam and its questions"""
    try:
        result = await db.exams.delete_one(
            {"_id": ObjectId(exam_id), "created_by": current_user.get("user_id")}
        )

        if result.deleted_count == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

        # Cascade delete questions
        await db.questions.delete_many({"exam_id": exam_id})

        return {"success": True, "message": "Exam deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete exam: {str(e)}"
        )


@router.post("/exams/{exam_id}/publish", response_model=Dict)
async def publish_exam(
    exam_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """Publish an exam so students can see it"""
    try:
        # Ensure exam has at least one question
        question_count = await db.questions.count_documents({"exam_id": exam_id})
        if question_count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot publish exam with no questions"
            )

        result = await db.exams.update_one(
            {"_id": ObjectId(exam_id), "created_by": current_user.get("user_id")},
            {"$set": {"is_published": True, "updated_at": datetime.utcnow()}}
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

        return {"success": True, "message": "Exam published successfully"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to publish exam: {str(e)}"
        )


# ============ Question Management ============

@router.post("/questions", response_model=Dict)
async def add_question(
    question_data: QuestionCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """Add a question to an exam"""
    try:
        # Verify exam belongs to admin
        exam = await db.exams.find_one({
            "_id": ObjectId(question_data.exam_id),
            "created_by": current_user.get("user_id")
        })
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

        question_doc = {
            **question_data.dict(),
            "created_at": datetime.utcnow()
        }

        result = await db.questions.insert_one(question_doc)

        return {
            "success": True,
            "message": "Question added successfully",
            "question_id": str(result.inserted_id)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add question: {str(e)}"
        )


@router.delete("/questions/{question_id}", response_model=Dict)
async def delete_question(
    question_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """Delete a question"""
    try:
        result = await db.questions.delete_one({"_id": ObjectId(question_id)})

        if result.deleted_count == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

        return {"success": True, "message": "Question deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete question: {str(e)}"
        )


# ============ Results Overview ============

@router.get("/exams/{exam_id}/results", response_model=Dict)
async def get_exam_results(
    exam_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """Get all student results for an exam"""
    try:
        # Verify exam ownership
        exam = await db.exams.find_one({
            "_id": ObjectId(exam_id),
            "created_by": current_user.get("user_id")
        })
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

        cursor = db.sessions.find({"exam_id": exam_id, "status": "submitted"})
        results = []
        async for session in cursor:
            session["_id"] = str(session["_id"])

            # Fetch student info
            student = await db.users.find_one({"_id": ObjectId(session["student_id"])})
            session["student_name"] = student["name"] if student else "Unknown"
            session["student_email"] = student["email"] if student else "Unknown"

            results.append(session)

        # Summary stats
        total = len(results)
        passed = sum(1 for r in results if r.get("passed"))
        avg_score = sum(r.get("percentage", 0) for r in results) / total if total > 0 else 0

        return {
            "success": True,
            "exam_title": exam["title"],
            "total_attempts": total,
            "passed": passed,
            "failed": total - passed,
            "average_score": round(avg_score, 2),
            "results": results
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch results: {str(e)}"
        )


@router.get("/dashboard", response_model=Dict)
async def admin_dashboard(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """Admin dashboard stats"""
    try:
        admin_id = current_user.get("user_id")

        total_exams = await db.exams.count_documents({"created_by": admin_id})
        published_exams = await db.exams.count_documents({"created_by": admin_id, "is_published": True})
        total_students = await db.users.count_documents({"role": "student"})
        total_sessions = await db.sessions.count_documents({})

        return {
            "success": True,
            "stats": {
                "total_exams": total_exams,
                "published_exams": published_exams,
                "total_students": total_students,
                "total_sessions": total_sessions
            }
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch dashboard: {str(e)}"
        )
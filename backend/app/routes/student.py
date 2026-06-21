"""
Student Routes
Exam access, session management, and result retrieval
"""

from fastapi import APIRouter, HTTPException, status, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from typing import Dict, List
from datetime import datetime

from app.schemas import SessionSubmit, SessionStatus
from app.core.database import get_db
from app.core.security import SecurityUtils

router = APIRouter()


def require_student(current_user: Dict = Depends(SecurityUtils.get_current_user)):
    """Dependency: ensure user is student"""
    if current_user.get("role") != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student access required"
        )
    return current_user


# ============ Exam Discovery ============

@router.get("/exams", response_model=Dict)
async def get_available_exams(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(require_student)
):
    """Get all published exams available to student"""
    try:
        student_id = current_user.get("user_id")

        cursor = db.exams.find({"is_published": True})
        exams = []
        async for exam in cursor:
            exam["_id"] = str(exam["_id"])

            # Check if student already attempted this exam
            existing_session = await db.sessions.find_one({
                "student_id": student_id,
                "exam_id": str(exam["_id"])
            })
            exam["attempted"] = existing_session is not None
            exam["session_status"] = existing_session.get("status") if existing_session else None

            # Don't expose correct answers
            exam.pop("correct_answers", None)
            exams.append(exam)

        return {"success": True, "exams": exams, "count": len(exams)}

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch exams: {str(e)}"
        )


@router.get("/exams/{exam_id}", response_model=Dict)
async def get_exam_for_student(
    exam_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(require_student)
):
    """Get exam details and questions (without correct answers)"""
    try:
        exam = await db.exams.find_one({"_id": ObjectId(exam_id), "is_published": True})
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

        exam["_id"] = str(exam["_id"])

        # Fetch questions — strip correct_answer field
        cursor = db.questions.find({"exam_id": exam_id})
        questions = []
        async for q in cursor:
            q["_id"] = str(q["_id"])
            q.pop("correct_answer", None)  # Never expose to student
            questions.append(q)

        return {"success": True, "exam": exam, "questions": questions}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch exam: {str(e)}"
        )


# ============ Session Management ============

@router.post("/exams/{exam_id}/start", response_model=Dict)
async def start_exam_session(
    exam_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(require_student)
):
    """Start an exam session"""
    try:
        student_id = current_user.get("user_id")

        # Verify exam exists and is published
        exam = await db.exams.find_one({"_id": ObjectId(exam_id), "is_published": True})
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

        # Prevent duplicate active sessions
        existing = await db.sessions.find_one({
            "student_id": student_id,
            "exam_id": exam_id,
            "status": SessionStatus.ONGOING.value
        })
        if existing:
            return {
                "success": True,
                "message": "Session already active",
                "session_id": str(existing["_id"])
            }

        # Prevent re-attempting submitted exams
        submitted = await db.sessions.find_one({
            "student_id": student_id,
            "exam_id": exam_id,
            "status": SessionStatus.SUBMITTED.value
        })
        if submitted:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You have already submitted this exam"
            )

        session_doc = {
            "student_id": student_id,
            "exam_id": exam_id,
            "status": SessionStatus.ONGOING.value,
            "score": 0,
            "total_marks": exam["total_marks"],
            "percentage": 0.0,
            "passed": False,
            "answers": [],
            "started_at": datetime.utcnow(),
            "submitted_at": None
        }

        result = await db.sessions.insert_one(session_doc)
        session_id = str(result.inserted_id)

        return {
            "success": True,
            "message": "Exam session started",
            "session_id": session_id,
            "duration_minutes": exam["duration"],
            "started_at": session_doc["started_at"].isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start session: {str(e)}"
        )


@router.post("/sessions/submit", response_model=Dict)
async def submit_exam(
    submission: SessionSubmit,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(require_student)
):
    """Submit exam answers and auto-generate result"""
    try:
        student_id = current_user.get("user_id")

        # Fetch session
        session = await db.sessions.find_one({
            "_id": ObjectId(submission.session_id),
            "student_id": student_id,
            "status": SessionStatus.ONGOING.value
        })
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Active session not found"
            )

        # Fetch all questions with correct answers
        exam_id = session["exam_id"]
        cursor = db.questions.find({"exam_id": exam_id})
        questions = {str(q["_id"]): q async for q in cursor}

        # Auto-grade
        score = 0
        graded_answers = []
        for answer in submission.answers:
            question = questions.get(answer.question_id)
            if not question:
                continue
            is_correct = answer.selected_answer.strip().lower() == question["correct_answer"].strip().lower()
            if is_correct:
                score += question.get("marks", 1)
            graded_answers.append({
                "question_id": answer.question_id,
                "selected_answer": answer.selected_answer,
                "correct_answer": question["correct_answer"],
                "is_correct": is_correct,
                "marks_awarded": question.get("marks", 1) if is_correct else 0
            })

        # Fetch exam for passing marks
        exam = await db.exams.find_one({"_id": ObjectId(exam_id)})
        total_marks = exam["total_marks"]
        passing_marks = exam["passing_marks"]
        percentage = round((score / total_marks) * 100, 2) if total_marks > 0 else 0
        passed = score >= passing_marks

        # Update session
        await db.sessions.update_one(
            {"_id": ObjectId(submission.session_id)},
            {"$set": {
                "status": SessionStatus.SUBMITTED.value,
                "score": score,
                "percentage": percentage,
                "passed": passed,
                "answers": graded_answers,
                "submitted_at": datetime.utcnow()
            }}
        )

        return {
            "success": True,
            "message": "Exam submitted successfully",
            "result": {
                "score": score,
                "total_marks": total_marks,
                "percentage": percentage,
                "passed": passed,
                "passing_marks": passing_marks
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit exam: {str(e)}"
        )


# ============ Results ============

@router.get("/results", response_model=Dict)
async def get_my_results(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(require_student)
):
    """Get all submitted exam results for the student"""
    try:
        student_id = current_user.get("user_id")

        cursor = db.sessions.find({
            "student_id": student_id,
            "status": SessionStatus.SUBMITTED.value
        })

        results = []
        async for session in cursor:
            session["_id"] = str(session["_id"])

            # Attach exam title
            exam = await db.exams.find_one({"_id": ObjectId(session["exam_id"])})
            session["exam_title"] = exam["title"] if exam else "Unknown"
            session.pop("answers", None)  # Don't expose full answer list in summary
            results.append(session)

        return {"success": True, "results": results, "count": len(results)}

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch results: {str(e)}"
        )


@router.get("/results/{session_id}", response_model=Dict)
async def get_result_detail(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(require_student)
):
    """Get detailed result for a specific session"""
    try:
        student_id = current_user.get("user_id")

        session = await db.sessions.find_one({
            "_id": ObjectId(session_id),
            "student_id": student_id
        })
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not found")

        session["_id"] = str(session["_id"])

        exam = await db.exams.find_one({"_id": ObjectId(session["exam_id"])})
        session["exam_title"] = exam["title"] if exam else "Unknown"

        return {"success": True, "result": session}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch result: {str(e)}"
        )


@router.get("/dashboard", response_model=Dict)
async def student_dashboard(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(require_student)
):
    """Student dashboard stats"""
    try:
        student_id = current_user.get("user_id")

        total_available = await db.exams.count_documents({"is_published": True})
        total_attempted = await db.sessions.count_documents({"student_id": student_id})
        total_passed = await db.sessions.count_documents({"student_id": student_id, "passed": True})

        return {
            "success": True,
            "stats": {
                "available_exams": total_available,
                "attempted": total_attempted,
                "passed": total_passed,
                "failed": total_attempted - total_passed
            }
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch dashboard: {str(e)}"
        )
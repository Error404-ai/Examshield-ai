"""
Proctoring Routes
API endpoints for real-time proctoring and monitoring
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from typing import Dict, Optional
from datetime import datetime
import logging

from app.core.security import SecurityUtils
from app.core.database import get_db
from app.ml.proctoring_orchestrator import ProctoringOrchestrator
from app.schemas import ProctoringLog, BehaviorAlert, ProctoringReport

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory storage of active proctoring sessions
# In production, use Redis for distributed systems
proctoring_sessions: Dict[str, ProctoringOrchestrator] = {}


@router.post("/register-face/{session_id}")
async def register_student_face(
    session_id: str,
    file: UploadFile = File(...),
    current_user: Dict = Depends(SecurityUtils.get_current_user)
):
    """
    Register student's face at start of exam
    
    Args:
        session_id: Exam session ID
        file: Face image file
        
    Returns:
        JSON response with registration status
    """
    try:
        student_id = current_user.get("user_id")
        
        # Save uploaded file temporarily
        import tempfile
        import shutil
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        # Initialize proctoring session
        if session_id not in proctoring_sessions:
            proctoring_sessions[session_id] = ProctoringOrchestrator(
                session_id=session_id,
                student_id=student_id
            )
        
        orchestrator = proctoring_sessions[session_id]
        
        # Register face
        success = orchestrator.register_student_face(tmp_path)
        
        # Clean up temp file
        import os
        os.unlink(tmp_path)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Face registration failed. Ensure face is clearly visible."
            )
        
        return {
            "success": True,
            "message": "Face registered successfully",
            "session_id": session_id
        }
        
    except Exception as e:
        logger.error(f"Face registration error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to register face"
        )


@router.post("/process-frame/{session_id}")
async def process_frame(
    session_id: str,
    frame_data: Dict,
    current_user: Dict = Depends(SecurityUtils.get_current_user)
):
    """
    Process a single frame from exam video stream
    
    Args:
        session_id: Exam session ID
        frame_data: Base64 encoded frame
        
    Returns:
        JSON with proctoring analysis
    """
    try:
        student_id = current_user.get("user_id")
        
        # Get or create orchestrator
        if session_id not in proctoring_sessions:
            proctoring_sessions[session_id] = ProctoringOrchestrator(
                session_id=session_id,
                student_id=student_id
            )
        
        orchestrator = proctoring_sessions[session_id]
        
        # Process frame
        result = orchestrator.process_frame(
            frame_data.get("frame"),
            frame_data.get("frame_index", 0)
        )
        
        return {
            "success": True,
            "data": result
        }
        
    except Exception as e:
        logger.error(f"Frame processing error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process frame"
        )


@router.post("/report-issue/{session_id}")
async def report_suspicious_activity(
    session_id: str,
    alert: BehaviorAlert,
    current_user: Dict = Depends(SecurityUtils.get_current_user)
):
    """
    Report suspicious activity during exam
    Can be called from frontend for immediate alerts
    
    Args:
        session_id: Exam session ID
        alert: Alert details
        
    Returns:
        JSON confirmation
    """
    try:
        if session_id not in proctoring_sessions:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        orchestrator = proctoring_sessions[session_id]
        
        # Record alert
        orchestrator.behavior_analyzer.record_event(
            event_type=alert.alert_type,
            severity=alert.severity,
            description=alert.description,
            metadata=alert.metadata
        )
        
        logger.warning(f"Alert reported for session {session_id}: {alert.alert_type}")
        
        return {
            "success": True,
            "message": "Alert recorded"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Alert reporting error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record alert"
        )


@router.get("/report/{session_id}")
async def get_proctoring_report(
    session_id: str,
    current_user: Dict = Depends(SecurityUtils.get_current_user)
):
    """
    Get proctoring report for completed exam
    
    Args:
        session_id: Exam session ID
        
    Returns:
        Comprehensive proctoring report
    """
    try:
        if session_id not in proctoring_sessions:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        orchestrator = proctoring_sessions[session_id]
        report = orchestrator.get_session_report()
        
        return {
            "success": True,
            "data": report
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Report generation error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate report"
        )


@router.post("/end-session/{session_id}")
async def end_proctoring_session(
    session_id: str,
    current_user: Dict = Depends(SecurityUtils.get_current_user)
):
    """
    End proctoring session and cleanup resources
    
    Args:
        session_id: Exam session ID
        
    Returns:
        Final report and cleanup confirmation
    """
    try:
        if session_id not in proctoring_sessions:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        orchestrator = proctoring_sessions[session_id]
        
        # Get final report
        report = orchestrator.get_session_report()
        
        # Cleanup
        orchestrator.cleanup()
        del proctoring_sessions[session_id]
        
        logger.info(f"✅ Proctoring session {session_id} ended")
        
        return {
            "success": True,
            "message": "Session ended successfully",
            "final_report": report
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Session end error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to end session"
        )


@router.get("/status/{session_id}")
async def get_session_status(
    session_id: str,
    current_user: Dict = Depends(SecurityUtils.get_current_user)
):
    """
    Get real-time status of proctoring session
    
    Args:
        session_id: Exam session ID
        
    Returns:
        Current session status and metrics
    """
    try:
        if session_id not in proctoring_sessions:
            return {
                "success": True,
                "status": "inactive",
                "message": "Session not active"
            }
        
        orchestrator = proctoring_sessions[session_id]
        
        return {
            "success": True,
            "status": "active",
            "frames_processed": orchestrator.frames_processed,
            "total_alerts": len(orchestrator.alerts),
            "suspicion_score": orchestrator.behavior_analyzer.calculate_suspicion_score(),
            "attention_score": orchestrator.gaze_detector.get_attention_score(),
            "session_id": session_id
        }
        
    except Exception as e:
        logger.error(f"Status check error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get session status"
        )
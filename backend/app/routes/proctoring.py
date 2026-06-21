"""
Proctoring Routes
Real-time proctoring events, alerts, and report retrieval
"""

from fastapi import APIRouter, HTTPException, status, Depends, WebSocket, WebSocketDisconnect
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from typing import Dict, List
from datetime import datetime
import json
import logging

from app.schemas import BehaviorAlert, ProctoringLog, AlertSeverity, SessionStatus
from app.core.database import get_db
from app.core.security import SecurityUtils

logger = logging.getLogger(__name__)
router = APIRouter()


# ============ Alert Logging ============

@router.post("/alert", response_model=Dict)
async def log_alert(
    alert: BehaviorAlert,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(SecurityUtils.get_current_user)
):
    """Log a proctoring alert for a session"""
    try:
        # Verify session belongs to student
        session = await db.sessions.find_one({
            "_id": ObjectId(alert.session_id),
            "student_id": current_user.get("user_id"),
            "status": SessionStatus.ONGOING.value
        })
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active session not found")

        alert_doc = {
            **alert.dict(),
            "timestamp": alert.timestamp or datetime.utcnow()
        }

        await db.proctoring_alerts.insert_one(alert_doc)

        # Auto-fail session on critical alerts
        if alert.severity == AlertSeverity.CRITICAL:
            critical_count = await db.proctoring_alerts.count_documents({
                "session_id": alert.session_id,
                "severity": AlertSeverity.CRITICAL.value
            })
            if critical_count >= 3:
                await db.sessions.update_one(
                    {"_id": ObjectId(alert.session_id)},
                    {"$set": {"status": SessionStatus.PROCTORING_FAILED.value}}
                )
                return {
                    "success": True,
                    "message": "Alert logged",
                    "session_terminated": True,
                    "reason": "Too many critical violations"
                }

        return {"success": True, "message": "Alert logged"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to log alert: {str(e)}"
        )


@router.post("/log", response_model=Dict)
async def log_proctoring_frame(
    log: ProctoringLog,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(SecurityUtils.get_current_user)
):
    """Log a proctoring frame snapshot"""
    try:
        log_doc = {
            **log.dict(),
            "timestamp": log.timestamp or datetime.utcnow()
        }
        await db.proctoring_logs.insert_one(log_doc)

        return {"success": True, "message": "Frame logged"}

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to log frame: {str(e)}"
        )


# ============ Tab Switch Tracking ============

@router.post("/tab-switch", response_model=Dict)
async def log_tab_switch(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(SecurityUtils.get_current_user)
):
    """Log a tab switch event"""
    try:
        alert_doc = {
            "session_id": session_id,
            "alert_type": "tab_switch",
            "severity": AlertSeverity.MEDIUM.value,
            "description": "Student switched browser tab during exam",
            "timestamp": datetime.utcnow(),
            "metadata": {"student_id": current_user.get("user_id")}
        }
        await db.proctoring_alerts.insert_one(alert_doc)

        # Count tab switches
        tab_switches = await db.proctoring_alerts.count_documents({
            "session_id": session_id,
            "alert_type": "tab_switch"
        })

        warning = None
        if tab_switches >= 5:
            warning = "Final warning: exam will be terminated on next tab switch"
        elif tab_switches >= 3:
            warning = f"Warning: {tab_switches} tab switches detected"

        return {
            "success": True,
            "tab_switch_count": tab_switches,
            "warning": warning
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to log tab switch: {str(e)}"
        )


# ============ Reports ============

@router.get("/report/{session_id}", response_model=Dict)
async def get_proctoring_report(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(SecurityUtils.get_current_user)
):
    """
    Generate a proctoring report for a session.
    Accessible by the session's student OR any admin.
    """
    try:
        session = await db.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        # Access control
        is_admin = current_user.get("role") == "admin"
        is_owner = session["student_id"] == current_user.get("user_id")
        if not is_admin and not is_owner:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

        # Fetch all alerts
        cursor = db.proctoring_alerts.find({"session_id": session_id})
        alerts = []
        async for alert in cursor:
            alert["_id"] = str(alert["_id"])
            alerts.append(alert)

        total = len(alerts)
        critical = sum(1 for a in alerts if a.get("severity") == AlertSeverity.CRITICAL.value)
        high = sum(1 for a in alerts if a.get("severity") == AlertSeverity.HIGH.value)

        # Compute suspicion score (0–100)
        suspicion_score = min(100, (critical * 30) + (high * 15) + ((total - critical - high) * 5))

        if suspicion_score >= 70:
            recommended_action = "reject"
        elif suspicion_score >= 40:
            recommended_action = "review"
        else:
            recommended_action = "approve"

        total_frames = await db.proctoring_logs.count_documents({"session_id": session_id})

        return {
            "success": True,
            "report": {
                "session_id": session_id,
                "total_frames_analyzed": total_frames,
                "alerts_count": total,
                "critical_alerts": critical,
                "suspicion_score": suspicion_score,
                "recommended_action": recommended_action,
                "detailed_log": alerts
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate report: {str(e)}"
        )


@router.get("/admin/alerts", response_model=Dict)
async def get_all_alerts(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(SecurityUtils.get_current_user)
):
    """Admin: get all recent critical/high alerts across all sessions"""
    try:
        if current_user.get("role") != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

        cursor = db.proctoring_alerts.find(
            {"severity": {"$in": [AlertSeverity.CRITICAL.value, AlertSeverity.HIGH.value]}}
        ).sort("timestamp", -1).limit(100)

        alerts = []
        async for alert in cursor:
            alert["_id"] = str(alert["_id"])
            alerts.append(alert)

        return {"success": True, "alerts": alerts, "count": len(alerts)}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch alerts: {str(e)}"
        )


# ============ WebSocket for Real-time Proctoring ============

@router.websocket("/ws/{session_id}")
async def proctoring_websocket(
    websocket: WebSocket,
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    WebSocket endpoint for real-time proctoring feed.
    Frontend sends frame analysis results; server responds with alerts.
    """
    await websocket.accept()
    logger.info(f"Proctoring WebSocket connected for session {session_id}")

    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)

            event_type = payload.get("type")

            if event_type == "frame_analysis":
                # Expect: { type, face_detected, looking_at_screen, tab_active }
                alerts = []

                if not payload.get("face_detected"):
                    alerts.append({"type": "no_face", "severity": "high", "message": "No face detected"})

                if not payload.get("looking_at_screen"):
                    alerts.append({"type": "gaze_away", "severity": "medium", "message": "Student not looking at screen"})

                if not payload.get("tab_active"):
                    alerts.append({"type": "tab_switch", "severity": "medium", "message": "Tab switched"})

                await websocket.send_text(json.dumps({
                    "type": "proctoring_response",
                    "session_id": session_id,
                    "alerts": alerts,
                    "timestamp": datetime.utcnow().isoformat()
                }))

            elif event_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

    except WebSocketDisconnect:
        logger.info(f"Proctoring WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {str(e)}")
        await websocket.close()
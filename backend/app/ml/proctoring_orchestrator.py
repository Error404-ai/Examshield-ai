"""
Proctoring Orchestrator
Coordinates face recognition, gaze detection, and behavior analysis
Central component for real-time exam proctoring
"""

import cv2
import base64
import numpy as np
from typing import Dict, Optional, List
from datetime import datetime
import logging
import asyncio

from app.ml.face_recognition import FaceRecognitionEngine
from app.ml.eye_gaze import EyeGazeDetector
from app.ml.behavior_analyzer import BehaviorAnalyzer
from app.core.config import settings

logger = logging.getLogger(__name__)


class ProctoringOrchestrator:
    """
    Main proctoring system that orchestrates all ML components
    Processes video frames and generates proctoring decisions
    """

    def __init__(self, session_id: str, student_id: str):
        """
        Initialize proctoring orchestrator
        
        Args:
            session_id: Exam session ID
            student_id: Student ID for verification
        """
        self.session_id = session_id
        self.student_id = student_id
        
        # Initialize ML components
        self.face_recognition = FaceRecognitionEngine(
            threshold=settings.FACE_RECOGNITION_THRESHOLD
        )
        self.gaze_detector = EyeGazeDetector(
            threshold=settings.EYE_GAZE_THRESHOLD
        )
        self.behavior_analyzer = BehaviorAnalyzer()
        
        # Tracking state
        self.frames_processed = 0
        self.alerts: List[Dict] = []
        self.logs: List[Dict] = []
        self.is_monitoring = False
        
        logger.info(f"✅ Proctoring initialized for session {session_id}")

    def register_student_face(self, image_path: str) -> bool:
        """
        Register student's face at the beginning of exam
        
        Args:
            image_path: Path to student's reference image
            
        Returns:
            bool: Registration success
        """
        success = self.face_recognition.register_student(image_path, self.student_id)
        
        if success:
            self.behavior_analyzer.record_event(
                event_type="student_registered",
                severity="low",
                description=f"Student {self.student_id} registered for proctoring"
            )
            logger.info(f"✅ Student {self.student_id} registered")
        else:
            logger.error(f"❌ Failed to register student {self.student_id}")
        
        return success

    def process_frame(self, frame_data: str, frame_index: int = 0) -> Dict:
        """
        Process a single video frame for proctoring
        
        Args:
            frame_data: Base64 encoded frame data
            frame_index: Frame index for tracking
            
        Returns:
            Dict: Proctoring analysis results for this frame
        """
        try:
            # Decode frame
            frame_bytes = base64.b64decode(frame_data)
            nparr = np.frombuffer(frame_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if frame is None:
                logger.error("Failed to decode frame")
                return self._create_error_result()
            
            self.frames_processed += 1
            
            # Run all analysis
            face_result = self._analyze_face(frame)
            gaze_result = self._analyze_gaze(frame)
            behavior_flags = self._analyze_behavior(face_result, gaze_result)
            
            # Compile results
            result = {
                "session_id": self.session_id,
                "frame_index": frame_index,
                "timestamp": datetime.utcnow().isoformat(),
                "face_detection": face_result,
                "gaze_detection": gaze_result,
                "behavior_flags": behavior_flags,
                "suspicion_score": self.behavior_analyzer.calculate_suspicion_score(),
                "critical_alert": len(behavior_flags) > 0 and any(
                    f.get("severity") == "critical" for f in behavior_flags
                )
            }
            
            # Store log
            self._store_log(result)
            
            # Generate alert if needed
            if result["critical_alert"]:
                self._generate_alert(behavior_flags)
            
            return result
            
        except Exception as e:
            logger.error(f"Frame processing error: {str(e)}")
            return self._create_error_result()

    def _analyze_face(self, frame: np.ndarray) -> Dict:
        """Analyze face in frame"""
        result = self.face_recognition.verify_student(frame)
        
        # Update behavior analyzer
        self.behavior_analyzer.analyze_face_detection(
            result.get("verified", False),
            result.get("confidence", 0.0)
        )
        
        # Check for multiple faces
        if result.get("face_count", 0) > 1:
            self.behavior_analyzer.detect_multiple_faces()
        
        return result

    def _analyze_gaze(self, frame: np.ndarray) -> Dict:
        """Analyze eye gaze in frame"""
        result = self.gaze_detector.detect_gaze(frame)
        
        # Update behavior analyzer
        self.behavior_analyzer.analyze_gaze_pattern(
            not result.get("looking_at_screen", True),
            result.get("gaze_direction", "unknown")
        )
        
        return result

    def _analyze_behavior(self, face_result: Dict, gaze_result: Dict) -> List[Dict]:
        """Analyze overall behavior and generate flags"""
        flags = []
        
        # Check face verification
        if not face_result.get("verified", False):
            flags.append({
                "type": "face_mismatch",
                "severity": "high",
                "description": "Detected face does not match registered student",
                "confidence": 1.0 - face_result.get("confidence", 0.0)
            })
        
        # Check face detection
        if face_result.get("face_count", 0) == 0:
            flags.append({
                "type": "no_face_detected",
                "severity": "critical",
                "description": "No face detected in frame"
            })
        elif face_result.get("face_count", 0) > 1:
            flags.append({
                "type": "multiple_faces",
                "severity": "critical",
                "description": f"Multiple faces detected ({face_result['face_count']})"
            })
        
        # Check eye closure
        if gaze_result.get("eye_closure_warning", False):
            flags.append({
                "type": "eyes_closed",
                "severity": "medium",
                "description": "Eyes detected as closed",
                "ear": gaze_result.get("eye_aspect_ratio", 0.0)
            })
        
        # Check gaze
        if not gaze_result.get("looking_at_screen", True):
            flags.append({
                "type": "looking_away",
                "severity": "low",
                "description": f"Student looking {gaze_result.get('gaze_direction', 'unknown')}",
                "gaze_direction": gaze_result.get("gaze_direction")
            })
        
        return flags

    def _store_log(self, result: Dict):
        """Store proctoring log entry"""
        self.logs.append(result)
        
        # Keep only last 1000 logs in memory
        if len(self.logs) > 1000:
            self.logs = self.logs[-1000:]

    def _generate_alert(self, flags: List[Dict]):
        """Generate alert for critical findings"""
        for flag in flags:
            if flag.get("severity") == "critical":
                alert = {
                    "session_id": self.session_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "type": flag.get("type"),
                    "description": flag.get("description"),
                    "severity": "critical"
                }
                self.alerts.append(alert)
                logger.warning(f"🚨 ALERT: {flag.get('description')}")

    def _create_error_result(self) -> Dict:
        """Create error result"""
        return {
            "session_id": self.session_id,
            "timestamp": datetime.utcnow().isoformat(),
            "error": True,
            "message": "Error processing frame"
        }

    def get_session_report(self) -> Dict:
        """
        Generate comprehensive proctoring report for session
        
        Returns:
            Dict: Complete proctoring analysis report
        """
        report = self.behavior_analyzer.generate_report()
        report.update({
            "session_id": self.session_id,
            "student_id": self.student_id,
            "frames_processed": self.frames_processed,
            "total_alerts": len(self.alerts),
            "attention_score": self.gaze_detector.get_attention_score(),
            "critical_alerts": [a for a in self.alerts if a.get("severity") == "critical"],
            "generated_at": datetime.utcnow().isoformat()
        })
        
        return report

    def cleanup(self):
        """Release resources"""
        self.face_recognition.release()
        self.gaze_detector.release()
        logger.info(f"🧹 Cleanup complete for session {self.session_id}")
"""
Behavior Analysis Module
Detects suspicious behaviors and patterns during exam
Includes tab switching detection, unusual movements, etc.
"""

from typing import Dict, List, Optional
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


class BehaviorAnalyzer:
    """
    Analyzes student behavior for cheating indicators
    Tracks multiple signals and generates suspicion score
    """

    def __init__(self):
        """Initialize behavior analyzer"""
        self.events: List[Dict] = []
        self.alerts: List[Dict] = []
        self.tab_switches = 0
        self.face_detection_failures = 0
        self.looking_away_incidents = 0
        self.head_movement_incidents = 0
        self.suspicious_patterns: List[str] = []

    def record_event(
        self,
        event_type: str,
        severity: str = "low",
        description: str = "",
        metadata: Optional[Dict] = None
    ):
        """
        Record a behavioral event
        
        Args:
            event_type: Type of event (tab_switch, face_lost, looking_away, etc.)
            severity: Severity level (low, medium, high, critical)
            description: Event description
            metadata: Additional metadata
        """
        event = {
            "timestamp": datetime.utcnow().isoformat(),
            "type": event_type,
            "severity": severity,
            "description": description,
            "metadata": metadata or {}
        }
        
        self.events.append(event)
        logger.info(f"Event recorded: {event_type} ({severity})")

    def detect_tab_switch(self) -> bool:
        """
        Detect tab/window switching attempts
        This would be integrated with JavaScript on frontend
        
        Returns:
            bool: True if suspicious tab switch detected
        """
        self.tab_switches += 1
        
        if self.tab_switches > 2:  # Allow max 2 tab switches
            self.record_event(
                event_type="tab_switch",
                severity="high",
                description=f"Multiple tab switches detected ({self.tab_switches})"
            )
            return True
        
        return False

    def analyze_face_detection(self, face_detected: bool, confidence: float):
        """
        Analyze face detection consistency
        
        Args:
            face_detected: Whether face was detected
            confidence: Detection confidence
        """
        if not face_detected:
            self.face_detection_failures += 1
            
            if self.face_detection_failures > 5:
                self.record_event(
                    event_type="face_not_detected",
                    severity="critical",
                    description=f"Face detection failed {self.face_detection_failures} times"
                )
        else:
            # Reset counter if face is detected
            if confidence > 0.8:
                self.face_detection_failures = max(0, self.face_detection_failures - 1)

    def analyze_gaze_pattern(self, looking_away: bool, gaze_direction: str):
        """
        Analyze eye gaze patterns
        
        Args:
            looking_away: Whether student is looking away
            gaze_direction: Direction of gaze
        """
        if looking_away:
            self.looking_away_incidents += 1
            
            # Alert if looking away too frequently
            if self.looking_away_incidents > 10:
                self.record_event(
                    event_type="excessive_looking_away",
                    severity="high",
                    description=f"Student looking away frequently ({self.looking_away_incidents} times)",
                    metadata={"gaze_direction": gaze_direction}
                )

    def analyze_head_movement(self, movement_angle: float, threshold: float = 30.0) -> bool:
        """
        Analyze head movement for suspicious behavior
        
        Args:
            movement_angle: Head rotation angle in degrees
            threshold: Threshold for suspicious movement
            
        Returns:
            bool: True if suspicious movement detected
        """
        if movement_angle > threshold:
            self.head_movement_incidents += 1
            
            self.record_event(
                event_type="excessive_head_movement",
                severity="medium",
                description=f"Head rotated {movement_angle:.1f} degrees",
                metadata={"angle": movement_angle, "threshold": threshold}
            )
            
            return True
        
        return False

    def detect_multiple_faces(self) -> bool:
        """
        Detect if multiple people are in frame
        
        Returns:
            bool: True if multiple faces detected
        """
        self.record_event(
            event_type="multiple_faces_detected",
            severity="critical",
            description="Multiple faces detected in frame"
        )
        return True

    def analyze_keystroke_pattern(self, wpm: float) -> Optional[str]:
        """
        Analyze typing pattern for anomalies
        Unusual typing speed might indicate someone else typing
        
        Args:
            wpm: Words per minute typing speed
            
        Returns:
            str: Warning message or None
        """
        # Average typing speed: 40 WPM
        # Extreme speeds might indicate copy-paste or AI assistance
        
        if wpm > 150:  # Suspiciously fast
            warning = "Unusually fast typing detected (possible copy-paste or AI assistance)"
            self.record_event(
                event_type="suspicious_typing_speed",
                severity="medium",
                description=warning,
                metadata={"wpm": wpm}
            )
            return warning
        
        if wpm < 10:  # Suspiciously slow
            warning = "Unusually slow typing detected"
            self.record_event(
                event_type="suspicious_typing_speed",
                severity="low",
                description=warning,
                metadata={"wpm": wpm}
            )
            return warning
        
        return None

    def analyze_submission_pattern(self, time_elapsed: float, exam_duration: float) -> Optional[str]:
        """
        Analyze exam submission pattern
        
        Args:
            time_elapsed: Time spent on exam (seconds)
            exam_duration: Total exam duration (seconds)
            
        Returns:
            str: Warning message or None
        """
        time_ratio = time_elapsed / exam_duration if exam_duration > 0 else 1.0
        
        if time_ratio < 0.1:  # Submitted in <10% of time
            warning = "Exam submitted too quickly (possible pre-prepared answers)"
            self.record_event(
                event_type="suspiciously_fast_submission",
                severity="high",
                description=warning,
                metadata={"time_ratio": time_ratio}
            )
            return warning
        
        return None

    def calculate_suspicion_score(self) -> float:
        """
        Calculate overall suspicion score (0-100)
        
        Returns:
            float: Suspicion score
        """
        score = 0.0
        
        # Critical incidents
        critical_count = sum(1 for e in self.events if e["severity"] == "critical")
        score += critical_count * 25  # Each critical incident: +25
        
        # High severity incidents
        high_count = sum(1 for e in self.events if e["severity"] == "high")
        score += high_count * 10  # Each high incident: +10
        
        # Medium severity incidents
        medium_count = sum(1 for e in self.events if e["severity"] == "medium")
        score += medium_count * 3  # Each medium incident: +3
        
        # Cap at 100
        return min(100.0, score)

    def get_recommendation(self) -> str:
        """
        Get recommendation based on suspicion score
        
        Returns:
            str: Recommendation (approve, review, reject)
        """
        score = self.calculate_suspicion_score()
        
        if score < 20:
            return "approve"  # Low suspicion, approve automatically
        elif score < 50:
            return "review"   # Moderate suspicion, manual review needed
        else:
            return "reject"   # High suspicion, likely cheating

    def generate_report(self) -> Dict:
        """
        Generate comprehensive proctoring report
        
        Returns:
            Dict: Detailed report with all findings
        """
        suspicion_score = self.calculate_suspicion_score()
        
        return {
            "total_events": len(self.events),
            "critical_incidents": sum(1 for e in self.events if e["severity"] == "critical"),
            "high_incidents": sum(1 for e in self.events if e["severity"] == "high"),
            "medium_incidents": sum(1 for e in self.events if e["severity"] == "medium"),
            "low_incidents": sum(1 for e in self.events if e["severity"] == "low"),
            "tab_switches": self.tab_switches,
            "face_detection_failures": self.face_detection_failures,
            "looking_away_incidents": self.looking_away_incidents,
            "head_movement_incidents": self.head_movement_incidents,
            "suspicion_score": suspicion_score,
            "recommendation": self.get_recommendation(),
            "events": self.events[-20:],  # Last 20 events
            "generated_at": datetime.utcnow().isoformat()
        }

    def reset(self):
        """Reset analyzer for new session"""
        self.events = []
        self.alerts = []
        self.tab_switches = 0
        self.face_detection_failures = 0
        self.looking_away_incidents = 0
        self.head_movement_incidents = 0
        self.suspicious_patterns = []
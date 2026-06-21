"""
Eye Gaze Detection Module
Monitors student's eye direction to detect looking away from screen
Uses MediaPipe Face Mesh for eye tracking
"""

import cv2
import numpy as np
from typing import Dict, Tuple, Optional, List
from datetime import datetime
import logging

try:
    import mediapipe as mp
except ImportError:
    logging.warning("MediaPipe not installed. Install with: pip install mediapipe")

logger = logging.getLogger(__name__)

# Eye landmarks indices in MediaPipe Face Mesh
RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 390, 373, 374, 380, 381, 382]
LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 155, 154, 153, 145, 144]
RIGHT_IRIS = [474, 475, 476, 477]
LEFT_IRIS = [469, 470, 471, 472]


class EyeGazeDetector:
    """
    Eye gaze detection for monitoring student attention
    Determines if student is looking at screen or away
    """

    def __init__(self, threshold: float = 0.7):
        """
        Initialize eye gaze detector
        
        Args:
            threshold: Confidence threshold (0-1) for gaze detection
        """
        self.threshold = threshold
        self.looking_away_count = 0
        self.total_frames = 0
        
        # Initialize MediaPipe Face Mesh
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )

    def get_eye_aspect_ratio(self, eye_landmarks: List[Tuple]) -> float:
        """
        Calculate eye aspect ratio (EAR)
        Used to detect eye closure/blink
        
        EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
        """
        if len(eye_landmarks) < 6:
            return 0.0
        
        # Euclidean distance
        def distance(pt1, pt2):
            return np.sqrt((pt1[0] - pt2[0])**2 + (pt1[1] - pt2[1])**2)
        
        # Calculate distances
        a = distance(eye_landmarks[1], eye_landmarks[5])
        b = distance(eye_landmarks[2], eye_landmarks[4])
        c = distance(eye_landmarks[0], eye_landmarks[3])
        
        # Calculate eye aspect ratio
        ear = (a + b) / (2.0 * c) if c > 0 else 0
        return ear

    def get_iris_center(self, iris_landmarks: List[Tuple]) -> Tuple[float, float]:
        """
        Calculate iris center position
        
        Args:
            iris_landmarks: 4 iris landmarks
            
        Returns:
            (x, y) center of iris
        """
        if len(iris_landmarks) < 4:
            return (0, 0)
        
        x_coords = [pt[0] for pt in iris_landmarks]
        y_coords = [pt[1] for pt in iris_landmarks]
        
        return (
            sum(x_coords) / len(x_coords),
            sum(y_coords) / len(y_coords)
        )

    def detect_gaze(self, frame: np.ndarray) -> Dict:
        """
        Detect eye gaze direction in frame
        
        Args:
            frame: Video frame (BGR format)
            
        Returns:
            Dict with gaze detection results:
                - looking_at_screen: bool
                - confidence: float (0-1)
                - gaze_direction: str (center, left, right, up, down)
                - eye_aspect_ratio: float (for blink detection)
                - eye_closure_warning: bool (eyes closed?)
        """
        result = {
            "looking_at_screen": False,
            "confidence": 0.0,
            "gaze_direction": "unknown",
            "eye_aspect_ratio": 0.0,
            "eye_closure_warning": False,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        self.total_frames += 1
        
        try:
            # Convert BGR to RGB
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            h, w, _ = frame.shape
            
            # Process frame
            results = self.face_mesh.process(rgb_frame)
            
            if not results.multi_face_landmarks:
                logger.debug("No face detected for gaze analysis")
                return result
            
            landmarks = results.multi_face_landmarks[0].landmark
            
            # Extract eye landmarks
            right_eye_pts = [
                (int(landmarks[idx].x * w), int(landmarks[idx].y * h))
                for idx in RIGHT_EYE[:6]
            ]
            left_eye_pts = [
                (int(landmarks[idx].x * w), int(landmarks[idx].y * h))
                for idx in LEFT_EYE[:6]
            ]
            
            # Extract iris landmarks
            right_iris_pts = [
                (int(landmarks[idx].x * w), int(landmarks[idx].y * h))
                for idx in RIGHT_IRIS
            ]
            left_iris_pts = [
                (int(landmarks[idx].x * w), int(landmarks[idx].y * h))
                for idx in LEFT_IRIS
            ]
            
            # Calculate eye aspect ratios (EAR)
            right_ear = self.get_eye_aspect_ratio(right_eye_pts)
            left_ear = self.get_eye_aspect_ratio(left_eye_pts)
            avg_ear = (right_ear + left_ear) / 2.0
            
            # Check for eye closure (EAR < 0.2 typically indicates closed eyes)
            if avg_ear < 0.2:
                result["eye_closure_warning"] = True
                logger.warning(f"Eye closure detected: EAR={avg_ear:.2f}")
            
            result["eye_aspect_ratio"] = float(avg_ear)
            
            # Get iris centers
            right_iris_center = self.get_iris_center(right_iris_pts)
            left_iris_center = self.get_iris_center(left_iris_pts)
            
            # Get eye centers
            right_eye_center = (
                np.mean([pt[0] for pt in right_eye_pts]),
                np.mean([pt[1] for pt in right_eye_pts])
            )
            left_eye_center = (
                np.mean([pt[0] for pt in left_eye_pts]),
                np.mean([pt[1] for pt in left_eye_pts])
            )
            
            # Calculate iris position relative to eye (horizontal & vertical)
            right_gaze_ratio_x = (right_iris_center[0] - right_eye_center[0]) / (
                max(pt[0] for pt in right_eye_pts) - min(pt[0] for pt in right_eye_pts) + 1e-6
            )
            left_gaze_ratio_x = (left_iris_center[0] - left_eye_center[0]) / (
                max(pt[0] for pt in left_eye_pts) - min(pt[0] for pt in left_eye_pts) + 1e-6
            )
            
            # Determine gaze direction
            gaze_x = (right_gaze_ratio_x + left_gaze_ratio_x) / 2.0
            
            # Threshold for gaze detection
            if -0.2 < gaze_x < 0.2:
                result["gaze_direction"] = "center"
                result["looking_at_screen"] = True
                result["confidence"] = 0.9
            elif gaze_x <= -0.2:
                result["gaze_direction"] = "left"
                result["looking_at_screen"] = False
                result["confidence"] = 0.8
                self.looking_away_count += 1
            elif gaze_x >= 0.2:
                result["gaze_direction"] = "right"
                result["looking_at_screen"] = False
                result["confidence"] = 0.8
                self.looking_away_count += 1
            
            logger.debug(f"Gaze: {result['gaze_direction']}, confidence: {result['confidence']:.2f}")
            
            return result
            
        except Exception as e:
            logger.error(f"Gaze detection error: {str(e)}")
            return result

    def get_attention_score(self) -> float:
        """
        Calculate attention score based on looking away frequency
        
        Returns:
            float: Attention score (0-100, higher = better)
        """
        if self.total_frames == 0:
            return 100.0
        
        looking_away_ratio = self.looking_away_count / self.total_frames
        attention_score = max(0, 100 - (looking_away_ratio * 100))
        
        return attention_score

    def reset(self):
        """Reset counters"""
        self.looking_away_count = 0
        self.total_frames = 0

    def release(self):
        """Release resources"""
        if hasattr(self, 'face_mesh'):
            self.face_mesh.close()
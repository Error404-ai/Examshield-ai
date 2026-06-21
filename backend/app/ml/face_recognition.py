"""
Face Recognition Module
Real-time face detection and student identity verification
Uses DeepFace for face recognition and MediaPipe for face detection
"""

import cv2
import numpy as np
from typing import Dict, Optional, Tuple, List
from datetime import datetime
import logging

try:
    from deepface import DeepFace
    import mediapipe as mp
except ImportError:
    logging.warning("DeepFace or MediaPipe not installed. Install with: pip install deepface mediapipe")

logger = logging.getLogger(__name__)


class FaceRecognitionEngine:
    """
    Face recognition and verification engine for proctoring
    Verifies that the same person remains on camera throughout exam
    """

    def __init__(self, threshold: float = 0.6):
        """
        Initialize face recognition engine
        
        Args:
            threshold: Cosine similarity threshold for face matching (0-1)
                      Higher = stricter matching
        """
        self.threshold = threshold
        self.reference_embedding = None
        self.reference_image = None
        self.student_id = None
        
        # Initialize MediaPipe Face Detection
        self.mp_face_detection = mp.solutions.face_detection
        self.face_detection = self.mp_face_detection.FaceDetection(
            model_selection=1,  # 1 for front camera
            min_detection_confidence=0.7
        )
        self.mp_drawing = mp.solutions.drawing_utils
        
    def register_student(self, image_path: str, student_id: str) -> bool:
        """
        Register student face for verification during exam
        
        Args:
            image_path: Path to student's reference face image
            student_id: Student identification
            
        Returns:
            bool: Success status
        """
        try:
            image = cv2.imread(image_path)
            if image is None:
                logger.error(f"Failed to load image: {image_path}")
                return False
            
            # Get face embedding
            embedding = DeepFace.represent(
                img_path=image_path,
                model_name="Facenet512",
                enforce_detection=True
            )
            
            if not embedding or len(embedding) == 0:
                logger.error("No face detected in registration image")
                return False
            
            self.reference_embedding = np.array(embedding[0]["embedding"])
            self.reference_image = image
            self.student_id = student_id
            
            logger.info(f"✅ Student {student_id} registered successfully")
            return True
            
        except Exception as e:
            logger.error(f"Face registration error: {str(e)}")
            return False

    def verify_student(self, frame: np.ndarray) -> Dict:
        """
        Verify if current frame shows the registered student
        
        Args:
            frame: Video frame (numpy array)
            
        Returns:
            Dict with verification results:
                - verified: bool (matches registered student)
                - confidence: float (0-1, higher = better match)
                - face_count: int (number of faces detected)
                - position: dict (face bounding box)
        """
        result = {
            "verified": False,
            "confidence": 0.0,
            "face_count": 0,
            "position": None,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        if self.reference_embedding is None:
            logger.warning("Student not registered. Call register_student first.")
            return result
        
        try:
            # Detect faces in current frame
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.face_detection.process(rgb_frame)
            
            if not results.detections:
                logger.debug("No face detected in frame")
                return result
            
            faces = results.detections
            result["face_count"] = len(faces)
            
            # If multiple faces detected, it's suspicious
            if len(faces) > 1:
                logger.warning(f"Multiple faces detected: {len(faces)}")
                return result
            
            # Get largest face (closest to camera)
            detection = faces[0]
            bbox = detection.location_data.relative_bounding_box
            
            # Convert frame for DeepFace
            h, w, _ = frame.shape
            x = int(bbox.xmin * w)
            y = int(bbox.ymin * h)
            width = int(bbox.width * w)
            height = int(bbox.height * h)
            
            # Ensure valid coordinates
            x = max(0, x)
            y = max(0, y)
            width = min(width, w - x)
            height = min(height, h - y)
            
            face_crop = frame[y:y+height, x:x+width]
            
            if face_crop.size == 0:
                logger.debug("Invalid face crop")
                return result
            
            # Get embedding of current face
            try:
                current_embedding = DeepFace.represent(
                    img_path=face_crop,
                    model_name="Facenet512",
                    enforce_detection=False
                )
                
                if not current_embedding or len(current_embedding) == 0:
                    logger.debug("Could not extract embedding from face crop")
                    return result
                
                current_vector = np.array(current_embedding[0]["embedding"])
                
                # Calculate cosine similarity
                from scipy.spatial.distance import cosine
                similarity = 1 - cosine(self.reference_embedding, current_vector)
                
                result["confidence"] = float(similarity)
                result["verified"] = similarity >= self.threshold
                result["position"] = {
                    "x": x,
                    "y": y,
                    "width": width,
                    "height": height
                }
                
                logger.debug(f"Face verification: similarity={similarity:.3f}, verified={result['verified']}")
                
            except Exception as e:
                logger.error(f"Embedding extraction error: {str(e)}")
            
            return result
            
        except Exception as e:
            logger.error(f"Face verification error: {str(e)}")
            return result

    def detect_face_in_image(self, image_path: str) -> Optional[Dict]:
        """
        Detect if face exists in image
        
        Args:
            image_path: Path to image file
            
        Returns:
            Dict with detection info or None
        """
        try:
            image = cv2.imread(image_path)
            if image is None:
                return None
            
            rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            results = self.face_detection.process(rgb_image)
            
            if results.detections:
                detection = results.detections[0]
                bbox = detection.location_data.relative_bounding_box
                
                h, w, _ = image.shape
                return {
                    "detected": True,
                    "confidence": float(detection.score[0]) if detection.score else 0.0,
                    "bounding_box": {
                        "x": int(bbox.xmin * w),
                        "y": int(bbox.ymin * h),
                        "width": int(bbox.width * w),
                        "height": int(bbox.height * h)
                    }
                }
            
            return {"detected": False}
            
        except Exception as e:
            logger.error(f"Face detection error: {str(e)}")
            return None

    def release(self):
        """Release resources"""
        if hasattr(self, 'face_detection'):
            self.face_detection.close()
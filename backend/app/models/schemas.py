"""
Pydantic Models/Schemas
Request and response data validation
"""

from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ============ Enums ============

class UserRole(str, Enum):
    """User roles"""
    STUDENT = "student"
    ADMIN = "admin"


class QuestionType(str, Enum):
    """Question types"""
    MCQ = "mcq"
    SHORT_ANSWER = "short_answer"
    ESSAY = "essay"
    TRUE_FALSE = "true_false"


class SessionStatus(str, Enum):
    """Exam session status"""
    ONGOING = "ongoing"
    SUBMITTED = "submitted"
    EXPIRED = "expired"
    PROCTORING_FAILED = "proctoring_failed"


class AlertSeverity(str, Enum):
    """Alert severity levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# ============ User Schemas ============

class UserBase(BaseModel):
    """Base user schema"""
    email: EmailStr
    name: str = Field(..., min_length=2, max_length=100)
    role: UserRole = UserRole.STUDENT


class UserCreate(UserBase):
    """User creation schema"""
    password: str = Field(..., min_length=6)
    confirm_password: str

    @validator("confirm_password")
    def passwords_match(cls, v, values):
        if "password" in values and v != values["password"]:
            raise ValueError("Passwords do not match")
        return v


class UserResponse(UserBase):
    """User response schema"""
    id: str = Field(alias="_id")
    created_at: datetime

    class Config:
        populate_by_name = True


# ============ Auth Schemas ============

class LoginRequest(BaseModel):
    """Login request schema"""
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """Token response schema"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    """Refresh token request"""
    refresh_token: str


# ============ Exam Schemas ============

class ExamCreate(BaseModel):
    """Create exam schema"""
    title: str = Field(..., min_length=5, max_length=200)
    description: str = Field(..., min_length=10)
    duration: int = Field(..., gt=0, le=300)  # Max 5 hours
    total_marks: int = Field(..., gt=0)
    passing_marks: int = Field(..., ge=0)
    
    @validator("passing_marks")
    def passing_marks_valid(cls, v, values):
        if "total_marks" in values and v > values["total_marks"]:
            raise ValueError("Passing marks cannot exceed total marks")
        return v


class ExamUpdate(BaseModel):
    """Update exam schema"""
    title: Optional[str] = Field(None, min_length=5)
    description: Optional[str] = None
    duration: Optional[int] = Field(None, gt=0)
    total_marks: Optional[int] = Field(None, gt=0)
    passing_marks: Optional[int] = Field(None, ge=0)
    is_published: Optional[bool] = None


class ExamResponse(ExamCreate):
    """Exam response schema"""
    id: str = Field(alias="_id")
    created_by: str
    is_published: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True


# ============ Question Schemas ============

class QuestionCreate(BaseModel):
    """Create question schema"""
    exam_id: str
    question_text: str = Field(..., min_length=5)
    question_type: QuestionType
    options: Optional[List[str]] = None
    correct_answer: str
    marks: int = Field(..., gt=0)

    @validator("options")
    def validate_options(cls, v, values):
        if "question_type" in values:
            question_type = values["question_type"]
            if question_type == QuestionType.MCQ and (not v or len(v) < 2):
                raise ValueError("MCQ must have at least 2 options")
            if question_type == QuestionType.TRUE_FALSE and (not v or len(v) != 2):
                raise ValueError("True/False question must have exactly 2 options")
        return v


class QuestionResponse(QuestionCreate):
    """Question response schema"""
    id: str = Field(alias="_id")
    created_at: datetime

    class Config:
        populate_by_name = True


# ============ Session Schemas ============

class StudentAnswer(BaseModel):
    """Student answer schema"""
    question_id: str
    selected_answer: str


class SessionSubmit(BaseModel):
    """Session submission schema"""
    session_id: str
    answers: List[StudentAnswer]


class SessionResponse(BaseModel):
    """Session response schema"""
    id: str = Field(alias="_id")
    student_id: str
    exam_id: str
    status: SessionStatus
    score: float
    total_marks: int
    percentage: float
    passed: bool
    started_at: datetime
    submitted_at: Optional[datetime] = None

    class Config:
        populate_by_name = True


# ============ Proctoring Schemas ============

class FaceDetectionResult(BaseModel):
    """Face detection result"""
    face_detected: bool
    face_id: Optional[str] = None
    confidence: float
    position: Optional[dict] = None


class GazeDetectionResult(BaseModel):
    """Gaze detection result"""
    looking_at_screen: bool
    gaze_direction: Optional[str] = None
    confidence: float


class BehaviorAlert(BaseModel):
    """Behavior alert schema"""
    session_id: str
    alert_type: str
    severity: AlertSeverity
    description: str
    timestamp: datetime
    metadata: Optional[dict] = None


class ProctoringLog(BaseModel):
    """Proctoring log schema"""
    session_id: str
    frame_data: dict  # Contains face, gaze, environment info
    timestamp: datetime
    flags: List[str] = []  # Warning flags


class ProctoringReport(BaseModel):
    """Proctoring report schema"""
    session_id: str
    total_frames_analyzed: int
    alerts_count: int
    critical_alerts: int
    suspicion_score: float  # 0-100
    recommended_action: str  # approve, review, reject
    detailed_log: List[BehaviorAlert]
"""
Application Configuration
Settings management using Pydantic V2
"""

from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    """Application settings loaded from environment"""

    # API Configuration
    API_TITLE: str = "ExamShield AI"
    API_VERSION: str = "1.0.0"
    API_DESCRIPTION: str = "AI-powered exam proctoring system"
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"
    PORT: int = int(os.getenv("PORT", "8000"))

    # Database
    MONGODB_URI: str = os.getenv(
        "MONGODB_URI",
        "mongodb+srv://user:password@cluster0.mongodb.net/examshield"
    )
    DATABASE_NAME: str = "examshield_db"

    # JWT Configuration
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = 24
    REFRESH_TOKEN_EXPIRATION_DAYS: int = 7

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        os.getenv("FRONTEND_URL", "http://localhost:3000")
    ]
    ALLOWED_HOSTS: List[str] = ["localhost", "127.0.0.1"]

    # ML Model Configuration
    FACE_RECOGNITION_THRESHOLD: float = 0.6
    EYE_GAZE_THRESHOLD: float = 0.7
    CONFIDENCE_THRESHOLD: float = 0.8
    
    # Proctoring Settings
    MAX_HEAD_MOVEMENT: float = 30.0  # degrees
    MAX_EYE_DEVIATION: float = 20.0  # degrees
    FRAME_CAPTURE_INTERVAL: int = 2  # seconds
    ALLOWED_TAB_SWITCHES: int = 2
    
    # File Storage
    MAX_VIDEO_DURATION: int = 300  # 5 minutes max for uploads
    UPLOAD_DIR: str = "uploads/"
    MODEL_DIR: str = "models/"

    # Security
    BCRYPT_ROUNDS: int = 12
    HASHING_ALGORITHM: str = "bcrypt"
    ACCESS_TOKEN_LIFETIME: int = 3600  # 1 hour

    class Config:
        env_file = ".env"
        case_sensitive = True


# Create settings instance
settings = Settings()
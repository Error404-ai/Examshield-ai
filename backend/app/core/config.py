"""
Application Configuration
Settings management using Pydantic V2
"""

try:
    from pydantic_settings import BaseSettings  # preferred (separate package)
except Exception:  # fallback for environments with pydantic exposing BaseSettings
    from pydantic import BaseSettings
from pydantic import ConfigDict
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

    # Frontend
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "https://examshield-ai-chi.vercel.app"]
    ALLOWED_HOSTS: List[str] = ["localhost", "127.0.0.1", "*.hf.space"]
    EXTRA_ALLOWED_HOSTS: str = os.getenv("EXTRA_ALLOWED_HOSTS", "")
    EXTRA_CORS_ORIGINS: str = os.getenv("EXTRA_CORS_ORIGINS", "")

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

    @property
    def all_cors_origins(self) -> List[str]:
        extra = [o.strip().rstrip("/") for o in self.EXTRA_CORS_ORIGINS.split(",") if o.strip()]
        return self.CORS_ORIGINS + [self.FRONTEND_URL.rstrip("/")] + extra

    @property
    def all_allowed_hosts(self) -> List[str]:
        extra = [h.strip() for h in self.EXTRA_ALLOWED_HOSTS.split(",") if h.strip()]
        return self.ALLOWED_HOSTS + extra

    model_config = ConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="allow"  # Allow extra fields from .env
    )


# Create settings instance
settings = Settings()
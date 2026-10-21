"""
Application Configuration
Settings management using Pydantic V2
"""

import logging
import os
from typing import List

try:
    from pydantic_settings import BaseSettings  # preferred (separate package)
except Exception:  # fallback for environments with pydantic exposing BaseSettings
    from pydantic import BaseSettings
from pydantic import ConfigDict

logger = logging.getLogger(__name__)

_PLACEHOLDER_SECRET = "your-secret-key-change-in-production"
_MIN_SECRET_LENGTH = 32


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
    # The placeholder is only tolerated when DEBUG=true (see check_secrets below)
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", _PLACEHOLDER_SECRET)
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = 24
    REFRESH_TOKEN_EXPIRATION_DAYS: int = 7

    # Frontend
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "https://examshield-ai-chi.vercel.app"]
    # *.onrender.com added so Render requests aren't rejected by TrustedHostMiddleware
    ALLOWED_HOSTS: List[str] = ["localhost", "127.0.0.1", "*.hf.space", "*.onrender.com"]
    EXTRA_ALLOWED_HOSTS: str = os.getenv("EXTRA_ALLOWED_HOSTS", "")
    EXTRA_CORS_ORIGINS: str = os.getenv("EXTRA_CORS_ORIGINS", "")

    # Security
    BCRYPT_ROUNDS: int = 12
    HASHING_ALGORITHM: str = "bcrypt"
    ACCESS_TOKEN_LIFETIME: int = 3600  # 1 hour
    RATE_LIMIT_ENABLED: bool = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"

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


def check_secrets(s: Settings) -> None:
    """Refuse to start with a missing, placeholder or short JWT secret (unless DEBUG=true)"""
    key = s.JWT_SECRET_KEY
    weak = key == _PLACEHOLDER_SECRET or len(key) < _MIN_SECRET_LENGTH
    if not weak:
        return
    message = (
        f"JWT_SECRET_KEY is missing, a placeholder, or shorter than {_MIN_SECRET_LENGTH} characters. "
        'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(48))"'
    )
    if s.DEBUG:
        logger.warning(f"{message} (allowed because DEBUG=true)")
    else:
        raise RuntimeError(message)


# Create settings instance
settings = Settings()
check_secrets(settings)
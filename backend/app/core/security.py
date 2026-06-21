"""
Security & Authentication Utilities
JWT tokens, password hashing, and access control
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthCredentials
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer Security
security = HTTPBearer()


class SecurityUtils:
    """Security utilities for JWT and password management"""

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash password using bcrypt"""
        return pwd_context.hash(password)

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify password against hash"""
        return pwd_context.verify(plain_password, hashed_password)

    @staticmethod
    def create_access_token(
        data: Dict[str, Any],
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """Create JWT access token"""
        to_encode = data.copy()
        
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(
                hours=settings.JWT_EXPIRATION_HOURS
            )

        to_encode.update({"exp": expire})
        
        try:
            encoded_jwt = jwt.encode(
                to_encode,
                settings.JWT_SECRET_KEY,
                algorithm=settings.JWT_ALGORITHM
            )
            return encoded_jwt
        except Exception as e:
            logger.error(f"Token creation error: {str(e)}")
            raise

    @staticmethod
    def create_refresh_token(user_id: str) -> str:
        """Create refresh token"""
        expires_delta = timedelta(days=settings.REFRESH_TOKEN_EXPIRATION_DAYS)
        return SecurityUtils.create_access_token(
            data={"sub": user_id, "type": "refresh"},
            expires_delta=expires_delta
        )

    @staticmethod
    def verify_token(token: str) -> Optional[Dict[str, Any]]:
        """Verify JWT token and return payload"""
        try:
            payload = jwt.decode(
                token,
                settings.JWT_SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM]
            )
            return payload
        except JWTError as e:
            logger.error(f"Token verification error: {str(e)}")
            return None

    @staticmethod
    async def get_current_user(credentials: HTTPAuthCredentials = Depends(security)) -> Dict[str, Any]:
        """Dependency to get current authenticated user"""
        token = credentials.credentials
        
        payload = SecurityUtils.verify_token(token)
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token does not contain user ID"
            )

        return {"user_id": user_id, "payload": payload}

    @staticmethod
    def verify_role(required_roles: list):
        """Dependency to verify user role"""
        async def role_checker(current_user: Dict = Depends(SecurityUtils.get_current_user)):
            user_role = current_user.get("payload", {}).get("role")
            if user_role not in required_roles:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Insufficient permissions. Required role: {', '.join(required_roles)}"
                )
            return current_user
        return role_checker
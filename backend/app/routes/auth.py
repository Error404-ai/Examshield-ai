"""
ExamShield AI - Authentication Routes
User registration, login, and token management
"""

from fastapi import APIRouter, HTTPException, Depends, status
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.database import get_db
from app.models.schemas import UserCreate, LoginRequest, TokenResponse, UserResponse
import logging
import os

logger = logging.getLogger(__name__)
router = APIRouter()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT config
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# ─── Register ────────────────────────────────────────────────────────────────

@router.post("/register", response_model=dict)
async def register(user_data: UserCreate, db=Depends(get_db)):
    """Register a new user"""
    try:
        users_col = db["users"]

        # Check duplicate email
        existing = await users_col.find_one({"email": user_data.email})
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User already exists with this email"
            )

        # Build user document
        user_doc = {
            "name": user_data.name,
            "email": user_data.email,
            "password_hash": hash_password(user_data.password),
            "role": user_data.role.value,
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }

        result = await users_col.insert_one(user_doc)

        return {
            "success": True,
            "message": "User registered successfully",
            "user_id": str(result.inserted_id)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed"
        )


# ─── Login ───────────────────────────────────────────────────────────────────

@router.post("/login", response_model=dict)
async def login(credentials: LoginRequest, db=Depends(get_db)):
    """Login and get access token"""
    try:
        users_col = db["users"]

        user = await users_col.find_one({"email": credentials.email})

        if not user or not verify_password(credentials.password, user["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        token = create_access_token({
            "sub": str(user["_id"]),
            "email": user["email"],
            "role": user["role"]
        })

        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": str(user["_id"]),
                "name": user["name"],
                "email": user["email"],
                "role": user["role"]
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed"
        )


# ─── Get Current User ────────────────────────────────────────────────────────

@router.get("/me", response_model=dict)
async def get_current_user(db=Depends(get_db)):
    """Get current authenticated user — JWT verification placeholder"""
    # TODO: Extract user from JWT in Authorization header
    return {"message": "Implement JWT middleware next"}


# ─── Logout ──────────────────────────────────────────────────────────────────

@router.post("/logout")
async def logout():
    return {"success": True, "message": "Logged out successfully"}


# ─── Refresh Token ───────────────────────────────────────────────────────────

@router.post("/refresh-token")
async def refresh_token():
    return {"message": "Refresh token endpoint — implement if needed"}
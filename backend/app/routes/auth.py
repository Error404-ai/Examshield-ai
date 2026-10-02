"""
ExamShield AI - Authentication Routes
User registration, login, and token management
"""

from datetime import datetime, timezone
import logging
import os

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Depends, status

from app.core.database import get_db
from app.core.security import SecurityUtils, get_current_user
from app.models.schemas import UserCreate, LoginRequest

logger = logging.getLogger(__name__)
router = APIRouter()

ADMIN_EMAILS = {e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()}


# ─── Register ────────────────────────────────────────────────────────────────

@router.post("/register", response_model=dict)
async def register(user_data: UserCreate, db=Depends(get_db)):
    """Register a new user and log them in straight away"""
    try:
        users_col = db["users"]
        email = user_data.email.strip().lower()

        # Check duplicate email
        existing = await users_col.find_one({"email": email})
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User already exists with this email"
            )

        # Role is decided by the server only (ADMIN_EMAILS env var), never by the client
        role = "admin" if email in ADMIN_EMAILS else "student"

        now = datetime.now(timezone.utc)
        user_doc = {
            "name": user_data.name,
            "email": email,
            "password_hash": SecurityUtils.hash_password(user_data.password),
            "role": role,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }

        result = await users_col.insert_one(user_doc)
        user_id = str(result.inserted_id)

        token = SecurityUtils.create_access_token({
            "sub": user_id,
            "email": email,
            "role": role,
        })

        return {
            "success": True,
            "message": "User registered successfully",
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user_id,
                "name": user_data.name,
                "email": email,
                "role": role,
            },
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
        email = credentials.email.strip().lower()

        user = await users_col.find_one({"email": email})

        if not user or not SecurityUtils.verify_password(
            credentials.password, user["password_hash"]
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        if not user.get("is_active", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled"
            )

        token = SecurityUtils.create_access_token({
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
async def read_current_user(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    """Return the authenticated user's profile"""
    try:
        user = await db["users"].find_one({"_id": ObjectId(current_user["user_id"])})
    except InvalidId:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token"
        )

    if not user or not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return {
        "id": str(user["_id"]),
        "name": user.get("name"),
        "email": user.get("email"),
        "role": user.get("role"),
    }


# ─── Logout ──────────────────────────────────────────────────────────────────

@router.post("/logout")
async def logout():
    return {"success": True, "message": "Logged out successfully"}


# ─── Refresh Token ───────────────────────────────────────────────────────────

@router.post("/refresh-token")
async def refresh_token():
    return {"message": "Refresh token endpoint — implement if needed"}
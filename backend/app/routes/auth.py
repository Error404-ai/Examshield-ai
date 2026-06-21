"""
Authentication Routes
User registration, login, and token management
"""

from fastapi import APIRouter, HTTPException, status, Depends
from motor.motor_asyncio import AsyncDatabase
from bson import ObjectId
from typing import Dict

from app.schemas import UserCreate, LoginRequest, TokenResponse, UserResponse
from app.core.security import SecurityUtils
from app.core.database import get_db

router = APIRouter()


@router.post("/register", response_model=Dict)
async def register(
    user_data: UserCreate,
    db: AsyncDatabase = Depends(get_db)
):
    """
    Register a new user
    
    Args:
        user_data: User registration data
        
    Returns:
        Token and user info
    """
    try:
        # Check if user exists
        existing_user = await db.users.find_one({"email": user_data.email})
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered"
            )
        
        # Create user document
        user_doc = {
            "email": user_data.email,
            "name": user_data.name,
            "password": SecurityUtils.hash_password(user_data.password),
            "role": user_data.role.value,
            "created_at": datetime.utcnow()
        }
        
        # Insert user
        result = await db.users.insert_one(user_doc)
        user_id = str(result.inserted_id)
        
        # Create tokens
        access_token = SecurityUtils.create_access_token(
            data={"sub": user_id, "email": user_data.email, "role": user_data.role.value}
        )
        refresh_token = SecurityUtils.create_refresh_token(user_id)
        
        return {
            "success": True,
            "message": "Registration successful",
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": {
                "id": user_id,
                "email": user_data.email,
                "name": user_data.name,
                "role": user_data.role.value
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )


@router.post("/login", response_model=Dict)
async def login(
    credentials: LoginRequest,
    db: AsyncDatabase = Depends(get_db)
):
    """
    Login user
    
    Args:
        credentials: Email and password
        
    Returns:
        Access token and user info
    """
    try:
        # Find user
        user = await db.users.find_one({"email": credentials.email})
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        # Verify password
        if not SecurityUtils.verify_password(credentials.password, user["password"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        # Create tokens
        user_id = str(user["_id"])
        access_token = SecurityUtils.create_access_token(
            data={"sub": user_id, "email": user["email"], "role": user["role"]}
        )
        refresh_token = SecurityUtils.create_refresh_token(user_id)
        
        return {
            "success": True,
            "message": "Login successful",
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": {
                "id": user_id,
                "email": user["email"],
                "name": user["name"],
                "role": user["role"]
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed"
        )


@router.get("/me", response_model=Dict)
async def get_current_user(
    current_user: Dict = Depends(SecurityUtils.get_current_user),
    db: AsyncDatabase = Depends(get_db)
):
    """
    Get current authenticated user
    
    Returns:
        Current user info
    """
    try:
        user_id = current_user.get("user_id")
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        return {
            "success": True,
            "user": {
                "id": str(user["_id"]),
                "email": user["email"],
                "name": user["name"],
                "role": user["role"]
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch user"
        )


@router.post("/refresh", response_model=Dict)
async def refresh_token(
    refresh_token: str
):
    """
    Refresh access token using refresh token
    
    Args:
        refresh_token: Refresh token
        
    Returns:
        New access token
    """
    try:
        payload = SecurityUtils.verify_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        user_id = payload.get("sub")
        access_token = SecurityUtils.create_access_token(
            data={"sub": user_id, "type": "access"}
        )
        
        return {
            "success": True,
            "access_token": access_token,
            "token_type": "bearer"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token refresh failed"
        )


@router.post("/logout", response_model=Dict)
async def logout(
    current_user: Dict = Depends(SecurityUtils.get_current_user)
):
    """
    Logout user
    Note: JWT is stateless, actual logout is client-side token deletion
    
    Returns:
        Confirmation
    """
    return {
        "success": True,
        "message": "Logged out successfully"
    }


from datetime import datetime
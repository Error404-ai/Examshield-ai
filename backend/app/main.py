"""
ExamShield AI - FastAPI Backend
Real-time exam proctoring with AI-powered cheating detection
"""

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from contextlib import asynccontextmanager
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import routes
from app.routes import auth, student, admin, proctoring
from app.core.config import settings
from app.core.database import connect_db, close_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    logger.info("🚀 Starting ExamShield AI...")
    await connect_db()
    yield
    logger.info("🛑 Shutting down...")
    await close_db()


# Initialize FastAPI app
app = FastAPI(
    title="ExamShield AI",
    description="AI-powered exam proctoring and management system",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Trusted Host Middleware
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.ALLOWED_HOSTS
)


# Health Check Endpoint
@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "ExamShield AI",
        "version": "1.0.0"
    }


# Include Routes
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(student.router, prefix="/api/student", tags=["Student"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(proctoring.router, prefix="/api/proctoring", tags=["Proctoring"])


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to ExamShield AI",
        "docs": "/docs"
    }


# Error Handlers
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {str(exc)}")
    return {
        "success": False,
        "message": "Internal server error",
        "detail": str(exc) if settings.DEBUG else None
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.DEBUG
    )
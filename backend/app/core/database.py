"""
Database Connection Management
MongoDB Atlas connection with async support
"""

from motor.motor_asyncio import AsyncClient, AsyncDatabase
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

# Global database instance
db: AsyncDatabase = None
client: AsyncClient = None


async def connect_db():
    """Connect to MongoDB Atlas"""
    global db, client
    try:
        client = AsyncClient(settings.MONGODB_URI)
        # Verify connection
        await client.admin.command("ping")
        db = client[settings.DATABASE_NAME]
        logger.info("✅ Connected to MongoDB successfully")
        
        # Create indexes
        await create_indexes()
    except Exception as e:
        logger.error(f"❌ MongoDB connection error: {str(e)}")
        raise


async def close_db():
    """Close MongoDB connection"""
    global client
    if client:
        client.close()
        logger.info("🛑 MongoDB connection closed")


async def create_indexes():
    """Create database indexes for optimization"""
    try:
        # User indexes
        await db.users.create_index("email", unique=True)
        await db.users.create_index("createdAt")
        
        # Exam indexes
        await db.exams.create_index("createdBy")
        await db.exams.create_index([("isPublished", 1), ("createdAt", -1)])
        
        # Question indexes
        await db.questions.create_index("examId")
        
        # Session indexes
        await db.sessions.create_index([("studentId", 1), ("examId", 1)])
        await db.sessions.create_index("examId")
        
        # Proctoring indexes
        await db.proctoring_logs.create_index([("sessionId", 1), ("timestamp", -1)])
        await db.alerts.create_index([("sessionId", 1), ("severity", 1)])
        
        logger.info("✅ Database indexes created")
    except Exception as e:
        logger.error(f"Index creation error: {str(e)}")


def get_db() -> AsyncDatabase:
    """Dependency to get database instance"""
    if db is None:
        raise RuntimeError("Database not connected")
    return db
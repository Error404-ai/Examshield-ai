"""
Database Connection Management
MongoDB Atlas connection with async support
"""

import logging

import certifi
from app.core.config import settings
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import ServerSelectionTimeoutError

logger = logging.getLogger(__name__)

# Global database instance
db: AsyncIOMotorDatabase = None
client: AsyncIOMotorClient = None


async def connect_db():
    """Connect to MongoDB Atlas with proper TLS configuration"""
    global db, client
    try:
        # Use certifi's CA bundle for Atlas TLS verification on Windows.
        client = AsyncIOMotorClient(
            settings.MONGODB_URI,
            tls=True,
            tlsCAFile=certifi.where(),
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=10000,
            socketTimeoutMS=None,
            retryWrites=True,
        )

        # Verify connection
        await client.admin.command("ping")
        db = client[settings.DATABASE_NAME]
        logger.info("Connected to MongoDB successfully")

        # Create indexes
        await create_indexes()
    except ServerSelectionTimeoutError as e:
        error_message = str(e)
        if "TLSV1_ALERT_INTERNAL_ERROR" in error_message or "SSL handshake failed" in error_message:
            logger.error(
                "MongoDB Atlas TLS handshake failed. Check Atlas Network Access and "
                "make sure your current public IP is allowed for this cluster. For local "
                "development, Atlas can temporarily allow 0.0.0.0/0, but use a narrower "
                "IP allowlist outside development."
            )
        logger.error(f"MongoDB connection error: {error_message}")
        raise
    except Exception as e:
        logger.error(f"MongoDB connection error: {str(e)}")
        raise


async def close_db():
    """Close MongoDB connection"""
    global client
    if client:
        client.close()
        logger.info("MongoDB connection closed")


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

        logger.info("Database indexes created")
    except Exception as e:
        logger.error(f"Index creation error: {str(e)}")


def get_db() -> AsyncIOMotorDatabase:
    """Dependency to get database instance"""
    if db is None:
        raise RuntimeError("Database not connected")
    return db

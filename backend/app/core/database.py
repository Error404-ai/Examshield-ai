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
    """Create indexes. Field names match the documents (snake_case)."""
    try:
        # Users
        await db.users.create_index("email", unique=True)

        # Exams
        await db.exams.create_index("created_by")
        await db.exams.create_index([("is_published", 1), ("created_at", -1)])

        # Questions
        await db.questions.create_index("exam_id")

        # Sessions (proctoring events live inside the session document)
        await db.sessions.create_index([("student_id", 1), ("exam_id", 1), ("status", 1)])
        await db.sessions.create_index("exam_id")

        duplicate_ongoing_sessions = await db.sessions.aggregate([
            {
                "$match": {
                    "status": "ongoing",
                    "student_id": {"$exists": True, "$ne": None},
                    "exam_id": {"$exists": True, "$ne": None},
                }
            },
            {
                "$group": {
                    "_id": {"student_id": "$student_id", "exam_id": "$exam_id"},
                    "count": {"$sum": 1},
                }
            },
            {"$match": {"count": {"$gt": 1}}},
            {"$limit": 10},
        ]).to_list(length=10)
        if duplicate_ongoing_sessions:
            logger.error(
                "Cannot enforce one ongoing session per student and exam; "
                "resolve duplicate sessions before starting the application: %s",
                duplicate_ongoing_sessions,
            )
            raise RuntimeError(
                "Duplicate ongoing exam sessions exist. Resolve them before creating "
                "the unique session index."
            )

        await db.sessions.create_index(
            [("student_id", 1), ("exam_id", 1)],
            unique=True,
            partialFilterExpression={"status": "ongoing"},
            name="uniq_ongoing_session_per_student_exam",
        )

        # Distributed rate-limit counters are removed after their fixed window ends.
        await db.rate_limits.create_index("expires_at", expireAfterSeconds=0)

        logger.info("Database indexes created")
    except Exception:
        logger.exception("Index creation error")
        raise


def get_db() -> AsyncIOMotorDatabase:
    """Dependency to get database instance"""
    if db is None:
        raise RuntimeError("Database not connected")
    return db
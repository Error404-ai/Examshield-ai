"""MongoDB-backed fixed-window rate limits shared by backend instances."""

from datetime import datetime, timezone
from math import ceil

from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError


async def check_distributed_rate_limit(
    db,
    key: str,
    limit: int,
    window_seconds: int,
    now: datetime | None = None,
) -> None:
    if limit < 1 or window_seconds < 1:
        raise ValueError("Rate limit and window must be positive")

    current = now or datetime.now(timezone.utc)
    window = int(current.timestamp()) // window_seconds
    window_end = datetime.fromtimestamp((window + 1) * window_seconds, timezone.utc)
    document_id = f"{key}:{window}"
    collection = db.rate_limits

    try:
        record = await collection.find_one_and_update(
            {"_id": document_id},
            {
                "$inc": {"count": 1},
                "$setOnInsert": {"expires_at": window_end},
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        # Another backend instance created this window's counter concurrently.
        record = await collection.find_one_and_update(
            {"_id": document_id},
            {"$inc": {"count": 1}},
            return_document=ReturnDocument.AFTER,
        )

    if record is None:
        raise RuntimeError("Failed to update the shared rate-limit counter")

    if record["count"] > limit:
        retry_after = max(1, ceil((window_end - current).total_seconds()))
        raise HTTPException(
            status_code=429,
            detail="You've reached the hourly limit for AI generation. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

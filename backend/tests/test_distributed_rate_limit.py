"""MongoDB-backed fixed-window rate limit shared by backend instances"""

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.core.distributed_rate_limit import check_distributed_rate_limit


@pytest.mark.asyncio
async def test_limit_is_shared_by_calls_using_the_same_database(db):
    now = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc)

    await check_distributed_rate_limit(db, "ai-generation:admin-1", 2, 3600, now)
    await check_distributed_rate_limit(db, "ai-generation:admin-1", 2, 3600, now)

    with pytest.raises(HTTPException) as error:
        await check_distributed_rate_limit(db, "ai-generation:admin-1", 2, 3600, now)

    assert error.value.status_code == 429
    assert int(error.value.headers["Retry-After"]) > 0


@pytest.mark.asyncio
async def test_rate_limit_isolated_by_key_and_window(db):
    now = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc)

    await check_distributed_rate_limit(db, "ai-generation:admin-1", 1, 3600, now)
    await check_distributed_rate_limit(db, "ai-generation:admin-2", 1, 3600, now)
    await check_distributed_rate_limit(db, "ai-generation:admin-1", 1, 3600, now.replace(hour=13))
"""
Shared helpers: JSON-safe serialization and ObjectId parsing
"""

from datetime import datetime
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException, status


def to_json(value: Any) -> Any:
    """
    Recursively convert Mongo documents into JSON-safe data.
    - ObjectId -> str
    - naive datetimes (Mongo returns UTC) -> ISO string with 'Z' so the
      browser doesn't read them as local time
    """
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat() + "Z" if value.tzinfo is None else value.isoformat()
    if isinstance(value, dict):
        return {k: to_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_json(v) for v in value]
    return value


def parse_object_id(value: str, label: str = "ID") -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid {label}")
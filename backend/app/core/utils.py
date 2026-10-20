"""Small helpers shared by route modules"""

from datetime import datetime
from typing import Any, Dict, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException


def oid(value: str) -> ObjectId:
    """Parse an ObjectId or raise a clean 400"""
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="Invalid ID")


def clean(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Make a Mongo document JSON-safe (ObjectId -> str, datetime -> ISO with Z)"""
    out = dict(doc)
    for key, value in out.items():
        if isinstance(value, ObjectId):
            out[key] = str(value)
        elif isinstance(value, datetime):
            out[key] = value.isoformat() + "Z"  # stored as naive UTC
    return out


def appeal_out(appeal: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """JSON-safe appeal sub-document (clean() does not reach nested datetimes)"""
    if not appeal:
        return None
    out = dict(appeal)
    out.pop("resolved_by", None)  # internal admin id, not for the client
    for key in ("created_at", "resolved_at"):
        value = out.get(key)
        out[key] = value.isoformat() + "Z" if isinstance(value, datetime) else None
    return out
"""
SwiftDrop :: Notification Schemas (Pydantic v2)
DTOs for the notifications relation introduced in Improvement 5.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: UUID
    user_id: UUID
    event_type: str
    payload: dict[str, Any]
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}

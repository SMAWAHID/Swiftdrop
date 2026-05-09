"""
SwiftDrop :: Review Schemas (Pydantic v2)
DTOs for the shipment_reviews relation introduced in Improvement 2.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ReviewCreateRequest(BaseModel):
    """Payload for POST /api/shipments/{id}/review (Vendor only)."""
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=1000)


class ReviewResponse(BaseModel):
    id: UUID
    shipment_id: UUID
    vendor_id: UUID
    driver_id: UUID
    rating: int
    comment: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

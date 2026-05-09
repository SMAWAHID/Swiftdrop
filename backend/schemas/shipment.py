"""
SwiftDrop :: Shipment Schemas (Pydantic v2)
Role : Data Transfer Objects (DTOs) — I/O contracts for the API.
       Completely decoupled from the DB layer (Low Coupling).
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# ── Request Schemas ────────────────────────────────────────────────────────────

class ShipmentBookRequest(BaseModel):
    """Payload for POST /api/shipments/book (Vendor only)."""

    shipment_type: Literal["STANDARD", "EXPRESS", "FRAGILE"] = "STANDARD"
    pickup_address: str = Field(..., min_length=5, max_length=500)
    delivery_address: str = Field(..., min_length=5, max_length=500)
    package_weight_kg: Decimal = Field(..., gt=0, decimal_places=3)
    package_description: Optional[str] = Field(None, max_length=500)

    @field_validator("shipment_type", mode="before")
    @classmethod
    def normalize_type(cls, v: str) -> str:
        return v.upper().strip()


# ── Response Schemas ────────────────────────────────────────────────────────────

class ShipmentResponse(BaseModel):
    """
    API response for a shipment resource.
    model_config: from_attributes=True allows construction from
    asyncpg.Record objects via ShipmentResponse.model_validate(dict(row)).
    """

    id: UUID
    vendor_id: UUID
    driver_id: Optional[UUID] = None
    shipment_type: str
    status: str
    pickup_address: str
    delivery_address: str
    package_weight_kg: Decimal
    package_description: Optional[str] = None
    estimated_fare: Decimal
    final_fare: Optional[Decimal] = None
    created_at: datetime
    accepted_at: Optional[datetime] = None
    picked_up_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Auth Schemas ────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=6)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str

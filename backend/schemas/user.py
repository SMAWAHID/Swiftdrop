"""
SwiftDrop :: User Schemas (Pydantic v2)
Signup request DTOs for Vendor and Driver self-registration.
"""
from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator


class SignupRequest(BaseModel):
    """Payload for POST /api/auth/signup"""
    full_name:    str = Field(..., min_length=2, max_length=150)
    email:        str = Field(..., min_length=5, max_length=255)
    password:     str = Field(..., min_length=6, max_length=100)
    phone:        str = Field(..., min_length=7, max_length=30)
    role:         Literal["VENDOR", "DRIVER"]   # Admin cannot self-register

    # VENDOR fields
    company_name:    Optional[str] = Field(None, max_length=200)
    company_address: Optional[str] = None
    gst_number:      Optional[str] = Field(None, max_length=50)

    # DRIVER fields
    vehicle_type:  Optional[str] = Field(None, max_length=80)
    vehicle_plate: Optional[str] = Field(None, max_length=30)
    license_number:Optional[str] = Field(None, max_length=50)

    @field_validator("email", mode="before")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return v.lower().strip()

    @field_validator("role", mode="before")
    @classmethod
    def normalise_role(cls, v: str) -> str:
        return v.upper().strip()

    def validate_role_fields(self) -> None:
        """Called in the service layer after construction."""
        if self.role == "VENDOR":
            if not self.company_name or not self.company_address:
                raise ValueError(
                    "company_name and company_address are required for VENDOR signup"
                )
        if self.role == "DRIVER":
            if not self.vehicle_type or not self.vehicle_plate or not self.license_number:
                raise ValueError(
                    "vehicle_type, vehicle_plate, and license_number are required for DRIVER signup"
                )


class SignupResponse(BaseModel):
    message:    str
    user_id:    str
    role:       str
    email:      str

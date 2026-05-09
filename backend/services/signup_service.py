"""
SwiftDrop :: Signup Service
============================
Creates a user + their role-specific profile (vendor or driver)
inside a single ACID transaction. If either INSERT fails the
entire registration is rolled back — no orphan user rows.

ACID Atomicity: both INSERTs succeed together or neither does.
High Cohesion : one responsibility — user self-registration.

Conflict handling
-----------------
asyncpg raises UniqueViolationError when a UNIQUE constraint is
violated. We translate the constraint name into a friendly message
so the frontend can show "this plate is already registered" instead
of a generic 500.
"""
from __future__ import annotations

import asyncpg
from fastapi import HTTPException, status

from core.security import hash_password
from db.connection import get_pool
from schemas.user import SignupRequest, SignupResponse


# Map asyncpg unique-constraint names to user-friendly messages.
# When PostgreSQL raises a duplicate-key error it puts the constraint
# name in the exception's `constraint_name` attribute.
_CONFLICT_MESSAGES: dict[str, str] = {
    "users_email_key":            "An account with this email already exists. Please log in.",
    "drivers_vehicle_plate_key":  "This vehicle plate is already registered.",
    "drivers_license_number_key": "This license number is already registered.",
    "vendors_gst_number_key":     "This GST number is already registered.",
}


class SignupService:

    async def signup(self, payload: SignupRequest) -> SignupResponse:
        # Validate role-specific required fields
        try:
            payload.validate_role_fields()
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(e),
            )

        pool = await get_pool()
        async with pool.acquire() as conn:
            # Pre-flight email check — clearer error than relying on the
            # constraint to fire mid-transaction.
            existing = await conn.fetchval(
                "SELECT id FROM users WHERE email = $1", payload.email
            )
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=_CONFLICT_MESSAGES["users_email_key"],
                )

            # Single transaction: user + profile
            try:
                async with conn.transaction():
                    user_row = await conn.fetchrow(
                        """
                        INSERT INTO users
                            (email, password_hash, full_name, phone, role)
                        VALUES ($1, $2, $3, $4, $5::user_role)
                        RETURNING id, email, role
                        """,
                        payload.email,
                        hash_password(payload.password),
                        payload.full_name,
                        payload.phone,
                        payload.role,
                    )
                    user_id = user_row["id"]

                    if payload.role == "VENDOR":
                        await conn.execute(
                            """
                            INSERT INTO vendors
                                (user_id, company_name, company_address, gst_number)
                            VALUES ($1, $2, $3, $4)
                            """,
                            user_id,
                            payload.company_name,
                            payload.company_address,
                            payload.gst_number or None,
                        )
                    elif payload.role == "DRIVER":
                        await conn.execute(
                            """
                            INSERT INTO drivers
                                (user_id, vehicle_type, vehicle_plate, license_number)
                            VALUES ($1, $2, $3, $4)
                            """,
                            user_id,
                            payload.vehicle_type,
                            payload.vehicle_plate.upper(),
                            payload.license_number,
                        )
            except asyncpg.UniqueViolationError as e:
                # Map the failing UNIQUE constraint to a friendly message.
                # asyncpg exposes constraint_name on the exception object.
                detail = _CONFLICT_MESSAGES.get(
                    getattr(e, "constraint_name", "") or "",
                    "An account with one of these unique fields already exists.",
                )
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=detail,
                )
            except asyncpg.CheckViolationError as e:
                # e.g. invalid email format on chk_email_format.
                # Map the constraint name to a friendlier message.
                friendly = {
                    "chk_email_format":  "Email address format is invalid.",
                    "chk_rating":        "Rating must be between 1.00 and 5.00.",
                    "chk_total_del":     "Total deliveries must be non-negative.",
                }.get(getattr(e, "constraint_name", "") or "", "Invalid input.")
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=friendly,
                )

        return SignupResponse(
            message="Account created successfully. Welcome to SwiftDrop!",
            user_id=str(user_id),
            role=payload.role,
            email=payload.email,
        )

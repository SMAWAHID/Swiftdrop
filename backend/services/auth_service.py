"""
SwiftDrop :: Auth Service
Handles login credential verification and JWT issuance.
Kept separate from security.py (which handles verification/guards)
to maintain Single Responsibility per module.
"""
from __future__ import annotations

from fastapi import HTTPException, status

from core.security import create_access_token, verify_password
from db.connection import get_pool
from schemas.shipment import LoginRequest, TokenResponse


class AuthService:
    async def login(self, payload: LoginRequest) -> TokenResponse:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, email, password_hash, role, is_active
                FROM   users
                WHERE  email = $1
                """,
                payload.email.lower().strip(),
            )

        # Deliberate: same error for "no user" and "wrong password"
        # prevents user enumeration attacks.
        if not row or not verify_password(payload.password, row["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        if not row["is_active"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is deactivated",
            )

        token = create_access_token(
            subject=str(row["id"]),
            role=row["role"],
        )
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            role=row["role"],
            user_id=str(row["id"]),
        )

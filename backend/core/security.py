"""
SwiftDrop :: Security Layer
- Password hashing  : bcrypt via passlib
- JWT creation/verify: python-jose
- FastAPI dependency: get_current_user, require_role

Security principles applied:
  - Passwords never stored or logged in plaintext
  - JWTs are short-lived (ACCESS_TOKEN_EXPIRE_MINUTES)
  - Role guard raises 403, not 401, after authentication succeeds
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from config import settings
from db.connection import get_pool
from models.user import User

# ── Password hashing ──────────────────────────────────────────────────────────
# bcrypt with 12 rounds is the industry standard (OWASP recommendation).
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(plain: str) -> str:
    """Return bcrypt hash of the plain-text password."""
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time comparison — safe against timing attacks."""
    return pwd_context.verify(plain, hashed)


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(
    subject: str,
    role: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Create a signed JWT.
    'sub' = user UUID string (standard JWT claim).
    'role' = custom claim for role-based access control.
    """
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        "sub": subject,
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    """
    Decode and verify JWT. Raises HTTPException on any failure.
    JWTError covers: expired, invalid signature, malformed.
    """
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── FastAPI Dependencies ──────────────────────────────────────────────────────

async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """
    FastAPI dependency: resolve and return the authenticated User.
    Raises 401 for invalid token, 401 for inactive/missing user.
    """
    payload = decode_token(token)
    user_id_str: Optional[str] = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim",
        )

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, email, full_name, phone, role,
                   is_active, created_at, updated_at
            FROM   users
            WHERE  id = $1
            """,
            UUID(user_id_str),
        )

    if not row or not row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return User.from_record(dict(row))


def require_role(*roles: str):
    """
    Factory for role-guard dependencies.
    Usage: Depends(require_role("DRIVER"))
           Depends(require_role("ADMIN", "VENDOR"))
    Returns the authenticated user if role matches, else 403.
    """
    async def _guard(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Access denied. Required role(s): {', '.join(roles)}. "
                    f"Your role: {current_user.role}"
                ),
            )
        return current_user

    return _guard

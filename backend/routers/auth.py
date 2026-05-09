"""
SwiftDrop :: Auth Router (Controller Layer)
Handles login and self-registration (signup).
Admin accounts are seeded only — cannot be created via signup.
"""
from fastapi import APIRouter, Depends

from schemas.shipment import LoginRequest, TokenResponse
from schemas.user import SignupRequest, SignupResponse
from services.auth_service import AuthService
from services.signup_service import SignupService

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate and receive a JWT",
)
async def login(
    payload: LoginRequest,
    svc: AuthService = Depends(AuthService),
) -> TokenResponse:
    """
    Returns a JWT on success. Token encodes: sub (user UUID), role, exp.
    Include as: Authorization: Bearer <token>
    Works for VENDOR, DRIVER, and ADMIN roles.
    """
    return await svc.login(payload)


@router.post(
    "/signup",
    response_model=SignupResponse,
    status_code=201,
    summary="Register a new Vendor or Driver account",
)
async def signup(
    payload: SignupRequest,
    svc: SignupService = Depends(SignupService),
) -> SignupResponse:
    """
    Self-registration for Vendors and Drivers.
    Admin accounts are pre-seeded and cannot be created here.
    Creates user + role profile in a single ACID transaction.
    """
    return await svc.signup(payload)

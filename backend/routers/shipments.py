"""
SwiftDrop :: Shipments Router (Controller Layer)
================================================
Architectural role: HTTP boundary ONLY.
  - Parses & validates requests via Pydantic schemas
  - Delegates ALL business logic to services / facade
  - Translates domain exceptions → HTTP responses
  - Returns well-formed Pydantic response models

Principle: Controllers must be thin.
           Business logic in controllers = Low Cohesion anti-pattern.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from core.exceptions import (
    DriverProfileNotFoundError,
    ShipmentAlreadyAcceptedError,
    ShipmentNotFoundError,
    VendorProfileNotFoundError,
)
from core.security import get_current_user, require_role
from db.connection import get_pool
from models.user import User
from schemas.shipment import ShipmentBookRequest, ShipmentResponse
from services.accept_service import AcceptShipmentService
from services.shipment_service import ShipmentBookingFacade

router = APIRouter(prefix="/api/shipments", tags=["Shipments"])


# ── POST /api/shipments/book ──────────────────────────────────────────────────

@router.post(
    "/book",
    response_model=ShipmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Vendor books a new shipment",
    description=(
        "Creates a new PENDING shipment. Fare is calculated automatically "
        "based on shipment type and package weight. "
        "Requires VENDOR role JWT."
    ),
)
async def book_shipment(
    payload: ShipmentBookRequest,
    current_user: User = Depends(require_role("VENDOR")),
    facade: ShipmentBookingFacade = Depends(ShipmentBookingFacade),
) -> ShipmentResponse:
    """
    Controller delegates entirely to ShipmentBookingFacade.
    No business logic here — only HTTP ↔ domain translation.

    Pattern: Facade (GoF) hides subsystem complexity from this controller.
    """
    try:
        return await facade.book_shipment(payload, current_user.id)
    except VendorProfileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )


# ── PUT /api/shipments/{shipment_id}/accept ────────────────────────────────────

@router.put(
    "/{shipment_id}/accept",
    response_model=ShipmentResponse,
    summary="Driver accepts a pending shipment (row-locked)",
    description=(
        "Atomically claims a PENDING shipment for the authenticated driver. "
        "Uses SELECT FOR UPDATE NOWAIT to prevent two drivers from "
        "accepting the same shipment concurrently. "
        "Returns 409 Conflict if another driver was faster. "
        "Requires DRIVER role JWT."
    ),
)
async def accept_shipment(
    shipment_id: UUID,
    current_user: User = Depends(require_role("DRIVER")),
    svc: AcceptShipmentService = Depends(AcceptShipmentService),
) -> ShipmentResponse:
    """
    CRITICAL CONCURRENCY ENDPOINT.
    Row-level locking is applied inside AcceptShipmentService.accept().
    This controller only maps domain exceptions to HTTP status codes.
    """
    try:
        return await svc.accept(shipment_id, current_user.id)
    except ShipmentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except (ShipmentAlreadyAcceptedError, DriverProfileNotFoundError) as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )


# ── GET /api/shipments ─────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[ShipmentResponse],
    summary="List shipments (filterable by status)",
    description=(
        "Returns shipments visible to the authenticated user. "
        "Vendors see only their own shipments. "
        "Drivers see PENDING shipments (to accept) or their assigned ones. "
        "Admins see all shipments."
    ),
)
async def list_shipments(
    shipment_status: str | None = Query(
        None, alias="status",
        description="Filter by status: PENDING | ASSIGNED | PICKED_UP | IN_TRANSIT | DELIVERED",
    ),
    page:  int = Query(1,  ge=1,  description="1-based page number"),
    limit: int = Query(20, ge=1, le=100, description="Page size (max 100)"),
    current_user: User = Depends(get_current_user),
) -> list[ShipmentResponse]:
    """
    Pagination: ?page=1&limit=20  → OFFSET (page-1)*limit  LIMIT limit.
    Returning unbounded result sets is never acceptable in production —
    bounded queries protect both the DB and the network round-trip.
    """
    pool = await get_pool()
    offset = (page - 1) * limit

    async with pool.acquire() as conn:
        if current_user.role == "VENDOR":
            rows = await conn.fetch(
                """
                SELECT s.*
                FROM   shipments s
                JOIN   vendors v ON v.id = s.vendor_id
                WHERE  v.user_id = $1
                  AND  ($2::text IS NULL OR s.status::text = $2)
                ORDER  BY s.created_at DESC
                LIMIT  $3 OFFSET $4
                """,
                current_user.id, shipment_status, limit, offset,
            )
        elif current_user.role == "DRIVER":
            rows = await conn.fetch(
                """
                SELECT s.*
                FROM   shipments s
                LEFT JOIN drivers d ON d.id = s.driver_id
                WHERE (
                    s.status = 'PENDING'
                    OR d.user_id = $1
                )
                  AND ($2::text IS NULL OR s.status::text = $2)
                ORDER  BY s.created_at DESC
                LIMIT  $3 OFFSET $4
                """,
                current_user.id, shipment_status, limit, offset,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT *
                FROM   shipments
                WHERE  $1::text IS NULL OR status::text = $1
                ORDER  BY created_at DESC
                LIMIT  $2 OFFSET $3
                """,
                shipment_status, limit, offset,
            )

    return [ShipmentResponse.model_validate(dict(r)) for r in rows]


# ── GET /api/shipments/{shipment_id} ──────────────────────────────────────────

@router.get(
    "/{shipment_id}",
    response_model=ShipmentResponse,
    summary="Get a single shipment by ID",
)
async def get_shipment(
    shipment_id: UUID,
    current_user: User = Depends(get_current_user),
) -> ShipmentResponse:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM shipments WHERE id = $1",
            shipment_id,
        )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shipment {shipment_id} not found",
        )
    return ShipmentResponse.model_validate(dict(row))


# ── PUT /api/shipments/{id}/pickup ────────────────────────────────────────────

@router.put(
    "/{shipment_id}/pickup",
    response_model=ShipmentResponse,
    summary="Driver marks shipment as PICKED_UP",
)
async def pickup_shipment(
    shipment_id: UUID,
    current_user: User = Depends(require_role("DRIVER")),
) -> ShipmentResponse:
    """Transition: ASSIGNED → PICKED_UP. Validates via DB trigger."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SELECT set_config('app.current_user_id', $1, TRUE)",
                str(current_user.id),
            )
            try:
                row = await conn.fetchrow(
                    """
                    UPDATE shipments
                    SET    status = 'PICKED_UP', picked_up_at = NOW()
                    WHERE  id = $1
                    AND    driver_id = (SELECT id FROM drivers WHERE user_id = $2)
                    RETURNING *
                    """,
                    shipment_id, current_user.id,
                )
            except Exception as e:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    if not row:
        raise HTTPException(status_code=404, detail="Shipment not found or not assigned to you")
    return ShipmentResponse.model_validate(dict(row))


# ── PUT /api/shipments/{id}/transit ───────────────────────────────────────────

@router.put(
    "/{shipment_id}/transit",
    response_model=ShipmentResponse,
    summary="Driver marks shipment as IN_TRANSIT",
)
async def transit_shipment(
    shipment_id: UUID,
    current_user: User = Depends(require_role("DRIVER")),
) -> ShipmentResponse:
    """Transition: PICKED_UP → IN_TRANSIT. Validates via DB trigger."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SELECT set_config('app.current_user_id', $1, TRUE)",
                str(current_user.id),
            )
            try:
                row = await conn.fetchrow(
                    """
                    UPDATE shipments
                    SET    status = 'IN_TRANSIT'
                    WHERE  id = $1
                    AND    driver_id = (SELECT id FROM drivers WHERE user_id = $2)
                    RETURNING *
                    """,
                    shipment_id, current_user.id,
                )
            except Exception as e:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    if not row:
        raise HTTPException(status_code=404, detail="Shipment not found or not assigned to you")
    return ShipmentResponse.model_validate(dict(row))


# ── PUT /api/shipments/{id}/complete ──────────────────────────────────────────

@router.put(
    "/{shipment_id}/complete",
    response_model=ShipmentResponse,
    summary="Driver completes delivery via stored procedure (CALL complete_delivery)",
    description=(
        "Calls the PostgreSQL stored procedure complete_delivery(). "
        "The procedure atomically: validates IN_TRANSIT state, sets DELIVERED, "
        "stamps delivered_at, sets final_fare, increments driver.total_deliveries, "
        "and marks driver available. The status-change trigger fires automatically "
        "to log the audit entry. Requires DRIVER role."
    ),
)
async def complete_shipment(
    shipment_id: UUID,
    final_fare: float | None = None,
    current_user: User = Depends(require_role("DRIVER")),
) -> ShipmentResponse:
    """
    Calls CALL complete_delivery() — a PostgreSQL stored procedure.
    All business logic runs inside the DB engine, not Python.
    """
    from services.complete_service import CompleteDeliveryService
    from decimal import Decimal
    from core.exceptions import ShipmentNotFoundError, ShipmentAlreadyAcceptedError

    svc = CompleteDeliveryService()
    try:
        return await svc.complete(
            shipment_id,
            current_user.id,
            Decimal(str(final_fare)) if final_fare else None,
        )
    except ShipmentNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ShipmentAlreadyAcceptedError as e:
        raise HTTPException(status_code=409, detail=str(e))

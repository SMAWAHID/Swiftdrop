"""
SwiftDrop :: Reviews Router
Vendor leaves a 1–5 rating + comment on a delivered shipment.
The DB trigger validates business rules; this router stays thin.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from core.exceptions import (
    ShipmentAlreadyAcceptedError,
    ShipmentNotFoundError,
    VendorProfileNotFoundError,
)
from core.security import require_role
from models.user import User
from schemas.review import ReviewCreateRequest, ReviewResponse
from services.review_service import ReviewService

router = APIRouter(prefix="/api", tags=["Reviews"])


@router.post(
    "/shipments/{shipment_id}/review",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Vendor rates the driver after delivery",
    description=(
        "Inserts into shipment_reviews. "
        "DB triggers validate the shipment is DELIVERED and the reviewer is the "
        "booking vendor, then automatically recompute drivers.rating as the "
        "running average. Trigger chaining demonstration."
    ),
)
async def create_review(
    shipment_id: UUID,
    payload: ReviewCreateRequest,
    current_user: User = Depends(require_role("VENDOR")),
    svc: ReviewService = Depends(ReviewService),
) -> ReviewResponse:
    try:
        return await svc.create(shipment_id, current_user.id, payload)
    except ShipmentNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except VendorProfileNotFoundError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ShipmentAlreadyAcceptedError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get(
    "/drivers/{driver_id}/reviews",
    response_model=list[ReviewResponse],
    summary="List reviews for a driver (paginated)",
)
async def list_driver_reviews(
    driver_id: UUID,
    page:  int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    svc: ReviewService = Depends(ReviewService),
) -> list[ReviewResponse]:
    return await svc.list_for_driver(driver_id, page=page, limit=limit)

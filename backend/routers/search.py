"""
SwiftDrop :: Search Router
GET /api/shipments/search?q=karachi
Backed by the GIN-indexed addresses_search tsvector (Improvement 6).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from core.security import get_current_user
from db.connection import get_pool
from models.user import User
from schemas.shipment import ShipmentResponse

router = APIRouter(prefix="/api/shipments", tags=["Search"])


@router.get(
    "/search",
    response_model=list[ShipmentResponse],
    summary="Full-text search shipments by pickup / delivery address",
    description=(
        "Uses PostgreSQL tsvector + GIN. Matches every word in q against "
        "shipments.addresses_search using plainto_tsquery. Vendors only see "
        "their own shipments; admin sees all; drivers see their own + "
        "PENDING shipments."
    ),
)
async def search_shipments(
    q: str = Query(..., min_length=1, max_length=200, description="Search terms"),
    page:  int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
) -> list[ShipmentResponse]:
    pool = await get_pool()
    offset = (page - 1) * limit

    role = current_user.role
    if role == "VENDOR":
        sql = """
            SELECT s.*
            FROM   shipments s
            JOIN   vendors v ON v.id = s.vendor_id
            WHERE  v.user_id = $1
              AND  s.addresses_search @@ plainto_tsquery('simple', $2)
            ORDER  BY ts_rank(s.addresses_search, plainto_tsquery('simple', $2)) DESC,
                      s.created_at DESC
            LIMIT  $3 OFFSET $4
        """
    elif role == "DRIVER":
        sql = """
            SELECT s.*
            FROM   shipments s
            LEFT JOIN drivers d ON d.id = s.driver_id
            WHERE  (s.status = 'PENDING' OR d.user_id = $1)
              AND  s.addresses_search @@ plainto_tsquery('simple', $2)
            ORDER  BY ts_rank(s.addresses_search, plainto_tsquery('simple', $2)) DESC,
                      s.created_at DESC
            LIMIT  $3 OFFSET $4
        """
    else:
        sql = """
            SELECT s.*
            FROM   shipments s
            WHERE  ($1::uuid IS NOT NULL OR TRUE)
              AND  s.addresses_search @@ plainto_tsquery('simple', $2)
            ORDER  BY ts_rank(s.addresses_search, plainto_tsquery('simple', $2)) DESC,
                      s.created_at DESC
            LIMIT  $3 OFFSET $4
        """

    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, current_user.id, q, limit, offset)

    return [ShipmentResponse.model_validate(dict(r)) for r in rows]

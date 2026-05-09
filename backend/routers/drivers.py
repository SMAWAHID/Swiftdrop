"""
SwiftDrop :: Drivers Router (Controller Layer)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from core.security import get_current_user, require_role
from db.connection import get_pool
from models.user import User

router = APIRouter(prefix="/api/drivers", tags=["Drivers"])


@router.get(
    "/dashboard",
    summary="Driver performance dashboard (view)",
    description="Returns aggregated metrics from the driver_performance_dashboard DB view. Admin only.",
)
async def get_driver_dashboard(
    _: User = Depends(require_role("ADMIN")),
) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM driver_performance_dashboard")
    return [dict(r) for r in rows]


@router.get(
    "/revenue-summary",
    summary="Monthly revenue (materialized view)",
    description=(
        "Reads from monthly_revenue_summary — a materialized view aggregating "
        "DELIVERED shipments by month and shipment_type. Refreshed via "
        "POST /api/drivers/revenue-summary/refresh (admin)."
    ),
)
async def get_revenue_summary(
    _: User = Depends(require_role("ADMIN")),
) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT month_start, shipment_type, deliveries_count,
                   total_revenue, avg_fare, total_weight_kg
            FROM   monthly_revenue_summary
            ORDER  BY month_start DESC, shipment_type
            """
        )
    return [
        {
            "month_start":      r["month_start"].isoformat() if r["month_start"] else None,
            "shipment_type":    r["shipment_type"],
            "deliveries_count": r["deliveries_count"],
            "total_revenue":    float(r["total_revenue"]),
            "avg_fare":         float(r["avg_fare"]),
            "total_weight_kg":  float(r["total_weight_kg"]),
        }
        for r in rows
    ]


@router.post(
    "/revenue-summary/refresh",
    summary="Refresh monthly revenue materialized view",
    description=(
        "CALL refresh_monthly_revenue() — runs REFRESH MATERIALIZED VIEW "
        "CONCURRENTLY on monthly_revenue_summary."
    ),
)
async def refresh_revenue_summary(
    _: User = Depends(require_role("ADMIN")),
) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("CALL refresh_monthly_revenue()")
    return {"status": "ok", "message": "monthly_revenue_summary refreshed"}


@router.get(
    "/me",
    summary="Get authenticated driver's own profile",
)
async def get_my_profile(
    current_user: User = Depends(require_role("DRIVER")),
) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT d.*, u.full_name, u.email, u.phone
            FROM   drivers d
            JOIN   users   u ON u.id = d.user_id
            WHERE  d.user_id = $1
            """,
            current_user.id,
        )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver profile not found",
        )
    return dict(row)


@router.patch(
    "/me/availability",
    summary="Toggle driver availability",
)
async def toggle_availability(
    available: bool,
    current_user: User = Depends(require_role("DRIVER")),
) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE drivers
            SET    is_available = $1
            WHERE  user_id = $2
            RETURNING id, is_available
            """,
            available,
            current_user.id,
        )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver profile not found",
        )
    return {"driver_id": str(row["id"]), "is_available": row["is_available"]}

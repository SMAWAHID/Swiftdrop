"""
SwiftDrop :: Review Service
============================
Vendor submits a 1–5 rating for a delivered shipment.

The Python service is intentionally thin — the BEFORE INSERT trigger
`trg_b_validate_review` already enforces:
  - Shipment must be DELIVERED.
  - Reviewer's vendor_id must match the booking vendor.
  - Driver_id must match the driver that delivered.

The AFTER INSERT trigger `trg_c_recompute_driver_rating` then refreshes
drivers.rating as the running average. Trigger chaining at work.
"""
from __future__ import annotations

from uuid import UUID

import asyncpg

from core.exceptions import (
    ShipmentAlreadyAcceptedError,
    ShipmentNotFoundError,
    VendorProfileNotFoundError,
)
from db.connection import get_pool
from schemas.review import ReviewCreateRequest, ReviewResponse


class ReviewService:

    async def create(
        self,
        shipment_id: UUID,
        vendor_user_id: UUID,
        payload: ReviewCreateRequest,
    ) -> ReviewResponse:
        pool: asyncpg.Pool = await get_pool()

        async with pool.acquire() as conn:
            async with conn.transaction():
                vendor = await conn.fetchrow(
                    "SELECT id FROM vendors WHERE user_id = $1",
                    vendor_user_id,
                )
                if not vendor:
                    raise VendorProfileNotFoundError(
                        "Authenticated user has no vendor profile"
                    )

                shipment = await conn.fetchrow(
                    "SELECT driver_id, status FROM shipments WHERE id = $1",
                    shipment_id,
                )
                if not shipment:
                    raise ShipmentNotFoundError(f"Shipment {shipment_id} not found")
                if shipment["driver_id"] is None:
                    raise ShipmentAlreadyAcceptedError(
                        "Shipment has no assigned driver — cannot be reviewed"
                    )

                try:
                    row = await conn.fetchrow(
                        """
                        INSERT INTO shipment_reviews
                            (shipment_id, vendor_id, driver_id, rating, comment)
                        VALUES ($1, $2, $3, $4, $5)
                        RETURNING *
                        """,
                        shipment_id,
                        vendor["id"],
                        shipment["driver_id"],
                        payload.rating,
                        payload.comment,
                    )
                except asyncpg.UniqueViolationError:
                    raise ShipmentAlreadyAcceptedError(
                        "This shipment has already been reviewed"
                    )
                except asyncpg.exceptions.RaiseError as e:
                    raise ShipmentAlreadyAcceptedError(str(e))

        return ReviewResponse.model_validate(dict(row))

    async def list_for_driver(
        self,
        driver_id: UUID,
        page: int = 1,
        limit: int = 20,
    ) -> list[ReviewResponse]:
        pool = await get_pool()
        offset = (page - 1) * limit
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT *
                FROM   shipment_reviews
                WHERE  driver_id = $1
                ORDER  BY created_at DESC
                LIMIT  $2 OFFSET $3
                """,
                driver_id, limit, offset,
            )
        return [ReviewResponse.model_validate(dict(r)) for r in rows]

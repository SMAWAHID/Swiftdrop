"""
SwiftDrop :: Complete Delivery Service
========================================
Calls the complete_delivery() PostgreSQL stored procedure via CALL.

Why a stored procedure instead of raw Python UPDATE?
------------------------------------------------------
The procedure encapsulates ALL delivery-completion logic at the DB
layer:
  - Row-level locking (FOR UPDATE)
  - Status validation (must be IN_TRANSIT)
  - Setting delivered_at, final_fare
  - Incrementing driver.total_deliveries
  - Marking driver available

The Python service's only job is to:
  1. Inject the audit context (app.current_user_id) so the
     trg_shipment_status_audit trigger can record the actor.
  2. Call CALL complete_delivery(...).
  3. Return the updated shipment to the router.

This demonstrates the Stored Procedure pattern: business rules
enforced at the database engine level, not just the application level.
The state machine guard trigger (trg_a_validate_status_transition)
also fires automatically — no bypass possible even from psql.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Optional
from uuid import UUID

import asyncpg

from core.exceptions import ShipmentNotFoundError, ShipmentAlreadyAcceptedError
from db.connection import get_pool
from schemas.shipment import ShipmentResponse
from services.notification_service import notification_service


class CompleteDeliveryService:
    """
    Wraps CALL complete_delivery() inside an asyncpg transaction.

    The stored procedure does the heavy lifting.
    This service layer adds:
      - Driver identity resolution (user_id → driver_id lookup)
      - Session variable injection for the audit trigger
      - asyncpg transaction management
      - Domain exception mapping
    """

    async def complete(
        self,
        shipment_id: UUID,
        driver_user_id: UUID,
        final_fare: Optional[Decimal] = None,
    ) -> ShipmentResponse:
        pool: asyncpg.Pool = await get_pool()

        async with pool.acquire() as conn:
            async with conn.transaction():

                # Step 1: Resolve driver — ensure the caller is the assigned driver
                driver = await conn.fetchrow(
                    "SELECT id FROM drivers WHERE user_id = $1",
                    driver_user_id,
                )
                if not driver:
                    raise ShipmentNotFoundError("No driver profile for this user")

                # Step 2: Verify this driver is actually assigned to this shipment
                shipment_check = await conn.fetchrow(
                    """
                    SELECT id, status, driver_id
                    FROM   shipments
                    WHERE  id = $1
                    """,
                    shipment_id,
                )
                if not shipment_check:
                    raise ShipmentNotFoundError(f"Shipment {shipment_id} not found")

                if shipment_check["driver_id"] != driver["id"]:
                    raise ShipmentAlreadyAcceptedError(
                        "You are not the assigned driver for this shipment"
                    )

                # Step 3: Inject audit context for the status-change trigger
                await conn.execute(
                    "SELECT set_config('app.current_user_id', $1, TRUE)",
                    str(driver_user_id),
                )

                # Step 4: CALL the stored procedure
                # The procedure handles: locking, status validation,
                # UPDATE shipments, UPDATE drivers — all atomically.
                # The trg_a_validate_status_transition trigger fires
                # inside the procedure's UPDATE, enforcing IN_TRANSIT→DELIVERED.
                # The trg_shipment_status_audit trigger fires next,
                # inserting the audit log row automatically.
                try:
                    await conn.execute(
                        "CALL complete_delivery($1, $2)",
                        shipment_id,
                        final_fare,
                    )
                except asyncpg.exceptions.RaiseError as e:
                    # P0001 = business rule violation from our procedure
                    raise ShipmentAlreadyAcceptedError(str(e))

                # Step 5: Fetch the updated row
                updated = await conn.fetchrow(
                    "SELECT * FROM shipments WHERE id = $1",
                    shipment_id,
                )
                response = ShipmentResponse.model_validate(dict(updated))

                # Resolve the booking vendor's user_id for the notification
                vendor_user_id = await conn.fetchval(
                    "SELECT user_id FROM vendors WHERE id = $1",
                    updated["vendor_id"],
                )

        # Observer pattern — publish "shipment.delivered" outside the transaction
        if vendor_user_id:
            await notification_service.publish(
                event_type="shipment.delivered",
                user_id=vendor_user_id,
                payload={
                    "shipment_id": str(response.id),
                    "final_fare":  float(response.final_fare or 0),
                    "message":     "Your shipment has been delivered.",
                },
            )
        await notification_service.publish(
            event_type="shipment.delivered",
            user_id=driver_user_id,
            payload={
                "shipment_id": str(response.id),
                "message":     "Delivery completed successfully.",
            },
        )

        return response

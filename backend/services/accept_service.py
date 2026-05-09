"""
SwiftDrop :: Accept Shipment Service
=====================================
★★★ CRITICAL CONCURRENCY SECTION ★★★

Problem (Race Condition without locking)
-----------------------------------------
T1 (Driver A): SELECT status → 'PENDING'  ✓
T2 (Driver B): SELECT status → 'PENDING'  ✓  (concurrent read, no lock)
T1:            UPDATE status = 'ASSIGNED', driver_id = A
T2:            UPDATE status = 'ASSIGNED', driver_id = B
RESULT: Two drivers own the same shipment. Business invariant violated.

Solution: SELECT ... FOR UPDATE (Pessimistic Locking)
------------------------------------------------------
- PostgreSQL acquires an EXCLUSIVE ROW LOCK on the target row.
- T2's `SELECT FOR UPDATE` BLOCKS until T1's transaction commits/rolls back.
- T2 then sees status = 'ASSIGNED' and raises ShipmentAlreadyAcceptedError.
- Router maps this to HTTP 409 Conflict.

NOWAIT clause
-------------
Without NOWAIT, T2 would block the HTTP worker thread for up to
command_timeout seconds (60s). NOWAIT raises asyncpg.LockNotAvailableError
immediately, which we catch and convert to a clean 409 response.

ACID Properties
---------------
Atomicity   : UPDATE shipments + INSERT audit_log (via trigger) succeed
              together or both roll back.
Consistency : chk_driver_assigned constraint never violated under lock.
Isolation   : READ COMMITTED isolation + FOR UPDATE prevents dirty reads
              and the lost-update anomaly simultaneously.
Durability  : Committed transaction survives crash (WAL guarantee).
"""
from __future__ import annotations

from uuid import UUID

import asyncpg

from core.exceptions import (
    DriverProfileNotFoundError,
    ShipmentAlreadyAcceptedError,
    ShipmentNotFoundError,
)
from db.connection import get_pool
from schemas.shipment import ShipmentResponse
from services.notification_service import notification_service


class AcceptShipmentService:
    """
    Service: Manages the atomic accept-shipment transaction.

    Concurrency strategy : Pessimistic Locking (SELECT FOR UPDATE NOWAIT)
    Alternative considered: Optimistic Locking (version column + CAS loop)
    Pessimistic chosen because:
      - Only one driver can ever win; retry loops waste compute.
      - NOWAIT gives instant 409 — better UX for the losing driver.
      - Lock contention per row is extremely low in practice.
    """

    async def accept(
        self,
        shipment_id: UUID,
        driver_user_id: UUID,
    ) -> ShipmentResponse:
        pool: asyncpg.Pool = await get_pool()

        async with pool.acquire() as conn:
            # ── Begin explicit serializable transaction ─────────────────────
            async with conn.transaction():

                # ── Step 1: Resolve driver profile ─────────────────────────
                driver = await conn.fetchrow(
                    "SELECT id FROM drivers WHERE user_id = $1",
                    driver_user_id,
                )
                if not driver:
                    raise DriverProfileNotFoundError(
                        "No driver profile found for this user"
                    )

                # ── Step 2: SELECT FOR UPDATE NOWAIT (Row-Level Lock) ───────
                #
                # This is the critical line.
                #
                # FOR UPDATE  : acquires an exclusive row-level lock.
                # NOWAIT      : raises LockNotAvailableError immediately if
                #               another transaction already holds the lock,
                #               instead of blocking the HTTP worker thread.
                #
                # The lock is held until this transaction commits or rolls back.
                # Any concurrent T2 hitting this line while T1 holds the lock
                # gets LockNotAvailableError → caught below → 409 Conflict.
                try:
                    row = await conn.fetchrow(
                        """
                        SELECT id, status, driver_id
                        FROM   shipments
                        WHERE  id = $1
                        FOR UPDATE NOWAIT
                        """,
                        shipment_id,
                    )
                except asyncpg.LockNotAvailableError:
                    # Another driver is mid-transaction on the same row.
                    # Fail fast — the client should retry or move on.
                    raise ShipmentAlreadyAcceptedError(
                        "Shipment is currently being claimed by another driver. "
                        "Please try another order."
                    )

                if not row:
                    raise ShipmentNotFoundError(
                        f"Shipment {shipment_id} not found"
                    )

                # ── Step 3: Business rule check (under the acquired lock) ───
                #
                # This check now executes against the LOCKED, current row.
                # No other transaction can change status between our read
                # and our write — the lost-update anomaly is impossible here.
                if row["status"] != "PENDING":
                    raise ShipmentAlreadyAcceptedError(
                        f"Shipment is already '{row['status']}'. "
                        "Another driver accepted it first."
                    )

                # ── Step 4: Inject audit context for the DB trigger ─────────
                #
                # The BEFORE UPDATE trigger `trg_shipment_status_audit` reads
                # `app.current_user_id` via current_setting() to populate the
                # `changed_by` column in shipment_audit_logs.
                # SET LOCAL scopes the variable to THIS transaction only.
                await conn.execute(
                    "SELECT set_config('app.current_user_id', $1, TRUE)",
                    str(driver_user_id),
                )

                # ── Step 5: Atomic UPDATE ───────────────────────────────────
                #
                # The trigger fires BEFORE this UPDATE completes, within the
                # same transaction. Both the status change and its audit record
                # are committed atomically (ACID Atomicity).
                updated = await conn.fetchrow(
                    """
                    UPDATE shipments
                    SET    status      = 'ASSIGNED',
                           driver_id   = $1,
                           accepted_at = NOW()
                    WHERE  id          = $2
                    RETURNING *
                    """,
                    driver["id"],
                    shipment_id,
                )

                # ── Step 6: Mark driver unavailable ────────────────────────
                await conn.execute(
                    "UPDATE drivers SET is_available = FALSE WHERE id = $1",
                    driver["id"],
                )

                response = ShipmentResponse.model_validate(dict(updated))

                # Look up the booking vendor's user_id so we can notify them
                vendor_user_id = await conn.fetchval(
                    "SELECT user_id FROM vendors WHERE id = $1",
                    updated["vendor_id"],
                )

        # Observer pattern — fan-out happens AFTER commit so a notification
        # failure cannot rollback the accepted shipment.
        if vendor_user_id:
            await notification_service.publish(
                event_type="shipment.accepted",
                user_id=vendor_user_id,
                payload={
                    "shipment_id": str(response.id),
                    "message":     "A driver has accepted your shipment.",
                },
            )
        await notification_service.publish(
            event_type="shipment.assigned",
            user_id=driver_user_id,
            payload={
                "shipment_id": str(response.id),
                "message":     "You accepted this shipment.",
            },
        )

        # Transaction commits here (async context manager exit).
        # The exclusive row lock is RELEASED.
        # Any queued T2 now proceeds, sees status='ASSIGNED', raises 409.
        return response

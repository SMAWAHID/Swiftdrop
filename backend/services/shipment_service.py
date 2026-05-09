"""
SwiftDrop :: Shipment Booking Service (GoF — Facade Pattern)
============================================================
Rationale
---------
The booking flow involves multiple sub-systems:
  1. ShipmentFactory  — type resolution & fare calculation
  2. Vendor lookup    — resolve vendor profile from user id
  3. DB INSERT        — transactional persistence
  4. (Future) Notification — push alert to nearby drivers

Without a Facade, the Router would need to orchestrate all of
these directly, creating tight coupling between HTTP and domain
logic (violation of Single Responsibility).

The Facade exposes one method — book_shipment() — hiding all
subsystem complexity from the Router (Law of Demeter).
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

import asyncpg

from core.exceptions import VendorProfileNotFoundError
from db.connection import get_pool
from factories.shipment_factory import ShipmentFactory
from schemas.shipment import ShipmentBookRequest, ShipmentResponse
from services.notification_service import notification_service

# Base rate used by the Factory's fare calculation
BASE_RATE_PER_KG = Decimal("80.00")  # PKR per kg


class ShipmentBookingFacade:
    """
    FACADE: Orchestrates the full shipment booking pipeline.

    The Router calls book_shipment() and receives a ShipmentResponse.
    It has zero knowledge of vendors, fare calculation, or pool
    management — all concerns are hidden behind this interface.

    High Cohesion: This class only deals with shipment booking.
    Low Coupling : Router depends only on this class's public API.
    """

    async def book_shipment(
        self,
        request: ShipmentBookRequest,
        vendor_user_id: UUID,
    ) -> ShipmentResponse:
        """
        Orchestrate the booking pipeline:
          1. Factory  → resolve type & compute fare
          2. DB       → resolve vendor profile
          3. DB       → INSERT shipment (atomic)
        """
        pool: asyncpg.Pool = await get_pool()

        # ── Step 1: Factory resolves type and computes fare ────────────────
        shipment_obj = ShipmentFactory.create(request)
        estimated_fare = shipment_obj.calculate_fare(BASE_RATE_PER_KG)
        db_dict = shipment_obj.to_db_dict()

        async with pool.acquire() as conn:
            # ── Step 2: Resolve vendor profile ─────────────────────────────
            vendor = await conn.fetchrow(
                "SELECT id FROM vendors WHERE user_id = $1",
                vendor_user_id,
            )
            if not vendor:
                raise VendorProfileNotFoundError(
                    "Authenticated user has no vendor profile"
                )

            # ── Step 3: Atomic INSERT ───────────────────────────────────────
            # ACID Atomicity: single INSERT; if it fails, nothing is written.
            row = await conn.fetchrow(
                """
                INSERT INTO shipments (
                    vendor_id, shipment_type, status,
                    pickup_address, delivery_address,
                    package_weight_kg, package_description,
                    estimated_fare
                )
                VALUES ($1, $2, 'PENDING', $3, $4, $5, $6, $7)
                RETURNING *
                """,
                vendor["id"],
                db_dict["shipment_type"],
                db_dict["pickup_address"],
                db_dict["delivery_address"],
                db_dict["package_weight_kg"],
                db_dict.get("package_description"),
                estimated_fare,
            )

        # ── Step 4: Observer pattern — publish "shipment.created" ──────────
        # The NotificationService Singleton fans the event out to every
        # registered observer (DB persistence + stdout log by default).
        # Booking still succeeds even if a sink fails — observer errors
        # are caught inside notification_service.publish().
        async with pool.acquire() as conn:
            driver_rows = await conn.fetch(
                "SELECT user_id FROM drivers WHERE is_available = TRUE"
            )
        for d in driver_rows:
            await notification_service.publish(
                event_type="shipment.created",
                user_id=d["user_id"],
                payload={
                    "shipment_id":      str(row["id"]),
                    "pickup_address":   row["pickup_address"],
                    "delivery_address": row["delivery_address"],
                    "estimated_fare":   float(row["estimated_fare"]),
                    "shipment_type":    row["shipment_type"],
                    "message":          "New PENDING shipment available.",
                },
            )

        # Also notify the vendor that booking succeeded
        await notification_service.publish(
            event_type="shipment.booked",
            user_id=vendor_user_id,
            payload={
                "shipment_id":     str(row["id"]),
                "estimated_fare":  float(row["estimated_fare"]),
                "message":         "Your shipment was booked successfully.",
            },
        )

        return ShipmentResponse.model_validate(dict(row))

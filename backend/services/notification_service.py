"""
SwiftDrop :: NotificationService (GoF — Observer Pattern)
==========================================================
Completes the GoF design-pattern set used in the project:
  • Singleton  — db.connection.get_pool
  • Factory    — factories.shipment_factory.ShipmentFactory
  • Facade     — services.shipment_service.ShipmentBookingFacade
  • Observer   — this module

Design
------
Subject  = NotificationService (Singleton)
Observer = NotificationObserver (abstract base)
Concrete observers:
    • DBNotificationObserver  — persists every event to notifications
    • LogNotificationObserver — prints to stdout (handy for demos)

Domain emitters (booking facade, status transitions) call
NotificationService.publish(event_type, user_id, payload). The service
fans the event out to every registered observer. Adding a new sink
(email, push, websocket) is a matter of writing one Observer class —
no domain code changes (Open/Closed).
"""
from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from typing import Any, Optional
from uuid import UUID

import asyncpg

from db.connection import get_pool


logger = logging.getLogger("swiftdrop.notifications")


# ── Observer Interface ────────────────────────────────────────────────────────

class NotificationObserver(ABC):
    """Abstract observer — concrete sinks override notify()."""

    @abstractmethod
    async def notify(
        self,
        event_type: str,
        user_id: Optional[UUID],
        payload: dict[str, Any],
    ) -> None:
        ...


# ── Concrete Observer: persist to notifications table ─────────────────────────

class DBNotificationObserver(NotificationObserver):
    """
    Persists each event as a row in notifications. Frontend polls
    /api/notifications/me to render an inbox / toast list.
    """

    async def notify(
        self,
        event_type: str,
        user_id: Optional[UUID],
        payload: dict[str, Any],
    ) -> None:
        if user_id is None:
            return  # broadcast events with no recipient are not stored
        pool: asyncpg.Pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO notifications (user_id, event_type, payload)
                VALUES ($1, $2, $3::jsonb)
                """,
                user_id, event_type, json.dumps(payload),
            )


# ── Concrete Observer: stdout logger (demo aid) ───────────────────────────────

class LogNotificationObserver(NotificationObserver):
    async def notify(
        self,
        event_type: str,
        user_id: Optional[UUID],
        payload: dict[str, Any],
    ) -> None:
        logger.info("event=%s user=%s payload=%s", event_type, user_id, payload)


# ── Subject (Singleton) ───────────────────────────────────────────────────────

class NotificationService:
    """
    Subject in the Observer pattern.

    Singleton via the module-level instance `notification_service`.
    Importers always get the same observer registry, so the booking
    facade and status-change endpoints share one event bus.
    """

    def __init__(self) -> None:
        self._observers: list[NotificationObserver] = []

    def subscribe(self, observer: NotificationObserver) -> None:
        if observer not in self._observers:
            self._observers.append(observer)

    def unsubscribe(self, observer: NotificationObserver) -> None:
        if observer in self._observers:
            self._observers.remove(observer)

    async def publish(
        self,
        event_type: str,
        user_id: Optional[UUID],
        payload: dict[str, Any],
    ) -> None:
        """
        Fan out a single event to every subscribed observer.
        Observer failures are logged but do not break the publisher —
        notifications are non-critical.
        """
        for observer in list(self._observers):
            try:
                await observer.notify(event_type, user_id, payload)
            except Exception:
                logger.exception(
                    "Observer %s failed for event %s",
                    observer.__class__.__name__, event_type,
                )


# ── Module-level Singleton (preconfigured with default observers) ─────────────

notification_service = NotificationService()
notification_service.subscribe(DBNotificationObserver())
notification_service.subscribe(LogNotificationObserver())

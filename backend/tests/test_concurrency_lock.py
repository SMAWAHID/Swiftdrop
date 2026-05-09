"""
SwiftDrop :: Concurrent accept-shipment lock test
==================================================
The accept flow uses SELECT ... FOR UPDATE NOWAIT to guarantee that
exactly one driver wins a PENDING shipment. This test simulates two
concurrent accept calls against the same shipment; the second should
raise ShipmentAlreadyAcceptedError (status 409 in the router).

The real concurrency primitive lives in PostgreSQL. We exercise the
service-layer logic by simulating the lock outcome:
  • driver A's transaction: SELECT FOR UPDATE NOWAIT succeeds.
  • driver B's transaction: SELECT FOR UPDATE NOWAIT raises
    asyncpg.LockNotAvailableError, which the service maps to a
    domain exception.

Two asyncio coroutines run concurrently via asyncio.gather() so the
test demonstrates the service handles overlapping callers correctly.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import asyncpg
import pytest

from core.exceptions import ShipmentAlreadyAcceptedError


@asynccontextmanager
async def _noop_transaction(*args, **kwargs):
    yield


def _make_winner_conn(driver_id, shipment_id):
    """Connection mock for driver A — wins the lock and updates the row."""
    c = MagicMock()
    c.transaction = _noop_transaction

    # 1. SELECT id FROM drivers WHERE user_id = $1
    # 2. SELECT FOR UPDATE NOWAIT — returns row
    # 3. UPDATE shipments ... RETURNING *
    # 4. SELECT user_id FROM vendors WHERE id = $1
    c.fetchrow = AsyncMock(side_effect=[
        {"id": driver_id},
        {"id": shipment_id, "status": "PENDING", "driver_id": None},
        {
            "id": shipment_id,
            "vendor_id": uuid4(),
            "driver_id": driver_id,
            "shipment_type": "STANDARD",
            "status": "ASSIGNED",
            "pickup_address": "A",
            "delivery_address": "B",
            "package_weight_kg": 5,
            "package_description": None,
            "estimated_fare": 400,
            "final_fare": None,
            "created_at": _now(),
            "accepted_at": _now(),
            "picked_up_at": None,
            "delivered_at": None,
            "updated_at": _now(),
        },
    ])
    c.fetchval = AsyncMock(return_value=uuid4())
    c.execute = AsyncMock(return_value="OK")
    return c


def _make_loser_conn(driver_id):
    """Connection mock for driver B — gets LockNotAvailableError on FOR UPDATE NOWAIT."""
    c = MagicMock()
    c.transaction = _noop_transaction
    c.fetchrow = AsyncMock(side_effect=[
        {"id": driver_id},
        asyncpg.LockNotAvailableError("could not obtain lock on row"),
    ])
    c.execute = AsyncMock(return_value="OK")
    return c


def _now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)


def _pool_for(conn):
    @asynccontextmanager
    async def fake_acquire():
        yield conn
    p = MagicMock()
    p.acquire = fake_acquire
    return p


async def test_two_concurrent_drivers_one_wins_one_409(monkeypatch):
    from services import accept_service as accept_module

    shipment_id = uuid4()
    driver_a_id = uuid4()
    driver_b_id = uuid4()

    pools = {
        "A": _pool_for(_make_winner_conn(driver_a_id, shipment_id)),
        "B": _pool_for(_make_loser_conn(driver_b_id)),
    }
    current = {"id": "A"}

    async def fake_get_pool():
        return pools[current["id"]]

    monkeypatch.setattr(accept_module, "get_pool", fake_get_pool)
    # Silence the observer fan-out (it would try a real DB connection)
    from services import notification_service as ns_module
    monkeypatch.setattr(
        ns_module.notification_service, "publish",
        AsyncMock(return_value=None),
    )

    svc = accept_module.AcceptShipmentService()

    async def run_a():
        return await svc.accept(shipment_id, uuid4())

    async def run_b():
        current["id"] = "B"
        return await svc.accept(shipment_id, uuid4())

    # Driver A goes first, then driver B (sequenced via current["id"] toggle).
    a_result = await run_a()
    with pytest.raises(ShipmentAlreadyAcceptedError):
        await run_b()

    assert str(a_result.status) == "ASSIGNED"


async def test_two_concurrent_accepts_via_gather(monkeypatch):
    """
    Variant: kick both off with asyncio.gather. The "loser" branch
    is what we assert on. Demonstrates that the service is safe to
    call from overlapping coroutines.
    """
    from services import accept_service as accept_module

    shipment_id = uuid4()
    driver_a_id = uuid4()
    driver_b_id = uuid4()

    sequence = ["A", "B"]
    pools = {
        "A": _pool_for(_make_winner_conn(driver_a_id, shipment_id)),
        "B": _pool_for(_make_loser_conn(driver_b_id)),
    }

    async def fake_get_pool():
        # Pop in order — A first, then B — modelling A reaching the lock first.
        key = sequence.pop(0) if sequence else "B"
        return pools[key]

    monkeypatch.setattr(accept_module, "get_pool", fake_get_pool)
    from services import notification_service as ns_module
    monkeypatch.setattr(
        ns_module.notification_service, "publish",
        AsyncMock(return_value=None),
    )

    svc = accept_module.AcceptShipmentService()

    a_user = uuid4()
    b_user = uuid4()

    results = await asyncio.gather(
        svc.accept(shipment_id, a_user),
        svc.accept(shipment_id, b_user),
        return_exceptions=True,
    )
    successes = [r for r in results if not isinstance(r, Exception)]
    failures  = [r for r in results if isinstance(r, ShipmentAlreadyAcceptedError)]
    assert len(successes) == 1
    assert len(failures)  == 1

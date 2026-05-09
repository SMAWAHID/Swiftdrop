"""
SwiftDrop :: Database Connection
Pattern : Singleton (GoF)
Rationale: A connection pool is an expensive, stateful resource.
           One pool for the entire application lifetime prevents
           connection exhaustion and overhead of repeated negotiation.

Thread-safety: asyncpg.Pool is inherently coroutine-safe.
               The module-level guard + async initialization is
               the idiomatic Python async Singleton.
"""
from __future__ import annotations

import asyncpg
from config import settings

# ── Private module-level instance (Singleton holder) ────────────────────────
_pool: asyncpg.Pool | None = None

async def get_pool() -> asyncpg.Pool:
    """
    Lazy-initializing Singleton accessor for the asyncpg connection pool.

    Called by every service; always returns the same pool object after
    the first call (Initialization-on-demand pattern).
    """
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=5,
            max_size=20,
            command_timeout=60,
            server_settings={"application_name": "swiftdrop-api"},
        )
    return _pool


async def close_pool() -> None:
    """
    Graceful shutdown — called from the FastAPI lifespan handler.
    Resets the Singleton so tests can reinitialize cleanly.
    """
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None

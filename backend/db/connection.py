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

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import asyncpg
from config import settings

# ── Private module-level instance (Singleton holder) ────────────────────────
_pool: asyncpg.Pool | None = None


# ── DSN normalisation ────────────────────────────────────────────────────────
# Managed Postgres providers hand out a libpq-style URL:
#
#   postgresql://user:pass@host/db?sslmode=require&channel_binding=require
#
# asyncpg is not libpq. Query parameters it does not recognise are forwarded to
# the server as configuration settings, so `channel_binding` arrives as an
# unknown GUC and the connection dies with "unrecognized configuration
# parameter". Stripping those here means the provider's copy-paste string works.

_LIBPQ_ONLY_PARAMS = {"sslmode", "channel_binding", "sslrootcert", "sslcert", "sslkey"}


def _normalize_dsn(raw: str) -> tuple[str, dict]:
    """Return an asyncpg-safe DSN plus the connect kwargs it implies."""
    url = urlsplit(raw.strip())
    kwargs: dict = {}

    kept, ssl_requested = [], False
    for key, value in parse_qsl(url.query, keep_blank_values=True):
        if key.lower() == "sslmode":
            ssl_requested = value.lower() not in ("disable", "allow", "prefer")
        elif key.lower() in _LIBPQ_ONLY_PARAMS:
            continue
        else:
            kept.append((key, value))

    is_local = url.hostname in ("localhost", "127.0.0.1", "::1", None)
    if (ssl_requested or "sslmode" not in raw.lower()) and not is_local:
        kwargs["ssl"] = "require"

    # Poolers (Neon's "-pooler" host, Supabase's pgbouncer) cannot hold the
    # server-side prepared statements asyncpg caches by default; reusing one
    # raises "prepared statement _asyncpg_stmt_N already exists".
    kwargs["statement_cache_size"] = 0

    dsn = urlunsplit(
        (url.scheme, url.netloc, url.path, urlencode(kept), url.fragment)
    )
    return dsn, kwargs


async def get_pool() -> asyncpg.Pool:
    """
    Lazy-initializing Singleton accessor for the asyncpg connection pool.

    Called by every service; always returns the same pool object after
    the first call (Initialization-on-demand pattern).
    """
    global _pool
    if _pool is None:
        dsn, connect_kwargs = _normalize_dsn(settings.DATABASE_URL)
        _pool = await asyncpg.create_pool(
            dsn=dsn,
            # Sized from config: free-tier Postgres caps concurrent connections
            # well below what a self-hosted server allows, and min_size=5 alone
            # could exhaust the quota before serving a single request.
            min_size=settings.DB_POOL_MIN_SIZE,
            max_size=settings.DB_POOL_MAX_SIZE,
            command_timeout=60,
            server_settings={"application_name": "swiftdrop-api"},
            **connect_kwargs,
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

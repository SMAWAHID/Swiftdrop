r"""
SwiftDrop :: Database bootstrap
===============================
Applies schema.sql, and seed.sql when the demo accounts are absent.

Why this exists
---------------
db/migrations.sql wraps the two files with psql's `\ir` include directive, so it
can only be run by the psql binary. Managed hosts (Render, Fly, Railway) build
from a plain Python image with no psql available, and their free tiers offer no
pre-deploy shell — so deploying meant the API booted against an empty database
and every request 500'd on "relation users does not exist".

This module does the same work over asyncpg, which the app already depends on,
and is safe to run on every start:

  * schema.sql is pure `CREATE ... IF NOT EXISTS` / `DO $$ ... EXCEPTION` DDL.
  * seed.sql deletes and re-inserts only its six demo accounts, so it never
    touches real signups — but it IS skipped once they exist, so a visitor's
    demo data survives a container restart. Pass --force-seed to reset it.

Usage (from the backend/ directory):
    python -m db.bootstrap
    python -m db.bootstrap --force-seed
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Allow both `python -m db.bootstrap` and `python db/bootstrap.py`.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

import asyncpg  # noqa: E402

from config import settings  # noqa: E402
from db.connection import _normalize_dsn  # noqa: E402

_SQL_DIR = Path(__file__).resolve().parent

# Present iff seed.sql has already run against this database.
_SEED_SENTINEL = "SELECT EXISTS (SELECT 1 FROM users WHERE email = 'admin@swiftdrop.io')"


async def _already_seeded(conn: asyncpg.Connection) -> bool:
    try:
        return bool(await conn.fetchval(_SEED_SENTINEL))
    except asyncpg.PostgresError:
        # users table does not exist yet — schema.sql has not run.
        return False


async def bootstrap(force_seed: bool = False) -> None:
    dsn, connect_kwargs = _normalize_dsn(settings.DATABASE_URL)
    conn = await asyncpg.connect(dsn=dsn, **connect_kwargs)
    try:
        schema = (_SQL_DIR / "schema.sql").read_text(encoding="utf-8")
        print(f"[bootstrap] applying schema.sql ({len(schema):,} bytes)", flush=True)
        await conn.execute(schema)
        print("[bootstrap] schema ready", flush=True)

        if not force_seed and await _already_seeded(conn):
            print("[bootstrap] demo data already present — skipping seed.sql", flush=True)
            return

        seed = (_SQL_DIR / "seed.sql").read_text(encoding="utf-8")
        print(f"[bootstrap] applying seed.sql ({len(seed):,} bytes)", flush=True)
        await conn.execute(seed)
        print("[bootstrap] seed data loaded (demo password: Admin@123)", flush=True)
    finally:
        await conn.close()


def main() -> int:
    force = "--force-seed" in sys.argv
    try:
        asyncio.run(bootstrap(force_seed=force))
    except Exception as exc:  # noqa: BLE001 — surface the real cause to deploy logs
        print(f"[bootstrap] FAILED: {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

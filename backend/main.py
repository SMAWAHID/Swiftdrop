"""
SwiftDrop :: FastAPI Application Entrypoint
============================================
Architecture : Layered (N-Tier)
  - Routers   → Controller layer  (HTTP parsing, response serialization)
  - Services  → Business layer    (domain logic, transactions)
  - DB pool   → Data access layer (asyncpg, raw SQL)

Lifespan
--------
FastAPI's lifespan context manager (replaces deprecated on_event handlers)
handles pool initialization at startup and graceful pool shutdown.

CORS
----
Origins are configurable via .env → CORS_ORIGINS.
In production, restrict to your actual frontend domain(s).

Exception Handlers
------------------
Domain exceptions are mapped to HTTP status codes here — keeping
routers thin (they only raise domain exceptions, not HTTPExceptions).
"""


from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from core.exceptions import (
    DriverProfileNotFoundError,
    ShipmentAlreadyAcceptedError,
    ShipmentNotFoundError,
    SwiftDropException,
    VendorProfileNotFoundError,
)
from db.connection import close_pool, get_pool
from routers import auth, drivers, notifications, reviews, search, shipments

# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup : initialize the Singleton DB connection pool.
    Shutdown: close the pool gracefully (drains active connections).
    """
    await get_pool()   # warm up the Singleton pool
    yield
    await close_pool()


# ── Application ───────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description=(
        "SwiftDrop — Real-time last-mile logistics API. "
        "Implements Singleton, Factory, and Facade GoF patterns. "
        "Row-level locking ensures concurrency-safe order acceptance."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)


# ── CORS Middleware ───────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Global Exception Handlers ─────────────────────────────────────────────────
# Map domain exceptions → HTTP without touching individual routers.

@app.exception_handler(ShipmentNotFoundError)
@app.exception_handler(DriverProfileNotFoundError)
async def not_found_handler(request: Request, exc: SwiftDropException):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(ShipmentAlreadyAcceptedError)
async def conflict_handler(request: Request, exc: SwiftDropException):
    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.exception_handler(VendorProfileNotFoundError)
async def forbidden_handler(request: Request, exc: SwiftDropException):
    return JSONResponse(status_code=403, content={"detail": str(exc)})


# ── Request validation handler ────────────────────────────────────────────────
# FastAPI's default 422 returns `detail: [{loc, msg, type, input}, ...]` —
# the frontend renders that as "[object Object]" or shows nothing useful.
# Translate it into a single, friendly string so users see e.g.
#   "phone: must be at least 7 characters"
# instead of a verbose array.

_FRIENDLY_FIELD_NAMES: dict[str, str] = {
    "full_name":       "Full name",
    "email":           "Email",
    "password":        "Password",
    "phone":           "Phone",
    "role":            "Role",
    "company_name":    "Company name",
    "company_address": "Company address",
    "gst_number":      "GST number",
    "vehicle_type":    "Vehicle type",
    "vehicle_plate":   "Vehicle plate",
    "license_number":  "License number",
}


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors() or []
    if not errors:
        return JSONResponse(
            status_code=422,
            content={"detail": "Invalid request payload."},
        )

    first = errors[0]
    loc = first.get("loc", [])
    # Skip the leading "body" / "query" / "path" segment when present.
    path = [str(p) for p in loc if p not in ("body", "query", "path")]
    field_raw = path[-1] if path else ""
    field = _FRIENDLY_FIELD_NAMES.get(field_raw, field_raw or "field")
    msg = first.get("msg", "is invalid")

    # Pydantic v2 prefixes its messages with "Value error, " — strip that.
    if msg.lower().startswith("value error, "):
        msg = msg[len("value error, "):]

    detail = f"{field}: {msg}" if field else msg
    return JSONResponse(status_code=422, content={"detail": detail})


# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth.router)
# search.router must come BEFORE shipments.router so /api/shipments/search
# is matched before the more general /api/shipments/{shipment_id}.
app.include_router(search.router)
app.include_router(shipments.router)
app.include_router(drivers.router)
app.include_router(reviews.router)
app.include_router(notifications.router)


# ── Health Check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["Meta"], summary="Health check")
async def health():
    return {"status": "ok", "app": settings.APP_NAME}

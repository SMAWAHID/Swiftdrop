# 🚀 SwiftDrop — Real-Time Last-Mile Logistics Platform

A production-ready full-stack logistics platform demonstrating:
- **3NF PostgreSQL schema** with PL/pgSQL triggers and views
- **GoF Design Patterns**: Singleton, Factory, Facade
- **Row-Level Locking** (`SELECT FOR UPDATE NOWAIT`) for concurrency safety
- **FastAPI** layered architecture (Router → Service → DB)
- **React + TypeScript** with custom hooks, protected routes, and optimistic UI

---

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Database  | PostgreSQL 15+                    |
| Backend   | Python 3.12, FastAPI, asyncpg     |
| Frontend  | React 18, TypeScript, Vite, Axios |
| Auth      | JWT (python-jose), bcrypt         |

---

## Project Structure

```
swiftdrop/
├── backend/                   # FastAPI application
│   ├── main.py                # App entrypoint, lifespan, CORS
│   ├── config.py              # Pydantic Settings (env vars)
│   ├── requirements.txt
│   ├── .env.example
│   ├── db/
│   │   ├── connection.py      # ★ Singleton: asyncpg pool
│   │   └── migrations.sql     # DDL: all tables, triggers, view, seed data
│   ├── models/
│   │   └── user.py            # Domain dataclass
│   ├── schemas/
│   │   └── shipment.py        # Pydantic v2 DTOs
│   ├── factories/
│   │   └── shipment_factory.py  # ★ Factory: Standard/Express/Fragile
│   ├── services/
│   │   ├── shipment_service.py  # ★ Facade: ShipmentBookingFacade
│   │   ├── accept_service.py    # ★ SELECT FOR UPDATE NOWAIT
│   │   └── auth_service.py
│   ├── routers/               # Controllers (thin HTTP layer)
│   │   ├── auth.py
│   │   ├── shipments.py
│   │   └── drivers.py
│   └── core/
│       ├── security.py        # JWT, bcrypt, role guards
│       └── exceptions.py      # Domain exception hierarchy
│
└── frontend/                  # React + TypeScript application
    └── src/
        ├── App.tsx            # Router + ProtectedRoute guard
        ├── api/shipmentApi.ts # Axios repository
        ├── context/AuthContext.tsx  # JWT state (useReducer)
        ├── hooks/useShipment.ts     # Data hook + optimistic UI
        ├── types/shipment.ts        # TypeScript interfaces
        ├── components/
        │   ├── OrderCard/     # Shipment card + Accept button
        │   ├── StatusBadge/   # Colour-coded status pill
        │   └── LoadingSpinner/
        └── pages/
            ├── LoginPage/
            ├── DriverDashboard/
            └── VendorDashboard/
```

---

## Setup Instructions

### 1. Database (PostgreSQL)

```bash
# Create database and user
psql -U postgres -c "CREATE USER swiftdrop WITH PASSWORD 'swiftdrop_pass';"
psql -U postgres -c "CREATE DATABASE swiftdrop OWNER swiftdrop;"

# Run the full schema + seed data
psql -U swiftdrop -d swiftdrop -f backend/db/migrations.sql
```

### 2. Backend (FastAPI)

```bash
cd backend

# Copy and configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL and SECRET_KEY

# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API docs available at: http://localhost:8000/docs

### 3. Frontend (React)

```bash
cd frontend

# Install dependencies
npm install

# Copy env (default points to localhost:8000)
cp .env.example .env.local

# Development server
npm run dev

# Production build (verified zero errors)
npm run build
```

App available at: http://localhost:5173

---

## Demo Credentials

| Role   | Email                  | Password      |
|--------|------------------------|---------------|
| Vendor | alice@vendor.com       | Password@123  |
| Driver | bob@driver.com         | Password@123  |
| Driver | carol@driver.com       | Password@123  |
| Admin  | admin@swiftdrop.io     | Password@123  |

---

## Key API Endpoints

| Method | Path                              | Role   | Description                         |
|--------|-----------------------------------|--------|-------------------------------------|
| POST   | /api/auth/login                   | Any    | Authenticate, get JWT               |
| POST   | /api/shipments/book               | VENDOR | Book shipment (Facade pattern)      |
| PUT    | /api/shipments/{id}/accept        | DRIVER | Accept order (Row-level lock)       |
| GET    | /api/shipments?status=PENDING     | Any    | List shipments (role-filtered)      |
| GET    | /api/drivers/dashboard            | ADMIN  | Performance metrics view            |
| PATCH  | /api/drivers/me/availability      | DRIVER | Toggle availability                 |

---

## Architecture Decisions

### Why SELECT FOR UPDATE NOWAIT?
Two drivers can simultaneously tap "Accept" on the same order.
Without a lock, both reads see `status=PENDING` and both writes succeed —
two drivers own one shipment. `FOR UPDATE` acquires an exclusive row lock;
`NOWAIT` returns a 409 immediately instead of blocking the HTTP thread.

### Why Pessimistic over Optimistic Locking?
Only one driver can ever win per shipment. Optimistic locking (version column + retry)
wastes compute on retries that will always fail for the loser. Pessimistic locking
fails fast with a clean user-facing message.

### Why Pydantic v2?
`model_validate()` + `from_attributes=True` are the v2 replacements for
deprecated `from_orm()`. All schemas are validated at import time — no silent failures.

### Why asyncpg over SQLAlchemy ORM?
asyncpg gives direct control over raw SQL and transactions, which is essential
for the `SET LOCAL app.current_user_id` session variable injection used by the
PL/pgSQL audit trigger.

# SwiftDrop — Project Report
**Real-Time Last-Mile Logistics Platform**

---

## 1. Executive Summary

SwiftDrop is a production-ready, full-stack logistics platform built to solve the concurrency and coordination challenges inherent to last-mile delivery operations. The system connects vendors who book shipments with drivers who fulfill them, using a real-time, role-based interface backed by a rigorously engineered API.

The project demonstrates advanced software engineering concepts including Gang-of-Four (GoF) design patterns, database-level concurrency controls, layered architecture, and modern reactive frontend development.

---

## 2. Project Objectives

- Design and implement a robust shipment booking and fulfillment workflow
- Apply GoF design patterns (Singleton, Factory, Facade) in a real production context
- Prevent race conditions in concurrent order acceptance using row-level locking
- Build role-differentiated dashboards for Vendors, Drivers, and Admins
- Maintain 3NF-normalized PostgreSQL schema with auditing triggers

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Database | PostgreSQL 15+ with PL/pgSQL triggers and views |
| Backend | Python 3.12, FastAPI, asyncpg |
| Frontend | React 18, TypeScript, Vite, Axios |
| Authentication | JWT (python-jose), bcrypt |
| Architecture | Layered N-Tier (Router → Service → DB) |

---

## 4. System Architecture

### 4.1 Backend Architecture

The backend follows a strict layered N-Tier pattern:

**Router Layer (Controllers):** Thin HTTP handlers responsible only for parsing requests and serializing responses. They raise domain-specific exceptions rather than HTTP exceptions, keeping business logic out of the transport layer.

**Service Layer (Business Logic):** Contains all domain rules. Key services include:
- `shipment_service.py` — implements the **Facade** pattern via `ShipmentBookingFacade`, abstracting multi-step booking logic into a single interface
- `accept_service.py` — implements **pessimistic row-level locking** (`SELECT FOR UPDATE NOWAIT`) to prevent two drivers from accepting the same order
- `signup_service.py`, `auth_service.py` — handle user lifecycle and JWT authentication
- `notification_service.py`, `review_service.py`, `complete_service.py` — extended feature services

**Data Access Layer:** Raw asyncpg connections with direct SQL control. The database connection pool uses the **Singleton** pattern to ensure a single shared pool across the application lifecycle.

### 4.2 GoF Design Patterns

**Singleton Pattern — DB Connection Pool (`db/connection.py`)**
The asyncpg connection pool is initialized once at application startup via FastAPI's lifespan context and shared globally. This prevents connection exhaustion and ensures consistent database access across all requests.

**Factory Pattern — Shipment Types (`factories/shipment_factory.py`)**
Shipments are created via a factory that produces `Standard`, `Express`, or `Fragile` shipment objects. Each type carries different SLA rules and handling requirements, abstracted away from the caller.

**Facade Pattern — Booking Workflow (`services/shipment_service.py`)**
The `ShipmentBookingFacade` wraps the multi-step booking process (validation → vendor lookup → factory instantiation → DB insert → notification trigger) into a single clean interface for the router.

### 4.3 Concurrency Control

The most critical engineering decision in SwiftDrop is its approach to concurrent order acceptance:

**Problem:** Two drivers can simultaneously view a `PENDING` shipment and both tap "Accept". Without locking, both reads see `status=PENDING` and both writes succeed — two drivers own one shipment.

**Solution:** `SELECT FOR UPDATE NOWAIT` acquires an exclusive row lock on the shipment record. The first driver's transaction wins the lock and updates the status. The second driver's transaction receives a lock contention error immediately and is returned a 409 Conflict response — without blocking the HTTP thread.

**Pessimistic over Optimistic:** Optimistic locking (version column + retry) was rejected because only one driver can ever win per shipment. Retries for the losing driver always fail, wasting compute. Pessimistic locking fails fast with a clean user-facing error.

### 4.4 Frontend Architecture

The React + TypeScript frontend is structured around:

- `AuthContext.tsx` — JWT state management via `useReducer`
- `useShipment.ts` — custom data hook with optimistic UI updates
- `ProtectedRoute` guards in `App.tsx` — role-based route access
- `shipmentApi.ts` — Axios repository for all API communication

Role-specific dashboards (`VendorDashboard`, `DriverDashboard`) render different views and actions depending on the authenticated user's role.

---

## 5. Database Design

The PostgreSQL schema is normalized to 3NF and includes:

- **Users table** — base identity with hashed passwords and roles (VENDOR, DRIVER, ADMIN)
- **Vendor profiles & Driver profiles** — role-specific data separated from the users table
- **Shipments table** — core entity with status enum, timestamps, and FK relationships
- **Reviews & Notifications tables** — extended relational data
- **PL/pgSQL audit trigger** — captures `app.current_user_id` session variable set per-request, enabling per-user change auditing without ORM overhead
- **Dashboard view** — pre-aggregated driver performance metrics consumed by the Admin dashboard

The decision to use asyncpg over SQLAlchemy ORM was deliberate: direct SQL control is necessary for `SET LOCAL app.current_user_id` injection into the session, which the audit trigger reads. An ORM would abstract away this transaction-level control.

---

## 6. API Reference

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | /api/auth/login | Any | Authenticate, receive JWT |
| POST | /api/shipments/book | VENDOR | Book shipment (Facade pattern) |
| PUT | /api/shipments/{id}/accept | DRIVER | Accept order (row-level lock) |
| GET | /api/shipments?status=PENDING | Any | List shipments (role-filtered) |
| GET | /api/drivers/dashboard | ADMIN | Performance metrics view |
| PATCH | /api/drivers/me/availability | DRIVER | Toggle availability status |

Interactive API documentation is auto-generated by FastAPI at `/docs` (Swagger UI) and `/redoc`.

---

## 7. Security Implementation

- **JWT Authentication:** Tokens are issued on login with role claims embedded. Every protected route validates the token and extracts the user role before dispatching to the service layer.
- **Password Hashing:** bcrypt via the `passlib` library. Passwords are never stored in plaintext.
- **Role Guards:** Enforced at the service layer, not just the router, preventing privilege escalation via direct service calls.
- **CORS:** Configurable via environment variable `CORS_ORIGINS`. Production deployments restrict to the known frontend domain.
- **Validation:** Pydantic v2 with `model_validate()` validates all inbound request bodies at import time. A custom `RequestValidationError` handler translates verbose Pydantic errors into user-friendly messages.

---

## 8. Project Structure

```
swiftdrop/
├── backend/
│   ├── main.py              # App entrypoint, lifespan, CORS, exception handlers
│   ├── config.py            # Pydantic Settings (env vars)
│   ├── db/
│   │   ├── connection.py    # Singleton: asyncpg pool
│   │   ├── schema.sql       # DDL: tables, triggers, views
│   │   └── seed.sql         # Demo data
│   ├── factories/
│   │   └── shipment_factory.py  # Factory: Standard/Express/Fragile
│   ├── services/
│   │   ├── shipment_service.py  # Facade: ShipmentBookingFacade
│   │   ├── accept_service.py    # SELECT FOR UPDATE NOWAIT
│   │   ├── auth_service.py
│   │   ├── signup_service.py
│   │   ├── notification_service.py
│   │   ├── review_service.py
│   │   └── complete_service.py
│   ├── routers/
│   │   ├── auth.py
│   │   ├── shipments.py
│   │   ├── drivers.py
│   │   ├── reviews.py
│   │   ├── notifications.py
│   │   └── search.py
│   └── core/
│       ├── security.py      # JWT, bcrypt, role guards
│       └── exceptions.py    # Domain exception hierarchy
└── frontend/
    └── src/
        ├── App.tsx
        ├── api/shipmentApi.ts
        ├── context/AuthContext.tsx
        ├── hooks/useShipment.ts
        ├── types/shipment.ts
        ├── components/
        │   ├── OrderCard/
        │   ├── StatusBadge/
        │   └── LoadingSpinner/
        └── pages/
            ├── LoginPage/
            ├── DriverDashboard/
            └── VendorDashboard/
```

---

## 9. Setup & Deployment

### Database
```bash
psql -U postgres -c "CREATE USER swiftdrop WITH PASSWORD 'swiftdrop_pass';"
psql -U postgres -c "CREATE DATABASE swiftdrop OWNER swiftdrop;"
psql -U swiftdrop -d swiftdrop -f backend/db/schema.sql
psql -U swiftdrop -d swiftdrop -f backend/db/seed.sql
```

### Backend
```bash
cd backend
cp .env.example .env        # Configure DATABASE_URL and SECRET_KEY
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local  # Default: points to localhost:8000
npm run dev                 # Dev server at localhost:5173
npm run build               # Production build (zero errors verified)
```

---

## 10. Demo Credentials

| Role | Email | Password |
|---|---|---|
| Vendor | alice@vendor.com | Password@123 |
| Driver | bob@driver.com | Password@123 |
| Driver | carol@driver.com | Password@123 |
| Admin | admin@swiftdrop.io | Password@123 |

---

## 11. Key Engineering Decisions Summary

| Decision | Rationale |
|---|---|
| asyncpg over SQLAlchemy | Required for SET LOCAL session variable injection used by the audit trigger |
| Pydantic v2 | model_validate() + from_attributes=True replaces deprecated from_orm(); validated at import time |
| Pessimistic locking | Only one driver can win per shipment — optimistic retries always fail for the loser |
| JWT over sessions | Stateless authentication suits horizontally scalable deployments |
| FastAPI over Django/Flask | Native async support, auto-generated OpenAPI docs, Pydantic integration |

---

## 12. Conclusion

SwiftDrop successfully demonstrates that production-grade engineering practices — design patterns, concurrency-safe database operations, layered architecture, and type-safe frontend development — can be cohesively applied in a single, well-scoped project. The platform is deployable as-is and serves as a strong reference implementation for real-time logistics systems.

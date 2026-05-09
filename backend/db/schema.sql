-- ============================================================
-- SwiftDrop :: Database Schema  (schema.sql)
-- Run this file ONCE to create all tables, types, indexes,
-- the audit trigger, and the performance view.
--
-- Normal Form  : Third Normal Form (3NF)
-- Engine       : PostgreSQL 15+
--
-- Usage:
--   psql -U swiftdrop -d swiftdrop -f schema.sql
-- ============================================================

-- Enable pgcrypto for gen_random_uuid() on PostgreSQL < 13
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Enum Types ───────────────────────────────────────────────────────────────
-- Using enums over VARCHAR + CHECK gives type-safety at the
-- PostgreSQL engine level and prevents invalid states at storage.

DO $$ BEGIN
    CREATE TYPE shipment_status AS ENUM (
        'PENDING',
        'ASSIGNED',
        'PICKED_UP',
        'IN_TRANSIT',
        'DELIVERED'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'VENDOR',
        'DRIVER',
        'ADMIN'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── TABLE: users ─────────────────────────────────────────────────────────────
-- 3NF: Stores identity/auth data ONLY.
-- Role-specific columns live in vendors/drivers to avoid
-- transitive dependencies (company_name → user_id is not 3NF here).

CREATE TABLE IF NOT EXISTS users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(150) NOT NULL,
    phone         VARCHAR(30)  NOT NULL,
    role          user_role    NOT NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_email_format CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$')
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- ── TABLE: vendors ───────────────────────────────────────────────────────────
-- 3NF: Business attributes separated from identity.
-- 1-to-1 relationship with users via UNIQUE FK.

CREATE TABLE IF NOT EXISTS vendors (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    company_name    VARCHAR(200) NOT NULL,
    company_address TEXT         NOT NULL,
    gst_number      VARCHAR(50)  UNIQUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── TABLE: drivers ───────────────────────────────────────────────────────────
-- 3NF: Vehicle/license data belongs to driver profile, not users.
-- Placing these in users would cause transitive dependency:
--   user_id → vehicle_plate (not a fact about the user's identity).

CREATE TABLE IF NOT EXISTS drivers (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    vehicle_type      VARCHAR(80)  NOT NULL,
    vehicle_plate     VARCHAR(30)  NOT NULL UNIQUE,
    license_number    VARCHAR(50)  NOT NULL UNIQUE,
    is_available      BOOLEAN      NOT NULL DEFAULT TRUE,
    current_latitude  NUMERIC(10,7),
    current_longitude NUMERIC(10,7),
    rating            NUMERIC(3,2)          DEFAULT 5.00,
    total_deliveries  INTEGER      NOT NULL  DEFAULT 0,
    created_at        TIMESTAMPTZ  NOT NULL  DEFAULT NOW(),

    CONSTRAINT chk_rating    CHECK (rating BETWEEN 1.00 AND 5.00),
    CONSTRAINT chk_total_del CHECK (total_deliveries >= 0)
);

CREATE INDEX IF NOT EXISTS idx_drivers_available ON drivers(is_available);

-- ── TABLE: shipments ─────────────────────────────────────────────────────────
-- References vendor and driver by FK — no denormalization.
--
-- Concurrency note: `status` is the target of
--   SELECT ... FOR UPDATE NOWAIT row-level locking in AcceptShipmentService.

CREATE TABLE IF NOT EXISTS shipments (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id           UUID            NOT NULL REFERENCES vendors(id),
    driver_id           UUID            REFERENCES drivers(id),
    shipment_type       VARCHAR(30)     NOT NULL DEFAULT 'STANDARD',
    status              shipment_status NOT NULL DEFAULT 'PENDING',
    pickup_address      TEXT            NOT NULL,
    pickup_lat          NUMERIC(10,7),
    pickup_lng          NUMERIC(10,7),
    delivery_address    TEXT            NOT NULL,
    delivery_lat        NUMERIC(10,7),
    delivery_lng        NUMERIC(10,7),
    package_weight_kg   NUMERIC(8,3)    NOT NULL,
    package_description VARCHAR(500),
    estimated_fare      NUMERIC(10,2)   NOT NULL,
    final_fare          NUMERIC(10,2),
    notes               TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    accepted_at         TIMESTAMPTZ,
    picked_up_at        TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_weight     CHECK (package_weight_kg > 0),
    CONSTRAINT chk_fare       CHECK (estimated_fare > 0),
    CONSTRAINT chk_final_fare CHECK (final_fare IS NULL OR final_fare > 0),
    CONSTRAINT chk_type       CHECK (shipment_type IN ('STANDARD', 'EXPRESS', 'FRAGILE'))
);

CREATE INDEX IF NOT EXISTS idx_shipments_status    ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_vendor_id ON shipments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_shipments_driver_id ON shipments(driver_id);

-- ── TABLE: shipment_audit_logs ───────────────────────────────────────────────
-- Immutable append-only event log for every status transition.
-- ACID: each INSERT here executes within the same transaction as the
--       UPDATE on shipments (Atomicity guarantee).

CREATE TABLE IF NOT EXISTS shipment_audit_logs (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID            NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    changed_by  UUID            NOT NULL REFERENCES users(id),
    old_status  shipment_status,
    new_status  shipment_status NOT NULL,
    changed_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    ip_address  INET,
    notes       TEXT,

    CONSTRAINT chk_status_changed CHECK (old_status IS DISTINCT FROM new_status)
);

CREATE INDEX IF NOT EXISTS idx_audit_shipment_id ON shipment_audit_logs(shipment_id);
CREATE INDEX IF NOT EXISTS idx_audit_changed_at  ON shipment_audit_logs(changed_at DESC);

-- ── TRIGGER FUNCTION: log_shipment_status_change ─────────────────────────────
-- Pattern  : Observer / Event-Sourcing at the DB layer.
-- Timing   : BEFORE UPDATE — allows modifying NEW.updated_at in the same row.
-- ACID     : Executes within the same transaction as the parent UPDATE.
-- Cohesion : Single responsibility — record a status transition event.
--
-- Session variable injection:
--   The application sets  SET LOCAL app.current_user_id = '<uuid>'
--   before each UPDATE so the trigger can populate `changed_by`
--   without being coupled to application-layer parameters.

CREATE OR REPLACE FUNCTION log_shipment_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Guard: only proceed when status actually changes
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    -- Safely read the session variable; fall back to sentinel UUID
    -- if the application did not inject it (e.g. direct psql edits).
    BEGIN
        v_user_id := current_setting('app.current_user_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_user_id := '00000000-0000-0000-0000-000000000001'::UUID;
    END;

    INSERT INTO shipment_audit_logs (
        shipment_id,
        changed_by,
        old_status,
        new_status,
        changed_at
    ) VALUES (
        NEW.id,
        v_user_id,
        OLD.status,
        NEW.status,
        NOW()
    );

    -- Stamp the row modification time (only valid in BEFORE trigger)
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

-- Drop before recreate to avoid duplicate-trigger error on re-run
DROP TRIGGER IF EXISTS trg_shipment_status_audit ON shipments;

CREATE TRIGGER trg_shipment_status_audit
    BEFORE UPDATE OF status ON shipments
    FOR EACH ROW
    EXECUTE FUNCTION log_shipment_status_change();

-- ── VIEW: driver_performance_dashboard ───────────────────────────────────────
-- Encapsulates complex aggregation behind a stable interface.
-- Application code queries the view; JOIN/aggregation details are hidden
-- (Facade pattern at the SQL layer).
--
-- Aggregation techniques used:
--   COUNT/SUM FILTER (WHERE ...)  — conditional aggregation (PG 9.4+)
--   EXTRACT(EPOCH FROM interval)  — interval → seconds for avg calc
--   NULLIF to prevent division-by-zero in acceptance_rate_pct

CREATE OR REPLACE VIEW driver_performance_dashboard AS
SELECT
    d.id                                                       AS driver_id,
    u.full_name                                                AS driver_name,
    u.phone                                                    AS driver_phone,
    d.vehicle_type,
    d.vehicle_plate,
    d.is_available,
    d.rating,
    d.total_deliveries,

    COUNT(s.id) FILTER (
        WHERE s.status = 'DELIVERED'
          AND DATE_TRUNC('month', s.delivered_at) = DATE_TRUNC('month', NOW())
    )                                                          AS deliveries_this_month,

    ROUND(
        AVG(
            EXTRACT(EPOCH FROM (s.delivered_at - s.accepted_at)) / 60.0
        ) FILTER (WHERE s.status = 'DELIVERED'), 2
    )                                                          AS avg_delivery_minutes,

    COALESCE(
        SUM(s.final_fare) FILTER (WHERE s.status = 'DELIVERED'),
        0.00
    )                                                          AS total_revenue_generated,

    ROUND(
        100.0
        * COUNT(s.id) FILTER (WHERE s.status != 'PENDING')
        / NULLIF(COUNT(s.id), 0),
    1)                                                         AS acceptance_rate_pct,

    MAX(s.delivered_at) FILTER (
        WHERE s.status = 'DELIVERED'
    )                                                          AS last_delivered_at

FROM   drivers   d
INNER  JOIN users      u  ON u.id  = d.user_id
LEFT   JOIN shipments  s  ON s.driver_id = d.id

GROUP BY
    d.id, u.full_name, u.phone,
    d.vehicle_type, d.vehicle_plate,
    d.is_available, d.rating, d.total_deliveries

ORDER BY total_revenue_generated DESC;

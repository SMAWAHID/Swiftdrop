-- ============================================================
-- SwiftDrop :: Combined Improvements + Seed Data  (seed.sql)
-- ============================================================
-- This file is self-contained. It applies every database
-- improvement (1, 2, 3, 5, 6) and then seeds demo data so the
-- whole stack lights up after one psql command.
--
-- Run AFTER schema.sql:
--   psql -U swiftdrop -d swiftdrop -f schema.sql
--   psql -U swiftdrop -d swiftdrop -f seed.sql
--
-- Sections in this file:
--   §1  Improvement 1 — complete_delivery() procedure + state-machine guard
--   §2  Improvement 2 — shipment_reviews + auto-rating trigger chain
--   §3  Improvement 3 — monthly_revenue_summary + partial/composite indexes
--   §5  Improvement 5 — notifications table (Observer pattern store)
--   §6  Improvement 6 — full-text search on addresses (tsvector + GIN)
--   §7  Demo seed     — admin, vendors, drivers, shipments, reviews,
--                       notifications, refresh of materialized view
--
-- All seeded passwords = "Admin@123" (bcrypt cost 12).
-- Safe to re-run.
-- ============================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §1 — Improvement 1: complete_delivery() + state-machine guard           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── A. Status Transition Guard ───────────────────────────────────────────────
-- Raises SQLSTATE 'P0001' on illegal moves. Only valid forward path:
-- PENDING → ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED.

CREATE OR REPLACE FUNCTION validate_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'PENDING'    AND NEW.status = 'ASSIGNED')   OR
        (OLD.status = 'ASSIGNED'   AND NEW.status = 'PICKED_UP')  OR
        (OLD.status = 'PICKED_UP'  AND NEW.status = 'IN_TRANSIT') OR
        (OLD.status = 'IN_TRANSIT' AND NEW.status = 'DELIVERED')
    ) THEN
        RAISE EXCEPTION
            'Invalid status transition: % → %. '
            'Allowed path: PENDING→ASSIGNED→PICKED_UP→IN_TRANSIT→DELIVERED',
            OLD.status, NEW.status
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger named with leading 'a_' so it fires alphabetically BEFORE
-- the audit trigger (trg_shipment_status_audit). PostgreSQL fires
-- BEFORE triggers in alphabetical order.
DROP TRIGGER IF EXISTS trg_validate_status_transition   ON shipments;
DROP TRIGGER IF EXISTS trg_a_validate_status_transition ON shipments;

CREATE TRIGGER trg_a_validate_status_transition
    BEFORE UPDATE OF status ON shipments
    FOR EACH ROW
    EXECUTE FUNCTION validate_status_transition();


-- ── B. complete_delivery() Stored Procedure ──────────────────────────────────
-- CALL complete_delivery('<shipment_uuid>', <final_fare>);
-- Locks the row, validates IN_TRANSIT, sets DELIVERED, stamps timestamps,
-- updates the driver counters — all atomically.

CREATE OR REPLACE PROCEDURE complete_delivery(
    p_shipment_id  UUID,
    p_final_fare   NUMERIC(10,2) DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_shipment  RECORD;
    v_driver_id UUID;
BEGIN
    SELECT id, status, driver_id, estimated_fare
    INTO   v_shipment
    FROM   shipments
    WHERE  id = p_shipment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shipment % not found', p_shipment_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_shipment.status != 'IN_TRANSIT' THEN
        RAISE EXCEPTION
            'Cannot complete delivery: shipment is in state %, expected IN_TRANSIT',
            v_shipment.status
            USING ERRCODE = 'P0001';
    END IF;

    v_driver_id := v_shipment.driver_id;

    UPDATE shipments
    SET    status       = 'DELIVERED',
           delivered_at = NOW(),
           final_fare   = COALESCE(p_final_fare, v_shipment.estimated_fare),
           updated_at   = NOW()
    WHERE  id = p_shipment_id;

    UPDATE drivers
    SET    is_available     = TRUE,
           total_deliveries = total_deliveries + 1
    WHERE  id = v_driver_id;

    RAISE NOTICE 'Delivery completed for shipment %. Driver % marked available.',
        p_shipment_id, v_driver_id;
END;
$$;


-- ── C. Auto-update driver on delivery (safety net) ───────────────────────────
CREATE OR REPLACE FUNCTION sync_driver_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'DELIVERED' AND OLD.status != 'DELIVERED' THEN
        IF NEW.driver_id IS NOT NULL THEN
            UPDATE drivers
            SET    is_available     = TRUE,
                   total_deliveries = total_deliveries + 1
            WHERE  id = NEW.driver_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_driver_on_delivery ON shipments;

CREATE TRIGGER trg_sync_driver_on_delivery
    AFTER UPDATE OF status ON shipments
    FOR EACH ROW
    EXECUTE FUNCTION sync_driver_on_delivery();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §2 — Improvement 2: shipment_reviews (3NF) + trigger chain              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── A. shipment_reviews table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipment_reviews (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID         NOT NULL UNIQUE REFERENCES shipments(id) ON DELETE CASCADE,
    vendor_id   UUID         NOT NULL REFERENCES vendors(id),
    driver_id   UUID         NOT NULL REFERENCES drivers(id),
    rating      SMALLINT     NOT NULL,
    comment     TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_reviews_driver_id ON shipment_reviews(driver_id);
CREATE INDEX IF NOT EXISTS idx_reviews_vendor_id ON shipment_reviews(vendor_id);


-- ── B. BEFORE INSERT validator ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION validate_review()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_shipment RECORD;
BEGIN
    SELECT id, status, vendor_id, driver_id
    INTO   v_shipment
    FROM   shipments
    WHERE  id = NEW.shipment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shipment % not found', NEW.shipment_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_shipment.status <> 'DELIVERED' THEN
        RAISE EXCEPTION
            'Cannot review shipment %: status is %, must be DELIVERED',
            NEW.shipment_id, v_shipment.status
            USING ERRCODE = 'P0001';
    END IF;

    IF v_shipment.vendor_id <> NEW.vendor_id THEN
        RAISE EXCEPTION
            'Vendor % is not the booking vendor for shipment %',
            NEW.vendor_id, NEW.shipment_id
            USING ERRCODE = 'P0001';
    END IF;

    IF v_shipment.driver_id IS DISTINCT FROM NEW.driver_id THEN
        RAISE EXCEPTION
            'Driver % did not deliver shipment %',
            NEW.driver_id, NEW.shipment_id
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_b_validate_review ON shipment_reviews;

CREATE TRIGGER trg_b_validate_review
    BEFORE INSERT ON shipment_reviews
    FOR EACH ROW
    EXECUTE FUNCTION validate_review();


-- ── C. AFTER INSERT auto-rating recompute (chained trigger) ──────────────────
CREATE OR REPLACE FUNCTION recompute_driver_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_avg NUMERIC(3,2);
BEGIN
    SELECT ROUND(AVG(rating)::NUMERIC, 2)
    INTO   v_avg
    FROM   shipment_reviews
    WHERE  driver_id = NEW.driver_id;

    UPDATE drivers
    SET    rating = LEAST(5.00, GREATEST(1.00, v_avg))
    WHERE  id = NEW.driver_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_c_recompute_driver_rating ON shipment_reviews;

CREATE TRIGGER trg_c_recompute_driver_rating
    AFTER INSERT ON shipment_reviews
    FOR EACH ROW
    EXECUTE FUNCTION recompute_driver_rating();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §3 — Improvement 3: materialized view + advanced indexes                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── A. monthly_revenue_summary materialized view ─────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS monthly_revenue_summary;

CREATE MATERIALIZED VIEW monthly_revenue_summary AS
SELECT
    DATE_TRUNC('month', delivered_at) ::DATE          AS month_start,
    shipment_type,
    COUNT(*)                                          AS deliveries_count,
    COALESCE(SUM(final_fare),    0.00)                AS total_revenue,
    COALESCE(AVG(final_fare),    0.00)::NUMERIC(10,2) AS avg_fare,
    COALESCE(SUM(package_weight_kg), 0.000)           AS total_weight_kg
FROM   shipments
WHERE  status = 'DELIVERED'
  AND  delivered_at IS NOT NULL
GROUP  BY DATE_TRUNC('month', delivered_at), shipment_type
ORDER  BY month_start DESC, shipment_type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_revenue_pk
    ON monthly_revenue_summary(month_start, shipment_type);


-- ── B. Partial index — only PENDING rows ─────────────────────────────────────
DROP INDEX IF EXISTS idx_shipments_pending_created_at;

CREATE INDEX idx_shipments_pending_created_at
    ON shipments(created_at DESC)
    WHERE status = 'PENDING';


-- ── C. Composite index — vendor + status ─────────────────────────────────────
DROP INDEX IF EXISTS idx_shipments_vendor_status;

CREATE INDEX idx_shipments_vendor_status
    ON shipments(vendor_id, status);


-- ── D. Refresh helper procedure ──────────────────────────────────────────────
CREATE OR REPLACE PROCEDURE refresh_monthly_revenue()
LANGUAGE plpgsql
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue_summary;
END;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §5 — Improvement 5: notifications table (Observer pattern store)        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS notifications (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type  VARCHAR(80)  NOT NULL,
    payload     JSONB        NOT NULL DEFAULT '{}'::jsonb,
    is_read     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_event_type
    ON notifications(event_type);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §6 — Improvement 6: full-text search on addresses                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE shipments
    ADD COLUMN IF NOT EXISTS addresses_search tsvector;

DROP INDEX IF EXISTS idx_shipments_addresses_fts;

CREATE INDEX idx_shipments_addresses_fts
    ON shipments
    USING GIN (addresses_search);

CREATE OR REPLACE FUNCTION refresh_addresses_search()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.addresses_search :=
        setweight(to_tsvector('simple', COALESCE(NEW.pickup_address,   '')), 'A')
      ||
        setweight(to_tsvector('simple', COALESCE(NEW.delivery_address, '')), 'B');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shipments_fts_refresh ON shipments;

CREATE TRIGGER trg_shipments_fts_refresh
    BEFORE INSERT OR UPDATE OF pickup_address, delivery_address ON shipments
    FOR EACH ROW
    EXECUTE FUNCTION refresh_addresses_search();

-- Backfill addresses_search for any shipments that pre-date this column.
UPDATE shipments
SET    pickup_address = pickup_address
WHERE  addresses_search IS NULL;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §7 — Seed Data                                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ── Cleanup (FK-safe order) ──────────────────────────────────────────────────
DELETE FROM notifications
WHERE user_id IN (SELECT id FROM users WHERE email IN (
    'admin@swiftdrop.io',
    'alice@vendor.com','foodco@vendor.com',
    'bob@driver.com','carol@driver.com','danish@driver.com'
));

DELETE FROM shipment_reviews
WHERE shipment_id IN (
    SELECT id FROM shipments WHERE vendor_id IN (
        SELECT id FROM vendors WHERE user_id IN (
            SELECT id FROM users WHERE email IN (
                'alice@vendor.com','foodco@vendor.com'
            )
        )
    )
);

DELETE FROM shipment_audit_logs
WHERE changed_by IN (SELECT id FROM users WHERE email IN (
    'admin@swiftdrop.io',
    'alice@vendor.com','foodco@vendor.com',
    'bob@driver.com','carol@driver.com','danish@driver.com'
));

DELETE FROM shipments
WHERE vendor_id IN (
    SELECT id FROM vendors WHERE user_id IN (
        SELECT id FROM users WHERE email IN (
            'alice@vendor.com','foodco@vendor.com'
        )
    )
);

DELETE FROM drivers
WHERE user_id IN (SELECT id FROM users WHERE email IN (
    'bob@driver.com','carol@driver.com','danish@driver.com'
));

DELETE FROM vendors
WHERE user_id IN (SELECT id FROM users WHERE email IN (
    'alice@vendor.com','foodco@vendor.com'
));

DELETE FROM users
WHERE email IN (
    'admin@swiftdrop.io',
    'alice@vendor.com','foodco@vendor.com',
    'bob@driver.com','carol@driver.com','danish@driver.com'
);


-- ── Users (all passwords = Admin@123) ────────────────────────────────────────
INSERT INTO users (id, email, password_hash, full_name, phone, role) VALUES
    ('ad000000-0000-0000-0000-000000000001',
     'admin@swiftdrop.io',
     '$2b$12$9iiFXHiAuDpHLU4gezMk7eo4ZdqB01lLiPdBsEwEcFeUhkOf4Ouy.',
     'SwiftDrop Admin', '+921234567890', 'ADMIN'),

    ('11111111-1111-1111-1111-111111111111',
     'alice@vendor.com',
     '$2b$12$9iiFXHiAuDpHLU4gezMk7eo4ZdqB01lLiPdBsEwEcFeUhkOf4Ouy.',
     'Alice Khan', '+923001112233', 'VENDOR'),

    ('22222222-2222-2222-2222-222222222222',
     'foodco@vendor.com',
     '$2b$12$9iiFXHiAuDpHLU4gezMk7eo4ZdqB01lLiPdBsEwEcFeUhkOf4Ouy.',
     'FoodCo Pakistan', '+923005554466', 'VENDOR'),

    ('33333333-3333-3333-3333-333333333333',
     'bob@driver.com',
     '$2b$12$9iiFXHiAuDpHLU4gezMk7eo4ZdqB01lLiPdBsEwEcFeUhkOf4Ouy.',
     'Bob Ali',  '+923011112222', 'DRIVER'),

    ('44444444-4444-4444-4444-444444444444',
     'carol@driver.com',
     '$2b$12$9iiFXHiAuDpHLU4gezMk7eo4ZdqB01lLiPdBsEwEcFeUhkOf4Ouy.',
     'Carol Hussain', '+923022223333', 'DRIVER'),

    ('55555555-5555-5555-5555-555555555555',
     'danish@driver.com',
     '$2b$12$9iiFXHiAuDpHLU4gezMk7eo4ZdqB01lLiPdBsEwEcFeUhkOf4Ouy.',
     'Danish Riaz', '+923033334444', 'DRIVER');


-- ── Vendor profiles ──────────────────────────────────────────────────────────
INSERT INTO vendors (id, user_id, company_name, company_address, gst_number) VALUES
    ('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '11111111-1111-1111-1111-111111111111',
     'Khan Trading Co.',  'Plot 12, SITE Industrial Area, Karachi',
     'GST-1100-KHC'),

    ('aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '22222222-2222-2222-2222-222222222222',
     'FoodCo Pakistan',   'Block 4, Clifton, Karachi',
     'GST-2200-FCP');


-- ── Driver profiles ──────────────────────────────────────────────────────────
INSERT INTO drivers
    (id, user_id, vehicle_type, vehicle_plate, license_number,
     is_available, current_latitude, current_longitude)
VALUES
    ('bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     '33333333-3333-3333-3333-333333333333',
     'Suzuki Bolan Van', 'KHI-1234', 'LIC-KHI-001',
     TRUE, 24.8607, 67.0011),

    ('bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     '44444444-4444-4444-4444-444444444444',
     'Honda CG 125 (bike)', 'KHI-5678', 'LIC-KHI-002',
     TRUE, 24.8138, 67.0299),

    ('bbbb3333-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     '55555555-5555-5555-5555-555555555555',
     'Toyota Hiace', 'KHI-9999', 'LIC-KHI-003',
     TRUE, 24.9056, 67.0822);


-- ── Walk three shipments through the full state machine ─────────────────────
-- Each UPDATE fires:
--   • trg_a_validate_status_transition (BEFORE)
--   • trg_shipment_status_audit        (BEFORE — inserts audit log)
--   • trg_sync_driver_on_delivery      (AFTER — only on DELIVERED)

-- Shipment #1 — Bob delivered for Khan Trading 5 days ago
SELECT set_config('app.current_user_id', '11111111-1111-1111-1111-111111111111', TRUE);

INSERT INTO shipments
    (id, vendor_id, shipment_type, status,
     pickup_address, delivery_address,
     package_weight_kg, package_description,
     estimated_fare, created_at)
VALUES
    ('cccc1111-cccc-cccc-cccc-cccccccccccc',
     'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'STANDARD', 'PENDING',
     'SITE Industrial Area, Karachi',
     'DHA Phase 6, Karachi',
     12.500, 'Pallet of textile rolls',
     1000.00, NOW() - INTERVAL '5 days');

SELECT set_config('app.current_user_id', '33333333-3333-3333-3333-333333333333', TRUE);
UPDATE shipments
SET status='ASSIGNED', driver_id='bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    accepted_at = NOW() - INTERVAL '5 days' + INTERVAL '10 minutes'
WHERE id = 'cccc1111-cccc-cccc-cccc-cccccccccccc';

UPDATE shipments
SET status='PICKED_UP',
    picked_up_at = NOW() - INTERVAL '5 days' + INTERVAL '40 minutes'
WHERE id = 'cccc1111-cccc-cccc-cccc-cccccccccccc';

UPDATE shipments
SET status='IN_TRANSIT'
WHERE id = 'cccc1111-cccc-cccc-cccc-cccccccccccc';

UPDATE shipments
SET status='DELIVERED', final_fare=1050.00,
    delivered_at = NOW() - INTERVAL '5 days' + INTERVAL '90 minutes'
WHERE id = 'cccc1111-cccc-cccc-cccc-cccccccccccc';


-- Shipment #2 — Carol delivered EXPRESS for FoodCo 3 days ago
SELECT set_config('app.current_user_id', '22222222-2222-2222-2222-222222222222', TRUE);

INSERT INTO shipments
    (id, vendor_id, shipment_type, status,
     pickup_address, delivery_address,
     package_weight_kg, package_description,
     estimated_fare, created_at)
VALUES
    ('cccc2222-cccc-cccc-cccc-cccccccccccc',
     'aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'EXPRESS', 'PENDING',
     'Clifton Block 4, Karachi',
     'Gulshan-e-Iqbal Block 6, Karachi',
     3.250, 'Refrigerated meal kits',
     750.00, NOW() - INTERVAL '3 days');

SELECT set_config('app.current_user_id', '44444444-4444-4444-4444-444444444444', TRUE);
UPDATE shipments
SET status='ASSIGNED', driver_id='bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    accepted_at = NOW() - INTERVAL '3 days' + INTERVAL '5 minutes'
WHERE id = 'cccc2222-cccc-cccc-cccc-cccccccccccc';

UPDATE shipments
SET status='PICKED_UP',
    picked_up_at = NOW() - INTERVAL '3 days' + INTERVAL '20 minutes'
WHERE id = 'cccc2222-cccc-cccc-cccc-cccccccccccc';

UPDATE shipments
SET status='IN_TRANSIT'
WHERE id = 'cccc2222-cccc-cccc-cccc-cccccccccccc';

UPDATE shipments
SET status='DELIVERED', final_fare=780.00,
    delivered_at = NOW() - INTERVAL '3 days' + INTERVAL '55 minutes'
WHERE id = 'cccc2222-cccc-cccc-cccc-cccccccccccc';


-- Shipment #3 — Danish delivered FRAGILE for Khan Trading yesterday
SELECT set_config('app.current_user_id', '11111111-1111-1111-1111-111111111111', TRUE);

INSERT INTO shipments
    (id, vendor_id, shipment_type, status,
     pickup_address, delivery_address,
     package_weight_kg, package_description,
     estimated_fare, created_at)
VALUES
    ('cccc3333-cccc-cccc-cccc-cccccccccccc',
     'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'FRAGILE', 'PENDING',
     'SITE Industrial Area, Karachi',
     'Bahadurabad, Karachi',
     8.000, 'Glassware crate — handle with care',
     1500.00, NOW() - INTERVAL '1 days');

SELECT set_config('app.current_user_id', '55555555-5555-5555-5555-555555555555', TRUE);
UPDATE shipments
SET status='ASSIGNED', driver_id='bbbb3333-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    accepted_at = NOW() - INTERVAL '1 days' + INTERVAL '8 minutes'
WHERE id = 'cccc3333-cccc-cccc-cccc-cccccccccccc';

UPDATE shipments
SET status='PICKED_UP',
    picked_up_at = NOW() - INTERVAL '1 days' + INTERVAL '35 minutes'
WHERE id = 'cccc3333-cccc-cccc-cccc-cccccccccccc';

UPDATE shipments
SET status='IN_TRANSIT'
WHERE id = 'cccc3333-cccc-cccc-cccc-cccccccccccc';

UPDATE shipments
SET status='DELIVERED', final_fare=1525.00,
    delivered_at = NOW() - INTERVAL '1 days' + INTERVAL '110 minutes'
WHERE id = 'cccc3333-cccc-cccc-cccc-cccccccccccc';


-- ── Reviews (auto-recompute driver ratings via trg_c_recompute_driver_rating)
INSERT INTO shipment_reviews (shipment_id, vendor_id, driver_id, rating, comment) VALUES
    ('cccc1111-cccc-cccc-cccc-cccccccccccc',
     'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     5, 'Bob was on time and professional.'),

    ('cccc2222-cccc-cccc-cccc-cccccccccccc',
     'aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     4, 'Carol kept the meal kits cold the whole way — minor delay.'),

    ('cccc3333-cccc-cccc-cccc-cccccccccccc',
     'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'bbbb3333-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     5, 'Glassware arrived intact. Excellent handling.');


-- ── A fresh PENDING shipment so the driver dashboard isn't empty ────────────
SELECT set_config('app.current_user_id', '22222222-2222-2222-2222-222222222222', TRUE);

INSERT INTO shipments
    (id, vendor_id, shipment_type, status,
     pickup_address, delivery_address,
     package_weight_kg, package_description,
     estimated_fare, created_at)
VALUES
    ('cccc4444-cccc-cccc-cccc-cccccccccccc',
     'aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'STANDARD', 'PENDING',
     'Clifton Block 4, Karachi',
     'North Nazimabad, Karachi',
     5.500, 'Bulk grocery order',
     500.00, NOW() - INTERVAL '5 minutes');


-- ── Sample notifications (Observer pattern, Improvement 5) ──────────────────
INSERT INTO notifications (user_id, event_type, payload, is_read) VALUES
    ('33333333-3333-3333-3333-333333333333',
     'shipment.created',
     '{"shipment_id":"cccc4444-cccc-cccc-cccc-cccccccccccc","message":"New PENDING shipment available."}',
     FALSE),

    ('11111111-1111-1111-1111-111111111111',
     'shipment.delivered',
     '{"shipment_id":"cccc1111-cccc-cccc-cccc-cccccccccccc","message":"Your shipment has been delivered."}',
     TRUE);


COMMIT;


-- ── Refresh the materialized view OUTSIDE the transaction ───────────────────
REFRESH MATERIALIZED VIEW monthly_revenue_summary;


-- ── Verification ─────────────────────────────────────────────────────────────
SELECT 'Improvements + seed applied. Login: any seeded user, password = Admin@123.' AS info;
SELECT email, role, is_active FROM users ORDER BY role, email;
SELECT COUNT(*) AS shipments_seeded, SUM(final_fare) AS total_revenue
FROM   shipments WHERE status = 'DELIVERED';
SELECT vehicle_plate, rating, total_deliveries, is_available FROM drivers ORDER BY vehicle_plate;

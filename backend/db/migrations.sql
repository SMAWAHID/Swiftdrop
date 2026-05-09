-- ============================================================
-- SwiftDrop :: migrations.sql — Convenience wrapper
--
-- Runs schema.sql then seed.sql.
-- seed.sql is now self-contained and applies every improvement
-- (1, 2, 3, 5, 6) before inserting demo data.
--
-- Usage (from any directory):
--   psql -U swiftdrop -d swiftdrop -f backend/db/migrations.sql
--
-- \ir = "include relative" — paths are resolved relative to THIS
-- script's location, so the file works no matter where psql is
-- invoked from.
-- ============================================================

\ir schema.sql
\ir seed.sql

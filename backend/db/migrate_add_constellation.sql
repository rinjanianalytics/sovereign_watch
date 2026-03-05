-- Migration: Add constellation column to satellites table
-- Run this against existing databases that were initialized before this column was added.
-- Safe to run multiple times (uses IF NOT EXISTS / IF NOT EXISTS guards).
--
-- Usage:
--   docker compose exec sovereign-timescaledb psql -U sovereign -d sovereign_watch -f /docker-entrypoint-initdb.d/migrate_add_constellation.sql
-- Or from host:
--   psql $DATABASE_URL -f backend/db/migrate_add_constellation.sql

ALTER TABLE satellites ADD COLUMN IF NOT EXISTS constellation TEXT;

CREATE INDEX IF NOT EXISTS ix_satellites_constellation ON satellites (constellation);

-- Existing rows will have constellation = NULL until the next ingestion cycle
-- backfills them automatically (orbital_pulse re-publishes all satellites every 6h).

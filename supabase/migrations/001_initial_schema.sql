-- ============================================================================
-- WINRAH - Shoe Warehouse Management System
-- Migration 001: Initial Schema & Indexes
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enums
CREATE TYPE entity_status AS ENUM ('active', 'archived');
CREATE TYPE sync_status AS ENUM ('synced', 'pending', 'conflict');
CREATE TYPE audit_action AS ENUM (
  'create',
  'update',
  'archive',
  'restore',
  'assign',
  'unassign',
  'transfer'
);
CREATE TYPE sync_direction AS ENUM ('push', 'pull', 'bidirectional', 'device_to_device');

-- 1. Warehouse
CREATE TABLE warehouse (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  status      entity_status NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  version     INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT warehouse_name_not_empty CHECK (char_length(trim(name)) > 0)
);

-- 2. Area
CREATE TABLE area (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id  UUID NOT NULL REFERENCES warehouse(id) ON DELETE RESTRICT,
  name          TEXT NOT NULL,
  status        entity_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  version       INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT area_name_not_empty CHECK (char_length(trim(name)) > 0)
);

-- 3. Section
CREATE TABLE section (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id     UUID NOT NULL REFERENCES area(id) ON DELETE RESTRICT,
  name        TEXT NOT NULL,
  capacity    TEXT,
  status      entity_status NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  version     INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT section_name_not_empty CHECK (char_length(trim(name)) > 0)
);

-- 4. Device
CREATE TABLE device (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT,
  platform            TEXT,
  active_warehouse_id UUID REFERENCES warehouse(id) ON DELETE SET NULL,
  pin_hash            TEXT,
  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  version             INTEGER NOT NULL DEFAULT 1
);

-- 5. Model (Shoe Model)
-- NOTE: reference_code is NOT unique. Duplicates are explicitly permitted per BRD FR-4.7
CREATE TABLE model (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id    UUID NOT NULL REFERENCES warehouse(id) ON DELETE RESTRICT,
  reference_code  TEXT NOT NULL,
  name            TEXT,
  size_range      TEXT,
  price           NUMERIC(10,2),
  photo_url       TEXT,
  status          entity_status NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  version         INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT model_reference_not_empty CHECK (char_length(trim(reference_code)) > 0)
);

COMMENT ON COLUMN model.reference_code IS
  'The short alphanumeric code staff search. NOT unique — duplicates are expected (FR-4.7). Disambiguation is automatic in UI via section + created_at + display index (FR-4.8).';

-- 6. Model_Section (Presence-only junction table - no quantity)
CREATE TABLE model_section (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id    UUID NOT NULL REFERENCES model(id) ON DELETE CASCADE,
  section_id  UUID NOT NULL REFERENCES section(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  version     INTEGER NOT NULL DEFAULT 1,

  UNIQUE (model_id, section_id)
);

COMMENT ON TABLE model_section IS
  'Presence-only assignment. A row means the model exists somewhere in that section. No qty column — the app tracks WHERE, not HOW MANY (BRD §1).';

-- 7. Transfer_Log (Immutable transfer record)
CREATE TABLE transfer_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id          UUID NOT NULL REFERENCES model(id) ON DELETE RESTRICT,
  from_section_id   UUID NOT NULL REFERENCES section(id) ON DELETE RESTRICT,
  to_section_id     UUID NOT NULL REFERENCES section(id) ON DELETE RESTRICT,
  device_id         UUID NOT NULL REFERENCES device(id) ON DELETE RESTRICT,
  performed_by      TEXT,
  sync_status       sync_status NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT transfer_different_sections CHECK (from_section_id <> to_section_id)
);

-- 8. Sync_Log
CREATE TABLE sync_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       UUID NOT NULL REFERENCES device(id) ON DELETE RESTRICT,
  direction       sync_direction NOT NULL,
  records_pushed  INTEGER NOT NULL DEFAULT 0,
  records_pulled  INTEGER NOT NULL DEFAULT 0,
  conflicts       INTEGER NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  error_message   TEXT
);

-- 9. Search_Log (Analytics & Zero-result audit)
CREATE TABLE search_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       UUID NOT NULL REFERENCES device(id) ON DELETE RESTRICT,
  warehouse_id    UUID REFERENCES warehouse(id) ON DELETE SET NULL,
  query_text      TEXT NOT NULL,
  filters         JSONB,
  result_count    INTEGER NOT NULL DEFAULT 0,
  is_everywhere   BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Audit_Log
CREATE TABLE audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id     UUID NOT NULL REFERENCES device(id) ON DELETE RESTRICT,
  entity_type   TEXT NOT NULL,
  entity_id     UUID NOT NULL,
  action        audit_action NOT NULL,
  changes       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Sync_Queue (Server-side conflict staging)
CREATE TABLE sync_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       UUID NOT NULL REFERENCES device(id) ON DELETE RESTRICT,
  entity_type     TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  payload         JSONB NOT NULL,
  server_version  INTEGER NOT NULL,
  device_version  INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Fast prefix/partial search on reference_code
CREATE INDEX idx_model_reference_code      ON model (reference_code);
CREATE INDEX idx_model_reference_code_trgm ON model USING gin (reference_code gin_trgm_ops);
CREATE INDEX idx_model_warehouse_id        ON model (warehouse_id);
CREATE INDEX idx_model_warehouse_ref       ON model (warehouse_id, reference_code);

-- Hierarchy Lookups
CREATE INDEX idx_area_warehouse_id         ON area (warehouse_id);
CREATE INDEX idx_section_area_id           ON section (area_id);

-- Presence Lookups
CREATE INDEX idx_model_section_model        ON model_section (model_id);
CREATE INDEX idx_model_section_section      ON model_section (section_id);

-- Transfer History
CREATE INDEX idx_transfer_log_model         ON transfer_log (model_id, created_at DESC);
CREATE INDEX idx_transfer_log_sync          ON transfer_log (sync_status) WHERE sync_status <> 'synced';

-- Analytics & Zero-Result Searches
CREATE INDEX idx_search_log_warehouse       ON search_log (warehouse_id, created_at DESC);
CREATE INDEX idx_search_log_query           ON search_log USING gin (query_text gin_trgm_ops);
CREATE INDEX idx_search_log_zero            ON search_log (warehouse_id, created_at DESC) WHERE result_count = 0;

-- Audit & Queue
CREATE INDEX idx_audit_log_entity           ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_sync_queue_pending         ON sync_queue (status, device_id) WHERE status = 'pending';

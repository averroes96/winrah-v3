-- ============================================================================
-- WINRAH - Shoe Warehouse Management System
-- Migration 002: Row Level Security (RLS) Policies
-- ============================================================================

-- Helper: extract device_id from authenticated JWT claims
CREATE OR REPLACE FUNCTION auth_device_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'device_id')::uuid;
$$;

-- ----------------------------------------------------------------------------
-- 1. MUTABLE ENTITIES: warehouse, area, section, model, model_section, device
-- Rules: All authenticated devices have SELECT, INSERT, UPDATE. Hard DELETE blocked.
-- ----------------------------------------------------------------------------

-- Warehouse
ALTER TABLE warehouse ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth devices select warehouse" ON warehouse FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth devices insert warehouse" ON warehouse FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth devices update warehouse" ON warehouse FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Block delete warehouse" ON warehouse FOR DELETE USING (false);

-- Area
ALTER TABLE area ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth devices select area" ON area FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth devices insert area" ON area FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth devices update area" ON area FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Block delete area" ON area FOR DELETE USING (false);

-- Section
ALTER TABLE section ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth devices select section" ON section FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth devices insert section" ON section FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth devices update section" ON section FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Block delete section" ON section FOR DELETE USING (false);

-- Model
ALTER TABLE model ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth devices select model" ON model FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth devices insert model" ON model FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth devices update model" ON model FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Block delete model" ON model FOR DELETE USING (false);

-- Model_Section
ALTER TABLE model_section ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth devices select model_section" ON model_section FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth devices insert model_section" ON model_section FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth devices update model_section" ON model_section FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
-- Allow unassigning / removing model from a section:
CREATE POLICY "Auth devices delete model_section" ON model_section FOR DELETE USING (auth.role() = 'authenticated');

-- Device
ALTER TABLE device ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth devices select device" ON device FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth devices insert device" ON device FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth devices update device" ON device FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Block delete device" ON device FOR DELETE USING (false);

-- ----------------------------------------------------------------------------
-- 2. APPEND-ONLY TABLES: transfer_log, search_log, audit_log, sync_log
-- Rules: SELECT allowed. INSERT restricted to own device_id. UPDATE/DELETE blocked.
-- ----------------------------------------------------------------------------

-- Transfer_Log
ALTER TABLE transfer_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth devices select transfer_log" ON transfer_log FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth devices insert own transfer_log" ON transfer_log FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND device_id = auth_device_id()
);

-- Search_Log
ALTER TABLE search_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth devices select search_log" ON search_log FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth devices insert own search_log" ON search_log FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND device_id = auth_device_id()
);

-- Audit_Log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth devices select audit_log" ON audit_log FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth devices insert own audit_log" ON audit_log FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND device_id = auth_device_id()
);

-- Sync_Log
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth devices select sync_log" ON sync_log FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth devices insert own sync_log" ON sync_log FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND device_id = auth_device_id()
);

-- ----------------------------------------------------------------------------
-- 3. SYNC QUEUE (Server-side conflict staging)
-- Rules: Device can read own pending conflicts. Direct write blocked for clients.
-- ----------------------------------------------------------------------------
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Devices read own conflicts" ON sync_queue FOR SELECT USING (
  auth.role() = 'authenticated' AND device_id = auth_device_id()
);
CREATE POLICY "Block client insert sync_queue" ON sync_queue FOR INSERT WITH CHECK (false);
CREATE POLICY "Block client update sync_queue" ON sync_queue FOR UPDATE USING (false);
CREATE POLICY "Block client delete sync_queue" ON sync_queue FOR DELETE USING (false);

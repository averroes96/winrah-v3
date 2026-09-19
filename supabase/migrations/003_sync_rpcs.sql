-- ============================================================================
-- WINRAH - Shoe Warehouse Management System
-- Migration 003: Version-Vector Sync RPCs
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. sync_push
-- Pushes locally modified rows with versions. Automatically detects conflicts.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_push(
  p_device_id UUID,
  p_changes   JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_change      JSONB;
  v_results     JSONB := '[]'::jsonb;
  v_server_row  RECORD;
  v_table       TEXT;
  v_entity_id   UUID;
  v_dev_version INTEGER;
BEGIN
  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes)
  LOOP
    v_table       := v_change ->> 'table';
    v_entity_id   := (v_change ->> 'id')::uuid;
    v_dev_version := (v_change ->> 'version')::integer;

    -- Look up current server record
    EXECUTE format(
      'SELECT version, updated_at FROM %I WHERE id = $1',
      v_table
    ) INTO v_server_row USING v_entity_id;

    IF v_server_row IS NULL THEN
      -- Fresh insert from client
      EXECUTE format(
        'INSERT INTO %I SELECT * FROM jsonb_populate_record(null::%I, $1)',
        v_table, v_table
      ) USING v_change -> 'payload';

      v_results := v_results || jsonb_build_object(
        'id', v_entity_id, 'table', v_table, 'status', 'inserted', 'server_version', 1
      );

    ELSIF v_dev_version >= v_server_row.version THEN
      -- In-sync update: bump version & updated_at
      EXECUTE format(
        'UPDATE %I SET version = version + 1, updated_at = now() WHERE id = $1',
        v_table
      ) USING v_entity_id;

      v_results := v_results || jsonb_build_object(
        'id', v_entity_id, 'table', v_table, 'status', 'applied', 'server_version', v_server_row.version + 1
      );

    ELSE
      -- Conflict: device version is older than server version
      INSERT INTO sync_queue (
        device_id, entity_type, entity_id, payload, server_version, device_version
      )
      VALUES (
        p_device_id, v_table, v_entity_id, v_change -> 'payload', v_server_row.version, v_dev_version
      );

      v_results := v_results || jsonb_build_object(
        'id', v_entity_id, 'table', v_table, 'status', 'conflict', 'server_version', v_server_row.version
      );
    END IF;
  END LOOP;

  -- Record push operation in sync_log
  INSERT INTO sync_log (device_id, direction, records_pushed, conflicts)
  VALUES (
    p_device_id,
    'push',
    jsonb_array_length(p_changes),
    (SELECT count(*) FROM jsonb_array_elements(v_results) r WHERE r ->> 'status' = 'conflict')::integer
  );

  RETURN v_results;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. sync_pull
-- Pulls changes modified after device's high-water mark timestamp per table.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_pull(
  p_device_id UUID,
  p_hwm       JSONB -- e.g. {"warehouse": "2026-01-01T00:00:00Z", "model": "..."}
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table   TEXT;
  v_since   TIMESTAMPTZ;
  v_rows    JSONB;
  v_result  JSONB := '{}'::jsonb;
BEGIN
  FOR v_table, v_since IN SELECT * FROM jsonb_each_text(p_hwm)
  LOOP
    EXECUTE format(
      'SELECT coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM %I t WHERE updated_at > $1',
      v_table
    ) INTO v_rows USING v_since;

    v_result := v_result || jsonb_build_object(v_table, v_rows);
  END LOOP;

  -- Update device last synced timestamp
  UPDATE device SET last_synced_at = now() WHERE id = p_device_id;

  -- Record pull in sync_log
  INSERT INTO sync_log (device_id, direction, records_pulled)
  VALUES (p_device_id, 'pull', (
    SELECT sum(jsonb_array_length(v)) FROM jsonb_each(v_result) AS x(k, v)
  )::integer);

  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. resolve_conflict
-- Resolves conflict staged in sync_queue with manual operator choice
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_conflict(
  p_device_id       UUID,
  p_sync_queue_id   UUID,
  p_resolution      TEXT,  -- 'accept_server' | 'accept_device' | 'merge'
  p_merged_payload  JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conflict RECORD;
BEGIN
  SELECT * INTO v_conflict FROM sync_queue
  WHERE id = p_sync_queue_id AND device_id = p_device_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conflict not found or already resolved';
  END IF;

  IF p_resolution = 'accept_device' THEN
    EXECUTE format(
      'UPDATE %I SET version = version + 1, updated_at = now() WHERE id = $1',
      v_conflict.entity_type
    ) USING v_conflict.entity_id;
  ELSIF p_resolution = 'merge' AND p_merged_payload IS NOT NULL THEN
    EXECUTE format(
      'UPDATE %I SET version = version + 1, updated_at = now() WHERE id = $1',
      v_conflict.entity_type
    ) USING v_conflict.entity_id;
  END IF;

  UPDATE sync_queue
  SET status = 'resolved', resolved_at = now()
  WHERE id = p_sync_queue_id;

  INSERT INTO audit_log (device_id, entity_type, entity_id, action, changes)
  VALUES (
    p_device_id, v_conflict.entity_type, v_conflict.entity_id, 'update',
    jsonb_build_object('conflict_resolution', p_resolution, 'sync_queue_id', p_sync_queue_id)
  );
END;
$$;

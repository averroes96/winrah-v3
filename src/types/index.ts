// ============================================================================
// WINRAH - Shoe Warehouse Management System
// TypeScript Domain Types & Interfaces
// Corresponds to Technical Design Document §4
// ============================================================================

export type EntityStatus = 'active' | 'archived';
export type SyncStatus = 'synced' | 'pending' | 'conflict';
export type AuditAction = 'create' | 'update' | 'archive' | 'restore' | 'assign' | 'unassign' | 'transfer';
export type SyncDirection = 'push' | 'pull' | 'bidirectional' | 'device_to_device';

// Local metadata tracked per-record for offline-first sync
export interface LocalMeta {
  is_dirty?: boolean;
  local_sync_status?: SyncStatus;
  last_synced_version?: number;
}

// 1. Warehouse
export interface Warehouse extends LocalMeta {
  id: string;
  name: string;
  status: EntityStatus;
  created_at: string;
  updated_at: string;
  version: number;
}

// 2. Area
export interface Area extends LocalMeta {
  id: string;
  warehouse_id: string;
  name: string;
  status: EntityStatus;
  created_at: string;
  updated_at: string;
  version: number;
}

// 3. Section
export interface Section extends LocalMeta {
  id: string;
  area_id: string;
  name: string;
  capacity?: string | null;
  status: EntityStatus;
  created_at: string;
  updated_at: string;
  version: number;
}

// 4. Device
export interface Device extends LocalMeta {
  id: string;
  name: string;
  platform: 'ios' | 'android' | 'web';
  active_warehouse_id?: string | null;
  pin_hash?: string | null;
  last_synced_at?: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

// 5. Model (Shoe Model)
// NOTE: reference_code is NOT unique. Multiple records can share the same reference code (FR-4.7).
export interface ShoeModel extends LocalMeta {
  id: string;
  warehouse_id: string;
  reference_code: string;
  name?: string | null;
  size_range?: string | null;
  price?: number | null;
  photo_url?: string | null;
  status: EntityStatus;
  created_at: string;
  updated_at: string;
  version: number;
}

// 6. Model_Section (Presence-only junction table - no quantity)
export interface ModelSection extends LocalMeta {
  id: string;
  model_id: string;
  section_id: string;
  assigned_at: string;
  updated_at: string;
  version: number;
}

// 7. Transfer_Log (Immutable transfer record)
export interface TransferLog {
  id: string;
  model_id: string;
  from_section_id: string;
  to_section_id: string;
  device_id: string;
  performed_by?: string | null;
  sync_status: SyncStatus;
  created_at: string;
}

// 8. Sync_Log
export interface SyncLog {
  id: string;
  device_id: string;
  direction: SyncDirection;
  records_pushed: number;
  records_pulled: number;
  conflicts: number;
  started_at: string;
  completed_at?: string | null;
  error_message?: string | null;
}

// 9. Search_Log (Analytics)
export interface SearchLog {
  id: string;
  device_id: string;
  warehouse_id?: string | null;
  query_text: string;
  filters?: Record<string, any> | null;
  result_count: number;
  is_everywhere: boolean;
  sync_status?: 'pending' | 'synced';
  created_at: string;
}

// 10. Audit_Log
export interface AuditLog {
  id: string;
  device_id: string;
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  changes?: Record<string, any> | null;
  sync_status?: 'pending' | 'synced';
  created_at: string;
}

// 11. Sync_Queue (Server-side & local conflict staging)
export interface SyncQueueItem {
  id: string;
  device_id: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, any>;
  server_version: number;
  device_version: number;
  status: 'pending' | 'resolved' | 'discarded';
  resolved_at?: string | null;
  created_at: string;
}

// Augmented Model Result for Disambiguation & Search Display (FR-4.8)
export interface DisambiguatedModelResult {
  model: ShoeModel;
  displayIndex: number; // e.g. 1 for "HS-21 (1)", 2 for "HS-21 (2)"
  totalEntriesWithCode: number;
  sections: Array<{
    section: Section;
    area: Area;
    warehouse: Warehouse;
    assigned_at: string;
  }>;
}

// Pairing QR Payload for Device-to-Device Data Exchange (FR-7.4)
export interface PairingQrPayload {
  type: 'sw_pair';
  device_id: string;
  device_name: string;
  pairing_code: string;
  created_at: string;
  protocol_version: number;
}

// Changeset for Device-to-Device or Push
export interface DeviceChangeset {
  from_device_id: string;
  exported_at: string;
  tables: {
    warehouses: Warehouse[];
    areas: Area[];
    sections: Section[];
    models: ShoeModel[];
    model_sections: ModelSection[];
    transfers: TransferLog[];
    search_logs: SearchLog[];
    audit_logs: AuditLog[];
  };
}

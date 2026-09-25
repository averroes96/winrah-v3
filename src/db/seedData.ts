// ============================================================================
// WINRAH - Database Initialization & Clean Reset
// Guarantees clean BASE warehouse creation without mock/sample data
// ============================================================================

import { db } from './indexedDb';
import { Warehouse, Device } from '../types';

export async function initBaseWarehouse(): Promise<void> {
  await db.clearAll();

  // Create only the single auto BASE warehouse on first login / clean reset
  const baseWarehouse: Warehouse = {
    id: 'wh-base',
    name: 'BASE',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  };
  await db.bulkPut('warehouses', [baseWarehouse]);

  // Save default local device
  const defaultDevice: Device = {
    id: 'dev-local-01',
    name: 'Terminal Mobile',
    platform: 'web',
    active_warehouse_id: 'wh-base',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    last_synced_at: null,
  };
  await db.bulkPut('devices', [defaultDevice]);

  // Set active warehouse in localStorage
  localStorage.setItem('winrah_active_warehouse_id', 'wh-base');
  localStorage.setItem('winrah_device_id', 'dev-local-01');
  localStorage.removeItem('winrah_last_synced_at');

  // Notify subscribers once initialized
  db.notify();
}

export const seedDemoData = initBaseWarehouse;

// ============================================================================
// WINRAH - Offline-First Version-Vector Sync Engine
// Implements TDD §7 & BRD §6.7 (push, pull, conflict staging, simulation & live Supabase)
// ============================================================================

import { db } from '../db/indexedDb';
import { SyncQueueItem, DeviceChangeset } from '../types';
import {
  isAppwriteConfigured,
  pushRecordsToAppwrite,
  pullRecordsFromAppwrite,
  SyncProgressCallback,
} from './appwriteClient';

export interface SyncEngineStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  pendingChangesCount: number;
  conflictCount: number;
  mode: 'simulator' | 'appwrite';
}

class SyncEngine {
  private isOnlineState = navigator.onLine;
  private isSyncing = false;
  private listeners: Set<(status: SyncEngineStatus) => void> = new Set();
  private simulatedServerDb: Map<string, any> = new Map();

  constructor() {
    window.addEventListener('online', () => this.handleNetworkChange(true));
    window.addEventListener('offline', () => this.handleNetworkChange(false));
  }

  private handleNetworkChange(online: boolean) {
    this.isOnlineState = online;
    this.notify();
    if (online) {
      this.syncNow();
    }
  }

  // Toggle simulated offline mode for local testing
  setSimulatedOffline(isOffline: boolean) {
    this.isOnlineState = !isOffline;
    this.notify();
    if (this.isOnlineState) {
      this.syncNow();
    }
  }

  subscribe(listener: (status: SyncEngineStatus) => void): () => void {
    this.listeners.add(listener);
    this.getStatus().then(listener);
    return () => this.listeners.delete(listener);
  }

  private async notify() {
    const status = await this.getStatus();
    this.listeners.forEach((fn) => {
      try {
        fn(status);
      } catch (err) {
        console.error(err);
      }
    });
  }

  async getStatus(): Promise<SyncEngineStatus> {
    const dirty = await db.getDirtyRecords();
    const pendingCount =
      dirty.warehouses.length +
      dirty.areas.length +
      dirty.sections.length +
      dirty.models.length +
      dirty.model_sections.length +
      dirty.transfers.length;

    const conflicts = await db.getAll<SyncQueueItem>('sync_queue');
    const activeConflicts = conflicts.filter((c) => c.status === 'pending');

    const lastSynced = localStorage.getItem('winrah_last_synced_at');

    return {
      isOnline: this.isOnlineState,
      isSyncing: this.isSyncing,
      lastSyncedAt: lastSynced,
      pendingChangesCount: pendingCount,
      conflictCount: activeConflicts.length,
      mode: isAppwriteConfigured() ? 'appwrite' : 'simulator',
    };
  }

  // Main Sync Execution: PUSH dirty changes, then PULL updates
  async syncNow(onProgress?: SyncProgressCallback): Promise<{ pushed: number; pulled: number; conflicts: number }> {
    if (!this.isOnlineState || this.isSyncing) {
      return { pushed: 0, pulled: 0, conflicts: 0 };
    }

    this.isSyncing = true;
    this.notify();

    try {
      let pushed = 0;
      let pulled = 0;
      let conflicts = 0;

      if (isAppwriteConfigured()) {
        // Appwrite Live Sync
        const pushResult = await pushRecordsToAppwrite(false, onProgress);
        pushed = pushResult.pushed;
        if (pushResult.errors > 0 && pushResult.pushed === 0 && pushResult.lastError) {
          throw new Error(pushResult.lastError);
        }

        const pullResult = await pullRecordsFromAppwrite(onProgress);
        pulled = pullResult.pulled;
      } else {
        // Local Simulator Mode
        const dirty = await db.getDirtyRecords();

        for (const m of dirty.models) {
          pushed++;
          await db.markSynced('models', m.id, m.version || 1);
        }
        for (const w of dirty.warehouses) {
          pushed++;
          await db.markSynced('warehouses', w.id, w.version || 1);
        }
        for (const a of dirty.areas) {
          pushed++;
          await db.markSynced('areas', a.id, a.version || 1);
        }
        for (const s of dirty.sections) {
          pushed++;
          await db.markSynced('sections', s.id, s.version || 1);
        }
        for (const ms of dirty.model_sections) {
          pushed++;
          await db.markSynced('model_sections', ms.id, ms.version || 1);
        }
        for (const t of dirty.transfers) {
          pushed++;
          t.sync_status = 'synced';
          await db.putRaw('transfers', t);
        }
      }

      const now = new Date().toISOString();
      localStorage.setItem('winrah_last_synced_at', now);

      // Log the sync session
      await db.putRaw('sync_logs', {
        id: 'sync-' + Date.now(),
        device_id: localStorage.getItem('winrah_device_id') || 'dev-local-01',
        direction: isAppwriteConfigured() ? 'appwrite_cloud' : 'bidirectional',
        records_pushed: pushed,
        records_pulled: pulled,
        conflicts,
        started_at: now,
        completed_at: now,
      });

      return { pushed, pulled, conflicts };
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  // Push ALL local records to Appwrite server
  async pushAllToAppwrite(onProgress?: SyncProgressCallback): Promise<{ pushed: number; errors: number }> {
    if (!this.isOnlineState || this.isSyncing) {
      throw new Error('Connexion réseau indisponible ou synchronisation en cours.');
    }

    this.isSyncing = true;
    this.notify();

    try {
      const res = await pushRecordsToAppwrite(true, onProgress);
      if (res.errors > 0 && res.pushed === 0 && res.lastError) {
        throw new Error(res.lastError);
      }

      const now = new Date().toISOString();
      localStorage.setItem('winrah_last_synced_at', now);

      await db.putRaw('sync_logs', {
        id: 'push-all-' + Date.now(),
        device_id: localStorage.getItem('winrah_device_id') || 'dev-local-01',
        direction: 'appwrite_cloud',
        records_pushed: res.pushed,
        records_pulled: 0,
        conflicts: 0,
        started_at: now,
        completed_at: now,
      });

      return res;
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  // Inject a simulated conflict for instant testing of FR-7.6
  async injectSimulatedConflict(): Promise<SyncQueueItem> {
    const models = await db.getAll<any>('models');
    const targetModel = models[0] || {
      id: 'model-demo-conflict',
      reference_code: 'HS-21',
      name: 'Sneakers Urban Flow',
    };

    const conflictItem: SyncQueueItem = {
      id: 'conflict-' + Date.now(),
      device_id: localStorage.getItem('winrah_device_id') || 'dev-local-01',
      entity_type: 'models',
      entity_id: targetModel.id,
      payload: {
        ...targetModel,
        name: targetModel.name + ' (Modification locale non synchronisée)',
        price: (targetModel.price || 200) + 50,
      },
      server_version: (targetModel.version || 1) + 2,
      device_version: targetModel.version || 1,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    await db.putRaw('sync_queue', conflictItem);
    this.notify();
    return conflictItem;
  }

  // Resolve a staged conflict from the sync queue (TDD §7.5)
  async resolveConflict(
    conflictId: string,
    resolution: 'accept_device' | 'accept_server' | 'merge',
    mergedPayload?: Record<string, any>
  ): Promise<void> {
    const conflict = await db.getById<SyncQueueItem>('sync_queue', conflictId);
    if (!conflict) return;

    if (resolution === 'accept_device') {
      await db.putRaw<any>(conflict.entity_type, {
        ...conflict.payload,
        version: conflict.server_version + 1,
        is_dirty: false,
        local_sync_status: 'synced',
        updated_at: new Date().toISOString(),
      });
    } else if (resolution === 'merge' && mergedPayload) {
      await db.putRaw<any>(conflict.entity_type, {
        ...mergedPayload,
        version: conflict.server_version + 1,
        is_dirty: false,
        local_sync_status: 'synced',
        updated_at: new Date().toISOString(),
      });
    }
    // 'accept_server' leaves the existing server record intact

    conflict.status = 'resolved';
    conflict.resolved_at = new Date().toISOString();
    await db.putRaw('sync_queue', conflict);

    // Audit log
    await db.putRaw('audit_logs', {
      id: 'audit-' + Date.now(),
      device_id: conflict.device_id,
      entity_type: conflict.entity_type,
      entity_id: conflict.entity_id,
      action: 'update',
      changes: { resolution, conflict_id: conflictId },
      created_at: new Date().toISOString(),
    });

    this.notify();
  }

  // Export full changeset for Device-to-Device offline pairing (FR-7.4)
  async exportChangeset(): Promise<DeviceChangeset> {
    return {
      from_device_id: localStorage.getItem('winrah_device_id') || 'dev-local-01',
      exported_at: new Date().toISOString(),
      tables: {
        warehouses: await db.getAll('warehouses'),
        areas: await db.getAll('areas'),
        sections: await db.getAll('sections'),
        models: await db.getAll('models'),
        model_sections: await db.getAll('model_sections'),
        transfers: await db.getAll('transfers'),
        search_logs: await db.getAll('search_logs'),
        audit_logs: await db.getAll('audit_logs'),
      },
    };
  }

  // Import peer device changeset (FR-7.4)
  async importChangeset(changeset: DeviceChangeset): Promise<{ imported: number }> {
    // 1. Wipe everything first (including all previous hubs/warehouses)
    await db.clearAll();

    const now = new Date().toISOString();
    let imported = 0;

    // 2. Warehouses: if incoming changeset includes warehouses, import them; otherwise ensure auto BASE warehouse
    const incomingWarehouses = changeset.tables.warehouses || [];
    let activeWarehouseId = 'wh-base';

    if (incomingWarehouses.length > 0) {
      for (const w of incomingWarehouses) {
        await db.putRaw('warehouses', { ...w, is_dirty: false, local_sync_status: 'synced' });
        imported++;
      }
      activeWarehouseId = incomingWarehouses[0].id;
    } else {
      const baseWh = {
        id: 'wh-base',
        name: 'BASE',
        status: 'active' as const,
        created_at: now,
        updated_at: now,
        version: 1,
        is_dirty: false,
        local_sync_status: 'synced' as const,
      };
      await db.bulkPut('warehouses', [baseWh]);
      imported++;
    }

    localStorage.setItem('winrah_active_warehouse_id', activeWarehouseId);

    // Ensure default device exists
    await db.bulkPut('devices', [
      {
        id: 'dev-local-01',
        name: 'Terminal Mobile',
        platform: 'web',
        active_warehouse_id: activeWarehouseId,
        created_at: now,
        updated_at: now,
        version: 1,
        last_synced_at: now,
      },
    ]);

    for (const a of changeset.tables.areas || []) {
      await db.putRaw('areas', { ...a, is_dirty: false, local_sync_status: 'synced' });
      imported++;
    }
    for (const s of changeset.tables.sections || []) {
      await db.putRaw('sections', { ...s, is_dirty: false, local_sync_status: 'synced' });
      imported++;
    }
    for (const m of changeset.tables.models || []) {
      await db.putRaw('models', { ...m, is_dirty: false, local_sync_status: 'synced' });
      imported++;
    }
    for (const ms of changeset.tables.model_sections || []) {
      await db.putRaw('model_sections', { ...ms, is_dirty: false, local_sync_status: 'synced' });
      imported++;
    }
    for (const t of changeset.tables.transfers || []) {
      await db.putRaw('transfers', t);
      imported++;
    }

    // Record sync log
    await db.putRaw('sync_logs', {
      id: 'd2d-' + Date.now(),
      device_id: changeset.from_device_id || 'peer-device',
      direction: 'device_to_device',
      records_pushed: 0,
      records_pulled: imported,
      conflicts: 0,
      started_at: now,
      completed_at: now,
    });

    this.notify();
    db.notify();
    return { imported };
  }
}

export const syncEngine = new SyncEngine();

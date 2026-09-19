// ============================================================================
// WINRAH - IndexedDB Local Database Engine
// Full offline-first local persistence supporting 11 entities with version tracking
// ============================================================================

import {
  Warehouse,
  Area,
  Section,
  ShoeModel,
  ModelSection,
  TransferLog,
  Device,
  SyncLog,
  SearchLog,
  AuditLog,
  SyncQueueItem,
} from '../types';

const DB_NAME = 'winrah_db';
const DB_VERSION = 2; // Incremented for clean store migration

export class LocalDatabase {
  private db: IDBDatabase | null = null;
  private changeListeners: Set<() => void> = new Set();
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 1. Warehouses
        if (!db.objectStoreNames.contains('warehouses')) {
          const s = db.createObjectStore('warehouses', { keyPath: 'id' });
          s.createIndex('status', 'status', { unique: false });
          s.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // 2. Areas
        if (!db.objectStoreNames.contains('areas')) {
          const s = db.createObjectStore('areas', { keyPath: 'id' });
          s.createIndex('warehouse_id', 'warehouse_id', { unique: false });
          s.createIndex('status', 'status', { unique: false });
        }

        // 3. Sections
        if (!db.objectStoreNames.contains('sections')) {
          const s = db.createObjectStore('sections', { keyPath: 'id' });
          s.createIndex('area_id', 'area_id', { unique: false });
          s.createIndex('status', 'status', { unique: false });
        }

        // 4. Devices
        if (!db.objectStoreNames.contains('devices')) {
          db.createObjectStore('devices', { keyPath: 'id' });
        }

        // 5. Models (reference_code is non-unique!)
        if (!db.objectStoreNames.contains('models')) {
          const s = db.createObjectStore('models', { keyPath: 'id' });
          s.createIndex('reference_code', 'reference_code', { unique: false });
          s.createIndex('warehouse_id', 'warehouse_id', { unique: false });
          s.createIndex('status', 'status', { unique: false });
          s.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // 6. Model_Section Assignments (Presence-only)
        if (!db.objectStoreNames.contains('model_sections')) {
          const s = db.createObjectStore('model_sections', { keyPath: 'id' });
          s.createIndex('model_id', 'model_id', { unique: false });
          s.createIndex('section_id', 'section_id', { unique: false });
        }

        // 7. Transfer_Log
        if (!db.objectStoreNames.contains('transfers')) {
          const s = db.createObjectStore('transfers', { keyPath: 'id' });
          s.createIndex('model_id', 'model_id', { unique: false });
          s.createIndex('created_at', 'created_at', { unique: false });
          s.createIndex('sync_status', 'sync_status', { unique: false });
        }

        // 8. Sync_Log
        if (!db.objectStoreNames.contains('sync_logs')) {
          const s = db.createObjectStore('sync_logs', { keyPath: 'id' });
          s.createIndex('started_at', 'started_at', { unique: false });
        }

        // 9. Search_Log
        if (!db.objectStoreNames.contains('search_logs')) {
          const s = db.createObjectStore('search_logs', { keyPath: 'id' });
          s.createIndex('warehouse_id', 'warehouse_id', { unique: false });
          s.createIndex('created_at', 'created_at', { unique: false });
          s.createIndex('result_count', 'result_count', { unique: false });
        }

        // 10. Audit_Log
        if (!db.objectStoreNames.contains('audit_logs')) {
          const s = db.createObjectStore('audit_logs', { keyPath: 'id' });
          s.createIndex('entity_type', 'entity_type', { unique: false });
          s.createIndex('created_at', 'created_at', { unique: false });
        }

        // 11. Sync_Queue (Staged conflicts)
        if (!db.objectStoreNames.contains('sync_queue')) {
          const s = db.createObjectStore('sync_queue', { keyPath: 'id' });
          s.createIndex('status', 'status', { unique: false });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => {
        this.initPromise = null;
        reject(request.error);
      };

      request.onblocked = () => {
        console.warn('Database upgrade blocked: please close other tabs running winrah.');
      };
    });

    return this.initPromise;
  }

  // Subscribe to changes across the database
  subscribe(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  notify() {
    this.changeListeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('Change listener error:', err);
      }
    });
  }

  private getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) throw new Error('Database not initialized');
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  // Generic CRUD
  async getAll<T>(storeName: string): Promise<T[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(storeName, 'readonly');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result as T[]);
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getById<T>(storeName: string, id: string): Promise<T | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(storeName, 'readonly');
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result ? (req.result as T) : null);
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async put<T extends { id: string }>(
    storeName: string,
    item: T,
    markDirty = true
  ): Promise<T> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(storeName, 'readwrite');
        const recordToSave = {
          ...item,
          ...(markDirty
            ? {
                is_dirty: true,
                local_sync_status: 'pending',
                updated_at: new Date().toISOString(),
                version: ((item as any).version || 0) + 1,
              }
            : {}),
        };

        const req = store.put(recordToSave);
        req.onsuccess = () => {
          this.notify();
          resolve(recordToSave as T);
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async putRaw<T extends { id: string }>(storeName: string, item: T, shouldNotify = true): Promise<T> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(storeName, 'readwrite');
        const req = store.put(item);
        req.onsuccess = () => {
          if (shouldNotify) this.notify();
          resolve(item);
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Fast batch put in a single transaction without re-entrant notifications
  async bulkPut<T extends { id: string }>(storeName: string, items: T[]): Promise<void> {
    await this.init();
    if (!this.db || items.length === 0) return;

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        for (const item of items) {
          store.put(item);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async delete(storeName: string, id: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(storeName, 'readwrite');
        const req = store.delete(id);
        req.onsuccess = () => {
          this.notify();
          resolve();
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Find all dirty records awaiting sync push
  async getDirtyRecords(): Promise<{
    warehouses: Warehouse[];
    areas: Area[];
    sections: Section[];
    models: ShoeModel[];
    model_sections: ModelSection[];
    transfers: TransferLog[];
    search_logs: SearchLog[];
    audit_logs: AuditLog[];
  }> {
    const warehouses = (await this.getAll<Warehouse>('warehouses')).filter((w) => w.is_dirty);
    const areas = (await this.getAll<Area>('areas')).filter((a) => a.is_dirty);
    const sections = (await this.getAll<Section>('sections')).filter((s) => s.is_dirty);
    const models = (await this.getAll<ShoeModel>('models')).filter((m) => m.is_dirty);
    const model_sections = (await this.getAll<ModelSection>('model_sections')).filter((ms) => ms.is_dirty);
    const transfers = (await this.getAll<TransferLog>('transfers')).filter(
      (t) => t.sync_status === 'pending'
    );
    const search_logs = await this.getAll<SearchLog>('search_logs');
    const audit_logs = await this.getAll<AuditLog>('audit_logs');

    return {
      warehouses,
      areas,
      sections,
      models,
      model_sections,
      transfers,
      search_logs,
      audit_logs,
    };
  }

  // Mark records as successfully synced
  async markSynced(table: string, id: string, newVersion: number): Promise<void> {
    const item = await this.getById<any>(table, id);
    if (!item) return;
    item.is_dirty = false;
    item.local_sync_status = 'synced';
    item.version = newVersion;
    item.last_synced_version = newVersion;
    await this.putRaw(table, item, false);
  }

  // Clear all data for clean resets / testing
  async clearAll(): Promise<void> {
    await this.init();
    if (!this.db) return;
    const storeNames = Array.from(this.db.objectStoreNames);
    if (storeNames.length === 0) return;

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(storeNames, 'readwrite');
        for (const name of storeNames) {
          tx.objectStore(name).clear();
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }
}

export const db = new LocalDatabase();

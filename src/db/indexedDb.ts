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

  async bulkDelete(storeName: string, ids: string[]): Promise<void> {
    await this.init();
    if (!this.db || ids.length === 0) return;

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        for (const id of ids) {
          store.delete(id);
        }

        tx.oncomplete = () => {
          this.notify();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Cascade delete section and all its models
  async deleteSectionWithCascade(sectionId: string): Promise<{ deletedModelsCount: number }> {
    await this.init();
    if (!this.db) return { deletedModelsCount: 0 };

    const allAssignments = await this.getAll<ModelSection>('model_sections');
    const matchingAssignments = allAssignments.filter((ms) => ms.section_id === sectionId);
    const modelIds = Array.from(new Set(matchingAssignments.map((ms) => ms.model_id)));
    const assignmentIds = matchingAssignments.map((ms) => ms.id);

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(['models', 'model_sections', 'sections'], 'readwrite');
        const modelStore = tx.objectStore('models');
        const msStore = tx.objectStore('model_sections');
        const sectionStore = tx.objectStore('sections');

        for (const mId of modelIds) {
          modelStore.delete(mId);
        }

        for (const msId of assignmentIds) {
          msStore.delete(msId);
        }

        sectionStore.delete(sectionId);

        tx.oncomplete = () => {
          this.notify();
          resolve({ deletedModelsCount: modelIds.length });
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Cascade delete area, its sections, and all their models
  async deleteAreaWithCascade(areaId: string): Promise<{ deletedSectionsCount: number; deletedModelsCount: number }> {
    await this.init();
    if (!this.db) return { deletedSectionsCount: 0, deletedModelsCount: 0 };

    const allSections = await this.getAll<Section>('sections');
    const areaSections = allSections.filter((s) => s.area_id === areaId);
    const sectionIds = areaSections.map((s) => s.id);
    const sectionIdSet = new Set(sectionIds);

    const allAssignments = await this.getAll<ModelSection>('model_sections');
    const matchingAssignments = allAssignments.filter((ms) => sectionIdSet.has(ms.section_id));
    const modelIds = Array.from(new Set(matchingAssignments.map((ms) => ms.model_id)));
    const assignmentIds = matchingAssignments.map((ms) => ms.id);

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(['models', 'model_sections', 'sections', 'areas'], 'readwrite');
        const modelStore = tx.objectStore('models');
        const msStore = tx.objectStore('model_sections');
        const sectionStore = tx.objectStore('sections');
        const areaStore = tx.objectStore('areas');

        for (const mId of modelIds) {
          modelStore.delete(mId);
        }

        for (const msId of assignmentIds) {
          msStore.delete(msId);
        }

        for (const sId of sectionIds) {
          sectionStore.delete(sId);
        }

        areaStore.delete(areaId);

        tx.oncomplete = () => {
          this.notify();
          resolve({
            deletedSectionsCount: sectionIds.length,
            deletedModelsCount: modelIds.length,
          });
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
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

  // Fast bulk mark records as synced in a single readwrite transaction
  async markBulkSynced(table: string, ids: string[]): Promise<void> {
    await this.init();
    if (!this.db || ids.length === 0) return;
    const idSet = new Set(ids);

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(table, 'readwrite');
        const store = tx.objectStore(table);
        const req = store.openCursor();

        req.onsuccess = (e: any) => {
          const cursor = e.target.result;
          if (cursor) {
            if (idSet.has(cursor.key as string)) {
              const item = cursor.value;
              item.is_dirty = false;
              item.local_sync_status = 'synced';
              item.last_synced_version = item.version || 1;
              cursor.update(item);
            }
            cursor.continue();
          }
        };

        tx.oncomplete = () => {
          this.notify();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
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

  /**
   * Resolves and deduplicates local data in IndexedDB:
   * 1. Warehouses: resolves duplicate warehouses by case-insensitive name
   * 2. Areas: resolves duplicate areas by warehouse_id + case-insensitive name
   * 3. Sections: resolves duplicate sections by canonical area_id + case-insensitive name
   * 4. Models: resolves duplicate models by warehouse_id + case-insensitive reference_code
   * 5. ModelSections: rebinds model_id and section_id to canonical IDs and eliminates duplicate assignments
   * 6. Transfers: rebinds model_id and section IDs to canonical IDs
   */
  async deduplicateLocalDatabase(): Promise<{
    warehousesRemoved: number;
    areasRemoved: number;
    sectionsRemoved: number;
    modelsRemoved: number;
    assignmentsRemoved: number;
  }> {
    await this.init();
    if (!this.db) {
      return { warehousesRemoved: 0, areasRemoved: 0, sectionsRemoved: 0, modelsRemoved: 0, assignmentsRemoved: 0 };
    }

    const [allWhs, allAreas, allSecs, allModels, allMs, allTransfers] = await Promise.all([
      this.getAll<Warehouse>('warehouses'),
      this.getAll<Area>('areas'),
      this.getAll<Section>('sections'),
      this.getAll<ShoeModel>('models'),
      this.getAll<ModelSection>('model_sections'),
      this.getAll<TransferLog>('transfers'),
    ]);

    // 1. Warehouses
    const whByNormalizedName = new Map<string, Warehouse[]>();
    for (const w of allWhs) {
      const k = (w.name || '').trim().toLowerCase();
      if (!whByNormalizedName.has(k)) whByNormalizedName.set(k, []);
      whByNormalizedName.get(k)!.push(w);
    }

    const whIdRemap = new Map<string, string>();
    const whIdsToDelete: string[] = [];

    for (const [, list] of whByNormalizedName) {
      if (list.length > 1) {
        list.sort((a, b) => {
          if (a.id === 'wh-base') return -1;
          if (b.id === 'wh-base') return 1;
          return (b.version || 1) - (a.version || 1);
        });
        const canonical = list[0];
        for (const dup of list.slice(1)) {
          whIdRemap.set(dup.id, canonical.id);
          whIdsToDelete.push(dup.id);
        }
      }
    }

    // 2. Areas
    const areasByNormalizedName = new Map<string, Area[]>();
    for (const a of allAreas) {
      const whId = whIdRemap.get(a.warehouse_id) || a.warehouse_id;
      const k = `${whId}:::${(a.name || '').trim().toLowerCase()}`;
      if (!areasByNormalizedName.has(k)) areasByNormalizedName.set(k, []);
      areasByNormalizedName.get(k)!.push(a);
    }

    const areaIdRemap = new Map<string, string>();
    const areaIdsToDelete: string[] = [];
    const areasToUpdate: Area[] = [];

    for (const [, list] of areasByNormalizedName) {
      if (list.length > 1) {
        list.sort((a, b) => {
          const aClean = !a.id.includes('-1790');
          const bClean = !b.id.includes('-1790');
          if (aClean && !bClean) return -1;
          if (!aClean && bClean) return 1;
          return (b.version || 1) - (a.version || 1);
        });
        const canonical = list[0];
        for (const dup of list.slice(1)) {
          areaIdRemap.set(dup.id, canonical.id);
          areaIdsToDelete.push(dup.id);
        }
      }
    }

    // Check if canonical area needs warehouse_id updated
    for (const a of allAreas) {
      if (!areaIdsToDelete.includes(a.id)) {
        const canonicalWh = whIdRemap.get(a.warehouse_id);
        if (canonicalWh && canonicalWh !== a.warehouse_id) {
          areasToUpdate.push({ ...a, warehouse_id: canonicalWh });
        }
      }
    }

    // 3. Sections
    const secsByNormalizedName = new Map<string, Section[]>();
    for (const s of allSecs) {
      const areaId = areaIdRemap.get(s.area_id) || s.area_id;
      const k = `${areaId}:::${(s.name || '').trim().toLowerCase()}`;
      if (!secsByNormalizedName.has(k)) secsByNormalizedName.set(k, []);
      secsByNormalizedName.get(k)!.push(s);
    }

    const secIdRemap = new Map<string, string>();
    const secIdsToDelete: string[] = [];
    const secsToUpdate: Section[] = [];

    for (const [, list] of secsByNormalizedName) {
      if (list.length > 1) {
        list.sort((a, b) => {
          const aClean = !a.id.includes('-1790');
          const bClean = !b.id.includes('-1790');
          if (aClean && !bClean) return -1;
          if (!aClean && bClean) return 1;
          return (b.version || 1) - (a.version || 1);
        });
        const canonical = list[0];
        for (const dup of list.slice(1)) {
          secIdRemap.set(dup.id, canonical.id);
          secIdsToDelete.push(dup.id);
        }
      }
    }

    // Check if remaining sections need area_id updated
    for (const s of allSecs) {
      if (!secIdsToDelete.includes(s.id)) {
        const canonicalArea = areaIdRemap.get(s.area_id);
        if (canonicalArea && canonicalArea !== s.area_id) {
          secsToUpdate.push({ ...s, area_id: canonicalArea });
        }
      }
    }

    // 4. Models (Location-Aware Deduplication - FR-4.7 & FR-4.8)
    // In WINRAH, multiple distinct shoe models can legitimately share the same reference code
    // when placed in different locations/sections. We MUST NOT merge or remove them!
    // We only merge:
    // (a) True duplicate IDs derived from the same base ID (e.g. timestamp suffixes like model-v2-3-1790... vs model-v2-3)
    // (b) Duplicate records with the same reference code assigned to the EXACT SAME section.
    const getBaseModelId = (id: string): string =>
      id.replace(/-\d{13}-[a-z0-9]+$/, '').replace(/-\d{13}$/, '');

    // Map each model to its assigned sections
    const modelToSections = new Map<string, Set<string>>();
    for (const ms of allMs) {
      const cSecId = secIdRemap.get(ms.section_id) || ms.section_id;
      if (!modelToSections.has(ms.model_id)) {
        modelToSections.set(ms.model_id, new Set());
      }
      modelToSections.get(ms.model_id)!.add(cSecId);
    }

    const modelIdRemap = new Map<string, string>();
    const modelIdsToDelete: string[] = [];
    const modelsToUpdate: ShoeModel[] = [];

    // Step 4a: Merge timestamp duplicates that share the same base ID
    const modelsByBaseId = new Map<string, ShoeModel[]>();
    for (const m of allModels) {
      const whId = whIdRemap.get(m.warehouse_id) || m.warehouse_id;
      const baseId = getBaseModelId(m.id);
      const k = `${whId}:::${baseId}`;
      if (!modelsByBaseId.has(k)) modelsByBaseId.set(k, []);
      modelsByBaseId.get(k)!.push(m);
    }

    for (const [, list] of modelsByBaseId) {
      if (list.length > 1) {
        list.sort((a, b) => {
          const aClean = !a.id.includes('-1790') && !a.id.includes('-1789');
          const bClean = !b.id.includes('-1790') && !b.id.includes('-1789');
          if (aClean && !bClean) return -1;
          if (!aClean && bClean) return 1;
          return (b.version || 1) - (a.version || 1);
        });
        const canonical = list[0];
        let updated = false;
        const mergedCanonical = { ...canonical };

        for (const dup of list.slice(1)) {
          modelIdRemap.set(dup.id, canonical.id);
          modelIdsToDelete.push(dup.id);
          if (!mergedCanonical.name && dup.name) {
            mergedCanonical.name = dup.name;
            updated = true;
          }
          if (!mergedCanonical.size_range && dup.size_range) {
            mergedCanonical.size_range = dup.size_range;
            updated = true;
          }
          if (mergedCanonical.price == null && dup.price != null) {
            mergedCanonical.price = dup.price;
            updated = true;
          }
          if (!mergedCanonical.photo_url && dup.photo_url) {
            mergedCanonical.photo_url = dup.photo_url;
            updated = true;
          }
        }
        if (updated) {
          modelsToUpdate.push(mergedCanonical);
        }
      }
    }

    // Step 4b: For remaining models sharing a reference code, only merge if in the EXACT SAME section.
    // If they are in different sections, KEEP BOTH (FR-4.7 & FR-4.8).
    const remainingModels = allModels.filter((m) => !modelIdsToDelete.includes(m.id));
    const modelsByRef = new Map<string, ShoeModel[]>();
    for (const m of remainingModels) {
      const whId = whIdRemap.get(m.warehouse_id) || m.warehouse_id;
      const ref = (m.reference_code || '').trim().toUpperCase();
      const k = `${whId}:::${ref}`;
      if (!modelsByRef.has(k)) modelsByRef.set(k, []);
      modelsByRef.get(k)!.push(m);
    }

    for (const [, list] of modelsByRef) {
      if (list.length <= 1) continue;

      for (let i = 0; i < list.length; i++) {
        const mA = list[i];
        if (modelIdsToDelete.includes(mA.id)) continue;
        const secsA = modelToSections.get(mA.id) || new Set();

        for (let j = i + 1; j < list.length; j++) {
          const mB = list[j];
          if (modelIdsToDelete.includes(mB.id)) continue;
          const secsB = modelToSections.get(mB.id) || new Set();

          // Check if they share any section location
          const sharesSection = Array.from(secsA).some((secId) => secsB.has(secId));
          if (sharesSection && secsA.size > 0 && secsB.size > 0) {
            // True duplicate in the SAME section: merge mB into mA
            modelIdRemap.set(mB.id, mA.id);
            modelIdsToDelete.push(mB.id);

            let updated = false;
            if (!mA.name && mB.name) {
              mA.name = mB.name;
              updated = true;
            }
            if (!mA.size_range && mB.size_range) {
              mA.size_range = mB.size_range;
              updated = true;
            }
            if (mA.price == null && mB.price != null) {
              mA.price = mB.price;
              updated = true;
            }
            if (!mA.photo_url && mB.photo_url) {
              mA.photo_url = mB.photo_url;
              updated = true;
            }
            if (updated) {
              modelsToUpdate.push(mA);
            }
          }
          // If they are in different sections (sharesSection === false), WE KEEP BOTH!
        }
      }
    }

    // 5. ModelSections
    const seenMsPairs = new Set<string>();
    const msIdsToDelete: string[] = [];
    const msToUpdate: ModelSection[] = [];

    for (const ms of allMs) {
      const canonicalModelId = modelIdRemap.get(ms.model_id) || ms.model_id;
      const canonicalSecId = secIdRemap.get(ms.section_id) || ms.section_id;

      // If either model or section was removed and not remapped, skip or delete
      const pairKey = `${canonicalModelId}:::${canonicalSecId}`;
      if (seenMsPairs.has(pairKey)) {
        msIdsToDelete.push(ms.id);
      } else {
        seenMsPairs.add(pairKey);
        if (canonicalModelId !== ms.model_id || canonicalSecId !== ms.section_id) {
          msToUpdate.push({
            ...ms,
            id: `ms-${canonicalModelId}-${canonicalSecId}`,
            model_id: canonicalModelId,
            section_id: canonicalSecId,
          });
          if (ms.id !== `ms-${canonicalModelId}-${canonicalSecId}`) {
            msIdsToDelete.push(ms.id);
          }
        }
      }
    }

    // 6. Transfers
    const transfersToUpdate: TransferLog[] = [];
    for (const t of allTransfers) {
      const cModel = modelIdRemap.get(t.model_id) || t.model_id;
      const cFrom = t.from_section_id ? (secIdRemap.get(t.from_section_id) || t.from_section_id) : '';
      const cTo = secIdRemap.get(t.to_section_id) || t.to_section_id;
      if (cModel !== t.model_id || cFrom !== t.from_section_id || cTo !== t.to_section_id) {
        transfersToUpdate.push({
          ...t,
          model_id: cModel,
          from_section_id: cFrom,
          to_section_id: cTo,
        });
      }
    }

    // Apply all changes in IndexedDB
    const storesToModify = ['warehouses', 'areas', 'sections', 'models', 'model_sections', 'transfers'];
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = this.db!.transaction(storesToModify, 'readwrite');
        const whStore = tx.objectStore('warehouses');
        const areaStore = tx.objectStore('areas');
        const secStore = tx.objectStore('sections');
        const modelStore = tx.objectStore('models');
        const msStore = tx.objectStore('model_sections');
        const transferStore = tx.objectStore('transfers');

        for (const id of whIdsToDelete) whStore.delete(id);
        for (const id of areaIdsToDelete) areaStore.delete(id);
        for (const id of secIdsToDelete) secStore.delete(id);
        for (const id of modelIdsToDelete) modelStore.delete(id);
        for (const id of msIdsToDelete) msStore.delete(id);

        for (const a of areasToUpdate) areaStore.put(a);
        for (const s of secsToUpdate) secStore.put(s);
        for (const m of modelsToUpdate) modelStore.put(m);
        for (const ms of msToUpdate) msStore.put(ms);
        for (const t of transfersToUpdate) transferStore.put(t);

        tx.oncomplete = () => {
          this.notify();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });

    return {
      warehousesRemoved: whIdsToDelete.length,
      areasRemoved: areaIdsToDelete.length,
      sectionsRemoved: secIdsToDelete.length,
      modelsRemoved: modelIdsToDelete.length,
      assignmentsRemoved: msIdsToDelete.length,
    };
  }
}

export const db = new LocalDatabase();

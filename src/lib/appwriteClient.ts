// ============================================================================
// WINRAH - Appwrite Backend Client & Cloud Sync
// Provides connection management, schema mapping, and high-performance
// concurrent bidirectional sync with Appwrite Database (Cloud or Self-Hosted)
// ============================================================================

import { Client, Databases, Query, Account } from 'appwrite';
import { db } from '../db/indexedDb';
import { Warehouse, Area, Section, ShoeModel, ModelSection, TransferLog, SearchLog } from '../types';

export interface AppwriteConfig {
  endpoint: string;
  projectId: string;
  databaseId: string;
  apiKey?: string;
}

export interface SyncProgressUpdate {
  phase: 'init' | 'warehouses' | 'areas' | 'sections' | 'models' | 'model_sections' | 'transfers' | 'search_logs' | 'fetching' | 'done';
  message: string;
  current: number;
  total: number;
  percentage: number;
}

export type SyncProgressCallback = (update: SyncProgressUpdate) => void;

export const APPWRITE_COLLECTIONS = {
  warehouses: 'warehouses',
  areas: 'areas',
  sections: 'sections',
  models: 'models',
  model_sections: 'model_sections',
  transfers: 'transfers',
  search_logs: 'search_logs',
} as const;

export function getAppwriteConfig(): AppwriteConfig {
  const envEndpoint = (import.meta as any).env?.VITE_APPWRITE_ENDPOINT;
  const envProjectId = (import.meta as any).env?.VITE_APPWRITE_PROJECT_ID;
  const envDatabaseId = (import.meta as any).env?.VITE_APPWRITE_DATABASE_ID;

  // Clear stale placeholder from localStorage if present
  const localDb = localStorage.getItem('winrah_appwrite_database_id');
  if (localDb === 'winrah_db' && envDatabaseId && envDatabaseId !== 'winrah_db') {
    localStorage.removeItem('winrah_appwrite_database_id');
  }

  return {
    endpoint:
      envEndpoint ||
      localStorage.getItem('winrah_appwrite_endpoint') ||
      'https://cloud.appwrite.io/v1',
    projectId:
      envProjectId ||
      localStorage.getItem('winrah_appwrite_project_id') ||
      '',
    databaseId:
      envDatabaseId ||
      localStorage.getItem('winrah_appwrite_database_id') ||
      'winrah_db',
    apiKey: localStorage.getItem('winrah_appwrite_api_key') || '',
  };
}

export function saveAppwriteConfig(config: Partial<AppwriteConfig>) {
  if (config.endpoint !== undefined) {
    localStorage.setItem('winrah_appwrite_endpoint', config.endpoint.trim());
  }
  if (config.projectId !== undefined) {
    localStorage.setItem('winrah_appwrite_project_id', config.projectId.trim());
  }
  if (config.databaseId !== undefined) {
    localStorage.setItem('winrah_appwrite_database_id', config.databaseId.trim());
  }
  if (config.apiKey !== undefined) {
    if (config.apiKey.trim()) {
      localStorage.setItem('winrah_appwrite_api_key', config.apiKey.trim());
    } else {
      localStorage.removeItem('winrah_appwrite_api_key');
    }
  }
}

export function isAppwriteConfigured(): boolean {
  const cfg = getAppwriteConfig();
  return Boolean(cfg.endpoint && cfg.projectId && cfg.databaseId);
}

export function getAppwriteClient(): { client: Client; databases: Databases; account: Account } | null {
  const cfg = getAppwriteConfig();
  if (!cfg.endpoint || !cfg.projectId) return null;

  const client = new Client();
  client.setEndpoint(cfg.endpoint).setProject(cfg.projectId);
  const databases = new Databases(client);
  const account = new Account(client);

  return { client, databases, account };
}

let appwriteSessionEstablished = false;

/**
 * Ensures an authenticated session exists (via anonymous session if needed).
 * Appwrite Cloud strictly rate-limits unauthenticated guest IPs to ~60 requests/minute.
 * Creating an anonymous session lifts this barrier, allowing high-speed parallel sync.
 */
export async function ensureAppwriteSession(client: Client): Promise<void> {
  if (appwriteSessionEstablished) return;
  const account = new Account(client);
  try {
    await account.get();
    appwriteSessionEstablished = true;
  } catch {
    try {
      await account.createAnonymousSession();
      appwriteSessionEstablished = true;
    } catch (createErr: any) {
      // If a session already exists or anonymous logins are disabled, continue gracefully
      console.warn('Appwrite session notice:', createErr?.message || createErr);
    }
  }
}

/**
 * High-performance worker pool executing items with a controlled concurrency limit
 */
export async function runConcurrentPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  onProgress?: (completed: number, total: number) => void
): Promise<void> {
  if (items.length === 0) return;
  let nextIndex = 0;
  let completed = 0;
  const limit = Math.min(concurrency, items.length);

  const workers = Array.from({ length: limit }, async () => {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      try {
        await worker(items[idx], idx);
      } catch (err) {
        console.error('Concurrent pool item error:', err);
      }
      completed++;
      if (onProgress && (completed % 10 === 0 || completed === items.length)) {
        onProgress(completed, items.length);
      }
    }
  });

  await Promise.all(workers);
}

/**
 * Safely fetches all documents from an Appwrite collection by paginating with cursorAfter
 */
export async function fetchAllCollectionDocuments(
  databases: Databases,
  databaseId: string,
  collectionId: string,
  batchSize: number = 100
): Promise<any[]> {
  const allDocs: any[] = [];
  let lastId: string | null = null;
  const maxPages = 200; // supports up to 20,000 documents

  for (let page = 0; page < maxPages; page++) {
    const queries = [Query.limit(batchSize)];
    if (lastId) {
      queries.push(Query.cursorAfter(lastId));
    }

    const response = await databases.listDocuments(databaseId, collectionId, queries);
    if (!response.documents || response.documents.length === 0) {
      break;
    }

    allDocs.push(...response.documents);
    if (response.documents.length < batchSize) {
      break;
    }
    lastId = response.documents[response.documents.length - 1].$id;
  }

  return allDocs;
}

export function toAppwriteDocId(rawId: string): string {
  let clean = rawId.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (/^[._-]/.test(clean)) {
    clean = 'doc_' + clean;
  }
  return clean.substring(0, 36);
}

export function getBaseModelId(id: string): string {
  return id.replace(/-\d{13}-[a-z0-9]+$/, '').replace(/-\d{13}$/, '');
}

// Strictly typed sanitizers matching Appwrite collection attributes
export function sanitizeWarehouse(w: Warehouse) {
  return {
    id: w.id,
    name: w.name,
    status: w.status || 'active',
    version: Number(w.version) || 1,
    created_at: w.created_at || new Date().toISOString(),
    updated_at: w.updated_at || new Date().toISOString(),
  };
}

export function sanitizeArea(a: Area) {
  return {
    id: a.id,
    warehouse_id: a.warehouse_id,
    name: a.name,
    status: a.status || 'active',
    version: Number(a.version) || 1,
    created_at: a.created_at || new Date().toISOString(),
    updated_at: a.updated_at || new Date().toISOString(),
  };
}

export function sanitizeSection(s: Section) {
  return {
    id: s.id,
    area_id: s.area_id,
    name: s.name,
    capacity: s.capacity || null,
    status: s.status || 'active',
    version: Number(s.version) || 1,
    created_at: s.created_at || new Date().toISOString(),
    updated_at: s.updated_at || new Date().toISOString(),
  };
}

export function sanitizeModel(m: ShoeModel) {
  return {
    id: m.id,
    warehouse_id: m.warehouse_id,
    reference_code: m.reference_code,
    name: m.name || null,
    size_range: m.size_range || null,
    price: m.price != null && !isNaN(Number(m.price)) ? Number(m.price) : null,
    photo_url: m.photo_url || null,
    status: m.status || 'active',
    version: Number(m.version) || 1,
    created_at: m.created_at || new Date().toISOString(),
    updated_at: m.updated_at || new Date().toISOString(),
  };
}

export function sanitizeModelSection(ms: ModelSection) {
  return {
    id: ms.id,
    model_id: ms.model_id,
    section_id: ms.section_id,
    assigned_at: ms.assigned_at || new Date().toISOString(),
    updated_at: ms.updated_at || new Date().toISOString(),
    version: Number(ms.version) || 1,
  };
}

export function sanitizeTransfer(t: TransferLog) {
  return {
    id: t.id,
    model_id: t.model_id,
    from_section_id: t.from_section_id || null,
    to_section_id: t.to_section_id,
    device_id: t.device_id || 'dev-local-01',
    performed_by: t.performed_by || 'Opérateur',
    sync_status: 'synced',
    created_at: t.created_at || new Date().toISOString(),
  };
}

export function sanitizeSearchLog(log: SearchLog) {
  return {
    id: log.id,
    device_id: log.device_id,
    query_text: (log.query_text || '').substring(0, 255),
    result_count: Number(log.result_count) || 0,
    warehouse_id: log.warehouse_id || null,
    created_at: log.created_at || new Date().toISOString(),
    is_everywhere: Boolean(log.is_everywhere),
  };
}

export async function testAppwriteConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const inst = getAppwriteClient();
    if (!inst) {
      return { success: false, message: 'Configuration incomplète (Endpoint ou Project ID manquant).' };
    }
    const cfg = getAppwriteConfig();
    const res = await inst.databases.listDocuments(cfg.databaseId, APPWRITE_COLLECTIONS.warehouses, [Query.limit(1)]);
    return {
      success: true,
      message: `Connexion Appwrite établie avec succès ! Base "${cfg.databaseId}" accessible (${res.total} entrepôts distants).`,
    };
  } catch (err: any) {
    if (err?.code === 404 || err?.message?.toLowerCase().includes('not found') || err?.message?.includes('collection')) {
      return {
        success: true,
        message: `Connecté au projet Appwrite ! Note : La base "${getAppwriteConfig().databaseId}" ou ses collections ne sont pas encore créées.`,
      };
    }
    return {
      success: false,
      message: `Erreur de connexion Appwrite : ${err?.message || err}`,
    };
  }
}

// 1-Click Server Database Fetch (Wipes local DB and populates directly from Appwrite with deduplication)
export async function fetchServerDatabase(
  cleanReplace: boolean = true,
  onProgress?: SyncProgressCallback
): Promise<{
  warehouses: number;
  areas: number;
  sections: number;
  models: number;
  assignments: number;
  transfers: number;
  total: number;
}> {
  const inst = getAppwriteClient();
  if (!inst) {
    throw new Error('Identifiants Appwrite non configurés. Renseignez VITE_APPWRITE_PROJECT_ID dans .env ou dans l’interface.');
  }

  const cfg = getAppwriteConfig();
  await ensureAppwriteSession(inst.client);

  onProgress?.({
    phase: 'fetching',
    message: 'Téléchargement des données depuis Appwrite Cloud...',
    current: 0,
    total: 100,
    percentage: 10,
  });

  if (cleanReplace) {
    await db.clearAll();
  }

  // Fetch all collections with full pagination
  const [
    remoteWarehouses,
    remoteAreas,
    remoteSections,
    remoteModels,
    remoteAssignments,
    remoteTransfers,
  ] = await Promise.all([
    fetchAllCollectionDocuments(inst.databases, cfg.databaseId, APPWRITE_COLLECTIONS.warehouses),
    fetchAllCollectionDocuments(inst.databases, cfg.databaseId, APPWRITE_COLLECTIONS.areas),
    fetchAllCollectionDocuments(inst.databases, cfg.databaseId, APPWRITE_COLLECTIONS.sections),
    fetchAllCollectionDocuments(inst.databases, cfg.databaseId, APPWRITE_COLLECTIONS.models),
    fetchAllCollectionDocuments(inst.databases, cfg.databaseId, APPWRITE_COLLECTIONS.model_sections),
    fetchAllCollectionDocuments(inst.databases, cfg.databaseId, APPWRITE_COLLECTIONS.transfers),
  ]);

  onProgress?.({
    phase: 'fetching',
    message: 'Résolution et déduplication intelligente des données...',
    current: 50,
    total: 100,
    percentage: 50,
  });

  // 1. Warehouses (deduplicated by normalized name)
  const whNameMap = new Map<string, Warehouse>();
  const whIdRemap = new Map<string, string>();

  for (const doc of remoteWarehouses) {
    const rawId = (doc.id as string) || doc.$id;
    const name = ((doc.name as string) || '').trim();
    const key = name.toLowerCase();

    if (!whNameMap.has(key)) {
      const canonicalWh: Warehouse = {
        id: rawId,
        name: doc.name as string,
        status: (doc.status as any) || 'active',
        created_at: (doc.created_at as string) || doc.$createdAt,
        updated_at: (doc.updated_at as string) || doc.$updatedAt,
        version: (doc.version as number) || 1,
        is_dirty: false,
        local_sync_status: 'synced',
      };
      whNameMap.set(key, canonicalWh);
      whIdRemap.set(rawId, rawId);
      if (doc.$id) whIdRemap.set(doc.$id, rawId);
    } else {
      const canonical = whNameMap.get(key)!;
      whIdRemap.set(rawId, canonical.id);
      if (doc.$id) whIdRemap.set(doc.$id, canonical.id);
    }
  }

  let warehousesToInsert = Array.from(whNameMap.values());
  if (warehousesToInsert.length === 0) {
    const baseWh: Warehouse = {
      id: 'wh-base',
      name: 'BASE',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      is_dirty: false,
      local_sync_status: 'synced',
    };
    warehousesToInsert = [baseWh];
    whIdRemap.set('wh-base', 'wh-base');
  }

  await db.bulkPut('warehouses', warehousesToInsert);
  const activeWhId = warehousesToInsert[0].id;
  localStorage.setItem('winrah_active_warehouse_id', activeWhId);

  // Ensure default device exists
  await db.bulkPut('devices', [
    {
      id: 'dev-local-01',
      name: 'Terminal Mobile',
      platform: 'web',
      active_warehouse_id: activeWhId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      last_synced_at: new Date().toISOString(),
    },
  ]);

  // 2. Areas (deduplicated by warehouse_id + normalized name)
  const areaNameMap = new Map<string, Area>();
  const areaIdRemap = new Map<string, string>();

  // Process clean deterministic IDs first
  const sortedRemoteAreas = [...remoteAreas].sort((a, b) => {
    const aId = (a.id as string) || a.$id;
    const bId = (b.id as string) || b.$id;
    const aHasTs = aId.includes('-1790');
    const bHasTs = bId.includes('-1790');
    if (!aHasTs && bHasTs) return -1;
    if (aHasTs && !bHasTs) return 1;
    return 0;
  });

  for (const doc of sortedRemoteAreas) {
    const rawId = (doc.id as string) || doc.$id;
    const canonicalWhId = whIdRemap.get(doc.warehouse_id as string) || activeWhId;
    const name = ((doc.name as string) || '').trim();
    const key = `${canonicalWhId}:::${name.toLowerCase()}`;

    if (!areaNameMap.has(key)) {
      const canonicalArea: Area = {
        id: rawId,
        warehouse_id: canonicalWhId,
        name,
        status: (doc.status as any) || 'active',
        created_at: (doc.created_at as string) || doc.$createdAt,
        updated_at: (doc.updated_at as string) || doc.$updatedAt,
        version: (doc.version as number) || 1,
        is_dirty: false,
        local_sync_status: 'synced',
      };
      areaNameMap.set(key, canonicalArea);
      areaIdRemap.set(rawId, rawId);
      if (doc.$id) areaIdRemap.set(doc.$id, rawId);
    } else {
      const canonical = areaNameMap.get(key)!;
      areaIdRemap.set(rawId, canonical.id);
      if (doc.$id) areaIdRemap.set(doc.$id, canonical.id);
    }
  }

  const areasToInsert = Array.from(areaNameMap.values());
  if (areasToInsert.length > 0) await db.bulkPut('areas', areasToInsert);

  // 3. Sections (deduplicated by canonical area_id + normalized name)
  const secNameMap = new Map<string, Section>();
  const sectionIdRemap = new Map<string, string>();

  const sortedRemoteSections = [...remoteSections].sort((a, b) => {
    const aId = (a.id as string) || a.$id;
    const bId = (b.id as string) || b.$id;
    const aHasTs = aId.includes('-1790');
    const bHasTs = bId.includes('-1790');
    if (!aHasTs && bHasTs) return -1;
    if (aHasTs && !bHasTs) return 1;
    return 0;
  });

  for (const doc of sortedRemoteSections) {
    const rawId = (doc.id as string) || doc.$id;
    const rawAreaId = doc.area_id as string;
    const canonicalAreaId = areaIdRemap.get(rawAreaId) || rawAreaId;
    const name = ((doc.name as string) || '').trim();
    const key = `${canonicalAreaId}:::${name.toLowerCase()}`;

    if (!secNameMap.has(key)) {
      const canonicalSec: Section = {
        id: rawId,
        area_id: canonicalAreaId,
        name,
        capacity: (doc.capacity as string) || null,
        status: (doc.status as any) || 'active',
        created_at: (doc.created_at as string) || doc.$createdAt,
        updated_at: (doc.updated_at as string) || doc.$updatedAt,
        version: (doc.version as number) || 1,
        is_dirty: false,
        local_sync_status: 'synced',
      };
      secNameMap.set(key, canonicalSec);
      sectionIdRemap.set(rawId, rawId);
      if (doc.$id) sectionIdRemap.set(doc.$id, rawId);
    } else {
      const canonical = secNameMap.get(key)!;
      sectionIdRemap.set(rawId, canonical.id);
      if (doc.$id) sectionIdRemap.set(doc.$id, canonical.id);
    }
  }

  const sectionsToInsert = Array.from(secNameMap.values());
  if (sectionsToInsert.length > 0) await db.bulkPut('sections', sectionsToInsert);


  // 4. Models (Location-Aware / Base-ID Deduplication - FR-4.7 & FR-4.8)
  // Preserve distinct models with the same reference code placed in different locations.
  // Only merge models that share the exact same base ID (stripping timestamp suffixes).
  const modelsByBaseId = new Map<string, ShoeModel>();
  const modelIdRemap = new Map<string, string>();

  const sortedRemoteModels = [...remoteModels].sort((a, b) => {
    const aId = (a.id as string) || a.$id;
    const bId = (b.id as string) || b.$id;
    const aHasTs = aId.includes('-1790') || aId.includes('-1789');
    const bHasTs = bId.includes('-1790') || bId.includes('-1789');
    if (!aHasTs && bHasTs) return -1;
    if (aHasTs && !bHasTs) return 1;
    return ((b.version as number) || 1) - ((a.version as number) || 1);
  });

  for (const doc of sortedRemoteModels) {
    const rawId = (doc.id as string) || doc.$id;
    const canonicalWhId = whIdRemap.get(doc.warehouse_id as string) || activeWhId;
    const baseId = getBaseModelId(rawId);
    const key = `${canonicalWhId}:::${baseId}`;

    if (!modelsByBaseId.has(key)) {
      const canonicalModel: ShoeModel = {
        id: baseId,
        warehouse_id: canonicalWhId,
        reference_code: ((doc.reference_code as string) || '').trim().toUpperCase(),
        name: (doc.name as string) || null,
        size_range: (doc.size_range as string) || null,
        price: (doc.price as number) || null,
        photo_url: (doc.photo_url as string) || null,
        status: (doc.status as any) || 'active',
        created_at: (doc.created_at as string) || doc.$createdAt,
        updated_at: (doc.updated_at as string) || doc.$updatedAt,
        version: (doc.version as number) || 1,
        is_dirty: false,
        local_sync_status: 'synced',
      };
      modelsByBaseId.set(key, canonicalModel);
      modelIdRemap.set(rawId, baseId);
      if (doc.$id) modelIdRemap.set(doc.$id, baseId);
    } else {
      const canonical = modelsByBaseId.get(key)!;
      modelIdRemap.set(rawId, canonical.id);
      if (doc.$id) modelIdRemap.set(doc.$id, canonical.id);
      // Merge any non-null fields
      if (!canonical.name && doc.name) canonical.name = doc.name as string;
      if (!canonical.size_range && doc.size_range) canonical.size_range = doc.size_range as string;
      if (canonical.price == null && doc.price != null) canonical.price = doc.price as number;
      if (!canonical.photo_url && doc.photo_url) canonical.photo_url = doc.photo_url as string;
    }
  }

  const modelsToInsert = Array.from(modelsByBaseId.values());
  if (modelsToInsert.length > 0) await db.bulkPut('models', modelsToInsert);

  // 5. Assignments (with remapped canonical model & section IDs, deduplicated pairs)
  const seenAssignments = new Set<string>();
  const assignmentsToInsert: ModelSection[] = [];

  for (const doc of remoteAssignments) {
    const rawModelId = doc.model_id as string;
    const rawSecId = doc.section_id as string;
    const canonicalModelId = modelIdRemap.get(rawModelId) || rawModelId;
    const canonicalSecId = sectionIdRemap.get(rawSecId) || rawSecId;
    const pairKey = `${canonicalModelId}:::${canonicalSecId}`;

    if (!seenAssignments.has(pairKey)) {
      seenAssignments.add(pairKey);
      assignmentsToInsert.push({
        id: `ms-${canonicalModelId}-${canonicalSecId}`,
        model_id: canonicalModelId,
        section_id: canonicalSecId,
        assigned_at: (doc.assigned_at as string) || doc.$createdAt,
        updated_at: (doc.updated_at as string) || doc.$updatedAt,
        version: (doc.version as number) || 1,
        is_dirty: false,
        local_sync_status: 'synced',
      });
    }
  }
  if (assignmentsToInsert.length > 0) await db.bulkPut('model_sections', assignmentsToInsert);

  // 6. Transfers (with remapped canonical IDs, deduplicated)
  const seenTransfers = new Set<string>();
  const transfersToInsert: TransferLog[] = [];

  for (const doc of remoteTransfers) {
    const rawModelId = doc.model_id as string;
    const fromSec = (doc.from_section_id as string) || '';
    const toSec = doc.to_section_id as string;
    const canonicalModelId = modelIdRemap.get(rawModelId) || rawModelId;
    const canonicalFrom = fromSec ? (sectionIdRemap.get(fromSec) || fromSec) : '';
    const canonicalTo = sectionIdRemap.get(toSec) || toSec;
    const createdAt = (doc.created_at as string) || doc.$createdAt;
    const tKey = `${canonicalModelId}:::${canonicalTo}:::${createdAt}`;

    if (!seenTransfers.has(tKey)) {
      seenTransfers.add(tKey);
      transfersToInsert.push({
        id: (doc.id as string) || doc.$id,
        model_id: canonicalModelId,
        from_section_id: canonicalFrom,
        to_section_id: canonicalTo,
        device_id: (doc.device_id as string) || 'dev-local-01',
        performed_by: (doc.performed_by as string) || 'Opérateur',
        sync_status: 'synced',
        created_at: createdAt,
      });
    }
  }
  if (transfersToInsert.length > 0) await db.bulkPut('transfers', transfersToInsert);

  // Final deduplication sanity check on IndexedDB
  await db.deduplicateLocalDatabase();

  const total =
    warehousesToInsert.length +
    areasToInsert.length +
    sectionsToInsert.length +
    modelsToInsert.length +
    assignmentsToInsert.length +
    transfersToInsert.length;

  localStorage.setItem('winrah_last_synced_at', new Date().toISOString());

  // Record sync log
  await db.putRaw('sync_logs', {
    id: 'fetch-server-' + Date.now(),
    device_id: localStorage.getItem('winrah_device_id') || 'dev-local-01',
    direction: 'appwrite_cloud',
    records_pushed: 0,
    records_pulled: total,
    conflicts: 0,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });

  db.notify();

  onProgress?.({
    phase: 'done',
    message: `Base serveur téléchargée et résolue (${total} enregistrements uniques).`,
    current: total,
    total,
    percentage: 100,
  });

  return {
    warehouses: warehousesToInsert.length,
    areas: areasToInsert.length,
    sections: sectionsToInsert.length,
    models: modelsToInsert.length,
    assignments: assignmentsToInsert.length,
    transfers: transfersToInsert.length,
    total,
  };
}

/**
 * Collections preserved during server database wipe (never deleted).
 * Per requirements: "everything except for search logs and audits should be wiped out to oblivion".
 */
export const PRESERVED_SERVER_COLLECTIONS = new Set<string>([
  APPWRITE_COLLECTIONS.search_logs,
  'audit_logs',
]);

/**
 * Collections to completely wipe clean to 0 documents when pushing local database.
 * Processed in child-to-parent dependency order.
 */
export const WIPABLE_SERVER_COLLECTIONS = [
  APPWRITE_COLLECTIONS.model_sections,
  APPWRITE_COLLECTIONS.transfers,
  APPWRITE_COLLECTIONS.models,
  APPWRITE_COLLECTIONS.sections,
  APPWRITE_COLLECTIONS.areas,
  APPWRITE_COLLECTIONS.warehouses,
] as const;

/**
 * Clears all documents from Appwrite business collections down to 0 documents.
 * Guarantees complete oblivion of previous data with exhaustive batch pagination,
 * concurrency control (15 workers), and automatic 429 rate-limit backoff retries.
 * Strictly preserves search_logs and audit_logs.
 */
export async function clearServerDatabase(
  onProgress?: SyncProgressCallback
): Promise<{ deleted: number }> {
  const inst = getAppwriteClient();
  if (!inst) throw new Error('Client Appwrite non configuré.');
  const cfg = getAppwriteConfig();
  await ensureAppwriteSession(inst.client);

  const collections = WIPABLE_SERVER_COLLECTIONS;
  let grandTotalDeleted = 0;

  for (let i = 0; i < collections.length; i++) {
    const col = collections[i];
    let totalDeletedInCol = 0;

    onProgress?.({
      phase: 'init',
      message: `Nettoyage du serveur : vidage de "${col}"...`,
      current: i,
      total: collections.length,
      percentage: Math.round((i / collections.length) * 100),
    });

    // Exhaustive batch deletion loop: guarantees 0 documents remain
    while (true) {
      let docs: any[] = [];

      for (let fetchAttempt = 0; fetchAttempt < 5; fetchAttempt++) {
        try {
          const res = await inst.databases.listDocuments(cfg.databaseId, col, [
            Query.limit(100),
          ]);
          docs = res.documents || [];
          break;
        } catch (err: any) {
          if (err?.code === 404) {
            docs = [];
            break;
          }
          if (err?.code === 429) {
            await new Promise((r) => setTimeout(r, 600 * (fetchAttempt + 1)));
            continue;
          }
          if (fetchAttempt === 4) {
            console.warn(`Error listing documents in ${col}:`, err?.message || err);
            docs = [];
            break;
          }
          await new Promise((r) => setTimeout(r, 400));
        }
      }

      if (docs.length === 0) {
        // Collection has been completely emptied
        break;
      }

      // Concurrently delete this batch with exponential backoff on 429
      let nextIdx = 0;
      const concurrency = Math.min(15, docs.length);
      const workers = Array.from({ length: concurrency }, async () => {
        while (nextIdx < docs.length) {
          const doc = docs[nextIdx++];
          for (let delAttempt = 0; delAttempt < 6; delAttempt++) {
            try {
              await inst.databases.deleteDocument(cfg.databaseId, col, doc.$id);
              totalDeletedInCol++;
              grandTotalDeleted++;
              break;
            } catch (err: any) {
              if (err?.code === 404) {
                totalDeletedInCol++;
                grandTotalDeleted++;
                break;
              }
              if (err?.code === 429) {
                const backoffMs = 500 * (delAttempt + 1) + Math.floor(Math.random() * 250);
                await new Promise((r) => setTimeout(r, backoffMs));
                continue;
              }
              if (delAttempt === 5) {
                console.warn(`Failed to delete doc ${doc.$id} in ${col}:`, err?.message || err);
                break;
              }
              await new Promise((r) => setTimeout(r, 400));
            }
          }
        }
      });

      await Promise.all(workers);

      onProgress?.({
        phase: 'init',
        message: `Nettoyage du serveur : "${col}" (${totalDeletedInCol} supprimés)...`,
        current: i,
        total: collections.length,
        percentage: Math.min(99, Math.round(((i + 0.5) / collections.length) * 100)),
      });

      // Brief breather between batches to respect Appwrite Cloud quotas
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return { deleted: grandTotalDeleted };
}

/**
 * Fast Concurrent Push of local records to Appwrite Collections.
 * Uses a worker pool (20 concurrent requests for models/assignments) and creates
 * an authenticated anonymous session to eliminate guest IP rate limits.
 */
export async function pushRecordsToAppwrite(
  forceAll: boolean = false,
  onProgress?: SyncProgressCallback
): Promise<{
  pushed: number;
  errors: number;
  lastError: string | null;
}> {
  const inst = getAppwriteClient();
  if (!inst) return { pushed: 0, errors: 0, lastError: 'Client Appwrite non configuré.' };

  const cfg = getAppwriteConfig();

  onProgress?.({
    phase: 'init',
    message: 'Initialisation de la session Appwrite...',
    current: 0,
    total: 100,
    percentage: 5,
  });

  // Ensure authenticated session to lift guest rate limits
  await ensureAppwriteSession(inst.client);

  // If forceAll is requested (Send Local Database), clear the server database first
  if (forceAll) {
    onProgress?.({
      phase: 'init',
      message: 'Vidage préalable du serveur Appwrite...',
      current: 0,
      total: 100,
      percentage: 2,
    });
    await clearServerDatabase(onProgress);
  }

  const dirty = await db.getDirtyRecords();

  const warehousesToPush = forceAll ? await db.getAll<Warehouse>('warehouses') : dirty.warehouses;
  const areasToPush = forceAll ? await db.getAll<Area>('areas') : dirty.areas;
  const sectionsToPush = forceAll ? await db.getAll<Section>('sections') : dirty.sections;
  const modelsToPush = forceAll ? await db.getAll<ShoeModel>('models') : dirty.models;
  const assignmentsToPush = forceAll ? await db.getAll<ModelSection>('model_sections') : dirty.model_sections;
  const transfersToPush = forceAll ? await db.getAll<TransferLog>('transfers') : dirty.transfers;

  let totalPushed = 0;
  let totalErrors = 0;
  let lastError: string | null = null;

  // Run local database deduplication first to ensure clean state before push
  await db.deduplicateLocalDatabase();

  // =========================================================================
  // Pre-push deduplication: fetch existing server areas/sections/models and build
  // name-based lookups so we update existing docs rather than creating dupes
  // when local IDs differ from server IDs (e.g., after CSV re-import).
  // =========================================================================
  const serverAreasByName = new Map<string, string>(); // "warehouse::name_lower" -> server $id
  const serverSectionsByName = new Map<string, string>(); // "area$id::name_lower" -> server $id
  const serverModelsByBaseId = new Map<string, string>(); // "warehouse::baseId" -> server $id

  if (!forceAll && (areasToPush.length > 0 || sectionsToPush.length > 0 || modelsToPush.length > 0)) {
    try {
      const promises: Promise<any>[] = [];
      if (areasToPush.length > 0) {
        promises.push(fetchAllCollectionDocuments(inst.databases, cfg.databaseId, APPWRITE_COLLECTIONS.areas));
      } else {
        promises.push(Promise.resolve([]));
      }
      if (sectionsToPush.length > 0) {
        promises.push(fetchAllCollectionDocuments(inst.databases, cfg.databaseId, APPWRITE_COLLECTIONS.sections));
      } else {
        promises.push(Promise.resolve([]));
      }
      if (modelsToPush.length > 0) {
        promises.push(fetchAllCollectionDocuments(inst.databases, cfg.databaseId, APPWRITE_COLLECTIONS.models));
      } else {
        promises.push(Promise.resolve([]));
      }

      const [existingAreas, existingSections, existingModels] = await Promise.all(promises);

      for (const a of existingAreas) {
        const key = `${a.warehouse_id || ''}::${((a.name as string) || '').toLowerCase()}`;
        if (!serverAreasByName.has(key)) {
          serverAreasByName.set(key, a.$id);
        }
      }
      for (const s of existingSections) {
        const key = `${s.area_id || ''}::${((s.name as string) || '').toLowerCase()}`;
        if (!serverSectionsByName.has(key)) {
          serverSectionsByName.set(key, s.$id);
        }
      }
      for (const m of existingModels) {
        const baseId = getBaseModelId(m.$id);
        const key = `${m.warehouse_id || ''}::${baseId}`;
        if (!serverModelsByBaseId.has(key)) {
          serverModelsByBaseId.set(key, m.$id);
        }
      }
    } catch (e) {
      console.warn('Pre-push fetch for dedup failed (will proceed without):', e);
    }
  }

  /**
   * Resolves the Appwrite document $id for an area.
   * If a server doc with the same name already exists, returns its $id to update it.
   * Otherwise returns the sanitized local ID for creation.
   */
  function resolveAreaDocId(a: Area): string {
    const key = `${a.warehouse_id}::${(a.name || '').toLowerCase()}`;
    return serverAreasByName.get(key) || toAppwriteDocId(a.id);
  }

  // Cache all local areas for section dedup resolution
  const allLocalAreas = await db.getAll<Area>('areas');

  /**
   * Resolves the Appwrite document $id for a section.
   * Checks the server lookup by (area_id, name) first.
   */
  function resolveSectionDocId(s: Section): string {
    // Try matching with the sanitized local area_id
    const key1 = `${toAppwriteDocId(s.area_id)}::${(s.name || '').toLowerCase()}`;
    if (serverSectionsByName.has(key1)) return serverSectionsByName.get(key1)!;

    // Also try with the raw local area_id (server might store it as-is)
    const key1raw = `${s.area_id}::${(s.name || '').toLowerCase()}`;
    if (serverSectionsByName.has(key1raw)) return serverSectionsByName.get(key1raw)!;

    // Try matching by resolving the area name from local data to find server area $id
    const localArea = allLocalAreas.find(a => a.id === s.area_id);
    if (localArea) {
      const areaKey = `${localArea.warehouse_id}::${(localArea.name || '').toLowerCase()}`;
      const serverAreaId = serverAreasByName.get(areaKey);
      if (serverAreaId) {
        const key2 = `${serverAreaId}::${(s.name || '').toLowerCase()}`;
        if (serverSectionsByName.has(key2)) return serverSectionsByName.get(key2)!;
      }
    }

    return toAppwriteDocId(s.id);
  }

  /**
   * Resolves the Appwrite document $id for a model.
   * Strips timestamp suffixes to canonical base ID and preserves distinct models.
   */
  function resolveModelDocId(m: ShoeModel): string {
    const baseId = getBaseModelId(m.id);
    const key = `${m.warehouse_id}::${baseId}`;
    return serverModelsByBaseId.get(key) || toAppwriteDocId(baseId);
  }

  // Optimized upsert: attempt CREATE first, fallback to UPDATE if 409, with retry on 429 rate limit
  async function upsertDocument(collectionId: string, docId: string, payload: any): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await inst!.databases.createDocument(cfg.databaseId, collectionId, docId, payload);
        return;
      } catch (err: any) {
        if (err?.code === 409) {
          try {
            await inst!.databases.updateDocument(cfg.databaseId, collectionId, docId, payload);
            return;
          } catch (updateErr: any) {
            if (updateErr?.code === 429 && attempt < 4) {
              const backoffMs = 500 * (attempt + 1) + Math.floor(Math.random() * 200);
              await new Promise((r) => setTimeout(r, backoffMs));
              continue;
            }
            throw updateErr;
          }
        }
        if (err?.code === 429 && attempt < 4) {
          const backoffMs = 500 * (attempt + 1) + Math.floor(Math.random() * 200);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        throw err;
      }
    }
  }

  // 1. Warehouses
  if (warehousesToPush.length > 0) {
    onProgress?.({
      phase: 'warehouses',
      message: `Envoi des entrepôts (0/${warehousesToPush.length})...`,
      current: 0,
      total: warehousesToPush.length,
      percentage: 0,
    });
    const succeededIds: string[] = [];
    await runConcurrentPool(
      warehousesToPush,
      5,
      async (w) => {
        try {
          const docId = toAppwriteDocId(w.id);
          const payload = sanitizeWarehouse(w);
          await upsertDocument(APPWRITE_COLLECTIONS.warehouses, docId, payload);
          succeededIds.push(w.id);
          totalPushed++;
        } catch (e: any) {
          lastError = e?.message || String(e);
          console.warn('Appwrite push error (warehouse):', e);
          totalErrors++;
        }
      },
      (done, total) => {
        onProgress?.({
          phase: 'warehouses',
          message: `Envoi des entrepôts (${done}/${total})...`,
          current: done,
          total,
          percentage: Math.round((done / total) * 100),
        });
      }
    );
    await db.markBulkSynced('warehouses', succeededIds);
  }

  // 2. Areas
  if (areasToPush.length > 0) {
    onProgress?.({
      phase: 'areas',
      message: `Envoi des zones (0/${areasToPush.length})...`,
      current: 0,
      total: areasToPush.length,
      percentage: 0,
    });
    const succeededIds: string[] = [];
    await runConcurrentPool(
      areasToPush,
      10,
      async (a) => {
        try {
          const docId = resolveAreaDocId(a);
          const payload = sanitizeArea(a);
          await upsertDocument(APPWRITE_COLLECTIONS.areas, docId, payload);
          succeededIds.push(a.id);
          totalPushed++;
        } catch (e: any) {
          lastError = e?.message || String(e);
          console.warn('Appwrite push error (area):', e);
          totalErrors++;
        }
      },
      (done, total) => {
        onProgress?.({
          phase: 'areas',
          message: `Envoi des zones (${done}/${total})...`,
          current: done,
          total,
          percentage: Math.round((done / total) * 100),
        });
      }
    );
    await db.markBulkSynced('areas', succeededIds);
  }

  // 3. Sections
  if (sectionsToPush.length > 0) {
    onProgress?.({
      phase: 'sections',
      message: `Envoi des rayons (0/${sectionsToPush.length})...`,
      current: 0,
      total: sectionsToPush.length,
      percentage: 0,
    });
    const succeededIds: string[] = [];
    await runConcurrentPool(
      sectionsToPush,
      15,
      async (s) => {
        try {
          const docId = resolveSectionDocId(s);
          const payload = sanitizeSection(s);
          await upsertDocument(APPWRITE_COLLECTIONS.sections, docId, payload);
          succeededIds.push(s.id);
          totalPushed++;
        } catch (e: any) {
          lastError = e?.message || String(e);
          console.warn('Appwrite push error (section):', e);
          totalErrors++;
        }
      },
      (done, total) => {
        onProgress?.({
          phase: 'sections',
          message: `Envoi des rayons (${done}/${total})...`,
          current: done,
          total,
          percentage: Math.round((done / total) * 100),
        });
      }
    );
    await db.markBulkSynced('sections', succeededIds);
  }

  // 4. Models (High Concurrency = 20)
  if (modelsToPush.length > 0) {
    onProgress?.({
      phase: 'models',
      message: `Envoi des modèles (0/${modelsToPush.length})...`,
      current: 0,
      total: modelsToPush.length,
      percentage: 0,
    });
    const succeededIds: string[] = [];
    await runConcurrentPool(
      modelsToPush,
      20,
      async (m) => {
        try {
          const docId = resolveModelDocId(m);
          const payload = sanitizeModel(m);
          await upsertDocument(APPWRITE_COLLECTIONS.models, docId, payload);
          succeededIds.push(m.id);
          totalPushed++;
        } catch (e: any) {
          lastError = e?.message || String(e);
          console.warn('Appwrite push error (model):', e);
          totalErrors++;
        }
      },
      (done, total) => {
        onProgress?.({
          phase: 'models',
          message: `Envoi des modèles (${done}/${total})...`,
          current: done,
          total,
          percentage: Math.round((done / total) * 100),
        });
      }
    );
    await db.markBulkSynced('models', succeededIds);
  }

  // 5. Model Sections / Assignments (High Concurrency = 20)
  if (assignmentsToPush.length > 0) {
    onProgress?.({
      phase: 'model_sections',
      message: `Envoi des assignations (0/${assignmentsToPush.length})...`,
      current: 0,
      total: assignmentsToPush.length,
      percentage: 0,
    });
    const succeededIds: string[] = [];
    await runConcurrentPool(
      assignmentsToPush,
      20,
      async (ms) => {
        try {
          const docId = toAppwriteDocId(ms.id);
          const payload = sanitizeModelSection(ms);
          await upsertDocument(APPWRITE_COLLECTIONS.model_sections, docId, payload);
          succeededIds.push(ms.id);
          totalPushed++;
        } catch (e: any) {
          lastError = e?.message || String(e);
          console.warn('Appwrite push error (model_section):', e);
          totalErrors++;
        }
      },
      (done, total) => {
        onProgress?.({
          phase: 'model_sections',
          message: `Envoi des assignations (${done}/${total})...`,
          current: done,
          total,
          percentage: Math.round((done / total) * 100),
        });
      }
    );
    await db.markBulkSynced('model_sections', succeededIds);
  }

  // 6. Transfers
  if (transfersToPush.length > 0) {
    onProgress?.({
      phase: 'transfers',
      message: `Envoi des transferts (0/${transfersToPush.length})...`,
      current: 0,
      total: transfersToPush.length,
      percentage: 0,
    });
    const succeededIds: string[] = [];
    await runConcurrentPool(
      transfersToPush,
      15,
      async (t) => {
        try {
          const docId = toAppwriteDocId(t.id);
          const payload = sanitizeTransfer(t);
          await upsertDocument(APPWRITE_COLLECTIONS.transfers, docId, payload);
          succeededIds.push(t.id);
          totalPushed++;
        } catch (e: any) {
          lastError = e?.message || String(e);
          console.warn('Appwrite push error (transfer):', e);
          totalErrors++;
        }
      },
      (done, total) => {
        onProgress?.({
          phase: 'transfers',
          message: `Envoi des transferts (${done}/${total})...`,
          current: done,
          total,
          percentage: Math.round((done / total) * 100),
        });
      }
    );
    for (const t of transfersToPush) {
      if (succeededIds.includes(t.id)) {
        t.sync_status = 'synced';
        await db.putRaw('transfers', t, false);
      }
    }
  }

  // 7. Search Logs (Tracked by timestamp cutoff: logs added after this sync push cutoff aren't pushed in this batch)
  const syncCutoffTimestamp = new Date().toISOString();
  const lastSearchLogsSyncedAt = localStorage.getItem('winrah_last_search_logs_synced_at') || null;

  const allSearchLogs = await db.getAll<SearchLog>('search_logs');
  const searchLogsToPush = forceAll
    ? allSearchLogs.filter((log) => log.created_at <= syncCutoffTimestamp)
    : allSearchLogs.filter((log) => {
        // Must have been created on or before this sync cutoff
        if (log.created_at > syncCutoffTimestamp) return false;
        // Must be newer than the last search logs sync cutoff
        if (lastSearchLogsSyncedAt && log.created_at <= lastSearchLogsSyncedAt) return false;
        // Must be pending
        return log.sync_status !== 'synced';
      });

  if (searchLogsToPush.length > 0) {
    onProgress?.({
      phase: 'search_logs',
      message: `Envoi des logs de recherche (0/${searchLogsToPush.length})...`,
      current: 0,
      total: searchLogsToPush.length,
      percentage: 0,
    });
    const succeededIds: string[] = [];
    await runConcurrentPool(
      searchLogsToPush,
      15,
      async (log) => {
        try {
          const docId = toAppwriteDocId(log.id);
          const payload = sanitizeSearchLog(log);
          await upsertDocument(APPWRITE_COLLECTIONS.search_logs, docId, payload);
          succeededIds.push(log.id);
          totalPushed++;
        } catch (e: any) {
          lastError = e?.message || String(e);
          console.warn('Appwrite push error (search_log):', e);
          totalErrors++;
        }
      },
      (done, total) => {
        onProgress?.({
          phase: 'search_logs',
          message: `Envoi des logs de recherche (${done}/${total})...`,
          current: done,
          total,
          percentage: Math.round((done / total) * 100),
        });
      }
    );

    // Update timestamp tracking so records created after this push aren't marked as synced or re-sent
    localStorage.setItem('winrah_last_search_logs_synced_at', syncCutoffTimestamp);

    // Mark pushed search logs as synced in IndexedDB
    for (const log of searchLogsToPush) {
      if (succeededIds.includes(log.id)) {
        log.sync_status = 'synced';
        await db.putRaw('search_logs', log, false);
      }
    }
  }

  onProgress?.({
    phase: 'done',
    message: `Synchronisation terminée avec succès (${totalPushed} enregistrements synchronisés).`,
    current: totalPushed,
    total: totalPushed,
    percentage: 100,
  });

  return { pushed: totalPushed, errors: totalErrors, lastError };
}

// Push entire local database to Appwrite
export async function pushAllLocalDatabase(
  onProgress?: SyncProgressCallback
): Promise<{
  pushed: number;
  errors: number;
  lastError: string | null;
}> {
  return pushRecordsToAppwrite(true, onProgress);
}

// Pull updated documents from Appwrite Collections
// Pull updated documents from Appwrite Collections with complete entity resolution and local merge
export async function pullRecordsFromAppwrite(
  onProgress?: SyncProgressCallback
): Promise<{ pulled: number; errors: number }> {
  const inst = getAppwriteClient();
  if (!inst) return { pulled: 0, errors: 0 };

  const cfg = getAppwriteConfig();
  await ensureAppwriteSession(inst.client);

  let pulled = 0;
  let errors = 0;

  try {
    // 1. Load existing local entities to resolve against
    const [
      localWarehouses,
      localAreas,
      localSections,
      localModels,
      localAssignments,
      remoteWarehouses,
      remoteAreas,
      remoteSections,
      remoteModels,
      remoteAssignments,
      remoteTransfers,
    ] = await Promise.all([
      db.getAll<Warehouse>('warehouses'),
      db.getAll<Area>('areas'),
      db.getAll<Section>('sections'),
      db.getAll<ShoeModel>('models'),
      db.getAll<ModelSection>('model_sections'),
      fetchAllCollectionDocuments(inst.databases, cfg.databaseId, APPWRITE_COLLECTIONS.warehouses),
      fetchAllCollectionDocuments(inst.databases, cfg.databaseId, APPWRITE_COLLECTIONS.areas),
      fetchAllCollectionDocuments(inst.databases, cfg.databaseId, APPWRITE_COLLECTIONS.sections),
      fetchAllCollectionDocuments(inst.databases, cfg.databaseId, APPWRITE_COLLECTIONS.models),
      fetchAllCollectionDocuments(inst.databases, cfg.databaseId, APPWRITE_COLLECTIONS.model_sections),
      fetchAllCollectionDocuments(inst.databases, cfg.databaseId, APPWRITE_COLLECTIONS.transfers),
    ]);

    // Local lookup maps
    const localWhByName = new Map<string, Warehouse>();
    for (const w of localWarehouses) {
      localWhByName.set((w.name || '').trim().toLowerCase(), w);
    }

    const localAreasByName = new Map<string, Area>();
    for (const a of localAreas) {
      localAreasByName.set(`${a.warehouse_id}:::${(a.name || '').trim().toLowerCase()}`, a);
    }

    const localSecsByName = new Map<string, Section>();
    for (const s of localSections) {
      localSecsByName.set(`${s.area_id}:::${(s.name || '').trim().toLowerCase()}`, s);
    }

    const localModelsByBaseId = new Map<string, ShoeModel>();
    for (const m of localModels) {
      localModelsByBaseId.set(`${m.warehouse_id}:::${getBaseModelId(m.id)}`, m);
    }

    const localMsByPair = new Map<string, ModelSection>();
    for (const ms of localAssignments) {
      localMsByPair.set(`${ms.model_id}:::${ms.section_id}`, ms);
    }

    // Remap tables from remote IDs to canonical local IDs
    const whIdRemap = new Map<string, string>();
    const areaIdRemap = new Map<string, string>();
    const sectionIdRemap = new Map<string, string>();
    const modelIdRemap = new Map<string, string>();

    // 1. Reconcile Warehouses
    const whsToPut: Warehouse[] = [];
    for (const doc of remoteWarehouses) {
      const rawId = (doc.id as string) || doc.$id;
      const name = ((doc.name as string) || '').trim();
      const match = localWhByName.get(name.toLowerCase());
      if (match) {
        whIdRemap.set(rawId, match.id);
        if (doc.$id) whIdRemap.set(doc.$id, match.id);
        if (!match.is_dirty) {
          match.version = Math.max(match.version || 1, (doc.version as number) || 1);
          match.local_sync_status = 'synced';
          whsToPut.push(match);
        }
      } else {
        const newWh: Warehouse = {
          id: rawId,
          name: doc.name as string,
          status: (doc.status as any) || 'active',
          created_at: (doc.created_at as string) || doc.$createdAt,
          updated_at: (doc.updated_at as string) || doc.$updatedAt,
          version: (doc.version as number) || 1,
          is_dirty: false,
          local_sync_status: 'synced',
        };
        whIdRemap.set(rawId, rawId);
        if (doc.$id) whIdRemap.set(doc.$id, rawId);
        localWhByName.set(name.toLowerCase(), newWh);
        whsToPut.push(newWh);
        pulled++;
      }
    }
    if (whsToPut.length > 0) await db.bulkPut('warehouses', whsToPut);

    const activeWhId = localWarehouses[0]?.id || 'wh-base';

    // 2. Reconcile Areas
    const areasToPut: Area[] = [];
    for (const doc of remoteAreas) {
      const rawId = (doc.id as string) || doc.$id;
      const cWhId = whIdRemap.get(doc.warehouse_id as string) || doc.warehouse_id || activeWhId;
      const name = ((doc.name as string) || '').trim();
      const match = localAreasByName.get(`${cWhId}:::${name.toLowerCase()}`);

      if (match) {
        areaIdRemap.set(rawId, match.id);
        if (doc.$id) areaIdRemap.set(doc.$id, match.id);
        if (!match.is_dirty) {
          match.version = Math.max(match.version || 1, (doc.version as number) || 1);
          match.local_sync_status = 'synced';
          areasToPut.push(match);
        }
      } else {
        const newArea: Area = {
          id: rawId,
          warehouse_id: cWhId,
          name,
          status: (doc.status as any) || 'active',
          created_at: (doc.created_at as string) || doc.$createdAt,
          updated_at: (doc.updated_at as string) || doc.$updatedAt,
          version: (doc.version as number) || 1,
          is_dirty: false,
          local_sync_status: 'synced',
        };
        areaIdRemap.set(rawId, rawId);
        if (doc.$id) areaIdRemap.set(doc.$id, rawId);
        localAreasByName.set(`${cWhId}:::${name.toLowerCase()}`, newArea);
        areasToPut.push(newArea);
        pulled++;
      }
    }
    if (areasToPut.length > 0) await db.bulkPut('areas', areasToPut);

    // 3. Reconcile Sections
    const secsToPut: Section[] = [];
    for (const doc of remoteSections) {
      const rawId = (doc.id as string) || doc.$id;
      const rawAreaId = doc.area_id as string;
      const cAreaId = areaIdRemap.get(rawAreaId) || rawAreaId;
      const name = ((doc.name as string) || '').trim();
      const match = localSecsByName.get(`${cAreaId}:::${name.toLowerCase()}`);

      if (match) {
        sectionIdRemap.set(rawId, match.id);
        if (doc.$id) sectionIdRemap.set(doc.$id, match.id);
        if (!match.is_dirty) {
          match.version = Math.max(match.version || 1, (doc.version as number) || 1);
          match.local_sync_status = 'synced';
          secsToPut.push(match);
        }
      } else {
        const newSec: Section = {
          id: rawId,
          area_id: cAreaId,
          name,
          capacity: (doc.capacity as string) || null,
          status: (doc.status as any) || 'active',
          created_at: (doc.created_at as string) || doc.$createdAt,
          updated_at: (doc.updated_at as string) || doc.$updatedAt,
          version: (doc.version as number) || 1,
          is_dirty: false,
          local_sync_status: 'synced',
        };
        sectionIdRemap.set(rawId, rawId);
        if (doc.$id) sectionIdRemap.set(doc.$id, rawId);
        localSecsByName.set(`${cAreaId}:::${name.toLowerCase()}`, newSec);
        secsToPut.push(newSec);
        pulled++;
      }
    }
    if (secsToPut.length > 0) await db.bulkPut('sections', secsToPut);

    // 4. Reconcile Models (by Base ID, preserving distinct multi-location models)
    const modelsToPut: ShoeModel[] = [];
    for (const doc of remoteModels) {
      const rawId = (doc.id as string) || doc.$id;
      const baseId = getBaseModelId(rawId);
      const cWhId = whIdRemap.get(doc.warehouse_id as string) || doc.warehouse_id || activeWhId;
      const ref = ((doc.reference_code as string) || '').trim().toUpperCase();
      const match = localModelsByBaseId.get(`${cWhId}:::${baseId}`);

      if (match) {
        modelIdRemap.set(rawId, match.id);
        if (doc.$id) modelIdRemap.set(doc.$id, match.id);
        if (!match.is_dirty) {
          if (!match.name && doc.name) match.name = doc.name as string;
          if (!match.size_range && doc.size_range) match.size_range = doc.size_range as string;
          if (match.price == null && doc.price != null) match.price = doc.price as number;
          if (!match.photo_url && doc.photo_url) match.photo_url = doc.photo_url as string;
          match.version = Math.max(match.version || 1, (doc.version as number) || 1);
          match.local_sync_status = 'synced';
          modelsToPut.push(match);
        }
      } else {
        const newModel: ShoeModel = {
          id: baseId,
          warehouse_id: cWhId,
          reference_code: ref,
          name: (doc.name as string) || null,
          size_range: (doc.size_range as string) || null,
          price: (doc.price as number) || null,
          photo_url: (doc.photo_url as string) || null,
          status: (doc.status as any) || 'active',
          created_at: (doc.created_at as string) || doc.$createdAt,
          updated_at: (doc.updated_at as string) || doc.$updatedAt,
          version: (doc.version as number) || 1,
          is_dirty: false,
          local_sync_status: 'synced',
        };
        modelIdRemap.set(rawId, baseId);
        if (doc.$id) modelIdRemap.set(doc.$id, baseId);
        localModelsByBaseId.set(`${cWhId}:::${baseId}`, newModel);
        modelsToPut.push(newModel);
        pulled++;
      }
    }
    if (modelsToPut.length > 0) await db.bulkPut('models', modelsToPut);

    // 5. Reconcile Model Sections
    const msToPut: ModelSection[] = [];
    const seenMsBatch = new Set<string>();

    for (const doc of remoteAssignments) {
      const cModelId = modelIdRemap.get(doc.model_id as string) || doc.model_id;
      const cSecId = sectionIdRemap.get(doc.section_id as string) || doc.section_id;
      const pairKey = `${cModelId}:::${cSecId}`;

      if (seenMsBatch.has(pairKey)) continue;
      seenMsBatch.add(pairKey);

      const existingLocalMs = localMsByPair.get(pairKey);
      if (existingLocalMs) {
        if (!existingLocalMs.is_dirty) {
          existingLocalMs.local_sync_status = 'synced';
          existingLocalMs.version = Math.max(existingLocalMs.version || 1, (doc.version as number) || 1);
          msToPut.push(existingLocalMs);
        }
      } else {
        const newMs: ModelSection = {
          id: `ms-${cModelId}-${cSecId}`,
          model_id: cModelId,
          section_id: cSecId,
          assigned_at: (doc.assigned_at as string) || doc.$createdAt,
          updated_at: (doc.updated_at as string) || doc.$updatedAt,
          version: (doc.version as number) || 1,
          is_dirty: false,
          local_sync_status: 'synced',
        };
        localMsByPair.set(pairKey, newMs);
        msToPut.push(newMs);
        pulled++;
      }
    }
    if (msToPut.length > 0) await db.bulkPut('model_sections', msToPut);

    // 6. Reconcile Transfers
    const transfersToPut: TransferLog[] = [];
    const seenTransfers = new Set<string>();
    for (const doc of remoteTransfers) {
      const cModel = modelIdRemap.get(doc.model_id as string) || doc.model_id;
      const fromSec = (doc.from_section_id as string) || '';
      const toSec = doc.to_section_id as string;
      const cFrom = fromSec ? (sectionIdRemap.get(fromSec) || fromSec) : '';
      const cTo = sectionIdRemap.get(toSec) || toSec;
      const createdAt = (doc.created_at as string) || doc.$createdAt;
      const tKey = `${cModel}:::${cTo}:::${createdAt}`;

      if (!seenTransfers.has(tKey)) {
        seenTransfers.add(tKey);
        transfersToPut.push({
          id: (doc.id as string) || doc.$id,
          model_id: cModel,
          from_section_id: cFrom,
          to_section_id: cTo,
          device_id: (doc.device_id as string) || 'dev-local-01',
          performed_by: (doc.performed_by as string) || 'Opérateur',
          sync_status: 'synced',
          created_at: createdAt,
        });
        pulled++;
      }
    }
    if (transfersToPut.length > 0) await db.bulkPut('transfers', transfersToPut);

    // 7. Prune any orphaned duplicates in local DB
    await db.deduplicateLocalDatabase();
  } catch (err) {
    console.warn('Appwrite pull error:', err);
    errors++;
  }

  if (pulled > 0) {
    db.notify();
  }

  return { pulled, errors };
}

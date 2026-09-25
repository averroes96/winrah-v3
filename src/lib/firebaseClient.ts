// ============================================================================
// WINRAH - Firebase Firestore Backend Client & Cloud Sync
// Provides high-throughput batched sync (writeBatch up to 500 ops per commit),
// eliminating client-side rate limits, 429 errors, and slow individual updates.
// ============================================================================

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  writeBatch,
  getDocs,
  query,
  limit,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../db/indexedDb';
import {
  Warehouse,
  Area,
  Section,
  ShoeModel,
  ModelSection,
  TransferLog,
  SearchLog,
  AuditLog,
} from '../types';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

export interface SyncProgressUpdate {
  phase:
    | 'init'
    | 'warehouses'
    | 'areas'
    | 'sections'
    | 'models'
    | 'model_sections'
    | 'transfers'
    | 'search_logs'
    | 'audit_logs'
    | 'fetching'
    | 'done';
  message: string;
  current: number;
  total: number;
  percentage: number;
}

export type SyncProgressCallback = (update: SyncProgressUpdate) => void;

export const FIREBASE_COLLECTIONS = {
  warehouses: 'warehouses',
  areas: 'areas',
  sections: 'sections',
  models: 'models',
  model_sections: 'model_sections',
  transfers: 'transfers',
  search_logs: 'search_logs',
  audit_logs: 'audit_logs',
} as const;

export const PRESERVED_FIREBASE_COLLECTIONS = new Set<string>([
  FIREBASE_COLLECTIONS.search_logs,
  FIREBASE_COLLECTIONS.audit_logs,
]);

export const WIPABLE_FIREBASE_COLLECTIONS = [
  FIREBASE_COLLECTIONS.model_sections,
  FIREBASE_COLLECTIONS.transfers,
  FIREBASE_COLLECTIONS.models,
  FIREBASE_COLLECTIONS.sections,
  FIREBASE_COLLECTIONS.areas,
  FIREBASE_COLLECTIONS.warehouses,
] as const;

export function getFirebaseConfig(): FirebaseConfig {
  const env = (import.meta as any).env || {};
  return {
    apiKey:
      env.VITE_FIREBASE_API_KEY ||
      localStorage.getItem('winrah_firebase_api_key') ||
      '',
    authDomain:
      env.VITE_FIREBASE_AUTH_DOMAIN ||
      localStorage.getItem('winrah_firebase_auth_domain') ||
      '',
    projectId:
      env.VITE_FIREBASE_PROJECT_ID ||
      localStorage.getItem('winrah_firebase_project_id') ||
      '',
    storageBucket:
      env.VITE_FIREBASE_STORAGE_BUCKET ||
      localStorage.getItem('winrah_firebase_storage_bucket') ||
      '',
    messagingSenderId:
      env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
      localStorage.getItem('winrah_firebase_messaging_sender_id') ||
      '',
    appId:
      env.VITE_FIREBASE_APP_ID ||
      localStorage.getItem('winrah_firebase_app_id') ||
      '',
  };
}

export function saveFirebaseConfig(config: Partial<FirebaseConfig>) {
  if (config.apiKey !== undefined) {
    localStorage.setItem('winrah_firebase_api_key', config.apiKey.trim());
  }
  if (config.authDomain !== undefined) {
    localStorage.setItem('winrah_firebase_auth_domain', config.authDomain.trim());
  }
  if (config.projectId !== undefined) {
    localStorage.setItem('winrah_firebase_project_id', config.projectId.trim());
  }
  if (config.storageBucket !== undefined) {
    localStorage.setItem('winrah_firebase_storage_bucket', config.storageBucket.trim());
  }
  if (config.messagingSenderId !== undefined) {
    localStorage.setItem('winrah_firebase_messaging_sender_id', config.messagingSenderId.trim());
  }
  if (config.appId !== undefined) {
    localStorage.setItem('winrah_firebase_app_id', config.appId.trim());
  }
}

export function isFirebaseConfigured(): boolean {
  const cfg = getFirebaseConfig();
  return Boolean(cfg.apiKey && cfg.projectId);
}

let cachedApp: FirebaseApp | null = null;
let cachedFirestore: Firestore | null = null;

export function getFirebaseClient(): { app: FirebaseApp; firestore: Firestore } | null {
  const cfg = getFirebaseConfig();
  if (!cfg.apiKey || !cfg.projectId) return null;

  try {
    if (!cachedApp) {
      const existingApps = getApps();
      cachedApp = existingApps.length > 0 ? getApp() : initializeApp(cfg);
    }
    if (!cachedFirestore) {
      cachedFirestore = getFirestore(cachedApp);
    }
    return { app: cachedApp, firestore: cachedFirestore };
  } catch (err) {
    console.error('Failed to initialize Firebase client:', err);
    return null;
  }
}

/**
 * Wipes business collections to 0 documents using high-speed batches (up to 450 deletes/commit).
 * Strictly preserves search_logs and audit_logs.
 */
export async function clearFirebaseDatabase(
  onProgress?: SyncProgressCallback
): Promise<{ deleted: number }> {
  const inst = getFirebaseClient();
  if (!inst) throw new Error('Client Firebase non configuré.');
  const { firestore } = inst;

  let grandTotalDeleted = 0;
  const collections = WIPABLE_FIREBASE_COLLECTIONS;

  for (let i = 0; i < collections.length; i++) {
    const colName = collections[i];
    let totalDeletedInCol = 0;

    onProgress?.({
      phase: 'init',
      message: `Nettoyage Firebase : vidage de "${colName}"...`,
      current: i,
      total: collections.length,
      percentage: Math.round((i / collections.length) * 100),
    });

    while (true) {
      // Query up to 450 documents (Firestore batch limit is 500 operations)
      const q = query(collection(firestore, colName), limit(450));
      const snap = await getDocs(q);

      if (snap.empty) {
        break;
      }

      const batch = writeBatch(firestore);
      snap.docs.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });

      await batch.commit();

      totalDeletedInCol += snap.docs.length;
      grandTotalDeleted += snap.docs.length;

      onProgress?.({
        phase: 'init',
        message: `Nettoyage Firebase : "${colName}" (${totalDeletedInCol} supprimés)...`,
        current: i,
        total: collections.length,
        percentage: Math.min(99, Math.round(((i + 0.5) / collections.length) * 100)),
      });
    }
  }

  return { deleted: grandTotalDeleted };
}

/**
 * Sanitizers for clean Firestore document structure
 */
function sanitizeWarehouse(w: Warehouse) {
  return {
    id: w.id,
    name: w.name,
    status: w.status || 'active',
    version: Number(w.version) || 1,
    created_at: w.created_at || new Date().toISOString(),
    updated_at: w.updated_at || new Date().toISOString(),
  };
}

function sanitizeArea(a: Area) {
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

function sanitizeSection(s: Section) {
  return {
    id: s.id,
    area_id: s.area_id,
    name: s.name,
    capacity: s.capacity ? String(s.capacity) : null,
    status: s.status || 'active',
    version: Number(s.version) || 1,
    created_at: s.created_at || new Date().toISOString(),
    updated_at: s.updated_at || new Date().toISOString(),
  };
}

function sanitizeModel(m: ShoeModel) {
  return {
    id: m.id,
    warehouse_id: m.warehouse_id,
    reference_code: m.reference_code,
    name: m.name || null,
    size_range: m.size_range || null,
    price: m.price !== undefined && m.price !== null ? Number(m.price) : null,
    photo_url: m.photo_url || null,
    status: m.status || 'active',
    version: Number(m.version) || 1,
    created_at: m.created_at || new Date().toISOString(),
    updated_at: m.updated_at || new Date().toISOString(),
  };
}

function sanitizeModelSection(ms: ModelSection) {
  return {
    id: ms.id,
    model_id: ms.model_id,
    section_id: ms.section_id,
    assigned_at: ms.assigned_at || new Date().toISOString(),
    updated_at: ms.updated_at || new Date().toISOString(),
    version: Number(ms.version) || 1,
  };
}

function sanitizeTransfer(t: TransferLog) {
  return {
    id: t.id,
    model_id: t.model_id,
    from_section_id: t.from_section_id || null,
    to_section_id: t.to_section_id,
    device_id: t.device_id,
    performed_by: t.performed_by || null,
    sync_status: 'synced',
    created_at: t.created_at || new Date().toISOString(),
  };
}

function sanitizeSearchLog(sl: SearchLog) {
  return {
    id: sl.id,
    device_id: sl.device_id || 'unknown',
    query_text: sl.query_text || '',
    result_count: Number(sl.result_count) || 0,
    warehouse_id: sl.warehouse_id ?? null,
    created_at: sl.created_at || new Date().toISOString(),
    is_everywhere: Boolean(sl.is_everywhere),
  };
}

function sanitizeAuditLog(al: AuditLog) {
  return {
    id: al.id,
    device_id: al.device_id || 'unknown',
    entity_type: al.entity_type || 'unknown',
    entity_id: al.entity_id || 'unknown',
    action: al.action || 'update',
    changes: al.changes ? JSON.parse(JSON.stringify(al.changes)) : null,
    created_at: al.created_at || new Date().toISOString(),
  };
}

/**
 * Commits an array of items to Firestore in chunks of up to 450 items per writeBatch
 */
async function commitBatchChunks<T>(
  firestore: Firestore,
  collectionName: string,
  items: T[],
  getId: (item: T) => string,
  sanitize: (item: T) => DocumentData,
  onProgress?: (done: number, total: number) => void
): Promise<string[]> {
  if (items.length === 0) return [];

  const BATCH_SIZE = 450;
  const succeededIds: string[] = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(firestore);

    for (const item of chunk) {
      const docId = getId(item);
      const docRef = doc(firestore, collectionName, docId);
      batch.set(docRef, sanitize(item), { merge: true });
    }

    await batch.commit();

    for (const item of chunk) {
      succeededIds.push(getId(item));
    }

    if (onProgress) {
      onProgress(Math.min(items.length, i + chunk.length), items.length);
    }
  }

  return succeededIds;
}

/**
 * High-speed batched push of local records to Firestore collections.
 * Uses atomic writeBatch chunks of up to 450 operations per network call.
 */
export async function pushRecordsToFirebase(
  forceAll: boolean = false,
  onProgress?: SyncProgressCallback
): Promise<{ pushed: number; errors: number; lastError: string | null }> {
  const inst = getFirebaseClient();
  if (!inst) return { pushed: 0, errors: 0, lastError: 'Client Firebase non configuré.' };

  const { firestore } = inst;

  onProgress?.({
    phase: 'init',
    message: 'Initialisation de la synchronisation Firebase...',
    current: 0,
    total: 100,
    percentage: 5,
  });

  // Deduplicate local database prior to push
  await db.deduplicateLocalDatabase();

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

  try {
    // If forceAll is requested, clear the server database first (except search_logs and audit_logs)
    if (forceAll) {
      onProgress?.({
        phase: 'init',
        message: 'Vidage préalable du serveur Firebase...',
        current: 0,
        total: 100,
        percentage: 10,
      });
      await clearFirebaseDatabase(onProgress);
    }
    // 1. Warehouses
    if (warehousesToPush.length > 0) {
      onProgress?.({
        phase: 'warehouses',
        message: `Envoi des entrepôts (${warehousesToPush.length})...`,
        current: 0,
        total: warehousesToPush.length,
        percentage: 15,
      });
      const ids = await commitBatchChunks(
        firestore,
        FIREBASE_COLLECTIONS.warehouses,
        warehousesToPush,
        (w) => w.id,
        sanitizeWarehouse
      );
      await db.markBulkSynced('warehouses', ids);
      totalPushed += ids.length;
    }

    // 2. Areas
    if (areasToPush.length > 0) {
      onProgress?.({
        phase: 'areas',
        message: `Envoi des zones (${areasToPush.length})...`,
        current: 0,
        total: areasToPush.length,
        percentage: 30,
      });
      const ids = await commitBatchChunks(
        firestore,
        FIREBASE_COLLECTIONS.areas,
        areasToPush,
        (a) => a.id,
        sanitizeArea
      );
      await db.markBulkSynced('areas', ids);
      totalPushed += ids.length;
    }

    // 3. Sections
    if (sectionsToPush.length > 0) {
      onProgress?.({
        phase: 'sections',
        message: `Envoi des rayons (${sectionsToPush.length})...`,
        current: 0,
        total: sectionsToPush.length,
        percentage: 45,
      });
      const ids = await commitBatchChunks(
        firestore,
        FIREBASE_COLLECTIONS.sections,
        sectionsToPush,
        (s) => s.id,
        sanitizeSection
      );
      await db.markBulkSynced('sections', ids);
      totalPushed += ids.length;
    }

    // 4. Models (Batch commit of ~1,400 models completes in ~3 network requests!)
    if (modelsToPush.length > 0) {
      onProgress?.({
        phase: 'models',
        message: `Envoi des modèles (${modelsToPush.length})...`,
        current: 0,
        total: modelsToPush.length,
        percentage: 60,
      });
      const ids = await commitBatchChunks(
        firestore,
        FIREBASE_COLLECTIONS.models,
        modelsToPush,
        (m) => m.id,
        sanitizeModel,
        (done, total) => {
          onProgress?.({
            phase: 'models',
            message: `Envoi des modèles (${done}/${total})...`,
            current: done,
            total,
            percentage: Math.round(60 + (done / total) * 20),
          });
        }
      );
      await db.markBulkSynced('models', ids);
      totalPushed += ids.length;
    }

    // 5. Model Sections / Assignments
    if (assignmentsToPush.length > 0) {
      onProgress?.({
        phase: 'model_sections',
        message: `Envoi des assignations (${assignmentsToPush.length})...`,
        current: 0,
        total: assignmentsToPush.length,
        percentage: 80,
      });
      const ids = await commitBatchChunks(
        firestore,
        FIREBASE_COLLECTIONS.model_sections,
        assignmentsToPush,
        (ms) => ms.id,
        sanitizeModelSection
      );
      await db.markBulkSynced('model_sections', ids);
      totalPushed += ids.length;
    }

    // 6. Transfers
    if (transfersToPush.length > 0) {
      onProgress?.({
        phase: 'transfers',
        message: `Envoi des transferts (${transfersToPush.length})...`,
        current: 0,
        total: transfersToPush.length,
        percentage: 90,
      });
      const ids = await commitBatchChunks(
        firestore,
        FIREBASE_COLLECTIONS.transfers,
        transfersToPush,
        (t) => t.id,
        sanitizeTransfer
      );
      for (const t of transfersToPush) {
        if (ids.includes(t.id)) {
          t.sync_status = 'synced';
          await db.putRaw('transfers', t, false);
        }
      }
      totalPushed += ids.length;
    }

    // 7. Search Logs (Filtered by cutoff timestamp)
    const syncCutoff = new Date().toISOString();
    const allSearchLogs = await db.getAll<SearchLog>('search_logs');
    const searchLogsToPush = forceAll
      ? allSearchLogs.filter((log) => log.created_at <= syncCutoff)
      : allSearchLogs.filter((log) => {
          if (log.created_at > syncCutoff) return false;
          return log.sync_status !== 'synced';
        });

    if (searchLogsToPush.length > 0) {
      onProgress?.({
        phase: 'search_logs',
        message: `Envoi des logs de recherche (${searchLogsToPush.length})...`,
        current: 0,
        total: searchLogsToPush.length,
        percentage: 94,
      });
      const ids = await commitBatchChunks(
        firestore,
        FIREBASE_COLLECTIONS.search_logs,
        searchLogsToPush,
        (sl) => sl.id,
        sanitizeSearchLog
      );
      localStorage.setItem('winrah_last_search_logs_synced_at', syncCutoff);
      for (const sl of searchLogsToPush) {
        if (ids.includes(sl.id)) {
          sl.sync_status = 'synced';
          await db.putRaw('search_logs', sl, false);
        }
      }
      totalPushed += ids.length;
    }

    // 8. Audit Logs (Filtered by cutoff timestamp)
    const allAuditLogs = await db.getAll<AuditLog>('audit_logs');
    const auditLogsToPush = forceAll
      ? allAuditLogs.filter((log) => log.created_at <= syncCutoff)
      : allAuditLogs.filter((log) => {
          if (log.created_at > syncCutoff) return false;
          return log.sync_status !== 'synced';
        });

    if (auditLogsToPush.length > 0) {
      onProgress?.({
        phase: 'audit_logs',
        message: `Envoi du journal d'audit (${auditLogsToPush.length})...`,
        current: 0,
        total: auditLogsToPush.length,
        percentage: 98,
      });
      const ids = await commitBatchChunks(
        firestore,
        FIREBASE_COLLECTIONS.audit_logs,
        auditLogsToPush,
        (al) => al.id,
        sanitizeAuditLog
      );
      localStorage.setItem('winrah_last_audit_logs_synced_at', syncCutoff);
      for (const al of auditLogsToPush) {
        if (ids.includes(al.id)) {
          al.sync_status = 'synced';
          await db.putRaw('audit_logs', al, false);
        }
      }
      totalPushed += ids.length;
    }

    onProgress?.({
      phase: 'done',
      message: `Synchronisation Firebase terminée (${totalPushed} enregistrements).`,
      current: totalPushed,
      total: totalPushed,
      percentage: 100,
    });
  } catch (err: any) {
    totalErrors++;
    lastError = err?.message || String(err);
    console.error('Firebase sync error:', err);
  }

  return { pushed: totalPushed, errors: totalErrors, lastError };
}

/**
 * Downloads entire server database from Firestore with full deduplication.
 */
export async function fetchFirebaseDatabase(
  reinitLocal: boolean = true,
  onProgress?: SyncProgressCallback
): Promise<{
  warehouses: number;
  areas: number;
  sections: number;
  models: number;
  assignments: number;
  transfers: number;
  search_logs: number;
  audit_logs: number;
  total: number;
}> {
  const inst = getFirebaseClient();
  if (!inst) throw new Error('Client Firebase non configuré.');

  const { firestore } = inst;

  onProgress?.({
    phase: 'fetching',
    message: 'Téléchargement des données depuis Firebase Firestore...',
    current: 0,
    total: 100,
    percentage: 10,
  });

  const [
    whSnap,
    areasSnap,
    secSnap,
    modelsSnap,
    msSnap,
    trSnap,
    slSnap,
    alSnap,
  ] = await Promise.all([
    getDocs(collection(firestore, FIREBASE_COLLECTIONS.warehouses)),
    getDocs(collection(firestore, FIREBASE_COLLECTIONS.areas)),
    getDocs(collection(firestore, FIREBASE_COLLECTIONS.sections)),
    getDocs(collection(firestore, FIREBASE_COLLECTIONS.models)),
    getDocs(collection(firestore, FIREBASE_COLLECTIONS.model_sections)),
    getDocs(collection(firestore, FIREBASE_COLLECTIONS.transfers)),
    getDocs(collection(firestore, FIREBASE_COLLECTIONS.search_logs)),
    getDocs(collection(firestore, FIREBASE_COLLECTIONS.audit_logs)),
  ]);

  const rawWarehouses = whSnap.docs.map((d) => ({ ...d.data(), id: d.id })) as Warehouse[];
  const rawAreas = areasSnap.docs.map((d) => ({ ...d.data(), id: d.id })) as Area[];
  const rawSections = secSnap.docs.map((d) => ({ ...d.data(), id: d.id })) as Section[];
  const rawModels = modelsSnap.docs.map((d) => ({ ...d.data(), id: d.id })) as ShoeModel[];
  const rawAssignments = msSnap.docs.map((d) => ({ ...d.data(), id: d.id })) as ModelSection[];
  const rawTransfers = trSnap.docs.map((d) => ({ ...d.data(), id: d.id })) as TransferLog[];
  const rawSearchLogs = slSnap.docs.map((d) => ({ ...d.data(), id: d.id })) as SearchLog[];
  const rawAuditLogs = alSnap.docs.map((d) => ({ ...d.data(), id: d.id })) as AuditLog[];

  if (reinitLocal) {
    await db.clearStore('model_sections');
    await db.clearStore('transfers');
    await db.clearStore('models');
    await db.clearStore('sections');
    await db.clearStore('areas');
    await db.clearStore('warehouses');
  }

  // Insert cleaned records locally with bulk transactions for maximum performance
  if (rawWarehouses.length > 0) {
    await db.bulkPut('warehouses', rawWarehouses.map(w => ({ ...w, local_sync_status: 'synced' as const, is_dirty: false })));
  }
  if (rawAreas.length > 0) {
    await db.bulkPut('areas', rawAreas.map(a => ({ ...a, local_sync_status: 'synced' as const, is_dirty: false })));
  }
  if (rawSections.length > 0) {
    await db.bulkPut('sections', rawSections.map(s => ({ ...s, local_sync_status: 'synced' as const, is_dirty: false })));
  }
  if (rawModels.length > 0) {
    await db.bulkPut('models', rawModels.map(m => ({ ...m, local_sync_status: 'synced' as const, is_dirty: false })));
  }
  if (rawAssignments.length > 0) {
    await db.bulkPut('model_sections', rawAssignments.map(ms => ({ ...ms, local_sync_status: 'synced' as const, is_dirty: false })));
  }
  if (rawTransfers.length > 0) {
    await db.bulkPut('transfers', rawTransfers.map(t => ({ ...t, sync_status: 'synced' as const })));
  }
  if (rawSearchLogs.length > 0) {
    await db.bulkPut('search_logs', rawSearchLogs.map(sl => ({ ...sl, sync_status: 'synced' as const })));
  }
  if (rawAuditLogs.length > 0) {
    await db.bulkPut('audit_logs', rawAuditLogs.map(al => ({ ...al, sync_status: 'synced' as const })));
  }

  await db.deduplicateLocalDatabase();

  const total =
    rawWarehouses.length +
    rawAreas.length +
    rawSections.length +
    rawModels.length +
    rawAssignments.length +
    rawTransfers.length +
    rawSearchLogs.length +
    rawAuditLogs.length;

  onProgress?.({
    phase: 'done',
    message: `Base locale synchronisée avec succès (${total} enregistrements).`,
    current: total,
    total,
    percentage: 100,
  });

  return {
    warehouses: rawWarehouses.length,
    areas: rawAreas.length,
    sections: rawSections.length,
    models: rawModels.length,
    assignments: rawAssignments.length,
    transfers: rawTransfers.length,
    search_logs: rawSearchLogs.length,
    audit_logs: rawAuditLogs.length,
    total,
  };
}

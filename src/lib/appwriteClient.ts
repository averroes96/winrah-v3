// ============================================================================
// WINRAH - Appwrite Backend Client & Cloud Sync
// Provides connection management, schema mapping, and live bidirectional sync
// with Appwrite Database (Cloud or Self-Hosted)
// ============================================================================

import { Client, Databases, Query } from 'appwrite';
import { db } from '../db/indexedDb';
import { Warehouse, Area, Section, ShoeModel, ModelSection, TransferLog } from '../types';

export interface AppwriteConfig {
  endpoint: string;
  projectId: string;
  databaseId: string;
  apiKey?: string;
}

export const APPWRITE_COLLECTIONS = {
  warehouses: 'warehouses',
  areas: 'areas',
  sections: 'sections',
  models: 'models',
  model_sections: 'model_sections',
  transfers: 'transfers',
} as const;

export function getAppwriteConfig(): AppwriteConfig {
  return {
    endpoint: localStorage.getItem('winrah_appwrite_endpoint') || 'https://cloud.appwrite.io/v1',
    projectId: localStorage.getItem('winrah_appwrite_project_id') || '',
    databaseId: localStorage.getItem('winrah_appwrite_database_id') || 'winrah_db',
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

export function getAppwriteClient(): { client: Client; databases: Databases } | null {
  const cfg = getAppwriteConfig();
  if (!cfg.endpoint || !cfg.projectId) return null;

  const client = new Client();
  client.setEndpoint(cfg.endpoint).setProject(cfg.projectId);
  const databases = new Databases(client);

  return { client, databases };
}

export function toAppwriteDocId(rawId: string): string {
  let clean = rawId.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (/^[._-]/.test(clean)) {
    clean = 'doc_' + clean;
  }
  return clean.substring(0, 36);
}

function cleanPayload<T extends Record<string, any>>(record: T): Record<string, any> {
  const copy: Record<string, any> = { ...record };
  delete copy.is_dirty;
  delete copy.local_sync_status;
  delete copy.$id;
  delete copy.$createdAt;
  delete copy.$updatedAt;
  delete copy.$permissions;
  delete copy.$databaseId;
  delete copy.$collectionId;
  return copy;
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
      message: `Connexion Appwrite établie avec succès ! Base "${cfg.databaseId}" accessible (${res.total} entrepôts).`,
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

// Push local dirty records to Appwrite Collections
export async function pushRecordsToAppwrite(): Promise<{ pushed: number; errors: number }> {
  const inst = getAppwriteClient();
  if (!inst) return { pushed: 0, errors: 0 };

  const cfg = getAppwriteConfig();
  const dirty = await db.getDirtyRecords();
  let pushed = 0;
  let errors = 0;

  // 1. Warehouses
  for (const w of dirty.warehouses) {
    try {
      const docId = toAppwriteDocId(w.id);
      const payload = cleanPayload(w);
      try {
        await inst.databases.updateDocument(cfg.databaseId, APPWRITE_COLLECTIONS.warehouses, docId, payload);
      } catch (err: any) {
        if (err?.code === 404) {
          await inst.databases.createDocument(cfg.databaseId, APPWRITE_COLLECTIONS.warehouses, docId, payload);
        } else {
          throw err;
        }
      }
      await db.markSynced('warehouses', w.id, w.version || 1);
      pushed++;
    } catch (e) {
      console.warn('Appwrite push error (warehouse):', e);
      errors++;
    }
  }

  // 2. Areas
  for (const a of dirty.areas) {
    try {
      const docId = toAppwriteDocId(a.id);
      const payload = cleanPayload(a);
      try {
        await inst.databases.updateDocument(cfg.databaseId, APPWRITE_COLLECTIONS.areas, docId, payload);
      } catch (err: any) {
        if (err?.code === 404) {
          await inst.databases.createDocument(cfg.databaseId, APPWRITE_COLLECTIONS.areas, docId, payload);
        } else {
          throw err;
        }
      }
      await db.markSynced('areas', a.id, a.version || 1);
      pushed++;
    } catch (e) {
      console.warn('Appwrite push error (area):', e);
      errors++;
    }
  }

  // 3. Sections
  for (const s of dirty.sections) {
    try {
      const docId = toAppwriteDocId(s.id);
      const payload = cleanPayload(s);
      try {
        await inst.databases.updateDocument(cfg.databaseId, APPWRITE_COLLECTIONS.sections, docId, payload);
      } catch (err: any) {
        if (err?.code === 404) {
          await inst.databases.createDocument(cfg.databaseId, APPWRITE_COLLECTIONS.sections, docId, payload);
        } else {
          throw err;
        }
      }
      await db.markSynced('sections', s.id, s.version || 1);
      pushed++;
    } catch (e) {
      console.warn('Appwrite push error (section):', e);
      errors++;
    }
  }

  // 4. Models
  for (const m of dirty.models) {
    try {
      const docId = toAppwriteDocId(m.id);
      const payload = cleanPayload(m);
      try {
        await inst.databases.updateDocument(cfg.databaseId, APPWRITE_COLLECTIONS.models, docId, payload);
      } catch (err: any) {
        if (err?.code === 404) {
          await inst.databases.createDocument(cfg.databaseId, APPWRITE_COLLECTIONS.models, docId, payload);
        } else {
          throw err;
        }
      }
      await db.markSynced('models', m.id, m.version || 1);
      pushed++;
    } catch (e) {
      console.warn('Appwrite push error (model):', e);
      errors++;
    }
  }

  // 5. Model Sections
  for (const ms of dirty.model_sections) {
    try {
      const docId = toAppwriteDocId(ms.id);
      const payload = cleanPayload(ms);
      try {
        await inst.databases.updateDocument(cfg.databaseId, APPWRITE_COLLECTIONS.model_sections, docId, payload);
      } catch (err: any) {
        if (err?.code === 404) {
          await inst.databases.createDocument(cfg.databaseId, APPWRITE_COLLECTIONS.model_sections, docId, payload);
        } else {
          throw err;
        }
      }
      await db.markSynced('model_sections', ms.id, ms.version || 1);
      pushed++;
    } catch (e) {
      console.warn('Appwrite push error (model_section):', e);
      errors++;
    }
  }

  // 6. Transfers
  for (const t of dirty.transfers) {
    try {
      const docId = toAppwriteDocId(t.id);
      const payload = cleanPayload(t);
      try {
        await inst.databases.updateDocument(cfg.databaseId, APPWRITE_COLLECTIONS.transfers, docId, payload);
      } catch (err: any) {
        if (err?.code === 404) {
          await inst.databases.createDocument(cfg.databaseId, APPWRITE_COLLECTIONS.transfers, docId, payload);
        } else {
          throw err;
        }
      }
      t.sync_status = 'synced';
      await db.putRaw('transfers', t);
      pushed++;
    } catch (e) {
      console.warn('Appwrite push error (transfer):', e);
      errors++;
    }
  }

  return { pushed, errors };
}

// Pull updated documents from Appwrite Collections
export async function pullRecordsFromAppwrite(): Promise<{ pulled: number; errors: number }> {
  const inst = getAppwriteClient();
  if (!inst) return { pulled: 0, errors: 0 };

  const cfg = getAppwriteConfig();
  let pulled = 0;
  let errors = 0;

  try {
    // 1. Warehouses
    const remoteWarehouses = await inst.databases.listDocuments(cfg.databaseId, APPWRITE_COLLECTIONS.warehouses, [Query.limit(100)]);
    for (const doc of remoteWarehouses.documents) {
      const item: Warehouse = {
        id: (doc.id as string) || doc.$id,
        name: doc.name as string,
        status: (doc.status as any) || 'active',
        created_at: (doc.created_at as string) || doc.$createdAt,
        updated_at: (doc.updated_at as string) || doc.$updatedAt,
        version: (doc.version as number) || 1,
        is_dirty: false,
        local_sync_status: 'synced',
      };
      await db.putRaw('warehouses', item);
      pulled++;
    }

    // 2. Areas
    const remoteAreas = await inst.databases.listDocuments(cfg.databaseId, APPWRITE_COLLECTIONS.areas, [Query.limit(100)]);
    for (const doc of remoteAreas.documents) {
      const item: Area = {
        id: (doc.id as string) || doc.$id,
        warehouse_id: doc.warehouse_id as string,
        name: doc.name as string,
        status: (doc.status as any) || 'active',
        created_at: (doc.created_at as string) || doc.$createdAt,
        updated_at: (doc.updated_at as string) || doc.$updatedAt,
        version: (doc.version as number) || 1,
        is_dirty: false,
        local_sync_status: 'synced',
      };
      await db.putRaw('areas', item);
      pulled++;
    }

    // 3. Sections
    const remoteSections = await inst.databases.listDocuments(cfg.databaseId, APPWRITE_COLLECTIONS.sections, [Query.limit(200)]);
    for (const doc of remoteSections.documents) {
      const item: Section = {
        id: (doc.id as string) || doc.$id,
        area_id: doc.area_id as string,
        name: doc.name as string,
        capacity: (doc.capacity as string) || null,
        status: (doc.status as any) || 'active',
        created_at: (doc.created_at as string) || doc.$createdAt,
        updated_at: (doc.updated_at as string) || doc.$updatedAt,
        version: (doc.version as number) || 1,
        is_dirty: false,
        local_sync_status: 'synced',
      };
      await db.putRaw('sections', item);
      pulled++;
    }

    // 4. Models
    const remoteModels = await inst.databases.listDocuments(cfg.databaseId, APPWRITE_COLLECTIONS.models, [Query.limit(500)]);
    for (const doc of remoteModels.documents) {
      const item: ShoeModel = {
        id: (doc.id as string) || doc.$id,
        warehouse_id: doc.warehouse_id as string,
        reference_code: doc.reference_code as string,
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
      await db.putRaw('models', item);
      pulled++;
    }

    // 5. Model Sections
    const remoteAssignments = await inst.databases.listDocuments(cfg.databaseId, APPWRITE_COLLECTIONS.model_sections, [Query.limit(500)]);
    for (const doc of remoteAssignments.documents) {
      const item: ModelSection = {
        id: (doc.id as string) || doc.$id,
        model_id: doc.model_id as string,
        section_id: doc.section_id as string,
        assigned_at: (doc.assigned_at as string) || doc.$createdAt,
        updated_at: (doc.updated_at as string) || doc.$updatedAt,
        version: (doc.version as number) || 1,
        is_dirty: false,
        local_sync_status: 'synced',
      };
      await db.putRaw('model_sections', item);
      pulled++;
    }

    // 6. Transfers
    const remoteTransfers = await inst.databases.listDocuments(cfg.databaseId, APPWRITE_COLLECTIONS.transfers, [Query.limit(200)]);
    for (const doc of remoteTransfers.documents) {
      const item: TransferLog = {
        id: (doc.id as string) || doc.$id,
        model_id: doc.model_id as string,
        from_section_id: (doc.from_section_id as string) || '',
        to_section_id: doc.to_section_id as string,
        device_id: doc.device_id as string,
        performed_by: doc.performed_by as string,
        sync_status: 'synced',
        created_at: (doc.created_at as string) || doc.$createdAt,
      };
      await db.putRaw('transfers', item);
      pulled++;
    }
  } catch (err) {
    console.warn('Appwrite pull error (some collections may not exist yet):', err);
    errors++;
  }

  if (pulled > 0) {
    db.notify();
  }

  return { pulled, errors };
}

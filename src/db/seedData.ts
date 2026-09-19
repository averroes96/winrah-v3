// ============================================================================
// WINRAH - Built-in Realistic Seed Data
// Used for instant 1-click local testing and onboarding
// ============================================================================

import { db } from './indexedDb';
import {
  Warehouse,
  Area,
  Section,
  ShoeModel,
  ModelSection,
  TransferLog,
  Device,
  SearchLog,
  AuditLog,
} from '../types';

export const SAMPLE_WAREHOUSES: Warehouse[] = [
  {
    id: 'wh-casablanca-01',
    name: 'Dépôt Central (Alger - Oued Smar)',
    status: 'active',
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'wh-tanger-02',
    name: 'Annexe Ouest (Oran - Es Sénia)',
    status: 'active',
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
];

export const SAMPLE_AREAS: Area[] = [
  {
    id: 'area-sport-01',
    warehouse_id: 'wh-casablanca-01',
    name: 'Zone A - Baskets & Sportswear',
    status: 'active',
    created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'area-cuir-02',
    warehouse_id: 'wh-casablanca-01',
    name: 'Zone B - Bottines & Maroquinerie',
    status: 'active',
    created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'area-soiree-03',
    warehouse_id: 'wh-casablanca-01',
    name: 'Zone C - Escarpins & Soirée',
    status: 'active',
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'area-transit-04',
    warehouse_id: 'wh-tanger-02',
    name: 'Zone Quai - Stock Transit & Réception',
    status: 'active',
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
];

export const SAMPLE_SECTIONS: Section[] = [
  {
    id: 'sec-a1-01',
    area_id: 'area-sport-01',
    name: 'Rayon A-01 (Niveau 1)',
    capacity: '60 cartons',
    status: 'active',
    created_at: new Date(Date.now() - 24 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'sec-a2-02',
    area_id: 'area-sport-01',
    name: 'Rayon A-02 (Niveau 2)',
    capacity: '50 cartons',
    status: 'active',
    created_at: new Date(Date.now() - 24 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'sec-b1-03',
    area_id: 'area-cuir-02',
    name: 'Rayon B-01 (Allée Principale)',
    capacity: '80 cartons',
    status: 'active',
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'sec-b2-04',
    area_id: 'area-cuir-02',
    name: 'Rayon B-02 (Étagère Haute)',
    capacity: '40 cartons',
    status: 'active',
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'sec-c1-05',
    area_id: 'area-soiree-03',
    name: 'Rayon C-01 (Armoire VIP)',
    capacity: '30 cartons',
    status: 'active',
    created_at: new Date(Date.now() - 18 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'sec-transit-06',
    area_id: 'area-transit-04',
    name: 'Palette T-1 (En cours de tri)',
    capacity: '120 cartons',
    status: 'active',
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
];

// Shoe Models - Includes duplicate reference HS-21 in two entries to prove FR-4.8
export const SAMPLE_MODELS: ShoeModel[] = [
  {
    id: 'model-hs21-white',
    warehouse_id: 'wh-casablanca-01',
    reference_code: 'HS-21',
    name: 'Sneakers Urban Flow Blanche (Semelle Chunky)',
    size_range: '36/41',
    price: 249.0,
    photo_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&auto=format&fit=crop&q=80',
    status: 'active',
    created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'model-hs21-black',
    warehouse_id: 'wh-casablanca-01',
    reference_code: 'HS-21',
    name: 'Sneakers Urban Flow Édition All-Black',
    size_range: '40/45',
    price: 269.0,
    photo_url: 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=500&auto=format&fit=crop&q=80',
    status: 'active',
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'model-hs88-chelsea',
    warehouse_id: 'wh-casablanca-01',
    reference_code: 'HS-88',
    name: 'Bottine Chelsea Cuir Huilé Marron',
    size_range: '38/44',
    price: 399.0,
    photo_url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=500&auto=format&fit=crop&q=80',
    status: 'active',
    created_at: new Date(Date.now() - 12 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'model-hs104-pumps',
    warehouse_id: 'wh-casablanca-01',
    reference_code: 'HS-104',
    name: 'Escarpin Verni Rouge Carmin Soirée',
    size_range: '36/40',
    price: 319.0,
    photo_url: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=500&auto=format&fit=crop&q=80',
    status: 'active',
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'model-md45-moc',
    warehouse_id: 'wh-casablanca-01',
    reference_code: 'MD-45',
    name: 'Mocassin Velours Nubuck Bleu Marine',
    size_range: '39/45',
    price: 279.0,
    photo_url: 'https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=500&auto=format&fit=crop&q=80',
    status: 'active',
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'model-tn09-sandale',
    warehouse_id: 'wh-tanger-02',
    reference_code: 'TN-09',
    name: 'Sandale Compensée Corde Naturelle',
    size_range: '36/41',
    price: 189.0,
    photo_url: 'https://images.unsplash.com/photo-1560343090-f0409e92791a?w=500&auto=format&fit=crop&q=80',
    status: 'active',
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
];

// Placements (Presence-only, no quantity)
export const SAMPLE_MODEL_SECTIONS: ModelSection[] = [
  {
    id: 'ms-01',
    model_id: 'model-hs21-white',
    section_id: 'sec-a1-01',
    assigned_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'ms-02',
    model_id: 'model-hs21-black',
    section_id: 'sec-a2-02',
    assigned_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'ms-03',
    model_id: 'model-hs88-chelsea',
    section_id: 'sec-b1-03',
    assigned_at: new Date(Date.now() - 12 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'ms-04',
    model_id: 'model-hs104-pumps',
    section_id: 'sec-c1-05',
    assigned_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'ms-05',
    model_id: 'model-md45-moc',
    section_id: 'sec-b2-04',
    assigned_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
  {
    id: 'ms-06',
    model_id: 'model-tn09-sandale',
    section_id: 'sec-transit-06',
    assigned_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  },
];

export const SAMPLE_TRANSFERS: TransferLog[] = [
  {
    id: 'tr-01',
    model_id: 'model-hs21-white',
    from_section_id: 'sec-a2-02',
    to_section_id: 'sec-a1-01',
    device_id: 'dev-local-01',
    performed_by: 'Hamza (Opérateur Aïn Sebaâ)',
    sync_status: 'synced',
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'tr-02',
    model_id: 'model-hs88-chelsea',
    from_section_id: 'sec-b2-04',
    to_section_id: 'sec-b1-03',
    device_id: 'dev-local-01',
    performed_by: 'Youssef (Cariste)',
    sync_status: 'synced',
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
];

export const SAMPLE_SEARCH_LOGS: SearchLog[] = [
  {
    id: 'sl-01',
    device_id: 'dev-local-01',
    warehouse_id: 'wh-casablanca-01',
    query_text: 'HS-21',
    result_count: 2,
    is_everywhere: false,
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: 'sl-02',
    device_id: 'dev-local-01',
    warehouse_id: 'wh-casablanca-01',
    query_text: 'HS-88',
    result_count: 1,
    is_everywhere: false,
    created_at: new Date(Date.now() - 4 * 3600000).toISOString(),
  },
  // Zero-result searches to demonstrate FR-8.3 zero-result gap analytics!
  {
    id: 'sl-03',
    device_id: 'dev-local-01',
    warehouse_id: 'wh-casablanca-01',
    query_text: 'NK-99',
    result_count: 0,
    is_everywhere: false,
    created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
  },
  {
    id: 'sl-04',
    device_id: 'dev-local-01',
    warehouse_id: 'wh-casablanca-01',
    query_text: 'NK-99',
    result_count: 0,
    is_everywhere: false,
    created_at: new Date(Date.now() - 6 * 3600000).toISOString(),
  },
  {
    id: 'sl-05',
    device_id: 'dev-local-01',
    warehouse_id: 'wh-casablanca-01',
    query_text: 'AD-01',
    result_count: 0,
    is_everywhere: false,
    created_at: new Date(Date.now() - 8 * 3600000).toISOString(),
  },
];

export async function seedDemoData(): Promise<void> {
  await db.clearAll();

  // Fast bulk insert per table
  await db.bulkPut('warehouses', SAMPLE_WAREHOUSES);
  await db.bulkPut('areas', SAMPLE_AREAS);
  await db.bulkPut('sections', SAMPLE_SECTIONS);
  await db.bulkPut('models', SAMPLE_MODELS);
  await db.bulkPut('model_sections', SAMPLE_MODEL_SECTIONS);
  await db.bulkPut('transfers', SAMPLE_TRANSFERS);
  await db.bulkPut('search_logs', SAMPLE_SEARCH_LOGS);

  // Save device
  const defaultDevice: Device = {
    id: 'dev-local-01',
    name: 'Scanner Mobile Entrepôt #1',
    platform: 'web',
    active_warehouse_id: 'wh-casablanca-01',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    last_synced_at: new Date(Date.now() - 3600000).toISOString(),
  };
  await db.bulkPut('devices', [defaultDevice]);

  // Set active warehouse in localStorage
  localStorage.setItem('winrah_active_warehouse_id', 'wh-casablanca-01');
  localStorage.setItem('winrah_device_id', 'dev-local-01');

  // Notify subscribers once everything is safely in the database
  db.notify();
}

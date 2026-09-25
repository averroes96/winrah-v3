// ============================================================================
// WINRAH - CSV Import & Export Engine (FR-4.5, FR-9.1, FR-9.2)
// Handles catalog export and bulk model import with upfront validation.
// ============================================================================

import { ShoeModel, Section, Area, Warehouse, ModelSection } from '../types';
import { db } from '../db/indexedDb';

export interface CsvImportRow {
  reference_code: string;
  name?: string;
  size_range?: string;
  price?: number;
  section_name?: string;
  area_name?: string;
  photo_url?: string;
}

export interface CsvValidationResult {
  validRows: CsvImportRow[];
  errors: Array<{ line: number; message: string }>;
}

// ----------------------------------------------------------------------------
// V2 Database Types & Schema
// ----------------------------------------------------------------------------

export interface V2Deposit {
  id: number;
  name: string;
  isBase: boolean;
}

export interface V2Section {
  id: number;
  name: string;
  depositId: number;
  normalizedName: string;
  zoneName: string;
}

export interface V2Product {
  id: number;
  referenceCode: string;
  name?: string;
  priceOrSize?: string;
  sectionId: number;
}

export interface V2ParsedDatabase {
  deposits: V2Deposit[];
  sections: V2Section[];
  products: V2Product[];
  errors: Array<{ line: number; message: string }>;
  summary: {
    totalDeposits: number;
    baseDepositName: string;
    totalSections: number;
    zones: string[];
    totalProducts: number;
  };
}

export function detectCsvFormat(csvText: string): 'v2' | 'v3' | 'unknown' {
  const trimmed = csvText.trim();
  if (!trimmed) return 'unknown';
  const lines = trimmed.split(/\r?\n/).slice(0, 10);

  const hasV2Lines = lines.some((line) => {
    const firstWord = line.split(',')[0]?.trim().toLowerCase();
    return firstWord === 'deposit' || firstWord === 'section' || firstWord === 'product';
  });

  if (hasV2Lines) return 'v2';

  const firstLine = lines[0]?.toLowerCase() || '';
  if (firstLine.includes('reference_code')) return 'v3';

  return 'unknown';
}

export function parseV2DatabaseCsv(csvText: string): V2ParsedDatabase {
  const lines = csvText.split(/\r?\n/);
  const deposits: V2Deposit[] = [];
  const sections: V2Section[] = [];
  const products: V2Product[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith('#')) continue;

    const parts = rawLine.split(',').map((p) => p.trim());
    const rowType = parts[0]?.toLowerCase();

    if (rowType === 'deposit') {
      const id = parseInt(parts[1], 10);
      const name = parts[2] || `Deposit ${id}`;
      const isBase = parts[3]?.toLowerCase() === 'true';

      if (isNaN(id)) {
        errors.push({ line: i + 1, message: `Deposit ID missing or invalid on line ${i + 1}` });
      } else {
        deposits.push({ id, name, isBase });
      }
    } else if (rowType === 'section') {
      const id = parseInt(parts[1], 10);
      const rawName = parts[2] || '';
      const depositId = parseInt(parts[3], 10);

      if (isNaN(id) || !rawName) {
        errors.push({ line: i + 1, message: `Invalid section record on line ${i + 1}` });
      } else {
        const cleanLetter = rawName.charAt(0).toUpperCase();
        const remainder = rawName.slice(1);
        const normalizedName = cleanLetter + remainder;
        const zoneName = `Zone ${cleanLetter}`;

        sections.push({
          id,
          name: rawName,
          depositId: isNaN(depositId) ? 1 : depositId,
          normalizedName,
          zoneName,
        });
      }
    } else if (rowType === 'product') {
      const id = parseInt(parts[1], 10);
      const referenceCode = parts[2] || '';
      const rawName = parts[3];
      const rawPriceOrSize = parts[4];
      const sectionId = parseInt(parts[5], 10);

      if (!referenceCode) {
        errors.push({ line: i + 1, message: `Missing reference code on line ${i + 1}` });
      } else if (isNaN(sectionId)) {
        errors.push({ line: i + 1, message: `Invalid or missing section ID on line ${i + 1}` });
      } else {
        products.push({
          id: isNaN(id) ? products.length + 1 : id,
          referenceCode: referenceCode.toUpperCase(),
          name: rawName && rawName !== 'N/A' ? rawName : undefined,
          priceOrSize: rawPriceOrSize && rawPriceOrSize !== 'N/A' ? rawPriceOrSize : undefined,
          sectionId,
        });
      }
    }
  }

  const baseDep = deposits.find((d) => d.isBase) || deposits[0];
  const uniqueZones = Array.from(new Set(sections.map((s) => s.zoneName))).sort();

  return {
    deposits,
    sections,
    products,
    errors,
    summary: {
      totalDeposits: deposits.length,
      baseDepositName: baseDep?.name || 'BASE',
      totalSections: sections.length,
      zones: uniqueZones,
      totalProducts: products.length,
    },
  };
}

export async function importV2DatabaseToDb(
  v2Data: V2ParsedDatabase,
  targetWarehouseId: string = 'wh-base',
  existingAreas: Area[] = [],
  existingSections: Section[] = []
): Promise<{
  areasCreated: number;
  sectionsCreated: number;
  modelsCreated: number;
  assignmentsCreated: number;
}> {
  // 1. Wipe everything first (including all previous hubs/warehouses)
  await db.clearAll();

  const now = new Date().toISOString();

  // 2. Create the auto BASE warehouse
  const baseWarehouse: Warehouse = {
    id: 'wh-base',
    name: 'BASE',
    status: 'active',
    created_at: now,
    updated_at: now,
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  };
  await db.bulkPut('warehouses', [baseWarehouse]);

  // Ensure default device exists
  await db.bulkPut('devices', [
    {
      id: 'dev-local-01',
      name: 'Terminal Mobile',
      platform: 'web',
      active_warehouse_id: 'wh-base',
      created_at: now,
      updated_at: now,
      version: 1,
      last_synced_at: null,
    },
  ]);

  localStorage.setItem('winrah_active_warehouse_id', 'wh-base');

  const areasToInsert: Area[] = [];
  const sectionsToInsert: Section[] = [];
  const modelsToInsert: ShoeModel[] = [];
  const modelSectionsToInsert: ModelSection[] = [];

  // 3. Resolve Areas under BASE
  const areaNameToId = new Map<string, string>();
  for (const zoneName of v2Data.summary.zones) {
    const cleanZone = zoneName.trim() || 'Zone Principale';
    const zoneSlug = cleanZone.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'def';
    if (!areaNameToId.has(cleanZone.toLowerCase())) {
      const newAreaId = `area-base-${zoneSlug}`;
      const newArea: Area = {
        id: newAreaId,
        warehouse_id: 'wh-base',
        name: cleanZone,
        status: 'active',
        created_at: now,
        updated_at: now,
        version: 1,
        is_dirty: false,
        local_sync_status: 'synced',
      };
      areasToInsert.push(newArea);
      areaNameToId.set(cleanZone.toLowerCase(), newAreaId);
    }
  }

  if (areasToInsert.length === 0) {
    const fallbackArea: Area = {
      id: 'area-base-zone-principale',
      warehouse_id: 'wh-base',
      name: 'Zone Principale',
      status: 'active',
      created_at: now,
      updated_at: now,
      version: 1,
      is_dirty: false,
      local_sync_status: 'synced',
    };
    areasToInsert.push(fallbackArea);
    areaNameToId.set('zone principale', fallbackArea.id);
  }

  // 4. Resolve Sections under BASE areas
  const v2SectionIdToV3SectionId = new Map<number, string>();
  for (const v2Sec of v2Data.sections) {
    const zoneKey = (v2Sec.zoneName || 'Zone Principale').toLowerCase();
    const areaId = areaNameToId.get(zoneKey) || areasToInsert[0].id;

    const sectionId = `sec-v2-${v2Sec.id}`;
    const newSection: Section = {
      id: sectionId,
      area_id: areaId,
      name: v2Sec.normalizedName,
      capacity: null,
      status: 'active',
      created_at: now,
      updated_at: now,
      version: 1,
      is_dirty: false,
      local_sync_status: 'synced',
    };
    sectionsToInsert.push(newSection);
    v2SectionIdToV3SectionId.set(v2Sec.id, sectionId);
  }

  // 5. Create Models and ModelSection assignments
  for (const v2Prod of v2Data.products) {
    const modelId = `model-v2-${v2Prod.id}`;
    const model: ShoeModel = {
      id: modelId,
      warehouse_id: 'wh-base',
      reference_code: v2Prod.referenceCode,
      name: v2Prod.name || null,
      size_range: v2Prod.priceOrSize || null,
      price: null,
      photo_url: null,
      status: 'active',
      created_at: now,
      updated_at: now,
      version: 1,
      is_dirty: false,
      local_sync_status: 'synced',
    };
    modelsToInsert.push(model);

    const v3SectionId = v2SectionIdToV3SectionId.get(v2Prod.sectionId);
    if (v3SectionId) {
      const assignment: ModelSection = {
        id: `ms-v2-${v2Prod.id}-${v2Prod.sectionId}`,
        model_id: modelId,
        section_id: v3SectionId,
        assigned_at: now,
        updated_at: now,
        version: 1,
        is_dirty: false,
        local_sync_status: 'synced',
      };
      modelSectionsToInsert.push(assignment);
    }
  }

  // 6. Ultra-fast bulk IndexedDB insertion
  if (areasToInsert.length > 0) {
    await db.bulkPut('areas', areasToInsert);
  }
  if (sectionsToInsert.length > 0) {
    await db.bulkPut('sections', sectionsToInsert);
  }
  if (modelsToInsert.length > 0) {
    await db.bulkPut('models', modelsToInsert);
  }
  if (modelSectionsToInsert.length > 0) {
    await db.bulkPut('model_sections', modelSectionsToInsert);
  }

  // Automatic deduplication & reconciliation pass
  await db.deduplicateLocalDatabase();

  db.notify();

  return {
    areasCreated: areasToInsert.length,
    sectionsCreated: sectionsToInsert.length,
    modelsCreated: modelsToInsert.length,
    assignmentsCreated: modelSectionsToInsert.length,
  };
}


export function getCsvTemplate(): string {
  return [
    'reference_code,name,size_range,price,section_name,area_name,photo_url',
    'HS-21,Sneakers Urban Flow Blanche,36/41,249.00,Rayon A-01,Zone Baskets,https://example.com/hs21.jpg',
    'HS-21,Sneakers Urban Flow Édition Noire,40/45,269.00,Rayon A-02,Zone Baskets,',
    'HS-88,Bottine Chelsea Cuir Marron,38/44,389.00,Rayon B-01,Zone Cuir,',
    'HS-104,Escarpin Soirée Velvet Rouge,36/40,299.00,Rayon C-01,Zone Soirée,',
  ].join('\n');
}

export function parseCsvText(csvText: string): CsvValidationResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      validRows: [],
      errors: [{ line: 1, message: 'Le fichier CSV doit contenir une ligne d’en-tête et au moins une ligne de données.' }],
    };
  }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const refIdx = header.indexOf('reference_code');
  const nameIdx = header.indexOf('name');
  const sizeIdx = header.indexOf('size_range');
  const priceIdx = header.indexOf('price');
  const secIdx = header.indexOf('section_name');
  const areaIdx = header.indexOf('area_name');
  const photoIdx = header.indexOf('photo_url');

  if (refIdx === -1) {
    return {
      validRows: [],
      errors: [{ line: 1, message: 'Colonne obligatoire "reference_code" manquante dans l’en-tête.' }],
    };
  }

  const validRows: CsvImportRow[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    // Simple CSV parser supporting unquoted or quoted strings
    const parts = rawLine.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));

    const ref = parts[refIdx];
    if (!ref || ref.trim().length === 0) {
      errors.push({ line: i + 1, message: 'Référence code manquante ou vide.' });
      continue;
    }

    const priceRaw = priceIdx !== -1 ? parts[priceIdx] : undefined;
    let price: number | undefined = undefined;
    if (priceRaw && priceRaw.length > 0) {
      const parsed = parseFloat(priceRaw);
      if (isNaN(parsed)) {
        errors.push({ line: i + 1, message: `Prix invalide "${priceRaw}". Doit être un nombre.` });
        continue;
      }
      price = parsed;
    }

    validRows.push({
      reference_code: ref.trim().toUpperCase(),
      name: nameIdx !== -1 ? parts[nameIdx] : undefined,
      size_range: sizeIdx !== -1 ? parts[sizeIdx] : undefined,
      price,
      section_name: secIdx !== -1 ? parts[secIdx] : undefined,
      area_name: areaIdx !== -1 ? parts[areaIdx] : undefined,
      photo_url: photoIdx !== -1 ? parts[photoIdx] : undefined,
    });
  }

  return { validRows, errors };
}

export async function importStandardCsvToDb(
  validRows: CsvImportRow[],
  targetWarehouseId: string = 'wh-base',
  existingSections: Section[] = []
): Promise<{
  modelsCreated: number;
  assignmentsCreated: number;
  areasCreated: number;
  sectionsCreated: number;
}> {
  // 1. Wipe everything first (including all previous hubs/warehouses)
  await db.clearAll();

  const now = new Date().toISOString();

  // 2. Create the auto BASE warehouse
  const baseWarehouse: Warehouse = {
    id: 'wh-base',
    name: 'BASE',
    status: 'active',
    created_at: now,
    updated_at: now,
    version: 1,
    is_dirty: false,
    local_sync_status: 'synced',
  };
  await db.bulkPut('warehouses', [baseWarehouse]);

  // Ensure default device exists
  await db.bulkPut('devices', [
    {
      id: 'dev-local-01',
      name: 'Terminal Mobile',
      platform: 'web',
      active_warehouse_id: 'wh-base',
      created_at: now,
      updated_at: now,
      version: 1,
      last_synced_at: null,
    },
  ]);

  localStorage.setItem('winrah_active_warehouse_id', 'wh-base');

  const areasToInsert: Area[] = [];
  const sectionsToInsert: Section[] = [];
  const modelsToInsert: ShoeModel[] = [];
  const modelSectionsToInsert: ModelSection[] = [];

  const areaMap = new Map<string, string>();
  const sectionMap = new Map<string, string>();

  // Extract unique areas and sections from CSV rows
  for (const row of validRows) {
    const areaName = (row.area_name || 'Zone Principale').trim();
    const areaSlug = areaName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'def';
    const areaId = `area-base-${areaSlug}`;
    if (!areaMap.has(areaName.toLowerCase())) {
      const newArea: Area = {
        id: areaId,
        warehouse_id: 'wh-base',
        name: areaName,
        status: 'active',
        created_at: now,
        updated_at: now,
        version: 1,
        is_dirty: false,
        local_sync_status: 'synced',
      };
      areasToInsert.push(newArea);
      areaMap.set(areaName.toLowerCase(), areaId);
    }

    if (row.section_name && row.section_name.trim()) {
      const secName = row.section_name.trim();
      const parentAreaId = areaMap.get(areaName.toLowerCase()) || areaId;
      const secSlug = secName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'def';
      const secKey = `${parentAreaId}:::${secName.toLowerCase()}`;
      if (!sectionMap.has(secKey)) {
        const secId = `sec-${parentAreaId.replace(/^area-/, '')}-${secSlug}`;
        const newSec: Section = {
          id: secId,
          area_id: parentAreaId,
          name: secName,
          capacity: null,
          status: 'active',
          created_at: now,
          updated_at: now,
          version: 1,
          is_dirty: false,
          local_sync_status: 'synced',
        };
        sectionsToInsert.push(newSec);
        sectionMap.set(secKey, secId);
      }
    }
  }

  // Insert models and link sections
  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    const refSlug = row.reference_code.trim().toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const modelId = `model-base-${refSlug}-${i + 1}`;
    const model: ShoeModel = {
      id: modelId,
      warehouse_id: 'wh-base',
      reference_code: row.reference_code,
      name: row.name || null,
      size_range: row.size_range || null,
      price: row.price || null,
      photo_url: row.photo_url || null,
      status: 'active',
      created_at: now,
      updated_at: now,
      version: 1,
      is_dirty: false,
      local_sync_status: 'synced',
    };
    modelsToInsert.push(model);

    if (row.section_name && row.section_name.trim()) {
      const secName = row.section_name.trim();
      const areaName = (row.area_name || 'Zone Principale').trim();
      const parentAreaId = areaMap.get(areaName.toLowerCase()) || areasToInsert[0]?.id || 'area-base-zone-principale';
      const secKey = `${parentAreaId}:::${secName.toLowerCase()}`;
      const secId = sectionMap.get(secKey);
      if (secId) {
        const secSlug = secName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'def';
        modelSectionsToInsert.push({
          id: `ms-${modelId}-${secSlug}`,
          model_id: modelId,
          section_id: secId,
          assigned_at: now,
          updated_at: now,
          version: 1,
          is_dirty: false,
          local_sync_status: 'synced',
        });
      }
    }
  }

  if (areasToInsert.length > 0) {
    await db.bulkPut('areas', areasToInsert);
  }
  if (sectionsToInsert.length > 0) {
    await db.bulkPut('sections', sectionsToInsert);
  }
  if (modelsToInsert.length > 0) {
    await db.bulkPut('models', modelsToInsert);
  }
  if (modelSectionsToInsert.length > 0) {
    await db.bulkPut('model_sections', modelSectionsToInsert);
  }

  // Automatic deduplication & reconciliation pass
  await db.deduplicateLocalDatabase();

  db.notify();

  return {
    areasCreated: areasToInsert.length,
    sectionsCreated: sectionsToInsert.length,
    modelsCreated: modelsToInsert.length,
    assignmentsCreated: modelSectionsToInsert.length,
  };
}


export function exportCatalogToCsv(
  models: ShoeModel[],
  modelSections: ModelSection[],
  sections: Section[],
  areas: Area[],
  warehouses: Warehouse[]
): string {
  const sectionMap = new Map(sections.map((s) => [s.id, s]));
  const areaMap = new Map(areas.map((a) => [a.id, a]));
  const whMap = new Map(warehouses.map((w) => [w.id, w]));

  const headers = [
    'reference_code',
    'name',
    'size_range',
    'price',
    'warehouse_name',
    'area_name',
    'section_name',
    'created_at',
  ];

  const rows: string[] = [headers.join(',')];

  for (const m of models) {
    const wh = whMap.get(m.warehouse_id);
    const assignments = modelSections.filter((ms) => ms.model_id === m.id);

    if (assignments.length === 0) {
      rows.push(
        [
          `"${m.reference_code}"`,
          `"${m.name || ''}"`,
          `"${m.size_range || ''}"`,
          m.price ?? '',
          `"${wh?.name || ''}"`,
          '""',
          '""',
          `"${m.created_at}"`,
        ].join(',')
      );
    } else {
      for (const assign of assignments) {
        const sec = sectionMap.get(assign.section_id);
        const area = sec ? areaMap.get(sec.area_id) : undefined;

        rows.push(
          [
            `"${m.reference_code}"`,
            `"${m.name || ''}"`,
            `"${m.size_range || ''}"`,
            m.price ?? '',
            `"${wh?.name || ''}"`,
            `"${area?.name || ''}"`,
            `"${sec?.name || ''}"`,
            `"${m.created_at}"`,
          ].join(',')
        );
      }
    }
  }

  return rows.join('\n');
}

export function downloadBlob(content: string, filename: string, mimeType: string = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// WINRAH - CSV Import & Export Engine (FR-4.5, FR-9.1, FR-9.2)
// Handles catalog export and bulk model import with upfront validation.
// ============================================================================

import { ShoeModel, Section, Area, Warehouse, ModelSection } from '../types';

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

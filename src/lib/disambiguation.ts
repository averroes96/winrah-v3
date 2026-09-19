// ============================================================================
// WINRAH - Model Reference Disambiguation Engine (FR-4.8)
// Automatically computes display index, section presence, and creation date
// for duplicate reference codes without requiring manual data-entry labeling.
// ============================================================================

import { ShoeModel, DisambiguatedModelResult, Section, Area, Warehouse, ModelSection } from '../types';

export function disambiguateModels(
  models: ShoeModel[],
  modelSections: ModelSection[],
  sections: Section[],
  areas: Area[],
  warehouses: Warehouse[]
): DisambiguatedModelResult[] {
  // 1. Group models by reference_code (case-insensitive)
  const groupedByCode = new Map<string, ShoeModel[]>();

  for (const m of models) {
    const key = m.reference_code.trim().toUpperCase();
    const list = groupedByCode.get(key) || [];
    list.push(m);
    groupedByCode.set(key, list);
  }

  // Maps for rapid lookups
  const sectionMap = new Map(sections.map((s) => [s.id, s]));
  const areaMap = new Map(areas.map((a) => [a.id, a]));
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));

  const results: DisambiguatedModelResult[] = [];

  for (const m of models) {
    const key = m.reference_code.trim().toUpperCase();
    const group = groupedByCode.get(key) || [m];

    // Sort group chronologically by created_at to assign stable display index (1, 2, ...)
    const sortedGroup = [...group].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const indexInGroup = sortedGroup.findIndex((item) => item.id === m.id);
    const displayIndex = indexInGroup !== -1 ? indexInGroup + 1 : 1;

    // Find all sections this model is placed in
    const activeAssignments = modelSections.filter((ms) => ms.model_id === m.id);
    const sectionsDetails = activeAssignments
      .map((ms) => {
        const sec = sectionMap.get(ms.section_id);
        if (!sec) return null;
        const area = areaMap.get(sec.area_id);
        if (!area) return null;
        const wh = warehouseMap.get(area.warehouse_id);
        if (!wh) return null;

        return {
          section: sec,
          area,
          warehouse: wh,
          assigned_at: ms.assigned_at,
        };
      })
      .filter(Boolean) as DisambiguatedModelResult['sections'];

    results.push({
      model: m,
      displayIndex,
      totalEntriesWithCode: group.length,
      sections: sectionsDetails,
    });
  }

  return results;
}

// Compute display title: if duplicates exist, returns "HS-21 (1)", else "HS-21"
export function getModelDisplayReference(
  referenceCode: string,
  displayIndex: number,
  totalWithCode: number
): string {
  if (totalWithCode > 1) {
    return `${referenceCode} (${displayIndex})`;
  }
  return referenceCode;
}

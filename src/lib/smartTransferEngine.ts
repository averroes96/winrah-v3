// ============================================================================
// WINRAH - Smart Transfer & Relocation Suggestion Engine
// Evaluates 30-day search velocity, zone proximity (Zone A -> Zone D),
// section model count capacity, and tight-space fallback routing.
// ============================================================================

import {
  ShoeModel,
  ModelSection,
  Section,
  Area,
  SearchLog,
} from '../types';

export const DEFAULT_SECTION_CAPACITY = 20;

export interface SectionOccupancy {
  sectionId: string;
  currentModelCount: number;
  capacity: number;
  remainingSlots: number;
  utilizationRatio: number;
  isFull: boolean;
}

export interface SmartTransferSuggestion {
  id: string;
  type: 'promote_fast_mover' | 'evict_dormant_for_space';
  model: ShoeModel;
  currentSection: Section;
  currentArea: Area;
  targetSection: Section;
  targetArea: Area;
  searchCount30d: number;
  velocityScore: number;
  priorityScore: number;
  isZoneAFallback?: boolean;
  targetSectionOccupancy: {
    current: number;
    capacity: number;
    remaining: number;
  };
  reasonBadge: string;
  explanation: string;
}

/**
 * Extracts a numeric model capacity from a section's capacity string (e.g. "15", "20 cartons", "30 paires").
 * Defaults to DEFAULT_SECTION_CAPACITY (20) if unset or non-numeric.
 */
export function parseSectionCapacity(capacityStr?: string | null): number {
  if (!capacityStr) return DEFAULT_SECTION_CAPACITY;
  const match = capacityStr.match(/\d+/);
  if (!match) return DEFAULT_SECTION_CAPACITY;
  const parsed = parseInt(match[0], 10);
  return isNaN(parsed) || parsed <= 0 ? DEFAULT_SECTION_CAPACITY : parsed;
}

/**
 * Determines the proximity ranking of an area (Zone A = closest / rank 1, Zone D = farthest / rank 4).
 */
export function getAreaProximityRank(areaName: string): {
  rank: number;
  letter: string;
  isZoneA: boolean;
  isZoneB: boolean;
  isZoneC: boolean;
  isZoneD: boolean;
} {
  const norm = areaName.trim().toUpperCase();
  // Check standard patterns: "ZONE A", "ZONE-A", "A (ENTREE)", "RAYON A"
  const match = norm.match(/\b([A-D])\b/) || norm.match(/ZONE\s*([A-D])/);
  const letter = match ? match[1] : '';

  switch (letter) {
    case 'A':
      return { rank: 1, letter: 'A', isZoneA: true, isZoneB: false, isZoneC: false, isZoneD: false };
    case 'B':
      return { rank: 2, letter: 'B', isZoneA: false, isZoneB: true, isZoneC: false, isZoneD: false };
    case 'C':
      return { rank: 3, letter: 'C', isZoneA: false, isZoneB: false, isZoneC: true, isZoneD: false };
    case 'D':
      return { rank: 4, letter: 'D', isZoneA: false, isZoneB: false, isZoneC: false, isZoneD: true };
    default: {
      // Heuristic fallback for non-A-D zone names
      if (norm.includes('PROCHE') || norm.includes('PICKING') || norm.includes('DEVANT') || norm.includes('EXPEDITION')) {
        return { rank: 1, letter: 'A', isZoneA: true, isZoneB: false, isZoneC: false, isZoneD: false };
      }
      if (norm.includes('FOND') || norm.includes('RESERVE') || norm.includes('ARCHIVE') || norm.includes('HAUT')) {
        return { rank: 4, letter: 'D', isZoneA: false, isZoneB: false, isZoneC: false, isZoneD: true };
      }
      return { rank: 2, letter: 'B', isZoneA: false, isZoneB: true, isZoneC: false, isZoneD: false };
    }
  }
}

/**
 * Core on-device heuristic inference algorithm.
 * Computes smart model relocation recommendations based on search history and section capacities.
 */
export function computeSmartTransferSuggestions({
  searchLogs,
  models,
  modelSections,
  sections,
  areas,
  warehouseId,
  maxSuggestions = 6,
  lookbackDays = 30,
}: {
  searchLogs: SearchLog[];
  models: ShoeModel[];
  modelSections: ModelSection[];
  sections: Section[];
  areas: Area[];
  warehouseId?: string | null;
  maxSuggestions?: number;
  lookbackDays?: number;
}): SmartTransferSuggestion[] {
  if (models.length === 0 || sections.length === 0 || areas.length === 0) {
    return [];
  }

  // 1. Filter sections and areas to active warehouse
  const whAreas = warehouseId ? areas.filter((a) => a.warehouse_id === warehouseId) : areas;
  const whAreaIds = new Set(whAreas.map((a) => a.id));
  const whSections = sections.filter((s) => whAreaIds.has(s.area_id));
  const whSectionIds = new Set(whSections.map((s) => s.id));

  // Quick lookup maps
  const areaMap = new Map<string, Area>(areas.map((a) => [a.id, a]));
  const sectionMap = new Map<string, Section>(sections.map((s) => [s.id, s]));
  const modelMap = new Map<string, ShoeModel>(models.map((m) => [m.id, m]));

  // 2. Compute current section model occupancy
  const sectionOccupancyMap = new Map<string, SectionOccupancy>();
  const modelsPerSection = new Map<string, string[]>(); // sectionId -> modelIds

  for (const s of whSections) {
    const capacity = parseSectionCapacity(s.capacity);
    sectionOccupancyMap.set(s.id, {
      sectionId: s.id,
      currentModelCount: 0,
      capacity,
      remainingSlots: capacity,
      utilizationRatio: 0,
      isFull: false,
    });
    modelsPerSection.set(s.id, []);
  }

  // Track current location of each model in this warehouse
  const modelLocationMap = new Map<string, { sectionId: string; areaId: string }>();

  for (const ms of modelSections) {
    if (whSectionIds.has(ms.section_id)) {
      const list = modelsPerSection.get(ms.section_id) || [];
      list.push(ms.model_id);
      modelsPerSection.set(ms.section_id, list);

      const sec = sectionMap.get(ms.section_id);
      if (sec) {
        modelLocationMap.set(ms.model_id, {
          sectionId: sec.id,
          areaId: sec.area_id,
        });
      }
    }
  }

  // Update occupancy metrics
  for (const s of whSections) {
    const assignedModels = modelsPerSection.get(s.id) || [];
    const count = assignedModels.length;
    const capacity = parseSectionCapacity(s.capacity);
    const remaining = Math.max(0, capacity - count);
    const ratio = capacity > 0 ? count / capacity : 1;

    sectionOccupancyMap.set(s.id, {
      sectionId: s.id,
      currentModelCount: count,
      capacity,
      remainingSlots: remaining,
      utilizationRatio: ratio,
      isFull: remaining === 0,
    });
  }

  // 3. Analyze Search Logs over lookback window (default 30 days)
  const now = Date.now();
  const cutoffTimestamp = now - lookbackDays * 24 * 60 * 60 * 1000;
  const recentLogs = searchLogs.filter((log) => {
    if (!log.created_at) return false;
    const logTime = new Date(log.created_at).getTime();
    if (logTime < cutoffTimestamp) return false;
    if (warehouseId && log.warehouse_id && log.warehouse_id !== warehouseId && !log.is_everywhere) {
      return false;
    }
    return true;
  });

  // Calculate search velocity and interaction scores per model
  const modelVelocityMap = new Map<string, { searchCount: number; score: number }>();

  for (const log of recentLogs) {
    const logTime = new Date(log.created_at).getTime();
    const daysAgo = Math.max(0, (now - logTime) / (24 * 60 * 60 * 1000));
    // Time decay: searches within the last 7 days get 1.35x weight
    const recencyMultiplier = daysAgo <= 7 ? 1.35 : 1.0;

    // A. Explicit model selection (tapped or transferred from search)
    if (log.selected_model_id) {
      const curr = modelVelocityMap.get(log.selected_model_id) || { searchCount: 0, score: 0 };
      curr.searchCount += 1;
      curr.score += 3.0 * recencyMultiplier;
      modelVelocityMap.set(log.selected_model_id, curr);
    }

    // B. Models matched in search results
    if (Array.isArray(log.matched_model_ids) && log.matched_model_ids.length > 0) {
      // If 1-3 results, high relevance
      const share = log.matched_model_ids.length <= 3 ? 1.0 : 0.5;
      for (const mId of log.matched_model_ids) {
        if (mId === log.selected_model_id) continue;
        const curr = modelVelocityMap.get(mId) || { searchCount: 0, score: 0 };
        curr.searchCount += 1;
        curr.score += share * recencyMultiplier;
        modelVelocityMap.set(mId, curr);
      }
    }

    // C. Fallback for legacy logs without matched_model_ids: match query against reference codes
    if (!log.matched_model_ids || log.matched_model_ids.length === 0) {
      const q = (log.query_text || '').trim().toUpperCase();
      if (q.length >= 2) {
        for (const m of models) {
          if (m.reference_code.toUpperCase().includes(q)) {
            const curr = modelVelocityMap.get(m.id) || { searchCount: 0, score: 0 };
            curr.searchCount += 1;
            curr.score += 1.0 * recencyMultiplier;
            modelVelocityMap.set(m.id, curr);
          }
        }
      }
    }
  }

  // 4. Group candidate sections by zone
  const sectionsByZone = new Map<string, Section[]>(); // 'A' | 'B' | 'C' | 'D' -> sections
  for (const s of whSections) {
    const area = areaMap.get(s.area_id);
    if (!area) continue;
    const { letter } = getAreaProximityRank(area.name);
    const zKey = letter || 'B';
    const list = sectionsByZone.get(zKey) || [];
    list.push(s);
    sectionsByZone.set(zKey, list);
  }

  // Helper to find best target section in a zone with available capacity
  const findBestSectionInZone = (zoneLetter: string): { section: Section; occ: SectionOccupancy } | null => {
    const candidateSections = sectionsByZone.get(zoneLetter) || [];
    const available = candidateSections
      .map((sec) => ({
        section: sec,
        occ: sectionOccupancyMap.get(sec.id)!,
      }))
      .filter((item) => item.occ && item.occ.remainingSlots > 0);

    if (available.length === 0) return null;

    // Pick section with lowest model count (least crowded)
    available.sort((a, b) => a.occ.currentModelCount - b.occ.currentModelCount);
    return available[0];
  };

  const suggestions: SmartTransferSuggestion[] = [];
  const processedModelIds = new Set<string>();

  // 5. Rule 1: Fast Movers in Distant Zones (Zone D or C -> Zone A or Zone B)
  for (const [mId, { searchCount, score }] of modelVelocityMap.entries()) {
    if (score < 2.0) continue; // Minimum activity threshold
    const loc = modelLocationMap.get(mId);
    if (!loc) continue;

    const currentSec = sectionMap.get(loc.sectionId);
    const currentArea = areaMap.get(loc.areaId);
    const model = modelMap.get(mId);
    if (!currentSec || !currentArea || !model) continue;

    const currentRank = getAreaProximityRank(currentArea.name);
    // Only suggest relocation if currently in distant storage (Zone D or Zone C)
    if (currentRank.rank <= 2) continue;

    // Target Selection: Try Zone A first
    let targetCandidate = findBestSectionInZone('A');
    let isZoneAFallback = false;

    // If Zone A is tight/full, fall back to Zone B
    if (!targetCandidate) {
      targetCandidate = findBestSectionInZone('B');
      isZoneAFallback = true;
    }

    // If both Zone A and Zone B are full, we cannot safely suggest moving without overcrowding
    if (!targetCandidate) continue;

    const targetSec = targetCandidate.section;
    const targetArea = areaMap.get(targetSec.area_id);
    if (!targetArea) continue;

    // Don't suggest moving to the exact same section
    if (targetSec.id === currentSec.id) continue;

    const targetRank = getAreaProximityRank(targetArea.name);
    const distanceGain = currentRank.rank - targetRank.rank;
    if (distanceGain <= 0) continue;

    const priorityScore = score * distanceGain;
    processedModelIds.add(model.id);

    suggestions.push({
      id: `sug-fast-${model.id}-${targetSec.id}`,
      type: 'promote_fast_mover',
      model,
      currentSection: currentSec,
      currentArea,
      targetSection: targetSec,
      targetArea,
      searchCount30d: searchCount,
      velocityScore: score,
      priorityScore,
      isZoneAFallback,
      targetSectionOccupancy: {
        current: targetCandidate.occ.currentModelCount,
        capacity: targetCandidate.occ.capacity,
        remaining: targetCandidate.occ.remainingSlots,
      },
      reasonBadge: isZoneAFallback ? 'Zone A saturée ➔ Zone B' : 'Forte demande ➔ Zone A',
      explanation: isZoneAFallback
        ? `Recherché ${searchCount} fois en 30j. Zone A saturée en modèles, déploiement optimal en Zone B (${targetCandidate.occ.remainingSlots} places libres).`
        : `Recherché ${searchCount} fois en 30j. Rapprocher de la zone de préparation (${targetCandidate.occ.remainingSlots} places libres en rayon).`,
    });
  }

  // 6. Rule 2: Free up space in tight Zone A (Evict dormant models with 0 searches to Zone C/D)
  const zoneASections = sectionsByZone.get('A') || [];
  const totalZoneASlots = zoneASections.reduce((acc, s) => acc + (sectionOccupancyMap.get(s.id)?.remainingSlots || 0), 0);
  const totalZoneACapacity = zoneASections.reduce((acc, s) => acc + (sectionOccupancyMap.get(s.id)?.capacity || 0), 0);

  // If Zone A is tight (< 20% remaining slots or 0 free slots)
  if (totalZoneACapacity > 0 && totalZoneASlots / totalZoneACapacity <= 0.25) {
    for (const secA of zoneASections) {
      const assigned = modelsPerSection.get(secA.id) || [];
      for (const mId of assigned) {
        if (processedModelIds.has(mId)) continue;
        const vel = modelVelocityMap.get(mId);
        // Zero searches in the last 30 days
        if (!vel || vel.searchCount === 0) {
          const model = modelMap.get(mId);
          const currentArea = areaMap.get(secA.area_id);
          if (!model || !currentArea) continue;

          // Find candidate section in Zone C or D
          const targetCandidate = findBestSectionInZone('C') || findBestSectionInZone('D');
          if (!targetCandidate) continue;

          const targetSec = targetCandidate.section;
          const targetArea = areaMap.get(targetSec.area_id);
          if (!targetArea || targetSec.id === secA.id) continue;

          processedModelIds.add(model.id);
          suggestions.push({
            id: `sug-dormant-${model.id}-${targetSec.id}`,
            type: 'evict_dormant_for_space',
            model,
            currentSection: secA,
            currentArea,
            targetSection: targetSec,
            targetArea,
            searchCount30d: 0,
            velocityScore: 0,
            priorityScore: 3.5, // High priority to free up tight Zone A
            isZoneAFallback: false,
            targetSectionOccupancy: {
              current: targetCandidate.occ.currentModelCount,
              capacity: targetCandidate.occ.capacity,
              remaining: targetCandidate.occ.remainingSlots,
            },
            reasonBadge: 'Libérer espace Zone A',
            explanation: `0 recherche ce mois-ci. Déplacer vers la ${targetArea.name} pour décongestionner le rayon ${secA.name} et libérer des places.`,
          });

          // Only suggest up to 2 space-clearing moves
          if (suggestions.filter((s) => s.type === 'evict_dormant_for_space').length >= 2) {
            break;
          }
        }
      }
    }
  }

  // 7. Sort by priority score descending and limit results
  suggestions.sort((a, b) => b.priorityScore - a.priorityScore);
  return suggestions.slice(0, maxSuggestions);
}

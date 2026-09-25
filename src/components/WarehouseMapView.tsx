// ============================================================================
// WINRAH - Interactive 2D Warehouse Map View
// Renders areas and sections as an interactive warehouse layout, colored by
// normalized model density (stock heatmap) with drag-and-drop reordering.
// ============================================================================

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  MapPin,
  Layers,
  Move,
  GripVertical,
  Save,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Search,
  Filter,
  Eye,
  Check,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Package,
  ArrowRightLeft,
  X,
  Sparkles,
  Info,
  Maximize,
} from 'lucide-react';
import {
  Warehouse,
  Area,
  Section,
  ShoeModel,
  ModelSection,
  WarehouseMapLayout,
  AreaMapPosition,
  SectionMapPosition,
} from '../types';
import { db } from '../db/indexedDb';
import { useI18n } from '../i18n';

interface WarehouseMapViewProps {
  warehouse: Warehouse;
  areas: Area[];
  sections: Section[];
  models: ShoeModel[];
  modelSections: ModelSection[];
  onOpenQuickAdd?: () => void;
  onNavigateToSearch?: (query: string) => void;
  onTransferModel?: (model: ShoeModel, fromSectionId: string) => void;
}

export const WarehouseMapView: React.FC<WarehouseMapViewProps> = ({
  warehouse,
  areas,
  sections,
  models,
  modelSections,
  onOpenQuickAdd,
  onNavigateToSearch,
  onTransferModel,
}) => {
  const { t } = useI18n();
  const [layout, setLayout] = useState<WarehouseMapLayout | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Selected Section for drawer/popup
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  // Map controls & filters
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [filterQuery, setFilterQuery] = useState('');
  const [activeDensityFilter, setActiveDensityFilter] = useState<'all' | 'empty' | 'low' | 'medium' | 'high'>('all');

  // Drag and drop tracking
  const [draggedAreaId, setDraggedAreaId] = useState<string | null>(null);
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [dragOverAreaId, setDragOverAreaId] = useState<string | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);

  // Quick lookup maps
  const areaMap = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const modelMap = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);

  // Model count per section
  const sectionModelCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const ms of modelSections) {
      map.set(ms.section_id, (map.get(ms.section_id) || 0) + 1);
    }
    return map;
  }, [modelSections]);

  // Maximum models in any section (for density normalization)
  const maxModelsInSection = useMemo(() => {
    let max = 0;
    for (const s of sections) {
      const count = sectionModelCountMap.get(s.id) || 0;
      if (count > max) max = count;
    }
    return Math.max(max, 1);
  }, [sections, sectionModelCountMap]);

  // Models placed in each section
  const sectionModelsMap = useMemo(() => {
    const map = new Map<string, ShoeModel[]>();
    for (const ms of modelSections) {
      const m = modelMap.get(ms.model_id);
      if (m) {
        const list = map.get(ms.section_id) || [];
        list.push(m);
        map.set(ms.section_id, list);
      }
    }
    return map;
  }, [modelSections, modelMap]);

  // Total warehouse metrics
  const totalModelsInWarehouse = useMemo(() => {
    let count = 0;
    for (const s of sections) {
      count += sectionModelCountMap.get(s.id) || 0;
    }
    return count;
  }, [sections, sectionModelCountMap]);

  // ---------------------------------------------------------------------------
  // 1. Initial Map Layout Loading & Intelligent Auto-Generation
  // ---------------------------------------------------------------------------
  const generateDefaultLayout = (
    currentAreas: Area[],
    currentSections: Section[]
  ): WarehouseMapLayout => {
    const now = new Date().toISOString();
    const sortedAreas = [...currentAreas].sort((a, b) => a.name.localeCompare(b.name));

    const areaPositions: AreaMapPosition[] = sortedAreas.map((area, areaIdx) => {
      const areaSections = currentSections
        .filter((s) => s.area_id === area.id && s.status === 'active')
        .sort((a, b) => a.name.localeCompare(b.name));

      const sectionPositions: SectionMapPosition[] = areaSections.map((sec, secIdx) => ({
        id: sec.id,
        col: secIdx % 4,
        row: Math.floor(secIdx / 4),
        order: secIdx,
      }));

      return {
        id: area.id,
        col: areaIdx % 2,
        row: Math.floor(areaIdx / 2),
        order: areaIdx,
        sections: sectionPositions,
      };
    });

    return {
      id: `map-${warehouse.id}`,
      warehouse_id: warehouse.id,
      areas: areaPositions,
      version: 1,
      updated_at: now,
      is_dirty: true,
      local_sync_status: 'pending',
    };
  };

  useEffect(() => {
    let isMounted = true;

    const loadOrInitMap = async () => {
      try {
        const maps = await db.getAll<WarehouseMapLayout>('warehouse_maps');
        const existing = maps.find((m) => m.warehouse_id === warehouse.id);

        if (existing && existing.areas && existing.areas.length > 0) {
          // Verify that all current areas and sections exist in the loaded layout
          let needsUpdate = false;
          const updatedAreas = [...existing.areas];

          // 1. Check for missing areas
          const layoutAreaIds = new Set(updatedAreas.map((a) => a.id));
          for (const a of areas) {
            if (a.warehouse_id === warehouse.id && a.status === 'active' && !layoutAreaIds.has(a.id)) {
              needsUpdate = true;
              updatedAreas.push({
                id: a.id,
                col: updatedAreas.length % 2,
                row: Math.floor(updatedAreas.length / 2),
                order: updatedAreas.length,
                sections: [],
              });
            }
          }

          // 2. Check for missing sections in each area
          for (const aLayout of updatedAreas) {
            const currentAreaSections = sections.filter(
              (s) => s.area_id === aLayout.id && s.status === 'active'
            );
            const layoutSecIds = new Set(aLayout.sections.map((s) => s.id));

            for (const s of currentAreaSections) {
              if (!layoutSecIds.has(s.id)) {
                needsUpdate = true;
                const nextOrder = aLayout.sections.length;
                aLayout.sections.push({
                  id: s.id,
                  col: nextOrder % 4,
                  row: Math.floor(nextOrder / 4),
                  order: nextOrder,
                });
              }
            }
          }

          if (isMounted) {
            const finalLayout: WarehouseMapLayout = {
              ...existing,
              areas: updatedAreas,
            };
            setLayout(finalLayout);
            if (needsUpdate) {
              await db.put('warehouse_maps', finalLayout);
            }
          }
        } else {
          // No layout exists: auto-generate initial layout
          const newLayout = generateDefaultLayout(areas, sections);
          if (isMounted) {
            setLayout(newLayout);
            await db.put('warehouse_maps', newLayout);
          }
        }
      } catch (err) {
        console.error('Error loading or generating warehouse map:', err);
        const fallback = generateDefaultLayout(areas, sections);
        if (isMounted) setLayout(fallback);
      }
    };

    loadOrInitMap();

    return () => {
      isMounted = false;
    };
  }, [warehouse.id, areas, sections]);

  // ---------------------------------------------------------------------------
  // 2. Layout Persistence & Synchronization
  // ---------------------------------------------------------------------------
  const saveLayoutToDb = async (layoutToSave: WarehouseMapLayout) => {
    setIsSaving(true);
    try {
      const updated: WarehouseMapLayout = {
        ...layoutToSave,
        updated_at: new Date().toISOString(),
        version: (layoutToSave.version || 0) + 1,
        is_dirty: true,
        local_sync_status: 'pending',
      };
      await db.put('warehouse_maps', updated);

      // Audit trail
      await db.logAudit({
        action: 'update',
        entity_type: 'warehouse_map',
        entity_id: updated.id,
        changes: {
          warehouse_id: warehouse.id,
          areas_count: updated.areas.length,
        },
      });

      setLayout(updated);
      setHasUnsavedChanges(false);
      showToast('Plan du dépôt enregistré et prêt à être synchronisé !');
    } catch (err: any) {
      console.error('Error saving map layout:', err);
      showToast('Erreur lors de la sauvegarde du plan : ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetAutoLayout = async () => {
    if (!window.confirm('Voulez-vous réinitialiser l’agencement automatique de ce dépôt ?')) {
      return;
    }
    const fresh = generateDefaultLayout(areas, sections);
    await saveLayoutToDb(fresh);
    showToast('Disposition réinitialisée avec succès !');
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // ---------------------------------------------------------------------------
  // 3. Drag & Drop Reordering & Directional Nudging
  // ---------------------------------------------------------------------------
  // Reorder Areas
  const moveArea = (areaId: string, direction: 'up' | 'down' | 'left' | 'right') => {
    if (!layout) return;
    const areasList = [...layout.areas].sort((a, b) => a.order - b.order);
    const currentIndex = areasList.findIndex((a) => a.id === areaId);
    if (currentIndex === -1) return;

    let targetIndex = currentIndex;
    if (direction === 'up' || direction === 'left') {
      targetIndex = Math.max(0, currentIndex - 1);
    } else if (direction === 'down' || direction === 'right') {
      targetIndex = Math.min(areasList.length - 1, currentIndex + 1);
    }

    if (targetIndex === currentIndex) return;

    // Swap positions
    const [moved] = areasList.splice(currentIndex, 1);
    areasList.splice(targetIndex, 0, moved);

    // Recompute orders and 2-col coordinates
    const updatedAreas = areasList.map((a, idx) => ({
      ...a,
      order: idx,
      col: idx % 2,
      row: Math.floor(idx / 2),
    }));

    const updatedLayout = { ...layout, areas: updatedAreas };
    setLayout(updatedLayout);
    setHasUnsavedChanges(true);
  };

  // Reorder Sections within an area or move to adjacent
  const moveSection = (
    areaId: string,
    sectionId: string,
    direction: 'up' | 'down' | 'left' | 'right'
  ) => {
    if (!layout) return;
    const updatedAreas = layout.areas.map((a) => {
      if (a.id !== areaId) return a;

      const secList = [...a.sections].sort((x, y) => x.order - y.order);
      const currentIndex = secList.findIndex((s) => s.id === sectionId);
      if (currentIndex === -1) return a;

      let targetIndex = currentIndex;
      if (direction === 'left') targetIndex = Math.max(0, currentIndex - 1);
      else if (direction === 'right') targetIndex = Math.min(secList.length - 1, currentIndex + 1);
      else if (direction === 'up') targetIndex = Math.max(0, currentIndex - 4);
      else if (direction === 'down') targetIndex = Math.min(secList.length - 1, currentIndex + 4);

      if (targetIndex === currentIndex) return a;

      const [moved] = secList.splice(currentIndex, 1);
      secList.splice(targetIndex, 0, moved);

      const recomputed = secList.map((s, idx) => ({
        ...s,
        order: idx,
        col: idx % 4,
        row: Math.floor(idx / 4),
      }));

      return { ...a, sections: recomputed };
    });

    const updatedLayout = { ...layout, areas: updatedAreas };
    setLayout(updatedLayout);
    setHasUnsavedChanges(true);
  };

  // HTML5 Drag Handlers for Area
  const handleAreaDragStart = (e: React.DragEvent, areaId: string) => {
    if (!isEditMode) return;
    setDraggedAreaId(areaId);
    e.dataTransfer.setData('text/plain', `area:${areaId}`);
  };

  const handleAreaDragOver = (e: React.DragEvent, targetAreaId: string) => {
    e.preventDefault();
    if (!isEditMode || !draggedAreaId || draggedAreaId === targetAreaId) return;
    setDragOverAreaId(targetAreaId);
  };

  const handleAreaDrop = (e: React.DragEvent, targetAreaId: string) => {
    e.preventDefault();
    if (!isEditMode || !draggedAreaId || draggedAreaId === targetAreaId || !layout) return;

    const areasList = [...layout.areas].sort((a, b) => a.order - b.order);
    const sourceIdx = areasList.findIndex((a) => a.id === draggedAreaId);
    const targetIdx = areasList.findIndex((a) => a.id === targetAreaId);

    if (sourceIdx !== -1 && targetIdx !== -1) {
      const [moved] = areasList.splice(sourceIdx, 1);
      areasList.splice(targetIdx, 0, moved);

      const updatedAreas = areasList.map((a, idx) => ({
        ...a,
        order: idx,
        col: idx % 2,
        row: Math.floor(idx / 2),
      }));

      setLayout({ ...layout, areas: updatedAreas });
      setHasUnsavedChanges(true);
    }

    setDraggedAreaId(null);
    setDragOverAreaId(null);
  };

  // HTML5 Drag Handlers for Section
  const handleSectionDragStart = (e: React.DragEvent, areaId: string, sectionId: string) => {
    if (!isEditMode) return;
    e.stopPropagation();
    setDraggedSectionId(sectionId);
    e.dataTransfer.setData('text/plain', `section:${areaId}:${sectionId}`);
  };

  const handleSectionDragOver = (e: React.DragEvent, targetSectionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isEditMode || !draggedSectionId || draggedSectionId === targetSectionId) return;
    setDragOverSectionId(targetSectionId);
  };

  const handleSectionDrop = (e: React.DragEvent, targetAreaId: string, targetSectionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isEditMode || !draggedSectionId || draggedSectionId === targetSectionId || !layout) return;

    // Find source area and section
    let sourceAreaId: string | null = null;
    let movedSec: SectionMapPosition | null = null;

    const nextAreas = layout.areas.map((a) => {
      const found = a.sections.find((s) => s.id === draggedSectionId);
      if (found) {
        sourceAreaId = a.id;
        movedSec = { ...found };
        return {
          ...a,
          sections: a.sections.filter((s) => s.id !== draggedSectionId),
        };
      }
      return a;
    });

    if (movedSec) {
      const updatedAreas = nextAreas.map((a) => {
        if (a.id === targetAreaId) {
          const targetSecIdx = a.sections.findIndex((s) => s.id === targetSectionId);
          const newSecs = [...a.sections];
          if (targetSecIdx !== -1) {
            newSecs.splice(targetSecIdx, 0, movedSec!);
          } else {
            newSecs.push(movedSec!);
          }

          return {
            ...a,
            sections: newSecs.map((s, idx) => ({
              ...s,
              order: idx,
              col: idx % 4,
              row: Math.floor(idx / 4),
            })),
          };
        }
        return a;
      });

      setLayout({ ...layout, areas: updatedAreas });
      setHasUnsavedChanges(true);
    }

    setDraggedSectionId(null);
    setDragOverSectionId(null);
  };

  // ---------------------------------------------------------------------------
  // 4. Normalized Density & Color Calculations
  // ---------------------------------------------------------------------------
  const getSectionDensity = (sectionId: string) => {
    const count = sectionModelCountMap.get(sectionId) || 0;
    if (count === 0) return { category: 'empty', ratio: 0, count };
    const ratio = count / maxModelsInSection;
    if (ratio <= 0.25) return { category: 'low', ratio, count };
    if (ratio <= 0.65) return { category: 'medium', ratio, count };
    return { category: 'high', ratio, count };
  };

  const getSectionTheme = (category: string) => {
    switch (category) {
      case 'empty':
        return {
          bg: 'rgba(255, 255, 255, 0.02)',
          border: '1px dashed rgba(148, 163, 184, 0.28)',
          accent: '#94A3B8',
          text: '#94A3B8',
          badgeClass: 'badge',
          label: 'Vide (0)',
        };
      case 'low':
        return {
          bg: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.38)',
          accent: '#10B981',
          text: '#10B981',
          badgeClass: 'badge badge-emerald',
          label: 'Faible (1-25%)',
        };
      case 'medium':
        return {
          bg: 'rgba(245, 158, 11, 0.14)',
          border: '1px solid rgba(245, 158, 11, 0.42)',
          accent: '#F59E0B',
          text: '#F59E0B',
          badgeClass: 'badge badge-amber',
          label: 'Moyen (25-65%)',
        };
      case 'high':
      default:
        return {
          bg: 'rgba(139, 92, 246, 0.18)',
          border: '1px solid rgba(139, 92, 246, 0.52)',
          accent: '#8B5CF6',
          text: '#A78BFA',
          badgeClass: 'badge badge-indigo',
          label: 'Dense (>65%)',
        };
    }
  };

  // Selected Section Object & Models
  const selectedSection = selectedSectionId ? sectionMap.get(selectedSectionId) : null;
  const selectedArea = selectedSection ? areaMap.get(selectedSection.area_id) : null;
  const selectedSectionModels = selectedSectionId ? sectionModelsMap.get(selectedSectionId) || [] : [];

  return (
    <div className="fade-in" style={{ position: 'relative' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className="fade-in"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'var(--text-primary)',
            color: 'var(--bg-page)',
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.35)',
            fontSize: '0.85rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            zIndex: 1000,
          }}
        >
          <Sparkles size={16} style={{ color: 'var(--accent)' }} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Map Control Bar */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          padding: '0.85rem 1.1rem',
          marginBottom: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <span className="badge badge-amber" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>
                Plan Interactif
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {warehouse.name}
              </span>
              {hasUnsavedChanges && (
                <span className="badge badge-rose" style={{ animation: 'pulse 2s infinite' }}>
                  Modifications non enregistrées
                </span>
              )}
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Carte Topologique & Densité de Stock
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Visualisez l'occupation réelle de chaque rayon et réagencez les zones par glisser-déposer.
            </p>
          </div>

          {/* Action Buttons: Edit Mode, Save, Reset */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setIsEditMode(!isEditMode)}
              className={`btn ${isEditMode ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                fontSize: '0.8rem',
                padding: '0.45rem 0.85rem',
                gap: '0.4rem',
                fontWeight: 700,
              }}
            >
              <Move size={14} />
              <span>{isEditMode ? t('map.exit_edit') : t('map.edit_layout')}</span>
            </button>

            {isEditMode && (
              <>
                <button
                  type="button"
                  onClick={() => layout && saveLayoutToDb(layout)}
                  disabled={isSaving}
                  className="btn"
                  style={{
                    background: 'var(--success)',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '0.8rem',
                    padding: '0.45rem 0.85rem',
                    gap: '0.4rem',
                    fontWeight: 700,
                  }}
                  title={t('map.save_layout')}
                >
                  <Save size={14} />
                  <span>{isSaving ? t('common.loading') : t('map.save_layout')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetAutoLayout}
                  className="btn btn-secondary"
                  style={{
                    fontSize: '0.8rem',
                    padding: '0.45rem 0.75rem',
                    gap: '0.35rem',
                  }}
                  title={t('map.reset_layout')}
                >
                  <RotateCcw size={13} />
                  <span>{t('map.reset_layout')}</span>
                </button>
              </>
            )}

            {/* Zoom Controls */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--bg-page)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
                style={{
                  padding: '0.4rem 0.55rem',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
                title={t('map.zoom_out')}
              >
                <ZoomOut size={14} />
              </button>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, minWidth: '40px', textAlign: 'center' }}>
                {zoomLevel}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(140, z + 10))}
                style={{
                  padding: '0.4rem 0.55rem',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
                title={t('map.zoom_in')}
              >
                <ZoomIn size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Heatmap Normalization Legend & Search Filter */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            paddingTop: '0.5rem',
            borderTop: '1px solid var(--border-default)',
          }}
        >
          {/* Density Color Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginRight: '0.2rem' }}>
              {t('map.legend.title')}
            </span>

            {[
              { id: 'all', label: t('map.filter.all'), color: 'var(--text-secondary)' },
              { id: 'empty', label: t('map.legend.empty'), color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.15)' },
              { id: 'low', label: t('map.legend.low'), color: '#10B981', bg: 'rgba(16, 185, 129, 0.18)' },
              { id: 'medium', label: t('map.legend.medium'), color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.2)' },
              { id: 'high', label: t('map.legend.dense'), color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.22)' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveDensityFilter(cat.id as any)}
                style={{
                  padding: '0.2rem 0.55rem',
                  fontSize: '0.72rem',
                  fontWeight: activeDensityFilter === cat.id ? 800 : 600,
                  borderRadius: 'var(--radius-xs)',
                  border: activeDensityFilter === cat.id ? `1.5px solid ${cat.color}` : '1px solid transparent',
                  background: cat.bg || 'transparent',
                  color: cat.color,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                {activeDensityFilter === cat.id && <Check size={10} />}
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          {/* Quick Highlight Search */}
          <div style={{ position: 'relative', width: '220px' }}>
            <Search
              size={13}
              style={{
                position: 'absolute',
                left: '0.65rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder={t('map.search_placeholder')}
              className="input-field"
              style={{
                paddingLeft: '2rem',
                paddingTop: '0.35rem',
                paddingBottom: '0.35rem',
                fontSize: '0.78rem',
                height: '32px',
              }}
            />
            {filterQuery && (
              <button
                type="button"
                onClick={() => setFilterQuery('')}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 5. Main Canvas / Grid Map */}
      {/* --------------------------------------------------------------------- */}
      <div
        style={{
          transform: `scale(${zoomLevel / 100})`,
          transformOrigin: 'top left',
          transition: 'transform 0.2s ease',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '1.25rem',
          paddingBottom: '2rem',
        }}
      >
        {(!layout || layout.areas.length === 0) ? (
          <div
            className="card"
            style={{
              padding: '2.5rem',
              textAlign: 'center',
              gridColumn: '1 / -1',
              color: 'var(--text-muted)',
            }}
          >
            <MapPin size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
            <h4 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.35rem' }}>
              Aucune zone dans ce dépôt
            </h4>
            <p style={{ fontSize: '0.8rem' }}>
              Créez des zones et des rayons pour voir le plan topologique apparaître.
            </p>
          </div>
        ) : (
          layout.areas.map((aLayout) => {
            const area = areaMap.get(aLayout.id);
            if (!area) return null;

            const isAreaHighlighted =
              filterQuery &&
              area.name.toUpperCase().includes(filterQuery.trim().toUpperCase());

            const isAreaDragOver = dragOverAreaId === aLayout.id;

            return (
              <div
                key={aLayout.id}
                draggable={isEditMode}
                onDragStart={(e) => handleAreaDragStart(e, aLayout.id)}
                onDragOver={(e) => handleAreaDragOver(e, aLayout.id)}
                onDrop={(e) => handleAreaDrop(e, aLayout.id)}
                style={{
                  background: 'var(--bg-card)',
                  border: isAreaHighlighted
                    ? '2px solid var(--accent)'
                    : isAreaDragOver
                    ? '2px dashed var(--accent)'
                    : '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                  boxShadow: isAreaHighlighted ? '0 0 15px rgba(217, 119, 6, 0.25)' : 'none',
                  transition: 'all 0.2s ease',
                  cursor: isEditMode ? 'grab' : 'default',
                  opacity: draggedAreaId === aLayout.id ? 0.4 : 1,
                  position: 'relative',
                }}
              >
                {/* Area Header Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingBottom: '0.65rem',
                    borderBottom: '1px solid var(--border-default)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {isEditMode && (
                      <span title="Glisser pour déplacer cette zone" style={{ display: 'inline-flex' }}>
                        <GripVertical
                          size={16}
                          style={{ color: 'var(--text-muted)', cursor: 'grab' }}
                        />
                      </span>
                    )}
                    <MapPin size={16} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      {area.name}
                    </span>
                    <span className="badge badge-amber" style={{ fontSize: '0.65rem' }}>
                      {aLayout.sections.length} rayon(s)
                    </span>
                  </div>

                  {/* Nudge Arrows in Edit Mode */}
                  {isEditMode && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <button
                        type="button"
                        onClick={() => moveArea(aLayout.id, 'left')}
                        style={{
                          background: 'var(--bg-page)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-xs)',
                          padding: '0.25rem',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                        }}
                        title="Déplacer zone à gauche / avant"
                      >
                        <ArrowLeft size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveArea(aLayout.id, 'right')}
                        style={{
                          background: 'var(--bg-page)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-xs)',
                          padding: '0.25rem',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                        }}
                        title="Déplacer zone à droite / après"
                      >
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Area Sections Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
                    gap: '0.65rem',
                    minHeight: '80px',
                    padding: '0.35rem 0',
                  }}
                >
                  {aLayout.sections.length === 0 ? (
                    <div
                      style={{
                        gridColumn: '1 / -1',
                        textAlign: 'center',
                        padding: '1.25rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        border: '1px dashed var(--border-default)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      Aucun rayon dans cette zone
                    </div>
                  ) : (
                    aLayout.sections.map((secPos) => {
                      const sec = sectionMap.get(secPos.id);
                      if (!sec) return null;

                      const density = getSectionDensity(sec.id);
                      const theme = getSectionTheme(density.category);

                      // Filtering
                      if (activeDensityFilter !== 'all' && density.category !== activeDensityFilter) {
                        return null;
                      }

                      const isSecHighlighted =
                        filterQuery &&
                        sec.name.toUpperCase().includes(filterQuery.trim().toUpperCase());

                      const isSelected = selectedSectionId === sec.id;
                      const isSecDragOver = dragOverSectionId === sec.id;

                      return (
                        <div
                          key={sec.id}
                          draggable={isEditMode}
                          onDragStart={(e) => handleSectionDragStart(e, aLayout.id, sec.id)}
                          onDragOver={(e) => handleSectionDragOver(e, sec.id)}
                          onDrop={(e) => handleSectionDrop(e, aLayout.id, sec.id)}
                          onClick={() => !isEditMode && setSelectedSectionId(sec.id)}
                          style={{
                            background: theme.bg,
                            border: isSelected
                              ? '2px solid var(--accent)'
                              : isSecHighlighted
                              ? '2px solid var(--accent)'
                              : isSecDragOver
                              ? '2px dashed var(--accent)'
                              : theme.border,
                            borderRadius: 'var(--radius-sm)',
                            padding: '0.55rem 0.45rem',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            cursor: isEditMode ? 'grab' : 'pointer',
                            position: 'relative',
                            transition: 'all 0.15s ease',
                            opacity: draggedSectionId === sec.id ? 0.35 : 1,
                            minHeight: '74px',
                            boxShadow: isSelected
                              ? '0 0 12px rgba(217, 119, 6, 0.35)'
                              : 'none',
                          }}
                          title={`Rayon ${sec.name} : ${density.count} modèle(s) placés`}
                        >
                          {/* Shelf Name */}
                          <span
                            style={{
                              fontWeight: 800,
                              fontSize: '0.82rem',
                              color: 'var(--text-primary)',
                              marginBottom: '0.2rem',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: '100%',
                            }}
                          >
                            {sec.name}
                          </span>

                          {/* Model Count Badge */}
                          <span
                            className={theme.badgeClass}
                            style={{
                              fontSize: '0.65rem',
                              padding: '0.1rem 0.35rem',
                              fontWeight: 700,
                            }}
                          >
                            {density.count} {density.count === 1 ? 'modèle' : 'modèles'}
                          </span>

                          {/* Capacity ratio bar */}
                          <div
                            style={{
                              width: '80%',
                              height: '3px',
                              background: 'rgba(255, 255, 255, 0.08)',
                              borderRadius: '999px',
                              marginTop: '0.35rem',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(100, Math.round(density.ratio * 100))}%`,
                                height: '100%',
                                background: theme.accent,
                              }}
                            />
                          </div>

                          {/* Edit Directional Nudge in Edit Mode */}
                          {isEditMode && (
                            <div
                              style={{
                                display: 'flex',
                                gap: '0.15rem',
                                marginTop: '0.35rem',
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => moveSection(aLayout.id, sec.id, 'left')}
                                style={{
                                  background: 'rgba(0, 0, 0, 0.35)',
                                  border: 'none',
                                  borderRadius: '2px',
                                  padding: '2px',
                                  cursor: 'pointer',
                                  color: '#FFFFFF',
                                }}
                                title="Déplacer vers la gauche"
                              >
                                <ArrowLeft size={9} />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveSection(aLayout.id, sec.id, 'right')}
                                style={{
                                  background: 'rgba(0, 0, 0, 0.35)',
                                  border: 'none',
                                  borderRadius: '2px',
                                  padding: '2px',
                                  cursor: 'pointer',
                                  color: '#FFFFFF',
                                }}
                                title="Déplacer vers la droite"
                              >
                                <ArrowRight size={9} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 6. Section Detail Inspection Drawer (when a section is clicked) */}
      {/* --------------------------------------------------------------------- */}
      {selectedSection && (
        <div
          className="fade-in"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 400,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setSelectedSectionId(null)}
        >
          <div
            className="slide-left"
            style={{
              width: '100%',
              maxWidth: '420px',
              height: '100%',
              background: 'var(--bg-card)',
              borderLeft: '1px solid var(--border-default)',
              boxShadow: '-10px 0 35px rgba(0, 0, 0, 0.45)',
              display: 'flex',
              flexDirection: 'column',
              padding: '1.25rem',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                marginBottom: '1rem',
                paddingBottom: '0.85rem',
                borderBottom: '1px solid var(--border-default)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.2rem' }}>
                  <span className="badge badge-amber">{selectedArea?.name || 'Zone'}</span>
                  {selectedSection.capacity && (
                    <span className="badge badge-indigo">Capacité : {selectedSection.capacity}</span>
                  )}
                </div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Rayon {selectedSection.name}
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {selectedSectionModels.length} modèle(s) actuellement positionnés
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSectionId(null)}
                style={{
                  background: 'var(--bg-page)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.4rem',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Density & Occupation Meter */}
            <div
              style={{
                background: 'var(--bg-page)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.85rem',
                marginBottom: '1rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('map.relative_occupancy')}</span>
                <span style={{ color: 'var(--accent)' }}>
                  {t('map.total_stock_pct', { pct: Math.round(((selectedSectionModels.length || 0) / (totalModelsInWarehouse || 1)) * 100) })}
                </span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '6px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: '999px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.round(((selectedSectionModels.length || 0) / (maxModelsInSection || 1)) * 100))}%`,
                    height: '100%',
                    background: 'var(--accent)',
                  }}
                />
              </div>
            </div>

            {/* Models Placed in This Section */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {t('map.section_models', { count: selectedSectionModels.length })}
                </h4>
                {onOpenQuickAdd && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSectionId(null);
                      onOpenQuickAdd();
                    }}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem' }}
                  >
                    {t('map.add_btn')}
                  </button>
                )}
              </div>

              {selectedSectionModels.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '2rem 1rem',
                    color: 'var(--text-muted)',
                    fontSize: '0.82rem',
                    border: '1px dashed var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <Package size={28} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                  {t('map.empty_section')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selectedSectionModels.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        background: 'var(--bg-page)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '0.65rem 0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span className="ref-code" style={{ fontSize: '0.85rem' }}>
                            {m.reference_code}
                          </span>
                          {m.size_range && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              ({m.size_range})
                            </span>
                          )}
                        </div>
                        {m.name && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                            {m.name}
                          </div>
                        )}
                        {m.price && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--success)', fontWeight: 700 }}>
                            {m.price.toLocaleString()} DA
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        {onTransferModel && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSectionId(null);
                              onTransferModel(m, selectedSection.id);
                            }}
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem 0.55rem', fontSize: '0.72rem', gap: '0.25rem' }}
                            title={t('map.transfer_tooltip')}
                          >
                            <ArrowRightLeft size={12} />
                            <span>{t('search.actions.transfer')}</span>
                          </button>
                        )}
                        {onNavigateToSearch && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSectionId(null);
                              onNavigateToSearch(m.reference_code);
                            }}
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem 0.45rem', fontSize: '0.72rem' }}
                            title={t('common.filter')}
                          >
                            <Search size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

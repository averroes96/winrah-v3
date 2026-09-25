// ============================================================================
// WINRAH - Catalog Tab Component (FR-2, FR-3, FR-4, FR-9.1, FR-9.2)
// Warehouse structure management (Areas, Sections), Model CRUD,
// CSV bulk import with error validation, and CSV export.
// ============================================================================

import React, { useState, useMemo, useRef } from 'react';
import {
  FolderTree,
  Plus,
  FileSpreadsheet,
  Download,
  Upload,
  Layers,
  MapPin,
  Trash2,
  CheckCircle,
  AlertCircle,
  X,
  Database,
  Sparkles,
  Search,
  Check,
  Loader2,
  FileText,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import {
  Warehouse,
  Area,
  Section,
  ShoeModel,
  ModelSection,
} from '../types';
import { db } from '../db/indexedDb';
import {
  exportCatalogToCsv,
  parseCsvText,
  getCsvTemplate,
  downloadBlob,
  CsvImportRow,
  detectCsvFormat,
  parseV2DatabaseCsv,
  importV2DatabaseToDb,
  importStandardCsvToDb,
  V2ParsedDatabase,
} from '../lib/csvHelper';
import { SectionSearchSelect } from './SectionSearchSelect';


interface CatalogTabProps {
  warehouses: Warehouse[];
  areas: Area[];
  sections: Section[];
  models: ShoeModel[];
  modelSections: ModelSection[];
  activeWarehouse: Warehouse | null;
  onRefreshData: () => void;
  onOpenQuickAdd?: () => void;
  onNavigateToSearch?: (query?: string) => void;
}

export const CatalogTab: React.FC<CatalogTabProps> = ({
  warehouses,
  areas,
  sections,
  models,
  modelSections,
  activeWarehouse,
  onRefreshData,
  onOpenQuickAdd,
  onNavigateToSearch,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'structure' | 'models' | 'import'>('structure');

  // Structure view state (FR-2, FR-3, Uncluttered Accordion & Cascade Deletions)
  const [expandedAreaIds, setExpandedAreaIds] = useState<Set<string>>(new Set());
  const [structureSearch, setStructureSearch] = useState('');
  const [sectionToDelete, setSectionToDelete] = useState<{
    id: string;
    name: string;
    areaName: string;
    modelsCount: number;
  } | null>(null);
  const [areaToDelete, setAreaToDelete] = useState<{
    id: string;
    name: string;
    sectionsCount: number;
    modelsCount: number;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteToast, setDeleteToast] = useState<string | null>(null);

  // Modal states
  const [isAddAreaOpen, setIsAddAreaOpen] = useState(false);
  const [newAreaName, setNewAreaName] = useState('');

  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
  const [targetAreaId, setTargetAreaId] = useState('');
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionCapacity, setNewSectionCapacity] = useState('');
  const [bulkSectionCount, setBulkSectionCount] = useState('1');

  const [isAddModelOpen, setIsAddModelOpen] = useState(false);
  const [newModelRef, setNewModelRef] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newModelSize, setNewModelSize] = useState('');
  const [newModelPrice, setNewModelPrice] = useState('');
  const [newModelSectionId, setNewModelSectionId] = useState('');
  const [modelSearchQuery, setModelSearchQuery] = useState('');

  // CSV Import State
  const [csvContent, setCsvContent] = useState('');
  const [detectedFormat, setDetectedFormat] = useState<'v2' | 'v3' | 'unknown'>('unknown');
  const [parsedV2Data, setParsedV2Data] = useState<V2ParsedDatabase | null>(null);
  const [csvValidationErrors, setCsvValidationErrors] = useState<Array<{ line: number; message: string }>>([]);
  const [parsedRows, setParsedRows] = useState<CsvImportRow[]>([]);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const [targetWarehouseIdForImport, setTargetWarehouseIdForImport] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingOriginalV2, setIsLoadingOriginalV2] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtered areas for active warehouse
  const activeAreas = useMemo(() => {
    if (!activeWarehouse) return areas;
    return areas.filter((a) => a.warehouse_id === activeWarehouse.id && a.status === 'active');
  }, [areas, activeWarehouse]);

  // Model count per section lookup
  const sectionModelCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const ms of modelSections) {
      map.set(ms.section_id, (map.get(ms.section_id) || 0) + 1);
    }
    return map;
  }, [modelSections]);

  // Expand all areas initially when active areas load
  React.useEffect(() => {
    if (activeAreas.length > 0) {
      setExpandedAreaIds(new Set(activeAreas.map((a) => a.id)));
    }
  }, [activeAreas.map((a) => a.id).join(',')]);

  // Auto-expand all matching areas when searching
  React.useEffect(() => {
    if (structureSearch.trim()) {
      setExpandedAreaIds(new Set(activeAreas.map((a) => a.id)));
    }
  }, [structureSearch, activeAreas]);

  const toggleAreaExpand = (areaId: string) => {
    setExpandedAreaIds((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) {
        next.delete(areaId);
      } else {
        next.add(areaId);
      }
      return next;
    });
  };

  const handleToggleAllAreas = () => {
    if (expandedAreaIds.size === activeAreas.length) {
      setExpandedAreaIds(new Set());
    } else {
      setExpandedAreaIds(new Set(activeAreas.map((a) => a.id)));
    }
  };

  const totalActiveSections = useMemo(() => {
    const activeAreaIdSet = new Set(activeAreas.map((a) => a.id));
    return sections.filter((s) => activeAreaIdSet.has(s.area_id) && s.status === 'active').length;
  }, [activeAreas, sections]);

  const totalModelsInWarehouse = useMemo(() => {
    const activeAreaIdSet = new Set(activeAreas.map((a) => a.id));
    const activeSectionIdSet = new Set(
      sections.filter((s) => activeAreaIdSet.has(s.area_id) && s.status === 'active').map((s) => s.id)
    );
    return modelSections.filter((ms) => activeSectionIdSet.has(ms.section_id)).length;
  }, [activeAreas, sections, modelSections]);

  const handleConfirmDeleteSection = async () => {
    if (!sectionToDelete) return;
    setIsDeleting(true);
    try {
      const result = await db.deleteSectionWithCascade(sectionToDelete.id);
      setDeleteToast(
        `Rayon "${sectionToDelete.name}" et ${result.deletedModelsCount} modèle(s) supprimé(s)`
      );
      setSectionToDelete(null);
      onRefreshData();
      setTimeout(() => setDeleteToast(null), 4000);
    } catch (err) {
      console.error('Failed to delete section:', err);
      alert('Erreur lors de la suppression du rayon');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmDeleteArea = async () => {
    if (!areaToDelete) return;
    setIsDeleting(true);
    try {
      const result = await db.deleteAreaWithCascade(areaToDelete.id);
      setDeleteToast(
        `Zone "${areaToDelete.name}", ${result.deletedSectionsCount} rayon(s) et ${result.deletedModelsCount} modèle(s) supprimés`
      );
      setAreaToDelete(null);
      onRefreshData();
      setTimeout(() => setDeleteToast(null), 4000);
    } catch (err) {
      console.error('Failed to delete area:', err);
      alert('Erreur lors de la suppression de la zone');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle Add Area (FR-2.1)
  const handleCreateArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAreaName.trim() || !activeWarehouse) return;

    const trimmedName = newAreaName.trim();
    const existingArea = areas.find(
      (a) => a.warehouse_id === activeWarehouse.id && a.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (existingArea) {
      alert(`Une zone nommée "${trimmedName}" existe déjà dans cet entrepôt.`);
      return;
    }

    const areaSlug = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const areaId = `area-${areaSlug}`;

    await db.put('areas', {
      id: areaId,
      warehouse_id: activeWarehouse.id,
      name: trimmedName,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      is_dirty: true,
      local_sync_status: 'pending',
    });

    setNewAreaName('');
    setIsAddAreaOpen(false);
    onRefreshData();
  };

  // Handle Add Section(s) (FR-3.1, FR-3.2 Bulk)
  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetAreaId || !newSectionName.trim()) return;

    const count = parseInt(bulkSectionCount, 10) || 1;
    const existingInArea = new Set(
      sections
        .filter((s) => s.area_id === targetAreaId)
        .map((s) => s.name.toLowerCase())
    );

    let createdCount = 0;
    for (let i = 1; i <= count; i++) {
      const name = count > 1 ? `${newSectionName.trim()}-${i.toString().padStart(2, '0')}` : newSectionName.trim();
      if (existingInArea.has(name.toLowerCase())) {
        continue; // Skip duplicate section names
      }

      const secSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const secId = `sec-${targetAreaId.replace(/^area-/, '')}-${secSlug}`;

      await db.put('sections', {
        id: secId,
        area_id: targetAreaId,
        name,
        capacity: newSectionCapacity.trim() || null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
        is_dirty: true,
        local_sync_status: 'pending',
      });
      existingInArea.add(name.toLowerCase());
      createdCount++;
    }

    if (createdCount === 0) {
      alert('Toutes les sections spécifiées existent déjà dans cette zone.');
      return;
    }

    setNewSectionName('');
    setNewSectionCapacity('');
    setBulkSectionCount('1');
    setIsAddSectionOpen(false);
    onRefreshData();
  };

  // Handle Add Model (FR-4.1, FR-4.3, FR-4.7)
  const handleCreateModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModelRef.trim() || !activeWarehouse) return;

    const modelId = 'model-' + Date.now();
    const now = new Date().toISOString();

    // 1. Create Model (duplicate references allowed! FR-4.7)
    await db.put('models', {
      id: modelId,
      warehouse_id: activeWarehouse.id,
      reference_code: newModelRef.trim().toUpperCase(),
      name: newModelName.trim() || null,
      size_range: newModelSize.trim() || null,
      price: newModelPrice ? parseFloat(newModelPrice) : null,
      status: 'active',
      created_at: now,
      updated_at: now,
      version: 1,
      is_dirty: true,
      local_sync_status: 'pending',
    });

    // 2. Assign to Section if selected
    if (newModelSectionId) {
      await db.put('model_sections', {
        id: 'ms-' + Date.now(),
        model_id: modelId,
        section_id: newModelSectionId,
        assigned_at: now,
        updated_at: now,
        version: 1,
        is_dirty: true,
        local_sync_status: 'pending',
      });
    }

    setNewModelRef('');
    setNewModelName('');
    setNewModelSize('');
    setNewModelPrice('');
    setIsAddModelOpen(false);

    onRefreshData();
  };

  // CSV Content Change with Instant Format Detection & Validation
  const handleCsvChange = (text: string) => {
    setCsvContent(text);
    setImportSuccessMessage(null);
    const fmt = detectCsvFormat(text);
    setDetectedFormat(fmt);

    if (fmt === 'v2') {
      const res = parseV2DatabaseCsv(text);
      setParsedV2Data(res);
      setCsvValidationErrors(res.errors);
      setParsedRows([]);
    } else if (fmt === 'v3') {
      const res = parseCsvText(text);
      setParsedRows(res.validRows);
      setCsvValidationErrors(res.errors);
      setParsedV2Data(null);
    } else {
      setParsedV2Data(null);
      setParsedRows([]);
      setCsvValidationErrors([]);
    }
  };

  // 1-Click Load bundled V2 Database
  const handleLoadOriginalV2 = async () => {
    try {
      setIsLoadingOriginalV2(true);
      setImportSuccessMessage(null);
      const resp = await fetch('/v2_database.csv');
      if (!resp.ok) throw new Error('Could not fetch /v2_database.csv');
      const text = await resp.text();
      handleCsvChange(text);
    } catch (err) {
      console.error('Failed to load v2_database.csv:', err);
      setCsvValidationErrors([{ line: 1, message: 'Could not load /v2_database.csv. Please upload it manually.' }]);
    } finally {
      setIsLoadingOriginalV2(false);
    }
  };

  // Upload CSV File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        handleCsvChange(text);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Manual re-validation trigger
  const handleValidateCsv = () => {
    handleCsvChange(csvContent);
  };

  // Commit valid CSV rows (Ultra-fast bulk import for both V2 and V3)
  const handleCommitCsv = async () => {
    setIsImporting(true);
    try {
      if (detectedFormat === 'v2' && parsedV2Data && parsedV2Data.products.length > 0) {
        const result = await importV2DatabaseToDb(parsedV2Data);
        setImportSuccessMessage(
          `Base réinitialisée avec succès ! ${result.modelsCreated.toLocaleString()} modèles et ${result.sectionsCreated} sections importés dans l'entrepôt BASE.`
        );
        setCsvContent('');
        setParsedV2Data(null);
        setDetectedFormat('unknown');
        onRefreshData();
      } else if (detectedFormat === 'v3' && parsedRows.length > 0) {
        const result = await importStandardCsvToDb(parsedRows);
        setImportSuccessMessage(
          `Base réinitialisée avec succès ! ${result.modelsCreated.toLocaleString()} modèles importés dans l'entrepôt BASE.`
        );
        setCsvContent('');
        setParsedRows([]);
        setDetectedFormat('unknown');
        onRefreshData();
      }
    } catch (err) {
      console.error('Import failed:', err);
      setCsvValidationErrors([{ line: 1, message: 'Database import failed. Please check the console for details.' }]);
    } finally {
      setIsImporting(false);
    }
  };

  // Export full catalog to CSV (FR-9.1)
  const handleExportCsv = () => {
    const csv = exportCatalogToCsv(models, modelSections, sections, areas, warehouses);
    const date = new Date().toISOString().split('T')[0];
    downloadBlob(csv, `winrah_catalogue_${date}.csv`);
  };

  return (
    <div className="fade-in">
      {/* Navigation Subtabs with Sleek Segmented Control */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '3px',
            gap: '3px',
            flex: '1 1 auto',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveSubTab('structure')}
            style={{
              flex: 1,
              padding: '0.45rem 0.65rem',
              fontSize: '0.8rem',
              fontWeight: 700,
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              background: activeSubTab === 'structure' ? 'var(--accent)' : 'transparent',
              color: activeSubTab === 'structure' ? '#FFFFFF' : 'var(--text-secondary)',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <FolderTree size={15} />
            <span>Zones & Rayons</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('models')}
            style={{
              flex: 1,
              padding: '0.45rem 0.65rem',
              fontSize: '0.8rem',
              fontWeight: 700,
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              background: activeSubTab === 'models' ? 'var(--accent)' : 'transparent',
              color: activeSubTab === 'models' ? '#FFFFFF' : 'var(--text-secondary)',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <Layers size={15} />
            <span>Catalogue ({models.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('import')}
            style={{
              flex: 1,
              padding: '0.45rem 0.65rem',
              fontSize: '0.8rem',
              fontWeight: 700,
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              background: activeSubTab === 'import' ? 'var(--accent)' : 'transparent',
              color: activeSubTab === 'import' ? '#FFFFFF' : 'var(--text-secondary)',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <FileSpreadsheet size={15} />
            <span>Import</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="btn btn-secondary"
          style={{
            padding: '0.45rem 0.65rem',
            fontSize: '0.78rem',
            height: '36px',
            flexShrink: 0,
            gap: '0.3rem',
          }}
          title="Exporter tout le catalogue au format CSV"
        >
          <Download size={14} style={{ color: 'var(--accent)' }} />
          <span>Export</span>
        </button>
      </div>

      {/* 1. Structure View: Zones & Rayons Drilldown */}
      {activeSubTab === 'structure' && (
        <div className="fade-in">
          {/* Warehouse Header Bar */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem 1rem',
              marginBottom: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem' }}>
                  <span className="badge badge-amber" style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Dépôt Actif
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {activeWarehouse?.name}
                  </span>
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  Architecture du Dépôt
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                  {activeAreas.length} zone(s) • {totalActiveSections} rayon(s) • {totalModelsInWarehouse} modèle(s)
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  type="button"
                  onClick={() => setIsAddAreaOpen(true)}
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem', gap: '0.3rem' }}
                >
                  <Plus size={13} />
                  <span>Zone</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (activeAreas.length > 0) setTargetAreaId(activeAreas[0].id);
                    setIsAddSectionOpen(true);
                  }}
                  disabled={activeAreas.length === 0}
                  className="btn btn-primary"
                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem', gap: '0.3rem' }}
                >
                  <Plus size={13} />
                  <span>Rayon(s)</span>
                </button>
              </div>
            </div>

            {/* Quick Shelf / Zone Filter Search & Expand Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search
                  size={15}
                  style={{
                    position: 'absolute',
                    left: '0.7rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  type="text"
                  className="input-control"
                  placeholder="Filtrer un rayon ou zone (ex: B1, D27, Zone C)..."
                  value={structureSearch}
                  onChange={(e) => setStructureSearch(e.target.value)}
                  style={{
                    paddingLeft: '2.1rem',
                    paddingRight: structureSearch ? '2rem' : '0.75rem',
                    fontSize: '0.8125rem',
                    minHeight: '36px',
                  }}
                />
                {structureSearch && (
                  <button
                    type="button"
                    onClick={() => setStructureSearch('')}
                    style={{
                      position: 'absolute',
                      right: '0.5rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleToggleAllAreas}
                className="btn btn-secondary"
                style={{ padding: '0.35rem 0.6rem', fontSize: '0.72rem', whiteSpace: 'nowrap', minHeight: '36px' }}
                title="Déplier ou replier toutes les zones"
              >
                {expandedAreaIds.size === activeAreas.length ? 'Tout replier' : 'Tout déplier'}
              </button>
            </div>
          </div>

          {/* Collapsible Zones List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activeAreas
              .filter((area) => {
                if (!structureSearch.trim()) return true;
                const q = structureSearch.trim().toUpperCase();
                if (area.name.toUpperCase().includes(q)) return true;
                return sections.some(
                  (s) => s.area_id === area.id && s.status === 'active' && s.name.toUpperCase().includes(q)
                );
              })
              .map((area) => {
                const areaSections = sections.filter((s) => {
                  if (s.area_id !== area.id || s.status !== 'active') return false;
                  if (!structureSearch.trim()) return true;
                  const q = structureSearch.trim().toUpperCase();
                  return s.name.toUpperCase().includes(q) || area.name.toUpperCase().includes(q);
                });

                const isExpanded = expandedAreaIds.has(area.id);
                const areaModelsCount = areaSections.reduce(
                  (acc, s) => acc + (sectionModelCountMap.get(s.id) || 0),
                  0
                );

                return (
                  <div
                    key={area.id}
                    className="card"
                    style={{
                      padding: 0,
                      overflow: 'hidden',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    {/* Collapsible Area Header */}
                    <div
                      onClick={() => toggleAreaExpand(area.id)}
                      style={{
                        padding: '0.75rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: isExpanded ? 'var(--bg-page)' : '#FFFFFF',
                        cursor: 'pointer',
                        userSelect: 'none',
                        borderBottom: isExpanded ? '1px solid var(--border-default)' : 'none',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div
                          style={{
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </div>

                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--accent-light)',
                            color: 'var(--accent-dark)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <MapPin size={15} />
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                              {area.name}
                            </span>
                            <span
                              className="badge badge-neutral"
                              style={{ fontSize: '0.7rem', padding: '0.1rem 0.45rem' }}
                            >
                              {areaSections.length} rayon{areaSections.length > 1 ? 's' : ''}
                            </span>
                            <span
                              style={{
                                fontSize: '0.7rem',
                                color: 'var(--text-muted)',
                              }}
                            >
                              • {areaModelsCount} modèle{areaModelsCount > 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Area Actions */}
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setTargetAreaId(area.id);
                            setIsAddSectionOpen(true);
                          }}
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', minHeight: '30px' }}
                        >
                          + Rayon
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setAreaToDelete({
                              id: area.id,
                              name: area.name,
                              sectionsCount: areaSections.length,
                              modelsCount: areaModelsCount,
                            })
                          }
                          className="btn btn-secondary"
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.72rem',
                            minHeight: '30px',
                            color: 'var(--text-muted)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = 'var(--danger)';
                            e.currentTarget.style.borderColor = '#FCA5A5';
                            e.currentTarget.style.background = '#FEE2E2';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--text-muted)';
                            e.currentTarget.style.borderColor = 'var(--border-default)';
                            e.currentTarget.style.background = 'transparent';
                          }}
                          title={`Supprimer la zone ${area.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Sections Content */}
                    {isExpanded && (
                      <div style={{ padding: '0.85rem 1rem' }}>
                        {areaSections.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '1.25rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                            Aucun rayon ne correspond dans cette zone.{' '}
                            <button
                              type="button"
                              onClick={() => {
                                setTargetAreaId(area.id);
                                setIsAddSectionOpen(true);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--accent)',
                                cursor: 'pointer',
                                fontWeight: 700,
                                textDecoration: 'underline',
                              }}
                            >
                              Créer un rayon
                            </button>
                          </div>
                        ) : (
                          /* Compact Section Grid */
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                              gap: '0.5rem',
                            }}
                          >
                            {areaSections.map((sec) => {
                              const count = sectionModelCountMap.get(sec.id) || 0;

                              return (
                                <div
                                  key={sec.id}
                                  style={{
                                    background: '#FFFFFF',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 'var(--radius-md)',
                                    padding: '0.55rem 0.65rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    gap: '0.35rem',
                                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
                                    transition: 'border-color 0.15s ease, transform 0.15s ease',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.35rem' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)', wordBreak: 'break-word', lineHeight: 1.25 }}>
                                      {sec.name}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSectionToDelete({
                                          id: sec.id,
                                          name: sec.name,
                                          areaName: area.name,
                                          modelsCount: count,
                                        });
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer',
                                        padding: '3px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        borderRadius: 'var(--radius-sm)',
                                        flexShrink: 0,
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.color = 'var(--danger)';
                                        e.currentTarget.style.background = '#FEE2E2';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.color = 'var(--text-muted)';
                                        e.currentTarget.style.background = 'transparent';
                                      }}
                                      title={`Supprimer le rayon ${sec.name}`}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.1rem' }}>
                                    <span
                                      style={{
                                        fontSize: '0.7rem',
                                        fontWeight: 600,
                                        color: count > 0 ? 'var(--accent-dark)' : 'var(--text-muted)',
                                        background: count > 0 ? 'var(--accent-light)' : 'var(--bg-input)',
                                        padding: '0.15rem 0.4rem',
                                        borderRadius: 'var(--radius-sm)',
                                      }}
                                    >
                                      {count} modèle{count > 1 ? 's' : ''}
                                    </span>
                                    {sec.capacity && (
                                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }} title={`Capacité: ${sec.capacity}`}>
                                        {sec.capacity}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 2. Models Catalog View */}
      {activeSubTab === 'models' && (
        <div className="fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Fiches Modèles ({models.length})</h3>
            <button
              type="button"
              onClick={() => (onOpenQuickAdd ? onOpenQuickAdd() : setIsAddModelOpen(true))}
              className="btn btn-primary"
              style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
            >
              <Plus size={16} />
              <span>Ajouter un modèle</span>
            </button>
          </div>

          {/* Quick search input */}
          <div style={{ marginBottom: '0.85rem' }}>
            <input
              type="text"
              className="input-control"
              placeholder="Filtrer par référence ou nom (ex: HS-21)…"
              value={modelSearchQuery}
              onChange={(e) => setModelSearchQuery(e.target.value)}
              style={{ fontSize: '0.8125rem' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {models
              .filter((m) => {
                if (!modelSearchQuery.trim()) return true;
                const q = modelSearchQuery.trim().toUpperCase();
                return (
                  m.reference_code.toUpperCase().includes(q) ||
                  (m.name && m.name.toUpperCase().includes(q))
                );
              })
              .map((m) => (
              <div
                key={m.id}
                className="card"
                style={{
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <span className="ref-code" style={{ fontSize: '1rem', marginRight: '0.5rem' }}>
                    {m.reference_code}
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {m.name || 'Sans description'}
                  </span>
                  {m.size_range && (
                    <span className="badge badge-neutral" style={{ marginLeft: '0.45rem', fontSize: '0.7rem' }}>
                      {m.size_range}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {m.price && (
                    <span className="badge badge-emerald" style={{ fontSize: '0.75rem' }}>
                      {m.price} DA
                    </span>
                  )}
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {new Date(m.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. CSV & Database Import View */}
      {activeSubTab === 'import' && (
        <div className="card fade-in" style={{ padding: '1.25rem' }}>
          {/* Header & Subtitle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database size={20} style={{ color: 'var(--brand-primary)' }} />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Import Catalog & V2 Database</h3>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Import complete V2 database extracts (1,484+ products across 101 sections) or standard V3 spreadsheets.
              </p>
            </div>

            {/* Quick Action Buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv,.txt"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />

              <button
                type="button"
                onClick={handleLoadOriginalV2}
                disabled={isLoadingOriginalV2}
                className="btn btn-primary"
                style={{ fontSize: '0.78rem', padding: '0.45rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                title="Load the 1,484 models database from v2"
              >
                {isLoadingOriginalV2 ? (
                  <>
                    <Loader2 size={14} className="spin" />
                    <span>Loading...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>Load Original V2 Database (1,484 items)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-secondary"
                style={{ fontSize: '0.78rem', padding: '0.45rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Upload size={14} />
                <span>Upload CSV File</span>
              </button>

              <button
                type="button"
                onClick={() => handleCsvChange(getCsvTemplate())}
                className="btn btn-secondary"
                style={{ fontSize: '0.78rem', padding: '0.45rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <FileSpreadsheet size={14} />
                <span>V3 Template</span>
              </button>
            </div>
          </div>

          {/* Destination Warehouse Selector */}
          <div
            style={{
              padding: '0.85rem 1rem',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', color: 'var(--text-primary)' }}>
                Entrepôt de destination :
              </label>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                L'importation réinitialise la base locale et associe l'ensemble des données à l'entrepôt <strong>BASE</strong>.
              </span>
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.35rem 0.75rem',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(99, 102, 241, 0.1)',
                color: '#4f46e5',
                fontWeight: 700,
                fontSize: '0.8rem',
              }}
            >
              <span>BASE (Automatique)</span>
            </div>
          </div>

          {/* Format Detection & Statistics Preview */}
          {detectedFormat === 'v2' && parsedV2Data && (
            <div
              className="fade-in"
              style={{
                padding: '1rem',
                background: 'rgba(59, 130, 246, 0.06)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span className="badge badge-primary" style={{ fontSize: '0.75rem', fontWeight: 800 }}>
                    Detected: V2 Warehouse Database Dump
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Ready for 1-click bulk import
                  </span>
                </div>
              </div>

              {/* Statistics Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                <div className="card" style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-card)' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
                    Source Deposit
                  </span>
                  <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
                    {parsedV2Data.summary.baseDepositName}
                  </strong>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block' }}>
                    ID: 1 (Main Base)
                  </span>
                </div>

                <div className="card" style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-card)' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
                    Shoe Models
                  </span>
                  <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)' }}>
                    {parsedV2Data.products.length.toLocaleString()}
                  </strong>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block' }}>
                    All linked to shelves
                  </span>
                </div>

                <div className="card" style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-card)' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
                    Shelves / Sections
                  </span>
                  <strong style={{ fontSize: '1.15rem', color: 'var(--success)' }}>
                    {parsedV2Data.sections.length}
                  </strong>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block' }}>
                    A1-A11, B1-B30, C1-C35, D1-D27
                  </span>
                </div>

                <div className="card" style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-card)' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
                    Zones Mapped
                  </span>
                  <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
                    {parsedV2Data.summary.zones.length} Zones
                  </strong>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block' }}>
                    {parsedV2Data.summary.zones.join(', ')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {detectedFormat === 'v3' && (
            <div
              className="fade-in"
              style={{
                padding: '0.75rem 1rem',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <span className="badge badge-emerald" style={{ fontSize: '0.75rem', fontWeight: 800 }}>
                  Detected: V3 Standard Catalog CSV
                </span>
                <span style={{ fontSize: '0.8rem', marginLeft: '0.5rem', color: 'var(--text-secondary)' }}>
                  {parsedRows.length} valid row(s) ready to import
                </span>
              </div>
            </div>
          )}

          {/* Raw CSV Textarea */}
          <div style={{ position: 'relative', marginBottom: '1rem' }}>
            <textarea
              value={csvContent}
              onChange={(e) => handleCsvChange(e.target.value)}
              rows={8}
              className="input-control"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', paddingBottom: '1.75rem' }}
              placeholder="Paste raw CSV content here, click 'Upload CSV File', or click 'Load Original V2 Database' above..."
            />
            {csvContent.trim() && (
              <span
                style={{
                  position: 'absolute',
                  bottom: '8px',
                  right: '12px',
                  fontSize: '0.7rem',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  background: 'var(--bg-card)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)',
                }}
              >
                {csvContent.split(/\r?\n/).filter(Boolean).length} lines
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={handleCommitCsv}
              disabled={
                isImporting ||
                (detectedFormat === 'v2' && (!parsedV2Data || parsedV2Data.products.length === 0)) ||
                (detectedFormat === 'v3' && parsedRows.length === 0) ||
                (detectedFormat === 'unknown' && !csvContent.trim())
              }
              className="btn btn-primary"
              style={{ minWidth: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              {isImporting ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>Importing into Database...</span>
                </>
              ) : detectedFormat === 'v2' && parsedV2Data ? (
                <>
                  <Sparkles size={16} />
                  <span>
                    Import V2 Database ({parsedV2Data.products.length.toLocaleString()} Items & {parsedV2Data.sections.length} Shelves)
                  </span>
                </>
              ) : detectedFormat === 'v3' ? (
                <>
                  <Upload size={16} />
                  <span>Import {parsedRows.length} Items</span>
                </>
              ) : (
                <>
                  <Upload size={16} />
                  <span>Import Data</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleValidateCsv}
              disabled={!csvContent.trim() || isImporting}
              className="btn btn-secondary"
            >
              Re-validate Format
            </button>

            {csvContent.trim() && (
              <button
                type="button"
                onClick={() => {
                  setCsvContent('');
                  setParsedV2Data(null);
                  setParsedRows([]);
                  setCsvValidationErrors([]);
                  setImportSuccessMessage(null);
                  setDetectedFormat('unknown');
                }}
                className="btn btn-secondary"
              >
                Clear
              </button>
            )}
          </div>

          {/* Validation Errors Display */}
          {csvValidationErrors.length > 0 && (
            <div
              style={{
                padding: '0.85rem',
                background: 'var(--danger-light)',
                border: '1px solid var(--danger)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '1rem',
              }}
            >
              <h4 style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertCircle size={16} />
                Validation errors detected :
              </h4>
              <ul style={{ paddingLeft: '1.25rem', fontSize: '0.8rem', color: 'var(--danger)' }}>
                {csvValidationErrors.slice(0, 8).map((err, i) => (
                  <li key={i}>
                    Line {err.line} : {err.message}
                  </li>
                ))}
                {csvValidationErrors.length > 8 && (
                  <li style={{ fontStyle: 'italic', marginTop: '0.25rem' }}>
                    ... and {csvValidationErrors.length - 8} more errors.
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Success Banner */}
          {importSuccessMessage && (
            <div
              className="fade-in"
              style={{
                padding: '1rem',
                background: 'var(--success-light)',
                border: '1px solid var(--success)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--success)',
                marginBottom: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                <CheckCircle size={18} />
                <span>{importSuccessMessage}</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                All records have been saved into offline IndexedDB and are immediately available for searching, barcode scanning, and stock transfers.
              </p>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {onNavigateToSearch && (
                  <button
                    type="button"
                    onClick={() => onNavigateToSearch('545-81')}
                    className="btn btn-primary"
                    style={{ fontSize: '0.78rem', padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <Search size={14} />
                    <span>Test Search (e.g. 545-81)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveSubTab('structure')}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.78rem', padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Layers size={14} />
                  <span>View Shelf Structure</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('models')}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.78rem', padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <FileText size={14} />
                  <span>View All Models</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Add Area (FR-2.1) */}
      {isAddAreaOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 250,
          }}
        >
          <div
            className="card fade-in"
            style={{
              width: '100%',
              maxWidth: '420px',
              background: '#FFFFFF',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
              border: '1px solid var(--border-default)',
              padding: '1.5rem',
            }}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>
              Nouvelle Zone ({activeWarehouse?.name})
            </h3>
            <form onSubmit={handleCreateArea}>
              <input
                type="text"
                autoFocus
                className="input-control"
                placeholder="Ex: Zone Baskets Homme"
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
                style={{ marginBottom: '1rem' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Créer
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddAreaOpen(false)}
                  className="btn btn-secondary"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Section(s) (FR-3.1, FR-3.2) */}
      {isAddSectionOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 250,
          }}
        >
          <div
            className="card fade-in"
            style={{
              width: '100%',
              maxWidth: '440px',
              background: '#FFFFFF',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
              border: '1px solid var(--border-default)',
              padding: '1.5rem',
            }}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>
              Nouveau Rayon / Emplacement
            </h3>
            <form onSubmit={handleCreateSection} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  Zone parente :
                </label>
                <select
                  value={targetAreaId}
                  onChange={(e) => setTargetAreaId(e.target.value)}
                  className="input-control"
                >
                  {activeAreas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  Nom ou Préfixe (Ex: Rayon A-01 ou Rayon B) :
                </label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ex: Rayon R-10"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  Nombre à générer en série (FR-3.2 Bulk) :
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  className="input-control"
                  value={bulkSectionCount}
                  onChange={(e) => setBulkSectionCount(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  Capacité ou notes (optionnel, FR-3.5) :
                </label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ex: 50 cartons, Étagère haute..."
                  value={newSectionCapacity}
                  onChange={(e) => setNewSectionCapacity(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Créer
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddSectionOpen(false)}
                  className="btn btn-secondary"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Model (FR-4.1, FR-4.3, FR-4.7) */}
      {isAddModelOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 250,
          }}
        >
          <div
            className="card fade-in"
            style={{
              width: '100%',
              maxWidth: '460px',
              background: '#FFFFFF',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
              border: '1px solid var(--border-default)',
              padding: '1.5rem',
            }}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.25rem' }}>
              Ajouter une fiche modèle
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Les doublons de référence sont autorisés (FR-4.7) et désambiguïsés automatiquement.
            </p>

            <form onSubmit={handleCreateModel} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  Code Référence * (ex: HS-21) :
                </label>
                <input
                  type="text"
                  required
                  className="input-control ref-code"
                  placeholder="HS-21"
                  value={newModelRef}
                  onChange={(e) => setNewModelRef(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  Description / Nom :
                </label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ex: Sneakers Urban Flow Blanche"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                    Pointures (FR-4.1) :
                  </label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Ex: 36/41, 40/45..."
                    value={newModelSize}
                    onChange={(e) => setNewModelSize(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                    Prix (DA) :
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    className="input-control"
                    placeholder="249.00"
                    value={newModelPrice}
                    onChange={(e) => setNewModelPrice(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  Associer immédiatement à un rayon :
                </label>
                <SectionSearchSelect
                  sections={sections}
                  areas={areas}
                  selectedSectionId={newModelSectionId}
                  onSelectSection={setNewModelSectionId}
                  placeholder="Rechercher un rayon (optionnel)..."
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Enregistrer
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddModelOpen(false)}
                  className="btn btn-secondary"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification for Deletion */}
      {deleteToast && (
        <div
          className="fade-in"
          style={{
            position: 'fixed',
            bottom: '5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--text-primary)',
            color: '#FFFFFF',
            padding: '0.65rem 1.15rem',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.82rem',
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            maxWidth: '90vw',
            textAlign: 'center',
          }}
        >
          <CheckCircle size={16} style={{ color: '#34D399', flexShrink: 0 }} />
          <span>{deleteToast}</span>
        </div>
      )}

      {/* Delete Section Modal with Cascade Models Warning */}
      {sectionToDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 1100,
          }}
        >
          <div
            className="card fade-in"
            style={{
              width: '100%',
              maxWidth: '420px',
              background: '#FFFFFF',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
              border: '1px solid var(--border-default)',
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--radius-md)',
                  background: '#FEE2E2',
                  color: 'var(--danger)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Trash2 size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Supprimer le rayon</h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {sectionToDelete.areaName} • {sectionToDelete.name}
                </span>
              </div>
            </div>

            <div
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                background: sectionToDelete.modelsCount > 0 ? '#FEF2F2' : 'var(--bg-input)',
                border: sectionToDelete.modelsCount > 0 ? '1px solid #FECACA' : '1px solid var(--border-default)',
                marginBottom: '1.25rem',
                fontSize: '0.82rem',
                lineHeight: 1.45,
                color: sectionToDelete.modelsCount > 0 ? '#991B1B' : 'var(--text-secondary)',
              }}
            >
              {sectionToDelete.modelsCount > 0 ? (
                <div>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
                    <AlertTriangle size={15} style={{ color: 'var(--danger)' }} />
                    <span>Suppression en cascade</span>
                  </div>
                  <div>
                    Ce rayon contient <strong>{sectionToDelete.modelsCount} modèle(s)</strong>.
                    La suppression du rayon <strong>supprimera définitivement tous ces modèles</strong> du catalogue.
                  </div>
                </div>
              ) : (
                <div>Ce rayon est vide. Aucun modèle ne sera affecté.</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setSectionToDelete(null)}
                disabled={isDeleting}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSection}
                disabled={isDeleting}
                style={{
                  flex: 1.2,
                  background: 'var(--danger)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.6rem 0.85rem',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  opacity: isDeleting ? 0.6 : 1,
                }}
              >
                {isDeleting ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                <span>Supprimer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Area Modal with Cascade Shelves & Models Warning */}
      {areaToDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 1100,
          }}
        >
          <div
            className="card fade-in"
            style={{
              width: '100%',
              maxWidth: '440px',
              background: '#FFFFFF',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
              border: '1px solid var(--border-default)',
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--radius-md)',
                  background: '#FEE2E2',
                  color: 'var(--danger)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Trash2 size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Supprimer la zone</h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {areaToDelete.name}
                </span>
              </div>
            </div>

            <div
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                marginBottom: '1.25rem',
                fontSize: '0.82rem',
                lineHeight: 1.45,
                color: '#991B1B',
              }}
            >
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
                <AlertTriangle size={15} style={{ color: 'var(--danger)' }} />
                <span>Suppression complète de la zone</span>
              </div>
              <div>
                Cette action supprimera la zone ainsi que ses{' '}
                <strong>{areaToDelete.sectionsCount} rayon(s)</strong> et{' '}
                <strong>{areaToDelete.modelsCount} modèle(s)</strong> associés.
                Cette action est <strong>irréversible</strong>.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setAreaToDelete(null)}
                disabled={isDeleting}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteArea}
                disabled={isDeleting}
                style={{
                  flex: 1.3,
                  background: 'var(--danger)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.6rem 0.85rem',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  opacity: isDeleting ? 0.6 : 1,
                }}
              >
                {isDeleting ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                <span>Supprimer la zone</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

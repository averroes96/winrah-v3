// ============================================================================
// WINRAH - Search Tab Component (FR-5.1 - FR-5.7, FR-4.8, FR-8.2)
// Core search experience with instant prefix/fuzzy query, duplicate disambiguation,
// camera barcode trigger, "Search Everywhere" toggle, and audit logging.
// ============================================================================

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  ScanBarcode,
  Globe,
  MapPin,
  ArrowRightLeft,
  X,
  Layers,
  AlertCircle,
  SlidersHorizontal,
  RotateCcw,
} from 'lucide-react';
import {
  ShoeModel,
  ModelSection,
  Section,
  Area,
  Warehouse,
  DisambiguatedModelResult,
} from '../types';
import { disambiguateModels, getModelDisplayReference } from '../lib/disambiguation';
import { db } from '../db/indexedDb';
import { useI18n } from '../i18n';
import { LogoMark } from './Logo';
import { AdvancedFilterModal, SearchFilterState } from './AdvancedFilterModal';

interface SearchTabProps {
  models: ShoeModel[];
  modelSections: ModelSection[];
  sections: Section[];
  areas: Area[];
  warehouses: Warehouse[];
  activeWarehouse: Warehouse | null;
  onOpenBarcodeScanner: () => void;
  onInitiateTransfer: (model: ShoeModel, fromSectionId?: string) => void;
  onViewModelDetails: (disambiguated: DisambiguatedModelResult) => void;
  query?: string;
  onQueryChange?: (query: string) => void;
}

export const SearchTab: React.FC<SearchTabProps> = ({
  models,
  modelSections,
  sections,
  areas,
  warehouses,
  activeWarehouse,
  onOpenBarcodeScanner,
  onInitiateTransfer,
  onViewModelDetails,
  query: externalQuery,
  onQueryChange,
}) => {
  const { language, t } = useI18n();
  const [internalQuery, setInternalQuery] = useState('');
  const query = externalQuery !== undefined ? externalQuery : internalQuery;
  const setQuery = (q: string) => {
    if (onQueryChange) {
      onQueryChange(q);
    } else {
      setInternalQuery(q);
    }
  };

  // Advanced Filter State
  const [filterState, setFilterState] = useState<SearchFilterState>({
    areaId: 'all',
    isSearchEverywhere: false,
    assignmentFilter: 'all',
    sortBy: 'relevance',
  });
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  const lastLoggedQueryRef = useRef<string>('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Active filter count
  const activeFiltersCount =
    (filterState.areaId !== 'all' ? 1 : 0) +
    (filterState.isSearchEverywhere ? 1 : 0) +
    (filterState.assignmentFilter !== 'all' ? 1 : 0) +
    (filterState.sortBy !== 'relevance' ? 1 : 0);

  // Only load/show models when user starts typing or when an area/scope filter is actively chosen
  const isTyping = query.trim().length > 0;
  const isBrowsingFilter = filterState.areaId !== 'all';
  const shouldComputeResults = isTyping || isBrowsingFilter;

  // Disambiguate models only when searching or browsing to avoid heavy initial computations
  const disambiguatedList = useMemo(() => {
    if (!shouldComputeResults) return [];
    return disambiguateModels(models, modelSections, sections, areas, warehouses);
  }, [models, modelSections, sections, areas, warehouses, shouldComputeResults]);

  // Available areas for filtering
  const relevantAreas = useMemo(() => {
    if (filterState.isSearchEverywhere || !activeWarehouse) {
      return areas;
    }
    return areas.filter((a) => a.warehouse_id === activeWarehouse.id);
  }, [areas, filterState.isSearchEverywhere, activeWarehouse]);

  // Filtered results
  const searchResults = useMemo(() => {
    if (!shouldComputeResults) return [];
    const q = query.trim().toUpperCase();

    const filtered = disambiguatedList.filter((item) => {
      // 1. Warehouse Scoping
      if (!filterState.isSearchEverywhere && activeWarehouse) {
        if (item.model.warehouse_id !== activeWarehouse.id) return false;
      }

      // 2. Area Filter
      if (filterState.areaId !== 'all') {
        const isInArea = item.sections.some((s) => s.area.id === filterState.areaId);
        if (!isInArea) return false;
      }

      // 3. Assignment / Stock location filter
      if (filterState.assignmentFilter === 'assigned') {
        if (item.sections.length === 0) return false;
      } else if (filterState.assignmentFilter === 'unassigned') {
        if (item.sections.length > 0) return false;
      }

      // 4. Search Query Match
      if (isTyping) {
        const refMatch = item.model.reference_code.toUpperCase().includes(q);
        const nameMatch = item.model.name?.toUpperCase().includes(q) || false;
        const sectionMatch = item.sections.some((s) =>
          s.section.name.toUpperCase().includes(q) || s.area.name.toUpperCase().includes(q)
        );
        return refMatch || nameMatch || sectionMatch;
      }

      return true;
    });

    // 5. Sorting
    if (filterState.sortBy === 'ref_asc') {
      filtered.sort((a, b) => a.model.reference_code.localeCompare(b.model.reference_code));
    } else if (filterState.sortBy === 'name_asc') {
      filtered.sort((a, b) => (a.model.name || '').localeCompare(b.model.name || ''));
    }

    return filtered;
  }, [disambiguatedList, query, filterState, activeWarehouse, shouldComputeResults, isTyping]);

  // Keep search context ref updated on every render
  const currentSearchContextRef = useRef({
    query,
    resultCount: searchResults.length,
    matchedModelIds: searchResults.slice(0, 15).map((r) => r.model.id),
    isSearchEverywhere: filterState.isSearchEverywhere,
    warehouseId: activeWarehouse?.id || null,
  });

  currentSearchContextRef.current = {
    query,
    resultCount: searchResults.length,
    matchedModelIds: searchResults.slice(0, 15).map((r) => r.model.id),
    isSearchEverywhere: filterState.isSearchEverywhere,
    warehouseId: activeWarehouse?.id || null,
  };

  // Immediate or debounced flush helper with optional model selection tracking
  const flushSearchLog = useCallback(async (extra?: { selectedModelId?: string; fromSectionId?: string }) => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }

    const ctx = currentSearchContextRef.current;
    const trimmed = ctx.query.trim();

    // Query must be at least 2 characters to be a meaningful search query
    if (trimmed.length < 2) return;

    // Prevent duplicate logs if the query hasn't changed since the last logged search,
    // unless an explicit model selection/interaction is being recorded
    const isSameQuery = trimmed.toUpperCase() === lastLoggedQueryRef.current.toUpperCase();
    if (isSameQuery && !extra?.selectedModelId) return;

    lastLoggedQueryRef.current = trimmed;

    try {
      await db.putRaw(
        'search_logs',
        {
          id: 'sl-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          device_id: localStorage.getItem('winrah_device_id') || 'dev-local-01',
          warehouse_id: ctx.isSearchEverywhere ? null : ctx.warehouseId,
          query_text: trimmed,
          result_count: ctx.resultCount,
          is_everywhere: ctx.isSearchEverywhere,
          matched_model_ids: ctx.matchedModelIds,
          selected_model_id: extra?.selectedModelId || null,
          from_section_id: extra?.fromSectionId || null,
          sync_status: 'pending',
          created_at: new Date().toISOString(),
        },
        false // Do NOT trigger store subscriber notifications which cause re-render loops while searching
      );
    } catch (err) {
      console.warn('Failed to record search log:', err);
    }
  }, []);

  // 5-second inactivity debounced logger (resets with each typed character)
  useEffect(() => {
    // Clear previous timer on any keystroke/query change
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }

    const trimmed = query.trim();

    // Do not schedule if query has fewer than 2 characters
    if (trimmed.length < 2) {
      return;
    }

    // Do not schedule if query matches what was already logged
    if (trimmed.toUpperCase() === lastLoggedQueryRef.current.toUpperCase()) {
      return;
    }

    // Wait for 5 seconds of inactivity after the last typed character
    searchTimerRef.current = setTimeout(() => {
      flushSearchLog();
    }, 5000);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
    };
  }, [query, flushSearchLog]);

  return (
    <div className="fade-in">
      {/* Sleek Search Row: Input + Barcode Scanner + Filter Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.75rem' }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '0.5rem 0.75rem',
            transition: 'all 0.15s ease',
          }}
        >
          <Search size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                flushSearchLog();
              }
            }}
            placeholder={t('search.placeholder')}
            className="ref-code"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.9375rem',
              fontFamily: 'inherit',
            }}
          />

          {query && (
            <button
              type="button"
              onClick={() => {
                if (searchTimerRef.current) {
                  clearTimeout(searchTimerRef.current);
                  searchTimerRef.current = null;
                }
                setQuery('');
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Camera Barcode Trigger Button */}
        <button
          type="button"
          onClick={onOpenBarcodeScanner}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '42px',
            height: '42px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent)',
            color: '#FFFFFF',
            border: 'none',
            cursor: 'pointer',
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(245, 158, 11, 0.25)',
            transition: 'transform 0.1s ease',
          }}
          title={t('search.scan_tooltip')}
        >
          <ScanBarcode size={20} />
        </button>

        {/* Advanced Filter Button with Active Badge */}
        <button
          type="button"
          onClick={() => setIsFilterModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '42px',
            height: '42px',
            borderRadius: 'var(--radius-md)',
            background: activeFiltersCount > 0 ? 'var(--accent-light)' : 'var(--bg-input)',
            color: activeFiltersCount > 0 ? 'var(--accent-dark)' : 'var(--text-secondary)',
            border: `1px solid ${activeFiltersCount > 0 ? 'var(--accent)' : 'var(--border-default)'}`,
            cursor: 'pointer',
            flexShrink: 0,
            position: 'relative',
            transition: 'all 0.15s ease',
          }}
          title="Filtres avancés"
        >
          <SlidersHorizontal size={18} />
          {activeFiltersCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: 'var(--accent)',
                color: '#FFFFFF',
                fontSize: '0.68rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
              }}
            >
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>

      {/* Active Filters Summary Bar (Only shown when filters are engaged) */}
      {activeFiltersCount > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            flexWrap: 'wrap',
            marginBottom: '0.85rem',
            padding: '0.4rem 0.6rem',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-default)',
            fontSize: '0.75rem',
          }}
        >
          <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Filtres :</span>

          {filterState.areaId !== 'all' && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.2rem 0.5rem',
                borderRadius: 'var(--radius-full)',
                background: 'var(--accent-light)',
                color: 'var(--accent-dark)',
                fontWeight: 700,
              }}
            >
              {relevantAreas.find((a) => a.id === filterState.areaId)?.name || 'Zone'}
              <X
                size={12}
                style={{ cursor: 'pointer' }}
                onClick={() => setFilterState((prev) => ({ ...prev, areaId: 'all' }))}
              />
            </span>
          )}

          {filterState.isSearchEverywhere && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.2rem 0.5rem',
                borderRadius: 'var(--radius-full)',
                background: 'var(--info-light)',
                color: 'var(--info)',
                fontWeight: 700,
              }}
            >
              Tous les dépôts
              <X
                size={12}
                style={{ cursor: 'pointer' }}
                onClick={() => setFilterState((prev) => ({ ...prev, isSearchEverywhere: false }))}
              />
            </span>
          )}

          {filterState.assignmentFilter !== 'all' && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.2rem 0.5rem',
                borderRadius: 'var(--radius-full)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontWeight: 700,
              }}
            >
              {filterState.assignmentFilter === 'assigned' ? 'En rayon' : 'Non assigné'}
              <X
                size={12}
                style={{ cursor: 'pointer' }}
                onClick={() => setFilterState((prev) => ({ ...prev, assignmentFilter: 'all' }))}
              />
            </span>
          )}

          {filterState.sortBy !== 'relevance' && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.2rem 0.5rem',
                borderRadius: 'var(--radius-full)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontWeight: 700,
              }}
            >
              Tri : {filterState.sortBy === 'ref_asc' ? 'Réf (A-Z)' : 'Nom (A-Z)'}
              <X
                size={12}
                style={{ cursor: 'pointer' }}
                onClick={() => setFilterState((prev) => ({ ...prev, sortBy: 'relevance' }))}
              />
            </span>
          )}

          <button
            type="button"
            onClick={() =>
              setFilterState({
                areaId: 'all',
                isSearchEverywhere: false,
                assignmentFilter: 'all',
                sortBy: 'relevance',
              })
            }
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 600,
              padding: '0 0.3rem',
            }}
          >
            Effacer
          </button>
        </div>
      )}

      {/* Results Header (Counter when searching or browsing) */}
      {shouldComputeResults && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            {searchResults.length} modèle(s) trouvé(s)
          </span>
          {activeWarehouse && !filterState.isSearchEverywhere && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Entrepôt : {activeWarehouse.name}
            </span>
          )}
        </div>
      )}

      {/* Results Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {/* State 1: Idle (User has not started searching or browsing yet) */}
        {!shouldComputeResults && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {/* Quick Scanner Hero Card */}
            <div
              className="card"
              style={{
                padding: '1.5rem 1.25rem',
                textAlign: 'center',
                background: 'linear-gradient(180deg, #FFFFFF 0%, #FFFBEB 100%)',
                border: '1px solid #FDE68A',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 0.75rem auto',
                  borderRadius: '16px',
                  boxShadow: '0 8px 24px rgba(245, 158, 11, 0.2)',
                }}
              >
                <LogoMark size={56} />
              </div>

              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
                {t('search.prompt_title')}
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', maxWidth: '380px', margin: '0 auto 1rem auto', lineHeight: 1.45 }}>
                {t('search.prompt_desc')}
              </p>

              <button
                type="button"
                onClick={onOpenBarcodeScanner}
                className="btn btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.65rem 1.25rem',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  margin: '0 auto',
                  boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
                }}
              >
                <ScanBarcode size={18} />
                <span>{t('search.scan_barcode')}</span>
              </button>
            </div>

            {/* Quick Zone Shortcuts */}
            {relevantAreas.length > 0 && (
              <div className="card" style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Explorer par zone
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Accès rapide aux rayons
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                  {relevantAreas.map((area) => {
                    const areaSections = sections.filter((s) => s.area_id === area.id);
                    return (
                      <button
                        key={area.id}
                        type="button"
                        onClick={() => setFilterState((prev) => ({ ...prev, areaId: area.id }))}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.65rem 0.75rem',
                          background: 'var(--bg-page)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <MapPin size={14} style={{ color: 'var(--accent)' }} />
                          <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                            {area.name}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '0.15rem 0.45rem',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--bg-input)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {areaSections.length} r.
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* State 2: User searching or browsing -> Show matching models */}
        {shouldComputeResults &&
          searchResults.map((item) => {
            const displayTitle = getModelDisplayReference(
              item.model.reference_code,
              item.displayIndex,
              item.totalEntriesWithCode
            );

            return (
              <div
                key={item.model.id}
                className="card"
                style={{
                  padding: '1rem',
                  display: 'flex',
                  gap: '0.85rem',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  flushSearchLog({
                    selectedModelId: item.model.id,
                    fromSectionId: item.sections[0]?.section.id,
                  });
                  onViewModelDetails(item);
                }}
              >
                {/* Photo Thumbnail */}
                {item.model.photo_url ? (
                  <img
                    src={item.model.photo_url}
                    alt={item.model.reference_code}
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: 'var(--radius-sm)',
                      objectFit: 'cover',
                      flexShrink: 0,
                      border: '1px solid var(--border-default)',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-input)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: '1.5rem',
                    }}
                  >
                    👟
                  </div>
                )}

                {/* Main Model Information */}
                <div style={{ flex: 1, minWidth: '180px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                    <h3 className="ref-code" style={{ fontSize: '1.0625rem' }}>
                      {displayTitle}
                    </h3>

                    {/* Duplicate Disambiguation Badge (FR-4.8) */}
                    {item.totalEntriesWithCode > 1 && (
                      <span
                        className="badge badge-amber"
                        title="Plusieurs modèles portent cette même référence (FR-4.7)"
                      >
                        <Layers size={11} />
                        <span>{item.totalEntriesWithCode} fiches</span>
                      </span>
                    )}

                    {item.model.size_range && (
                      <span className="badge badge-neutral">
                        {item.model.size_range}
                      </span>
                    )}

                    {item.model.price && (
                      <span className="badge badge-emerald">
                        {item.model.price.toFixed(2)} DA
                      </span>
                    )}
                  </div>

                  {item.model.name && (
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                      {item.model.name}
                    </p>
                  )}

                  {/* Physical Location Chips */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                    {item.sections.length > 0 ? (
                      item.sections.map((loc) => (
                        <span
                          key={loc.section.id}
                          className="badge"
                          style={{
                            background: 'var(--accent-light)',
                            color: 'var(--accent-dark)',
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.55rem',
                          }}
                        >
                          <MapPin size={11} />
                          <span>
                            <strong>{loc.section.name}</strong> ({loc.area.name})
                            {filterState.isSearchEverywhere && ` — ${loc.warehouse.name.split(' ')[0]}`}
                          </span>
                        </span>
                      ))
                    ) : (
                      <span className="badge badge-rose" style={{ fontSize: '0.75rem' }}>
                        <AlertCircle size={11} />
                        {t('search.not_assigned')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    alignSelf: 'center',
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      flushSearchLog({
                        selectedModelId: item.model.id,
                        fromSectionId: item.sections[0]?.section.id,
                      });
                      onInitiateTransfer(item.model, item.sections[0]?.section.id);
                    }}
                    className="btn btn-primary"
                    style={{
                      padding: '0.45rem 0.85rem',
                      fontSize: '0.8rem',
                      gap: '0.35rem',
                    }}
                    title={t('search.actions.transfer')}
                  >
                    <ArrowRightLeft size={14} />
                    <span>{t('search.actions.transfer')}</span>
                  </button>
                </div>
              </div>
            );
          })}

        {/* State 3: Searching or browsing with zero matches */}
        {shouldComputeResults && searchResults.length === 0 && (
          <div
            className="card fade-in"
            style={{
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              marginTop: '0.5rem',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'var(--danger-light)',
                color: 'var(--danger)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 0.75rem auto',
              }}
            >
              <AlertCircle size={24} />
            </div>

            <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.3rem', color: 'var(--text-primary)' }}>
              {t('search.no_results_title')}
            </h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', maxWidth: '380px', margin: '0 auto 1rem auto' }}>
              {t('search.no_results_desc')}
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              {!filterState.isSearchEverywhere && (
                <button
                  type="button"
                  onClick={() => setFilterState((prev) => ({ ...prev, isSearchEverywhere: true }))}
                  className="btn btn-secondary"
                  style={{ gap: '0.4rem', fontSize: '0.8rem' }}
                >
                  <Globe size={14} />
                  <span>{t('search.search_everywhere')}</span>
                </button>
              )}

              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setFilterState({
                      areaId: 'all',
                      isSearchEverywhere: false,
                      assignmentFilter: 'all',
                      sortBy: 'relevance',
                    })
                  }
                  className="btn btn-secondary"
                  style={{ gap: '0.4rem', fontSize: '0.8rem' }}
                >
                  <RotateCcw size={14} />
                  <span>Réinitialiser les filtres</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Advanced Filter Modal */}
      <AdvancedFilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        filters={filterState}
        onApplyFilters={setFilterState}
        onResetFilters={() =>
          setFilterState({
            areaId: 'all',
            isSearchEverywhere: false,
            assignmentFilter: 'all',
            sortBy: 'relevance',
          })
        }
        areas={relevantAreas}
        activeWarehouse={activeWarehouse}
        totalWarehousesCount={warehouses.length}
        totalResultsCount={searchResults.length}
      />
    </div>
  );
};

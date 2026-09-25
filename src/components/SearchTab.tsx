// ============================================================================
// WINRAH - Search Tab Component (FR-5.1 - FR-5.7, FR-4.8, FR-8.2)
// Core search experience with instant prefix/fuzzy query, duplicate disambiguation,
// camera barcode trigger, "Search Everywhere" toggle, and audit logging.
// ============================================================================

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  ScanBarcode,
  Globe,
  MapPin,
  ArrowRightLeft,
  X,
  Layers,
  AlertCircle,
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

  const [isSearchEverywhere, setIsSearchEverywhere] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('all');
  const lastLoggedQueryRef = useRef<string>('');

  // Only load/show models when user starts typing
  const isTyping = query.trim().length > 0;

  // Disambiguate models only when query is present to avoid loading models immediately
  const disambiguatedList = useMemo(() => {
    if (!isTyping) return [];
    return disambiguateModels(models, modelSections, sections, areas, warehouses);
  }, [models, modelSections, sections, areas, warehouses, isTyping]);

  // Available areas for filter chips
  const relevantAreas = useMemo(() => {
    if (isSearchEverywhere || !activeWarehouse) {
      return areas;
    }
    return areas.filter((a) => a.warehouse_id === activeWarehouse.id);
  }, [areas, isSearchEverywhere, activeWarehouse]);

  // Filtered results: only computed once the user starts typing
  const searchResults = useMemo(() => {
    if (!isTyping) return [];
    const q = query.trim().toUpperCase();

    return disambiguatedList.filter((item) => {
      // 1. Warehouse Scoping (FR-5.7)
      if (!isSearchEverywhere && activeWarehouse) {
        if (item.model.warehouse_id !== activeWarehouse.id) return false;
      }

      // 2. Area Filter (FR-5.6)
      if (selectedAreaId !== 'all') {
        const isInArea = item.sections.some((s) => s.area.id === selectedAreaId);
        if (!isInArea) return false;
      }

      // 3. Search Query Match (Reference Code, Name, or Section Name)
      const refMatch = item.model.reference_code.toUpperCase().includes(q);
      const nameMatch = item.model.name?.toUpperCase().includes(q) || false;
      const sectionMatch = item.sections.some((s) =>
        s.section.name.toUpperCase().includes(q) || s.area.name.toUpperCase().includes(q)
      );

      return refMatch || nameMatch || sectionMatch;
    });
  }, [disambiguatedList, query, isSearchEverywhere, activeWarehouse, selectedAreaId, isTyping]);

  // Log search query for analytics & zero-result detection (FR-8.2, FR-8.3)
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length >= 2 && trimmed !== lastLoggedQueryRef.current) {
      const timer = setTimeout(async () => {
        lastLoggedQueryRef.current = trimmed;
        await db.putRaw('search_logs', {
          id: 'sl-' + Date.now(),
          device_id: localStorage.getItem('winrah_device_id') || 'dev-local-01',
          warehouse_id: isSearchEverywhere ? null : activeWarehouse?.id || null,
          query_text: trimmed,
          result_count: searchResults.length,
          is_everywhere: isSearchEverywhere,
          sync_status: 'pending',
          created_at: new Date().toISOString(),
        });
      }, 700);

      return () => clearTimeout(timer);
    }
  }, [query, searchResults.length, isSearchEverywhere, activeWarehouse]);

  return (
    <div className="fade-in">
      {/* Search Input Box */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          marginBottom: '0.85rem',
          background: 'var(--bg-input)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          padding: '0.5rem 0.75rem',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        }}
      >
        <Search size={20} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
            onClick={() => setQuery('')}
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

        {/* Camera Barcode Trigger Button (FR-5.4) */}
        <button
          type="button"
          onClick={onOpenBarcodeScanner}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--accent)',
            color: '#FFFFFF',
            border: 'none',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'background 0.15s ease',
          }}
          title={t('search.scan_tooltip')}
        >
          <ScanBarcode size={18} />
        </button>
      </div>

      {/* Scope Controls & Filter Chips */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '1rem',
        }}
      >
        {/* Scope Toggle: Active Warehouse vs Everywhere (FR-5.7) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <button
            type="button"
            onClick={() => setIsSearchEverywhere(false)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.3rem 0.65rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: 'var(--radius-full)',
              background: !isSearchEverywhere ? 'var(--accent-light)' : 'var(--bg-card)',
              color: !isSearchEverywhere ? 'var(--accent-dark)' : 'var(--text-muted)',
              border: `1px solid ${!isSearchEverywhere ? 'var(--accent)' : 'var(--border-default)'}`,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <MapPin size={12} />
            <span>{activeWarehouse ? activeWarehouse.name.split(' ')[0] : t('header.active_warehouse')}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSearchEverywhere(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.3rem 0.65rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: 'var(--radius-full)',
              background: isSearchEverywhere ? 'var(--info-light)' : 'var(--bg-card)',
              color: isSearchEverywhere ? 'var(--info)' : 'var(--text-muted)',
              border: `1px solid ${isSearchEverywhere ? 'var(--info)' : 'var(--border-default)'}`,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title={t('search.search_everywhere')}
          >
            <Globe size={12} />
            <span>{t('search.search_everywhere')} ({warehouses.length})</span>
          </button>
        </div>

        {/* Result Counter */}
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {isTyping ? t('search.results_count', { count: searchResults.length }) : ''}
        </span>
      </div>

      {/* Area Filter Chips */}
      {relevantAreas.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '0.35rem',
            overflowX: 'auto',
            paddingBottom: '0.5rem',
            marginBottom: '1rem',
          }}
        >
          <button
            type="button"
            onClick={() => setSelectedAreaId('all')}
            style={{
              padding: '0.3rem 0.7rem',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: selectedAreaId === 'all' ? 'var(--text-primary)' : 'var(--bg-card)',
              color: selectedAreaId === 'all' ? '#FFFFFF' : 'var(--text-secondary)',
              border: `1px solid ${selectedAreaId === 'all' ? 'var(--text-primary)' : 'var(--border-default)'}`,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
          >
            {t('search.all_zones')}
          </button>
          {relevantAreas.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelectedAreaId(a.id)}
              style={{
                padding: '0.3rem 0.7rem',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: selectedAreaId === a.id ? 'var(--accent)' : 'var(--bg-card)',
                color: selectedAreaId === a.id ? '#FFFFFF' : 'var(--text-secondary)',
                border: `1px solid ${selectedAreaId === a.id ? 'var(--accent)' : 'var(--border-default)'}`,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-sans)',
                transition: 'all 0.15s ease',
              }}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      {/* Results Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {/* State 1: Idle (User has not started typing yet) -> Models are NOT loaded/shown */}
        {!isTyping && (
          <div
            className="card fade-in"
            style={{
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              marginTop: '0.25rem',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem auto',
                borderRadius: '16px',
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
              }}
            >
              <LogoMark size={64} />
            </div>

            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              {t('search.prompt_title')}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', maxWidth: '420px', margin: '0 auto 1.25rem auto', lineHeight: 1.5 }}>
              {t('search.prompt_desc')}
            </p>

            <button
              type="button"
              onClick={onOpenBarcodeScanner}
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.5rem 1rem',
                fontSize: '0.8125rem',
                margin: '0 auto',
              }}
            >
              <ScanBarcode size={16} />
              <span>{t('search.scan_barcode')}</span>
            </button>
          </div>
        )}

        {/* State 2: User started typing -> Show matching models */}
        {isTyping &&
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
                onClick={() => onViewModelDetails(item)}
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
                            {isSearchEverywhere && ` — ${loc.warehouse.name.split(' ')[0]}`}
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

        {/* State 3: User typed but zero matches found */}
        {isTyping && searchResults.length === 0 && (
          <div
            className="card fade-in"
            style={{
              padding: '3rem 1.5rem',
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

            {!isSearchEverywhere && (
              <button
                type="button"
                onClick={() => setIsSearchEverywhere(true)}
                className="btn btn-secondary"
                style={{ gap: '0.4rem' }}
              >
                <Globe size={15} />
                <span>{t('search.search_everywhere')}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

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
  Tag,
  ArrowRightLeft,
  X,
  Layers,
  Sparkles,
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
}) => {
  const [query, setQuery] = useState('');
  const [isSearchEverywhere, setIsSearchEverywhere] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('all');
  const lastLoggedQueryRef = useRef<string>('');

  // Disambiguate all models
  const disambiguatedList = useMemo(() => {
    return disambiguateModels(models, modelSections, sections, areas, warehouses);
  }, [models, modelSections, sections, areas, warehouses]);

  // Available areas for filter chips
  const relevantAreas = useMemo(() => {
    if (isSearchEverywhere || !activeWarehouse) {
      return areas;
    }
    return areas.filter((a) => a.warehouse_id === activeWarehouse.id);
  }, [areas, isSearchEverywhere, activeWarehouse]);

  // Filtered results
  const searchResults = useMemo(() => {
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
      if (!q) return true;

      const refMatch = item.model.reference_code.toUpperCase().includes(q);
      const nameMatch = item.model.name?.toUpperCase().includes(q) || false;
      const sectionMatch = item.sections.some((s) =>
        s.section.name.toUpperCase().includes(q) || s.area.name.toUpperCase().includes(q)
      );

      return refMatch || nameMatch || sectionMatch;
    });
  }, [disambiguatedList, query, isSearchEverywhere, activeWarehouse, selectedAreaId]);

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
        className="glass-panel"
        style={{
          padding: '0.65rem 0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '0.85rem',
          background: 'rgba(16, 22, 38, 0.95)',
          border: '1px solid var(--border-focus)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        }}
      >
        <Search size={22} style={{ color: 'var(--primary)', flexShrink: 0 }} />

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Entrer référence (ex: HS-21), nom, rayon..."
          className="ref-code"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: '1.1rem',
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
            }}
          >
            <X size={18} />
          </button>
        )}

        {/* Camera Barcode Trigger Button (FR-5.4) */}
        <button
          type="button"
          onClick={onOpenBarcodeScanner}
          className="btn btn-primary"
          style={{
            padding: '0.55rem 0.95rem',
            gap: '0.4rem',
            fontSize: '0.85rem',
            flexShrink: 0,
          }}
          title="Scanner un code-barres avec la caméra"
        >
          <ScanBarcode size={18} />
          <span>Scanner</span>
        </button>
      </div>

      {/* Scope Controls & Filter Chips */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.65rem',
          marginBottom: '1.25rem',
        }}
      >
        {/* Scope Toggle: Active Warehouse vs Everywhere (FR-5.7) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            type="button"
            onClick={() => setIsSearchEverywhere(false)}
            className="btn"
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.78rem',
              borderRadius: 'var(--radius-full)',
              background: !isSearchEverywhere ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              color: !isSearchEverywhere ? '#fbbf24' : 'var(--text-muted)',
              border: `1px solid ${!isSearchEverywhere ? 'var(--primary)' : 'var(--border-subtle)'}`,
            }}
          >
            <MapPin size={13} />
            <span>{activeWarehouse ? activeWarehouse.name.split(' ')[0] : 'Entrepôt actif'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSearchEverywhere(true)}
            className="btn"
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.78rem',
              borderRadius: 'var(--radius-full)',
              background: isSearchEverywhere ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.05)',
              color: isSearchEverywhere ? '#818cf8' : 'var(--text-muted)',
              border: `1px solid ${isSearchEverywhere ? 'var(--indigo)' : 'var(--border-subtle)'}`,
            }}
            title="Rechercher dans tous les entrepôts du réseau"
          >
            <Globe size={13} />
            <span>Partout ({warehouses.length})</span>
          </button>
        </div>

        {/* Result Counter */}
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {searchResults.length} modèle(s) trouvé(s)
        </span>
      </div>

      {/* Area Filter Chips */}
      {relevantAreas.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '0.4rem',
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
              fontWeight: 700,
              background: selectedAreaId === 'all' ? 'var(--text-primary)' : 'rgba(255,255,255,0.06)',
              color: selectedAreaId === 'all' ? 'var(--bg-dark)' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Toutes les zones
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
                fontWeight: 700,
                background: selectedAreaId === a.id ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                color: selectedAreaId === a.id ? 'var(--primary-text)' : 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      {/* Results List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {searchResults.map((item) => {
          const displayTitle = getModelDisplayReference(
            item.model.reference_code,
            item.displayIndex,
            item.totalEntriesWithCode
          );

          return (
            <div
              key={item.model.id}
              className="glass-panel"
              style={{
                padding: '1.1rem',
                display: 'flex',
                gap: '1rem',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
              }}
            >
              {/* Photo Thumbnail */}
              {item.model.photo_url ? (
                <img
                  src={item.model.photo_url}
                  alt={item.model.reference_code}
                  style={{
                    width: '76px',
                    height: '76px',
                    borderRadius: 'var(--radius-md)',
                    objectFit: 'cover',
                    flexShrink: 0,
                    border: '1px solid var(--border-subtle)',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '76px',
                    height: '76px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: '1.8rem',
                  }}
                >
                  👟
                </div>
              )}

              {/* Main Model Information */}
              <div style={{ flex: 1, minWidth: '220px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                  <h3 className="ref-code" style={{ fontSize: '1.25rem' }}>
                    {displayTitle}
                  </h3>

                  {/* Duplicate Disambiguation Badge (FR-4.8) */}
                  {item.totalEntriesWithCode > 1 && (
                    <span
                      className="badge badge-amber"
                      title="Plusieurs modèles portent cette même référence (autorisé FR-4.7)"
                    >
                      <Layers size={12} />
                      <span>{item.totalEntriesWithCode} fiches réf. (Index #{item.displayIndex})</span>
                    </span>
                  )}

                  {item.model.size_range && (
                    <span className="badge badge-neutral">
                      Pointures: {item.model.size_range}
                    </span>
                  )}

                  {item.model.price && (
                    <span className="badge badge-emerald">
                      {item.model.price.toFixed(2)} DH
                    </span>
                  )}
                </div>

                {item.model.name && (
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '0.65rem' }}>
                    {item.model.name}
                  </p>
                )}

                {/* Physical Location Chips (Where is this model?) */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    Emplacement(s) :
                  </span>

                  {item.sections.length > 0 ? (
                    item.sections.map((loc) => (
                      <span
                        key={loc.section.id}
                        className="badge"
                        style={{
                          background: 'rgba(245, 158, 11, 0.12)',
                          color: '#fbbf24',
                          border: '1px solid rgba(245, 158, 11, 0.25)',
                          fontSize: '0.8rem',
                          padding: '0.3rem 0.65rem',
                        }}
                      >
                        <MapPin size={12} />
                        <span>
                          <strong>{loc.section.name}</strong> ({loc.area.name})
                          {isSearchEverywhere && ` — ${loc.warehouse.name.split(' ')[0]}`}
                        </span>
                      </span>
                    ))
                  ) : (
                    <span className="badge badge-rose" style={{ fontSize: '0.78rem' }}>
                      <AlertCircle size={12} />
                      Non assigné à un rayon
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons: Quick Move / Transfer & Details */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: '0.5rem',
                  alignSelf: 'center',
                }}
              >
                <button
                  type="button"
                  onClick={() => onInitiateTransfer(item.model, item.sections[0]?.section.id)}
                  className="btn btn-primary"
                  style={{
                    padding: '0.55rem 0.95rem',
                    fontSize: '0.85rem',
                    gap: '0.4rem',
                  }}
                  title="Déplacer vers un autre rayon"
                >
                  <ArrowRightLeft size={16} />
                  <span>Transférer</span>
                </button>

                <button
                  type="button"
                  onClick={() => onViewModelDetails(item)}
                  className="btn btn-secondary"
                  style={{
                    padding: '0.55rem 0.85rem',
                    fontSize: '0.85rem',
                  }}
                  title="Détails, historique et code-barres"
                >
                  Détails
                </button>
              </div>
            </div>
          );
        })}

        {/* Empty State when no results found */}
        {searchResults.length === 0 && (
          <div
            className="glass-panel fade-in"
            style={{
              padding: '3rem 1.5rem',
              textAlign: 'center',
              marginTop: '1rem',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'rgba(244, 63, 94, 0.15)',
                color: '#fb7185',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem auto',
              }}
            >
              <AlertCircle size={28} />
            </div>

            <h4 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.35rem' }}>
              Aucun modèle trouvé pour "{query}"
            </h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '420px', margin: '0 auto 1.25rem auto' }}>
              Cette recherche infructueuse a été enregistrée dans le journal d’audit pour analyse des ruptures de stock.
            </p>

            {!isSearchEverywhere && (
              <button
                type="button"
                onClick={() => setIsSearchEverywhere(true)}
                className="btn btn-indigo"
                style={{ gap: '0.45rem' }}
              >
                <Globe size={16} />
                <span>Rechercher dans tous les autres entrepôts</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

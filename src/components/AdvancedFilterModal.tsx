import React from 'react';
import { X, Check, RotateCcw, MapPin, Globe, Layers, SlidersHorizontal } from 'lucide-react';
import { Area, Warehouse } from '../types';
import { useI18n } from '../i18n';

export interface SearchFilterState {
  areaId: string; // 'all' or area.id
  isSearchEverywhere: boolean;
  assignmentFilter: 'all' | 'assigned' | 'unassigned';
  sortBy: 'relevance' | 'ref_asc' | 'name_asc';
}

interface AdvancedFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: SearchFilterState;
  onApplyFilters: (newFilters: SearchFilterState) => void;
  onResetFilters: () => void;
  areas: Area[];
  activeWarehouse: Warehouse | null;
  totalWarehousesCount: number;
  totalResultsCount?: number;
}

export const AdvancedFilterModal: React.FC<AdvancedFilterModalProps> = ({
  isOpen,
  onClose,
  filters,
  onApplyFilters,
  onResetFilters,
  areas,
  activeWarehouse,
  totalWarehousesCount,
  totalResultsCount,
}) => {
  const { direction, t } = useI18n();
  const [draftFilters, setDraftFilters] = React.useState<SearchFilterState>(filters);

  // Sync draft state with props when opened
  React.useEffect(() => {
    if (isOpen) {
      setDraftFilters(filters);
    }
  }, [isOpen, filters]);

  if (!isOpen) return null;

  const hasActiveFilters =
    draftFilters.areaId !== 'all' ||
    draftFilters.isSearchEverywhere ||
    draftFilters.assignmentFilter !== 'all' ||
    draftFilters.sortBy !== 'relevance';

  const handleApply = () => {
    onApplyFilters(draftFilters);
    onClose();
  };

  const handleReset = () => {
    const resetState: SearchFilterState = {
      areaId: 'all',
      isSearchEverywhere: false,
      assignmentFilter: 'all',
      sortBy: 'relevance',
    };
    setDraftFilters(resetState);
    onResetFilters();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onClose}>
      <div
        className="modal-panel"
        style={{
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px',
          padding: '0',
          boxShadow: '0 -8px 30px rgba(0, 0, 0, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.1rem 1.25rem',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-light)',
                color: 'var(--accent-dark)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SlidersHorizontal size={17} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Filtres de recherche
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Affinez l'affichage des modèles et emplacements
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleReset}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--danger)',
                  background: 'var(--danger-light)',
                  border: 'none',
                  borderRadius: 'var(--radius-full)',
                  cursor: 'pointer',
                }}
              >
                <RotateCcw size={12} />
                <span>Réinitialiser</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'var(--bg-input)',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', flex: 1 }}>
          {/* 1. Scope (Warehouse) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
              Périmètre d'entrepôt
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setDraftFilters((prev) => ({ ...prev, isSearchEverywhere: false }))}
                style={{
                  padding: '0.65rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  border: `1.5px solid ${!draftFilters.isSearchEverywhere ? 'var(--accent)' : 'var(--border-default)'}`,
                  background: !draftFilters.isSearchEverywhere ? 'var(--accent-light)' : 'var(--bg-card)',
                  color: !draftFilters.isSearchEverywhere ? 'var(--accent-dark)' : 'var(--text-primary)',
                  transition: 'all 0.15s ease',
                }}
              >
                <MapPin size={15} style={{ color: 'var(--accent)' }} />
                <div style={{ textAlign: direction === 'rtl' ? 'right' : 'left', flex: 1 }}>
                  <div>{activeWarehouse ? activeWarehouse.name : 'Dépôt actif'}</div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Actuel uniquement</span>
                </div>
                {!draftFilters.isSearchEverywhere && <Check size={16} style={{ color: 'var(--accent)' }} />}
              </button>

              <button
                type="button"
                onClick={() => setDraftFilters((prev) => ({ ...prev, isSearchEverywhere: true }))}
                style={{
                  padding: '0.65rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  border: `1.5px solid ${draftFilters.isSearchEverywhere ? 'var(--info)' : 'var(--border-default)'}`,
                  background: draftFilters.isSearchEverywhere ? 'var(--info-light)' : 'var(--bg-card)',
                  color: draftFilters.isSearchEverywhere ? 'var(--info)' : 'var(--text-primary)',
                  transition: 'all 0.15s ease',
                }}
              >
                <Globe size={15} style={{ color: 'var(--info)' }} />
                <div style={{ textAlign: direction === 'rtl' ? 'right' : 'left', flex: 1 }}>
                  <div>Tous les dépôts</div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>{totalWarehousesCount} entrepôt(s)</span>
                </div>
                {draftFilters.isSearchEverywhere && <Check size={16} style={{ color: 'var(--info)' }} />}
              </button>
            </div>
          </div>

          {/* 2. Zone / Emplacement */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
              Zone & Emplacement
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={() => setDraftFilters((prev) => ({ ...prev, areaId: 'all' }))}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: draftFilters.areaId === 'all' ? 'var(--text-primary)' : 'var(--bg-card)',
                  color: draftFilters.areaId === 'all' ? '#FFFFFF' : 'var(--text-secondary)',
                  border: `1px solid ${draftFilters.areaId === 'all' ? 'var(--text-primary)' : 'var(--border-default)'}`,
                  transition: 'all 0.15s ease',
                }}
              >
                Toutes les zones
              </button>

              {areas.map((area) => {
                const isSelected = draftFilters.areaId === area.id;
                return (
                  <button
                    key={area.id}
                    type="button"
                    onClick={() => setDraftFilters((prev) => ({ ...prev, areaId: area.id }))}
                    style={{
                      padding: '0.45rem 0.85rem',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: isSelected ? 'var(--accent)' : 'var(--bg-card)',
                      color: isSelected ? '#FFFFFF' : 'var(--text-secondary)',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-default)'}`,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {area.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Statut d'affectation */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
              Emplacement en rayon
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
              {[
                { id: 'all', label: 'Tous' },
                { id: 'assigned', label: 'Localisé en rayon' },
                { id: 'unassigned', label: 'Non assigné' },
              ].map((opt) => {
                const isSelected = draftFilters.assignmentFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDraftFilters((prev) => ({ ...prev, assignmentFilter: opt.id as any }))}
                    style={{
                      padding: '0.5rem 0.4rem',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      textAlign: 'center',
                      cursor: 'pointer',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-default)'}`,
                      background: isSelected ? 'var(--accent-light)' : 'var(--bg-card)',
                      color: isSelected ? 'var(--accent-dark)' : 'var(--text-secondary)',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Ordre de tri */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
              Ordre de tri
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
              {[
                { id: 'relevance', label: 'Pertinence' },
                { id: 'ref_asc', label: 'Référence (A-Z)' },
                { id: 'name_asc', label: 'Nom (A-Z)' },
              ].map((sortOpt) => {
                const isSelected = draftFilters.sortBy === sortOpt.id;
                return (
                  <button
                    key={sortOpt.id}
                    type="button"
                    onClick={() => setDraftFilters((prev) => ({ ...prev, sortBy: sortOpt.id as any }))}
                    style={{
                      padding: '0.5rem 0.4rem',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      textAlign: 'center',
                      cursor: 'pointer',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-default)'}`,
                      background: isSelected ? 'var(--accent-light)' : 'var(--bg-card)',
                      color: isSelected ? 'var(--accent-dark)' : 'var(--text-secondary)',
                    }}
                  >
                    {sortOpt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '1rem 1.25rem calc(max(env(safe-area-inset-bottom, 0px), 12px) + 1rem) 1.25rem',
            borderTop: '1px solid var(--border-default)',
            background: 'var(--bg-card)',
            display: 'flex',
            gap: '0.75rem',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{ flex: 1, padding: '0.75rem', fontSize: '0.88rem' }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="btn btn-primary"
            style={{ flex: 2, padding: '0.75rem', fontSize: '0.88rem', fontWeight: 700 }}
          >
            Appliquer les filtres {totalResultsCount !== undefined ? `(${totalResultsCount})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

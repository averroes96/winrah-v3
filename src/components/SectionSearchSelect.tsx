// ============================================================================
// WINRAH - Section Search Select Component
// Replaces static HTML dropdowns with instant search and zone filtering
// ============================================================================

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, MapPin, Check, X, ChevronDown, Layers } from 'lucide-react';
import { Section, Area } from '../types';

interface SectionSearchSelectProps {
  sections: Section[];
  areas: Area[];
  selectedSectionId: string;
  onSelectSection: (sectionId: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}

export const SectionSearchSelect: React.FC<SectionSearchSelectProps> = ({
  sections,
  areas,
  selectedSectionId,
  onSelectSection,
  placeholder = 'Rechercher un rayon (ex: B1, D27, Zone A)...',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZoneFilter, setSelectedZoneFilter] = useState<string>('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const areaMap = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);

  const selectedSection = useMemo(
    () => sections.find((s) => s.id === selectedSectionId) || null,
    [sections, selectedSectionId]
  );

  const selectedSectionArea = useMemo(
    () => (selectedSection ? areaMap.get(selectedSection.area_id) : null),
    [selectedSection, areaMap]
  );

  // Available unique zones among the sections
  const availableZones = useMemo(() => {
    const zoneMap = new Map<string, string>();
    for (const s of sections) {
      const a = areaMap.get(s.area_id);
      if (a && !zoneMap.has(a.id)) {
        zoneMap.set(a.id, a.name);
      }
    }
    return Array.from(zoneMap.entries()).map(([id, name]) => ({ id, name }));
  }, [sections, areaMap]);

  // Filtered sections based on query and zone
  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    return sections.filter((s) => {
      if (selectedZoneFilter !== 'all' && s.area_id !== selectedZoneFilter) {
        return false;
      }
      if (!q) return true;
      const area = areaMap.get(s.area_id);
      const nameMatch = s.name.toUpperCase().includes(q);
      const areaMatch = area?.name.toUpperCase().includes(q) || false;
      const capacityMatch = s.capacity?.toUpperCase().includes(q) || false;
      return nameMatch || areaMatch || capacityMatch;
    });
  }, [sections, areaMap, searchQuery, selectedZoneFilter]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelect = (sectionId: string) => {
    onSelectSection(sectionId);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectSection('');
    setSearchQuery('');
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Closed State / Trigger Display */}
      {!isOpen ? (
        <div
          onClick={handleOpen}
          className="input-control"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: disabled ? 'not-allowed' : 'pointer',
            background: 'var(--bg-card)',
            border: selectedSection ? '1.5px solid var(--accent)' : '1px solid var(--border-default)',
            minHeight: '44px',
            padding: '0.5rem 0.75rem',
            userSelect: 'none',
          }}
        >
          {selectedSection ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, overflow: 'hidden' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent-light)',
                  color: 'var(--accent-dark)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <MapPin size={14} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                  {selectedSection.name}
                </span>
                {selectedSectionArea && (
                  <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                    {selectedSectionArea.name}
                  </span>
                )}
                {selectedSection.capacity && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    [{selectedSection.capacity}]
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              <Search size={16} />
              <span>{placeholder}</span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {selectedSection && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Effacer la sélection"
              >
                <X size={16} />
              </button>
            )}
            <ChevronDown size={16} style={{ color: 'var(--text-secondary)' }} />
          </div>
        </div>
      ) : (
        /* Open State with Active Search Input */
        <div
          className="input-control"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'var(--bg-card)',
            borderColor: 'var(--border-focus)',
            boxShadow: 'var(--shadow-focus)',
            minHeight: '44px',
            padding: '0.35rem 0.75rem',
          }}
        >
          <Search size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tapez le nom du rayon (ex: B1, D27)..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '0.875rem',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px',
              }}
            >
              <X size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="btn btn-secondary"
            style={{
              padding: '0.2rem 0.5rem',
              fontSize: '0.72rem',
              minHeight: '28px',
              border: '1px solid var(--border-default)',
            }}
          >
            Fermer
          </button>
        </div>
      )}

      {/* Dropdown Menu Popup */}
      {isOpen && (
        <div
          className="card fade-in"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 1000,
            background: '#FFFFFF',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 12px 28px rgba(0, 0, 0, 0.12), 0 4px 10px rgba(0, 0, 0, 0.05)',
            maxHeight: '300px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Quick Zone Filter Chips */}
          {availableZones.length > 1 && (
            <div
              style={{
                padding: '0.5rem 0.65rem',
                borderBottom: '1px solid var(--border-default)',
                background: 'var(--bg-input)',
                display: 'flex',
                gap: '0.35rem',
                overflowX: 'auto',
                whiteSpace: 'nowrap',
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedZoneFilter('all')}
                style={{
                  padding: '0.2rem 0.55rem',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-full)',
                  border: selectedZoneFilter === 'all' ? '1px solid var(--accent)' : '1px solid var(--border-default)',
                  background: selectedZoneFilter === 'all' ? 'var(--accent)' : '#FFFFFF',
                  color: selectedZoneFilter === 'all' ? '#FFFFFF' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                Tous ({sections.length})
              </button>
              {availableZones.map((z) => {
                const count = sections.filter((s) => s.area_id === z.id).length;
                const isSelected = selectedZoneFilter === z.id;
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setSelectedZoneFilter(z.id)}
                    style={{
                      padding: '0.2rem 0.55rem',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      borderRadius: 'var(--radius-full)',
                      border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border-default)',
                      background: isSelected ? 'var(--accent)' : '#FFFFFF',
                      color: isSelected ? '#FFFFFF' : 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    {z.name} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Section Items List */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '0.35rem 0' }}>
            {filteredSections.length === 0 ? (
              <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                <Search size={20} style={{ margin: '0 auto 0.35rem auto', opacity: 0.5 }} />
                <span>Aucun rayon ne correspond à votre recherche</span>
              </div>
            ) : (
              filteredSections.map((s) => {
                const isSelected = s.id === selectedSectionId;
                const area = areaMap.get(s.area_id);
                return (
                  <div
                    key={s.id}
                    onClick={() => handleSelect(s.id)}
                    style={{
                      padding: '0.6rem 0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      background: isSelected ? '#FFFBEB' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                      transition: 'background 0.1s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <MapPin
                        size={16}
                        style={{ color: isSelected ? 'var(--accent-dark)' : 'var(--text-muted)', flexShrink: 0 }}
                      />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: isSelected ? 'var(--accent-dark)' : 'var(--text-primary)' }}>
                          {s.name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.05rem' }}>
                          {area?.name || 'Zone'} {s.capacity ? `• Capacité: ${s.capacity}` : ''}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <Check size={16} style={{ color: 'var(--accent)', strokeWidth: 3 }} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

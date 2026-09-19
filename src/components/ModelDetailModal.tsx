// ============================================================================
// WINRAH - Model Detail & History Modal
// Shows locations, history, barcode preview, and disambiguation details.
// ============================================================================

import React from 'react';
import {
  X,
  MapPin,
  Clock,
  ArrowRightLeft,
  Barcode,
  Layers,
  Calendar,
} from 'lucide-react';
import { DisambiguatedModelResult, TransferLog, Section, ShoeModel } from '../types';
import { getModelDisplayReference } from '../lib/disambiguation';

interface ModelDetailModalProps {
  item: DisambiguatedModelResult | null;
  transfers: TransferLog[];
  sections: Section[];
  onInitiateTransfer: (model: ShoeModel, fromSectionId?: string) => void;
  onClose: () => void;
}

export const ModelDetailModal: React.FC<ModelDetailModalProps> = ({
  item,
  transfers,
  sections,
  onInitiateTransfer,
  onClose,
}) => {
  if (!item) return null;

  const sectionMap = new Map(sections.map((s) => [s.id, s]));
  const modelTransfers = transfers.filter((t) => t.model_id === item.model.id);
  const displayTitle = getModelDisplayReference(
    item.model.reference_code,
    item.displayIndex,
    item.totalEntriesWithCode
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
        zIndex: 280,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="glass-panel fade-in"
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--bg-surface)',
          padding: '1.5rem',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          <X size={22} />
        </button>

        {/* Header & Photo */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          {item.model.photo_url ? (
            <img
              src={item.model.photo_url}
              alt={item.model.reference_code}
              style={{
                width: '90px',
                height: '90px',
                borderRadius: 'var(--radius-md)',
                objectFit: 'cover',
                border: '1px solid var(--border-subtle)',
              }}
            />
          ) : (
            <div
              style={{
                width: '90px',
                height: '90px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
              }}
            >
              👟
            </div>
          )}

          <div>
            <h2 className="ref-code" style={{ fontSize: '1.4rem' }}>
              {displayTitle}
            </h2>
            {item.model.name && (
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                {item.model.name}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {item.model.size_range && (
                <span className="badge badge-neutral">Tailles: {item.model.size_range}</span>
              )}
              {item.model.price && (
                <span className="badge badge-emerald">{item.model.price.toFixed(2)} DH</span>
              )}
            </div>
          </div>
        </div>

        {/* Disambiguation Insight (FR-4.8) */}
        {item.totalEntriesWithCode > 1 && (
          <div
            style={{
              padding: '0.75rem',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1.25rem',
              fontSize: '0.8rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#fbbf24', fontWeight: 700, marginBottom: '0.2rem' }}>
              <Layers size={14} />
              <span>Désambiguïsation automatique (FR-4.8)</span>
            </div>
            <p style={{ color: 'var(--text-secondary)' }}>
              Il existe <strong>{item.totalEntriesWithCode} fiches</strong> partageant le code{' '}
              <span className="ref-code">{item.model.reference_code}</span>. Cette fiche est
              l'index <strong>#{item.displayIndex}</strong> (créée le{' '}
              {new Date(item.model.created_at).toLocaleDateString()}).
            </p>
          </div>
        )}

        {/* Current Physical Placements */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Localisation actuelle
          </h4>

          {item.sections.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {item.sections.map((loc) => (
                <div
                  key={loc.section.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.65rem 0.85rem',
                    background: 'rgba(9, 13, 22, 0.5)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: '#fbbf24', fontSize: '0.9rem' }}>
                      {loc.section.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {loc.area.name} — {loc.warehouse.name}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onInitiateTransfer(item.model, loc.section.id);
                    }}
                    className="btn btn-primary"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', gap: '0.35rem' }}
                  >
                    <ArrowRightLeft size={13} />
                    <span>Déplacer</span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#fb7185', fontSize: '0.85rem' }}>
              Non affecté à un rayon actuellement.
            </div>
          )}
        </div>

        {/* Code-128 Barcode Simulation Card */}
        <div
          style={{
            padding: '1rem',
            background: '#ffffff',
            borderRadius: 'var(--radius-md)',
            textAlign: 'center',
            marginBottom: '1.25rem',
          }}
        >
          {/* Barcode Lines Graphic */}
          <div
            style={{
              height: '42px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              marginBottom: '0.35rem',
            }}
          >
            {[4, 2, 6, 1, 3, 5, 2, 4, 1, 7, 3, 2, 5, 1, 6, 2, 4, 3, 5, 2, 7, 1].map((w, i) => (
              <div
                key={i}
                style={{
                  width: `${w}px`,
                  height: '100%',
                  background: '#000000',
                }}
              />
            ))}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 800, color: '#000' }}>
            {item.model.reference_code}
          </div>
          <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
            Code-128 Standard • Prêt pour étiquette carton (BRD §13)
          </div>
        </div>

        {/* Transfer History (FR-6.5) */}
        <div>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Historique des déplacements ({modelTransfers.length})
          </h4>

          {modelTransfers.length === 0 ? (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Aucun déplacement antérieur pour ce modèle.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {modelTransfers.map((t) => (
                <div
                  key={t.id}
                  style={{
                    fontSize: '0.78rem',
                    padding: '0.5rem 0.75rem',
                    background: 'rgba(9, 13, 22, 0.4)',
                    borderRadius: 'var(--radius-sm)',
                    borderLeft: '3px solid var(--primary)',
                  }}
                >
                  <div>
                    De <strong>{sectionMap.get(t.from_section_id)?.name || 'Rayon'}</strong> vers{' '}
                    <strong style={{ color: '#fbbf24' }}>
                      {sectionMap.get(t.to_section_id)?.name || 'Rayon'}
                    </strong>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Par {t.performed_by || 'Opérateur'} le {new Date(t.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

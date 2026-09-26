// ============================================================================
// WINRAH - Quick Transfer Modal
// Triggered directly from model cards to move a shoe between sections.
// ============================================================================

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightLeft, X, MapPin } from 'lucide-react';
import { ShoeModel, Section, Area, Warehouse, TransferLog } from '../types';
import { db } from '../db/indexedDb';
import confetti from 'canvas-confetti';
import { SectionSearchSelect } from './SectionSearchSelect';
import { useI18n } from '../i18n';

interface TransferModalProps {
  model: ShoeModel | null;
  fromSectionId?: string;
  sections: Section[];
  areas: Area[];
  activeWarehouse: Warehouse | null;
  onSuccess: () => void;
  onClose: () => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  model,
  fromSectionId,
  sections,
  areas,
  activeWarehouse,
  onSuccess,
  onClose,
}) => {
  const { t } = useI18n();
  const [toSectionId, setToSectionId] = useState('');
  const [operator, setOperator] = useState('Opérateur');

  if (!model) return null;

  const areaMap = new Map(areas.map((a) => [a.id, a]));
  const currentSection = sections.find((s) => s.id === fromSectionId);

  // Available sections in warehouse
  const availableSections = activeWarehouse
    ? sections.filter((s) => {
        const a = areaMap.get(s.area_id);
        return a && a.warehouse_id === activeWarehouse.id && s.id !== fromSectionId;
      })
    : sections.filter((s) => s.id !== fromSectionId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toSectionId) return;

    const now = new Date().toISOString();
    const deviceId = localStorage.getItem('winrah_device_id') || 'dev-local-01';

    // 1. Update assignment
    const allAssignments = await db.getAll<any>('model_sections');
    const existing = allAssignments.find((ms) => ms.model_id === model.id);

    if (existing) {
      existing.section_id = toSectionId;
      await db.put('model_sections', existing);
    } else {
      await db.put('model_sections', {
        id: 'ms-' + Date.now(),
        model_id: model.id,
        section_id: toSectionId,
        assigned_at: now,
        updated_at: now,
        version: 1,
        is_dirty: true,
        local_sync_status: 'pending',
      });
    }

    // 2. Transfer Log
    const transferId = 'tr-' + Date.now();
    await db.putRaw('transfers', {
      id: transferId,
      model_id: model.id,
      from_section_id: fromSectionId || toSectionId,
      to_section_id: toSectionId,
      device_id: deviceId,
      performed_by: operator,
      sync_status: 'pending',
      created_at: now,
    });

    await db.logAudit({
      action: 'transfer',
      entity_type: 'transfer',
      entity_id: transferId,
      device_id: deviceId,
      changes: {
        model_id: model.id,
        from_section_id: fromSectionId || toSectionId,
        to_section_id: toSectionId,
        performed_by: operator,
      },
    });

    confetti({ particleCount: 40, spread: 55, origin: { y: 0.3 } });
    onSuccess();
    onClose();
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 290,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
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
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(245, 158, 11, 0.2)',
              color: '#fbbf24',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowRightLeft size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>{t('modal.transfer.title')}</h3>
            <span className="ref-code" style={{ fontSize: '0.95rem' }}>
              {model.reference_code}
            </span>
          </div>
        </div>

        {/* Current Location Verification (FR-6.4) */}
        <div
          style={{
            padding: '0.75rem',
            background: 'var(--bg-input)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
          }}
        >
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
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('modal.transfer.current_location')}</div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              {currentSection ? currentSection.name : t('search.not_assigned')}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
              {t('modal.transfer.target_section')}
            </label>
            <SectionSearchSelect
              sections={availableSections}
              areas={areas}
              selectedSectionId={toSectionId}
              onSelectSection={setToSectionId}
              placeholder={t('modal.transfer.select_section_placeholder')}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
              {t('modal.transfer.operator_name')}
            </label>
            <input
              type="text"
              className="input-control"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              {t('modal.transfer.confirm_btn')}
            </button>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              {t('modal.transfer.cancel_btn')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

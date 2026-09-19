// ============================================================================
// WINRAH - Transfers Tab Component (FR-6.1 - FR-6.6)
// Handles single and batch shoe transfers with current location verification,
// attribution, undo grace window, and recent history.
// ============================================================================

import React, { useState, useMemo } from 'react';
import {
  ArrowRightLeft,
  CheckCircle2,
  Undo2,
  Clock,
  MapPin,
  Search,
  CheckSquare,
  Square,
} from 'lucide-react';
import {
  ShoeModel,
  ModelSection,
  Section,
  Area,
  Warehouse,
  TransferLog,
} from '../types';
import { db } from '../db/indexedDb';

interface TransfersTabProps {
  models: ShoeModel[];
  modelSections: ModelSection[];
  sections: Section[];
  areas: Area[];
  warehouses: Warehouse[];
  activeWarehouse: Warehouse | null;
  transfers: TransferLog[];
  onRefreshData: () => void;
}

export const TransfersTab: React.FC<TransfersTabProps> = ({
  models,
  modelSections,
  sections,
  areas,
  warehouses,
  activeWarehouse,
  transfers,
  onRefreshData,
}) => {
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [targetSectionId, setTargetSectionId] = useState<string>('');
  const [operatorName, setOperatorName] = useState<string>('Opérateur');
  const [searchFilter, setSearchFilter] = useState('');
  const [lastTransferLog, setLastTransferLog] = useState<{
    transfer: TransferLog;
    previousSectionId: string;
    modelId: string;
  } | null>(null);
  const [undoTimerSeconds, setUndoTimerSeconds] = useState<number>(0);

  // Available sections in current warehouse
  const availableSections = useMemo(() => {
    if (!activeWarehouse) return sections;
    const whAreaIds = new Set(
      areas.filter((a) => a.warehouse_id === activeWarehouse.id).map((a) => a.id)
    );
    return sections.filter((s) => whAreaIds.has(s.area_id));
  }, [sections, areas, activeWarehouse]);

  // Map lookups
  const modelMap = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const areaMap = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);

  // Filter models for selection
  const selectableModels = useMemo(() => {
    let list = models;
    if (activeWarehouse) {
      list = list.filter((m) => m.warehouse_id === activeWarehouse.id);
    }
    if (searchFilter.trim()) {
      const q = searchFilter.trim().toUpperCase();
      list = list.filter(
        (m) =>
          m.reference_code.toUpperCase().includes(q) ||
          m.name?.toUpperCase().includes(q)
      );
    }
    return list;
  }, [models, activeWarehouse, searchFilter]);

  const toggleSelectModel = (id: string) => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedModelIds.size === selectableModels.length) {
      setSelectedModelIds(new Set());
    } else {
      setSelectedModelIds(new Set(selectableModels.map((m) => m.id)));
    }
  };

  // Perform transfer of selected models (FR-6.1, FR-6.2, FR-6.3, FR-6.4)
  const handleExecuteTransfer = async () => {
    if (selectedModelIds.size === 0 || !targetSectionId) return;

    const deviceId = localStorage.getItem('winrah_device_id') || 'dev-local-01';
    const now = new Date().toISOString();

    for (const modelId of selectedModelIds) {
      // Find current placement
      const currentPlacement = modelSections.find((ms) => ms.model_id === modelId);
      const fromSectionId = currentPlacement ? currentPlacement.section_id : targetSectionId;

      if (fromSectionId === targetSectionId) {
        continue; // already in this section
      }

      // 1. Update or create model_section placement (presence-only!)
      if (currentPlacement) {
        currentPlacement.section_id = targetSectionId;
        await db.put('model_sections', currentPlacement);
      } else {
        await db.put('model_sections', {
          id: 'ms-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          model_id: modelId,
          section_id: targetSectionId,
          assigned_at: now,
          updated_at: now,
          version: 1,
          is_dirty: true,
          local_sync_status: 'pending',
        });
      }

      // 2. Record immutable Transfer Log (FR-6.3)
      const transferEntry: TransferLog = {
        id: 'tr-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        model_id: modelId,
        from_section_id: fromSectionId,
        to_section_id: targetSectionId,
        device_id: deviceId,
        performed_by: operatorName,
        sync_status: 'pending',
        created_at: now,
      };

      await db.putRaw('transfers', transferEntry);

      // 3. Save for undo grace window (FR-6.6)
      setLastTransferLog({
        transfer: transferEntry,
        previousSectionId: fromSectionId,
        modelId,
      });
      setUndoTimerSeconds(15);
    }

    setSelectedModelIds(new Set());
    onRefreshData();
  };

  // Undo Transfer within Grace Window (FR-6.6)
  const handleUndoTransfer = async () => {
    if (!lastTransferLog) return;

    // Move back to previous section
    const currentPlacement = modelSections.find(
      (ms) => ms.model_id === lastTransferLog.modelId
    );
    if (currentPlacement) {
      currentPlacement.section_id = lastTransferLog.previousSectionId;
      await db.put('model_sections', currentPlacement);
    }

    // Insert reverse transfer log entry
    await db.putRaw('transfers', {
      id: 'tr-undo-' + Date.now(),
      model_id: lastTransferLog.modelId,
      from_section_id: lastTransferLog.transfer.to_section_id,
      to_section_id: lastTransferLog.previousSectionId,
      device_id: localStorage.getItem('winrah_device_id') || 'dev-local-01',
      performed_by: `${operatorName} (ANNULATION)`,
      sync_status: 'pending',
      created_at: new Date().toISOString(),
    });

    setLastTransferLog(null);
    setUndoTimerSeconds(0);
    onRefreshData();
  };

  return (
    <div className="fade-in">
      {/* Undo Grace Window Banner (FR-6.6) */}
      {lastTransferLog && undoTimerSeconds > 0 && (
        <div
          className="card fade-in"
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            background: 'var(--success-light)',
            border: '1px solid var(--success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                Transfert enregistré
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Vers {sectionMap.get(lastTransferLog.transfer.to_section_id)?.name}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleUndoTransfer}
            className="btn btn-secondary"
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem',
              gap: '0.35rem',
              borderRadius: 'var(--radius-full)',
            }}
          >
            <Undo2 size={14} />
            <span>Annuler ({undoTimerSeconds}s)</span>
          </button>
        </div>
      )}

      {/* Main Transfer Workflow Card (FR-6.1 - FR-6.4) */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-light)',
              color: 'var(--accent-dark)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowRightLeft size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 700 }}>Déplacer du stock</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Sélectionnez les modèles puis le rayon de destination
            </p>
          </div>
        </div>

        {/* Step 1: Destination Section Selector */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
            Rayon de destination
          </label>
          <select
            value={targetSectionId}
            onChange={(e) => setTargetSectionId(e.target.value)}
            className="input-control"
            style={{ cursor: 'pointer' }}
          >
            <option value="">-- Choisir un rayon --</option>
            {availableSections.map((s) => {
              const area = areaMap.get(s.area_id);
              return (
                <option key={s.id} value={s.id}>
                  {s.name} ({area?.name || 'Zone'}) {s.capacity ? `[${s.capacity}]` : ''}
                </option>
              );
            })}
          </select>
        </div>

        {/* Step 2: Operator Name Attribution */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
            Opérateur
          </label>
          <input
            type="text"
            className="input-control"
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            placeholder="Ex: Youssef, Hamza…"
          />
        </div>

        {/* Step 3: Model Picker (Single or Batch, FR-6.1, FR-6.2) */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
              Modèles à transférer ({selectedModelIds.size})
            </label>
            <button
              type="button"
              onClick={selectAll}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {selectedModelIds.size === selectableModels.length ? 'Désélectionner' : 'Tout sélectionner'}
            </button>
          </div>

          {/* Quick filter by typing */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.35rem 0.65rem',
              marginBottom: '0.45rem',
            }}
          >
            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Filtrer les modèles par référence ou nom…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: '0.8125rem',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div
            style={{
              maxHeight: '280px',
              overflowY: 'auto',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-page)',
              padding: '0.4rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            {selectableModels.map((m) => {
              const isSelected = selectedModelIds.has(m.id);
              const placement = modelSections.find((ms) => ms.model_id === m.id);
              const currentSection = placement ? sectionMap.get(placement.section_id) : null;

              return (
                <div
                  key={m.id}
                  onClick={() => toggleSelectModel(m.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.5rem 0.7rem',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--accent-light)' : 'transparent',
                    border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
                    transition: 'all 0.1s ease',
                  }}
                >
                  {isSelected ? (
                    <CheckSquare size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  ) : (
                    <Square size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  )}

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span className="ref-code" style={{ fontSize: '0.875rem' }}>
                        {m.reference_code}
                      </span>
                      {m.size_range && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          ({m.size_range})
                        </span>
                      )}
                    </div>
                    {m.name && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        {m.name}
                      </div>
                    )}
                  </div>

                  {/* Current Location Preview (FR-6.4) */}
                  <span
                    className="badge"
                    style={{
                      background: currentSection ? 'var(--accent-light)' : 'var(--danger-light)',
                      color: currentSection ? 'var(--accent-dark)' : 'var(--danger)',
                      fontSize: '0.7rem',
                    }}
                  >
                    <MapPin size={10} />
                    {currentSection ? currentSection.name : 'Non assigné'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Confirm Transfer Button (FR Usability) */}
        <button
          type="button"
          onClick={handleExecuteTransfer}
          disabled={selectedModelIds.size === 0 || !targetSectionId}
          className="btn btn-primary btn-large"
          style={{ width: '100%', gap: '0.5rem' }}
        >
          <ArrowRightLeft size={18} />
          <span>
            Confirmer ({selectedModelIds.size} modèle{selectedModelIds.size > 1 ? 's' : ''})
          </span>
        </button>
      </div>

      {/* Recent Transfer History (FR-6.5) */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.85rem' }}>
          <Clock size={16} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700 }}>Historique récent</h3>
        </div>

        {transfers.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
            Aucun transfert enregistré.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {transfers.slice(0, 10).map((t) => {
              const model = modelMap.get(t.model_id);
              const fromSec = sectionMap.get(t.from_section_id);
              const toSec = sectionMap.get(t.to_section_id);

              return (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.4rem',
                    padding: '0.65rem 0.75rem',
                    background: 'var(--bg-page)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    borderLeft: '3px solid var(--accent)',
                  }}
                >
                  <div>
                    <span className="ref-code" style={{ fontSize: '0.875rem', marginRight: '0.4rem' }}>
                      {model?.reference_code || 'Modèle'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {fromSec?.name || '?'} → <strong>{toSec?.name || '?'}</strong>
                    </span>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {t.performed_by || 'Opérateur'} · {new Date(t.created_at).toLocaleString()}
                    </div>
                  </div>

                  <span className="badge badge-emerald" style={{ fontSize: '0.68rem' }}>
                    Effectué
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

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
  Sparkles,
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
import confetti from 'canvas-confetti';

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

    confetti({ particleCount: 50, spread: 60, origin: { y: 0.3 } });
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
          className="glass-panel fade-in"
          style={{
            padding: '0.85rem 1.25rem',
            marginBottom: '1rem',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.65rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <CheckCircle2 size={20} style={{ color: '#fbbf24' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                Transfert enregistré avec succès !
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Modèle déplacé vers {sectionMap.get(lastTransferLog.transfer.to_section_id)?.name}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleUndoTransfer}
            className="btn btn-secondary"
            style={{
              padding: '0.45rem 0.95rem',
              fontSize: '0.82rem',
              gap: '0.4rem',
              borderRadius: 'var(--radius-full)',
              color: '#fbbf24',
              borderColor: 'var(--primary)',
            }}
          >
            <Undo2 size={16} />
            <span>Annuler ({undoTimerSeconds}s)</span>
          </button>
        </div>
      )}

      {/* Main Transfer Workflow Card (FR-6.1 - FR-6.4) */}
      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
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
            <ArrowRightLeft size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Déplacer du stock (Transferts)</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Sélectionnez les modèles puis indiquez le rayon de destination
            </p>
          </div>
        </div>

        {/* Step 1: Destination Section Selector */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.45rem', color: 'var(--text-secondary)' }}>
            1. Rayon de destination cible :
          </label>
          <select
            value={targetSectionId}
            onChange={(e) => setTargetSectionId(e.target.value)}
            className="input-control"
            style={{ cursor: 'pointer', fontWeight: 600 }}
          >
            <option value="">-- Choisir un rayon d’arrivée --</option>
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
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.45rem', color: 'var(--text-secondary)' }}>
            2. Opérateur réalisant le déplacement :
          </label>
          <input
            type="text"
            className="input-control"
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            placeholder="Ex: Youssef, Hamza, Équipe Nuit..."
          />
        </div>

        {/* Step 3: Model Picker (Single or Batch, FR-6.1, FR-6.2) */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              3. Modèles à transférer ({selectedModelIds.size} sélectionné(s)) :
            </label>
            <button
              type="button"
              onClick={selectAll}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--primary)',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {selectedModelIds.size === selectableModels.length ? 'Désélectionner tout' : 'Tout sélectionner'}
            </button>
          </div>

          <div
            style={{
              maxHeight: '280px',
              overflowY: 'auto',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(9, 13, 22, 0.6)',
              padding: '0.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}
          >
            {selectableModels.map((m) => {
              const isSelected = selectedModelIds.has(m.id);
              const placement = modelSections.find((ms) => ms.model_id === m.id);
              const currentSection = placement ? sectionMap.get(placement.section_id) : null;
              const currentArea = currentSection ? areaMap.get(currentSection.area_id) : null;

              return (
                <div
                  key={m.id}
                  onClick={() => toggleSelectModel(m.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                    border: isSelected ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid transparent',
                  }}
                >
                  {isSelected ? (
                    <CheckSquare size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                  ) : (
                    <Square size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  )}

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span className="ref-code" style={{ fontSize: '0.95rem' }}>
                        {m.reference_code}
                      </span>
                      {m.size_range && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          ({m.size_range})
                        </span>
                      )}
                    </div>
                    {m.name && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {m.name}
                      </div>
                    )}
                  </div>

                  {/* Current Location Preview before confirming (FR-6.4) */}
                  <div style={{ textAlign: 'right' }}>
                    <span
                      className="badge"
                      style={{
                        background: 'rgba(255, 255, 255, 0.06)',
                        color: currentSection ? '#fbbf24' : '#fb7185',
                        fontSize: '0.72rem',
                      }}
                    >
                      <MapPin size={10} />
                      {currentSection ? currentSection.name : 'Non assigné'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Confirm Transfer Big Tactile Button (FR Usability) */}
        <button
          type="button"
          onClick={handleExecuteTransfer}
          disabled={selectedModelIds.size === 0 || !targetSectionId}
          className="btn btn-primary btn-large"
          style={{ width: '100%', gap: '0.5rem' }}
        >
          <ArrowRightLeft size={20} />
          <span>
            Confirmer le transfert ({selectedModelIds.size} modèle{selectedModelIds.size > 1 ? 's' : ''})
          </span>
        </button>
      </div>

      {/* Recent Transfer History (FR-6.5) */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Clock size={18} style={{ color: 'var(--primary)' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>Historique récent des mouvements</h3>
        </div>

        {transfers.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Aucun transfert enregistré pour le moment.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
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
                    gap: '0.5rem',
                    padding: '0.75rem',
                    background: 'rgba(9, 13, 22, 0.4)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div>
                    <span className="ref-code" style={{ fontSize: '0.92rem', marginRight: '0.5rem' }}>
                      {model?.reference_code || 'Modèle'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      déplacé de <strong>{fromSec?.name || 'Rayon'}</strong> vers{' '}
                      <strong style={{ color: '#fbbf24' }}>{toSec?.name || 'Rayon'}</strong>
                    </span>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Par {t.performed_by || 'Opérateur'} le {new Date(t.created_at).toLocaleString()}
                    </div>
                  </div>

                  <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>
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

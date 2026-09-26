// ============================================================================
// WINRAH - Transfers Tab Component (FR-6.1 - FR-6.6)
// Handles single and batch shoe transfers with search-to-queue workflow,
// current location verification, attribution, undo grace window, and history.
// ============================================================================

import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowRightLeft,
  CheckCircle2,
  Undo2,
  Clock,
  MapPin,
  Search,
  Plus,
  Trash2,
  X,
  ArrowRight,
  Package,
  Sparkles,
  Flame,
} from 'lucide-react';
import {
  ShoeModel,
  ModelSection,
  Section,
  Area,
  Warehouse,
  TransferLog,
  SearchLog,
} from '../types';
import { db } from '../db/indexedDb';
import { SectionSearchSelect } from './SectionSearchSelect';
import { useI18n } from '../i18n';
import {
  computeSmartTransferSuggestions,
  SmartTransferSuggestion,
} from '../lib/smartTransferEngine';

interface TransfersTabProps {
  models: ShoeModel[];
  modelSections: ModelSection[];
  sections: Section[];
  areas: Area[];
  warehouses: Warehouse[];
  activeWarehouse: Warehouse | null;
  transfers: TransferLog[];
  searchLogs?: SearchLog[];
  onRefreshData: () => void;
}

export const TransfersTab: React.FC<TransfersTabProps> = ({
  models,
  modelSections,
  sections,
  areas,
  warehouses: _warehouses,
  activeWarehouse,
  transfers,
  searchLogs = [],
  onRefreshData,
}) => {
  const { t } = useI18n();
  const [queuedModelIds, setQueuedModelIds] = useState<string[]>([]);
  const [targetSectionId, setTargetSectionId] = useState<string>('');
  const [operatorName, setOperatorName] = useState<string>('Opérateur');
  const [searchFilter, setSearchFilter] = useState('');
  const [lastTransferLog, setLastTransferLog] = useState<{
    transfer: TransferLog;
    previousSectionId: string;
    modelId: string;
  } | null>(null);
  const [undoTimerSeconds, setUndoTimerSeconds] = useState<number>(0);

  // Undo Timer countdown effect
  useEffect(() => {
    if (undoTimerSeconds <= 0) return;
    const timer = setInterval(() => {
      setUndoTimerSeconds((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [undoTimerSeconds]);

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

  // Smart Relocation Suggestions based on 30-day search velocity and section capacities
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<Set<string>>(new Set());
  const [appliedSuggestionId, setAppliedSuggestionId] = useState<string | null>(null);

  const smartSuggestions = useMemo(() => {
    if (!searchLogs || searchLogs.length === 0) return [];
    return computeSmartTransferSuggestions({
      searchLogs,
      models,
      modelSections,
      sections,
      areas,
      warehouseId: activeWarehouse?.id,
      maxSuggestions: 5,
      lookbackDays: 30,
    }).filter((s) => !dismissedSuggestionIds.has(s.id));
  }, [searchLogs, models, modelSections, sections, areas, activeWarehouse, dismissedSuggestionIds]);

  const handleApplySuggestion = (sug: SmartTransferSuggestion) => {
    setQueuedModelIds([sug.model.id]);
    setTargetSectionId(sug.targetSection.id);
    setAppliedSuggestionId(sug.id);
    setTimeout(() => setAppliedSuggestionId(null), 3000);

    const targetElement = document.getElementById('transfer-workflow-card');
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Fast search filter: only computes and renders when user types!
  const searchResults = useMemo(() => {
    const q = searchFilter.trim().toUpperCase();
    if (!q) return [];

    let list = models;
    if (activeWarehouse) {
      list = list.filter((m) => m.warehouse_id === activeWarehouse.id);
    }

    // Match reference code or name
    const matches = list.filter(
      (m) =>
        m.reference_code.toUpperCase().includes(q) ||
        (m.name && m.name.toUpperCase().includes(q))
    );

    // Prioritize exact or prefix matches
    matches.sort((a, b) => {
      const aRef = a.reference_code.toUpperCase();
      const bRef = b.reference_code.toUpperCase();
      const aStarts = aRef.startsWith(q);
      const bStarts = bRef.startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return aRef.localeCompare(bRef);
    });

    return matches.slice(0, 15);
  }, [models, activeWarehouse, searchFilter]);

  const addToQueue = (modelId: string) => {
    if (!queuedModelIds.includes(modelId)) {
      setQueuedModelIds((prev) => [...prev, modelId]);
    }
  };

  const removeFromQueue = (modelId: string) => {
    setQueuedModelIds((prev) => prev.filter((id) => id !== modelId));
  };

  const clearQueue = () => {
    setQueuedModelIds([]);
  };

  // Perform transfer of queued models (FR-6.1, FR-6.2, FR-6.3, FR-6.4)
  const handleExecuteTransfer = async () => {
    if (queuedModelIds.length === 0 || !targetSectionId) return;

    const deviceId = localStorage.getItem('winrah_device_id') || 'dev-local-01';
    const now = new Date().toISOString();

    for (const modelId of queuedModelIds) {
      const currentPlacement = modelSections.find((ms) => ms.model_id === modelId);
      const fromSectionId = currentPlacement ? currentPlacement.section_id : targetSectionId;

      if (fromSectionId === targetSectionId) {
        continue;
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

      await db.logAudit({
        action: 'transfer',
        entity_type: 'transfer',
        entity_id: transferEntry.id,
        device_id: deviceId,
        changes: {
          model_id: modelId,
          from_section_id: fromSectionId,
          to_section_id: targetSectionId,
          performed_by: operatorName,
        },
      });

      // 3. Save for undo grace window (FR-6.6)
      setLastTransferLog({
        transfer: transferEntry,
        previousSectionId: fromSectionId,
        modelId,
      });
      setUndoTimerSeconds(15);
    }

    setQueuedModelIds([]);
    setSearchFilter('');
    onRefreshData();
  };

  // Undo Transfer within Grace Window (FR-6.6)
  const handleUndoTransfer = async () => {
    if (!lastTransferLog) return;

    const currentPlacement = modelSections.find(
      (ms) => ms.model_id === lastTransferLog.modelId
    );
    if (currentPlacement) {
      currentPlacement.section_id = lastTransferLog.previousSectionId;
      await db.put('model_sections', currentPlacement);
    }

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

    await db.logAudit({
      action: 'restore',
      entity_type: 'transfer',
      entity_id: lastTransferLog.transfer.id,
      changes: {
        model_id: lastTransferLog.modelId,
        restored_to_section_id: lastTransferLog.previousSectionId,
        reason: 'annulation_grace_window',
      },
    });

    setLastTransferLog(null);
    setUndoTimerSeconds(0);
    onRefreshData();
  };

  const targetSection = sectionMap.get(targetSectionId);

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
                Transfert enregistré avec succès
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Déplacé vers {sectionMap.get(lastTransferLog.transfer.to_section_id)?.name || 'Rayon'}
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

      {/* Smart Relocation Suggestions Card (30-day velocity & section model capacity optimization) */}
      {smartSuggestions.length > 0 && (
        <div
          className="card fade-in"
          style={{
            padding: '1.15rem 1.25rem',
            marginBottom: '1rem',
            background: 'linear-gradient(135deg, #FFFBEB 0%, #FFFFFF 100%)',
            border: '1px solid #FDE68A',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-subtle)',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.85rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(245, 158, 11, 0.35)',
                }}
              >
                <Sparkles size={18} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    {t('smart_transfers.title')}
                  </h3>
                  <span
                    style={{
                      background: 'var(--accent)',
                      color: '#FFFFFF',
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      padding: '0.1rem 0.4rem',
                      borderRadius: 'var(--radius-full)',
                    }}
                  >
                    {smartSuggestions.length}
                  </span>
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  {t('smart_transfers.subtitle')}
                </p>
              </div>
            </div>
          </div>

          {/* Suggestions List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {smartSuggestions.map((sug) => {
              const isApplied = appliedSuggestionId === sug.id;
              return (
                <div
                  key={sug.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '0.75rem 0.9rem',
                    borderRadius: 'var(--radius-md)',
                    background: '#FFFFFF',
                    border: '1px solid var(--border-default)',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                    gap: '0.55rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    {/* Model Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      {sug.model.photo_url ? (
                        <img
                          src={sug.model.photo_url}
                          alt={sug.model.reference_code}
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: 'var(--radius-sm)',
                            objectFit: 'cover',
                            border: '1px solid var(--border-default)',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--bg-input)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.2rem',
                          }}
                        >
                          👟
                        </div>
                      )}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                            {sug.model.reference_code}
                          </span>
                          {sug.model.name && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              • {sug.model.name}
                            </span>
                          )}
                        </div>

                        {/* Badges: Search Count & Fallback Warning */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', marginTop: '2px' }}>
                          <span
                            className="badge badge-amber"
                            style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', fontWeight: 700 }}
                          >
                            <Flame size={10} />
                            <span>{t('smart_transfers.searches_30d', { count: sug.searchCount30d })}</span>
                          </span>

                          {sug.isZoneAFallback && (
                            <span
                              className="badge badge-rose"
                              style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', fontWeight: 700 }}
                            >
                              {t('smart_transfers.zone_a_fallback_badge')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <button
                        type="button"
                        onClick={() => handleApplySuggestion(sug)}
                        className={isApplied ? 'btn btn-success' : 'btn btn-primary'}
                        style={{
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.75rem',
                          gap: '0.35rem',
                          borderRadius: 'var(--radius-full)',
                        }}
                      >
                        {isApplied ? (
                          <>
                            <CheckCircle2 size={13} />
                            <span>{t('smart_transfers.applied')}</span>
                          </>
                        ) : (
                          <>
                            <ArrowRightLeft size={13} />
                            <span>{t('smart_transfers.apply')}</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setDismissedSuggestionIds((prev) => new Set([...prev, sug.id]))}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          borderRadius: '50%',
                        }}
                        title={t('smart_transfers.dismiss')}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Route & Section Capacity indicator */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      background: 'var(--bg-page)',
                      padding: '0.45rem 0.65rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-default)',
                      fontSize: '0.72rem',
                      gap: '0.4rem',
                    }}
                  >
                    {/* Transfer Route */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {sug.currentArea.name} ({sug.currentSection.name})
                      </span>
                      <ArrowRight size={12} style={{ color: 'var(--accent)' }} />
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {sug.targetArea.name} ({sug.targetSection.name})
                      </span>
                    </div>

                    {/* Target Capacity Pill */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)' }}>
                      <Package size={12} style={{ color: 'var(--accent)' }} />
                      <span style={{ fontWeight: 600 }}>
                        {t('smart_transfers.target_capacity', {
                          current: sug.targetSectionOccupancy.current,
                          capacity: sug.targetSectionOccupancy.capacity,
                          remaining: sug.targetSectionOccupancy.remaining,
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Transfer Card */}
      <div id="transfer-workflow-card" className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
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
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 700 }}>{t('transfers.title')}</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {t('transfers.subtitle')}
            </p>
          </div>
        </div>

        {/* Step 1: Search & Filter Models (Type to find, no bulk loading) */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
            1. {t('search.placeholder')}
          </label>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.45rem 0.75rem',
            }}
          >
            <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Tapez une référence ou un nom (ex: 724, 629, Baskets...)..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: '0.85rem',
                color: 'var(--text-primary)',
              }}
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Search Results Dropdown / Picker */}
          {searchFilter.trim().length > 0 && (
            <div
              style={{
                marginTop: '0.45rem',
                maxHeight: '230px',
                overflowY: 'auto',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-page)',
                padding: '0.35rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
              }}
            >
              {searchResults.length === 0 ? (
                <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Aucun modèle trouvé pour "{searchFilter}"
                </div>
              ) : (
                searchResults.map((m) => {
                  const isQueued = queuedModelIds.includes(m.id);
                  const placement = modelSections.find((ms) => ms.model_id === m.id);
                  const currentSection = placement ? sectionMap.get(placement.section_id) : null;

                  return (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.45rem 0.65rem',
                        borderRadius: 'var(--radius-sm)',
                        background: isQueued ? 'var(--accent-light)' : 'transparent',
                        border: isQueued ? '1px solid var(--accent)' : '1px solid transparent',
                        transition: 'all 0.1s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                        <span className="ref-code" style={{ fontSize: '0.85rem' }}>
                          {m.reference_code}
                        </span>
                        {m.name && (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--text-secondary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {m.name}
                          </span>
                        )}
                        {m.size_range && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            ({m.size_range})
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                        <span
                          className="badge"
                          style={{
                            background: currentSection ? 'rgba(0, 0, 0, 0.06)' : 'var(--danger-light)',
                            color: currentSection ? 'var(--text-secondary)' : 'var(--danger)',
                            fontSize: '0.68rem',
                          }}
                        >
                          <MapPin size={9} />
                          {currentSection ? currentSection.name : 'Non assigné'}
                        </span>

                        {isQueued ? (
                          <span
                            className="badge badge-emerald"
                            style={{ fontSize: '0.68rem', padding: '0.2rem 0.45rem' }}
                          >
                            Dans la file
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addToQueue(m.id)}
                            className="btn btn-secondary"
                            style={{
                              padding: '0.25rem 0.55rem',
                              fontSize: '0.75rem',
                              gap: '0.25rem',
                              fontWeight: 600,
                            }}
                          >
                            <Plus size={13} />
                            <span>Ajouter</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Step 2: Queue of Selected Models Staged for Transfer */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              2. File d'attente de transfert ({queuedModelIds.length})
            </label>
            {queuedModelIds.length > 0 && (
              <button
                type="button"
                onClick={clearQueue}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--danger)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                <Trash2 size={12} />
                <span>Vider la file</span>
              </button>
            )}
          </div>

          {queuedModelIds.length === 0 ? (
            <div
              style={{
                padding: '1.25rem',
                textAlign: 'center',
                border: '1px dashed var(--border-default)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-page)',
                color: 'var(--text-muted)',
                fontSize: '0.8rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <Package size={22} style={{ opacity: 0.5 }} />
              <span>Aucun modèle dans la file. Tapez une référence ci-dessus pour ajouter des articles à déplacer.</span>
            </div>
          ) : (
            <div
              style={{
                maxHeight: '220px',
                overflowY: 'auto',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-page)',
                padding: '0.4rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}
            >
              {queuedModelIds.map((mId) => {
                const model = modelMap.get(mId);
                const placement = modelSections.find((ms) => ms.model_id === mId);
                const currentSection = placement ? sectionMap.get(placement.section_id) : null;

                return (
                  <div
                    key={mId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.45rem 0.65rem',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-color)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                      <span className="ref-code" style={{ fontSize: '0.85rem' }}>
                        {model?.reference_code || mId}
                      </span>
                      {model?.name && (
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {model.name}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        De : <strong>{currentSection ? currentSection.name : 'N/A'}</strong>
                      </span>

                      {targetSection && (
                        <>
                          <ArrowRight size={12} style={{ color: 'var(--accent)' }} />
                          <span style={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 700 }}>
                            {targetSection.name}
                          </span>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => removeFromQueue(mId)}
                        title="Retirer de la file"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--danger)',
                          padding: '0.2rem',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Step 3: Destination Section Selector */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
            3. Rayon de destination
          </label>
          <SectionSearchSelect
            sections={availableSections}
            areas={areas}
            selectedSectionId={targetSectionId}
            onSelectSection={setTargetSectionId}
            placeholder="Rechercher un rayon de destination (ex: B1, C22, Zone A)..."
          />
        </div>

        {/* Step 4: Operator Name */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
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

        {/* Confirm Transfer Button */}
        <button
          type="button"
          onClick={handleExecuteTransfer}
          disabled={queuedModelIds.length === 0 || !targetSectionId}
          className="btn btn-primary btn-large"
          style={{ width: '100%', gap: '0.5rem', fontWeight: 700 }}
        >
          <ArrowRightLeft size={18} />
          <span>
            {t('modal.transfer.confirm_btn')} ({queuedModelIds.length})
          </span>
        </button>
      </div>

      {/* Recent Transfer History (FR-6.5) */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.85rem' }}>
          <Clock size={16} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700 }}>{t('transfers.history', { count: transfers.length })}</h3>
        </div>

        {transfers.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
            {t('transfers.empty_history')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {transfers.slice(0, 10).map((log) => {
              const model = modelMap.get(log.model_id);
              const fromSec = sectionMap.get(log.from_section_id);
              const toSec = sectionMap.get(log.to_section_id);

              return (
                <div
                  key={log.id}
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
                      {log.performed_by || 'Opérateur'} · {new Date(log.created_at).toLocaleString()}
                    </div>
                  </div>

                  <span className="badge badge-emerald" style={{ fontSize: '0.68rem' }}>
                    {t('transfers.badge_success')}
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

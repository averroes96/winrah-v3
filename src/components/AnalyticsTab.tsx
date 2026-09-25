// ============================================================================
// WINRAH - Analytics & Search Audit Tab (FR-8.1 - FR-8.4)
// Highlights zero-result search gaps (missing stock alert), most-searched references,
// most-transferred shoes, and full audit logs.
// ============================================================================

import React, { useMemo } from 'react';
import {
  BarChart3,
  AlertTriangle,
  TrendingUp,
  ArrowRightLeft,
  Search,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import {
  SearchLog,
  TransferLog,
  AuditLog,
  ShoeModel,
  Section,
  Area,
  Warehouse,
} from '../types';

interface AnalyticsTabProps {
  searchLogs: SearchLog[];
  transfers: TransferLog[];
  auditLogs: AuditLog[];
  models: ShoeModel[];
  sections: Section[];
  areas: Area[];
  activeWarehouse: Warehouse | null;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  searchLogs,
  transfers,
  auditLogs,
  models,
  sections,
  areas,
  activeWarehouse,
}) => {
  // 1. Zero-Result Searches (BRD FR-8.3, §13: Proactively flag repeated zero-result searches!)
  const zeroResultSearches = useMemo(() => {
    const zeroLogs = searchLogs.filter((s) => s.result_count === 0);
    const countMap = new Map<string, { count: number; lastSearched: string }>();

    for (const log of zeroLogs) {
      const q = log.query_text.trim().toUpperCase();
      const existing = countMap.get(q) || { count: 0, lastSearched: log.created_at };
      countMap.set(q, {
        count: existing.count + 1,
        lastSearched:
          new Date(log.created_at) > new Date(existing.lastSearched)
            ? log.created_at
            : existing.lastSearched,
      });
    }

    return Array.from(countMap.entries())
      .map(([query, data]) => ({ query, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [searchLogs]);

  // 2. Most Searched References (FR-8.3)
  const mostSearched = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const log of searchLogs) {
      const q = log.query_text.trim().toUpperCase();
      countMap.set(q, (countMap.get(q) || 0) + 1);
    }

    return Array.from(countMap.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [searchLogs]);

  // 3. Most Transferred Models (FR-8.3)
  const mostTransferred = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const t of transfers) {
      countMap.set(t.model_id, (countMap.get(t.model_id) || 0) + 1);
    }

    const modelMap = new Map(models.map((m) => [m.id, m]));

    return Array.from(countMap.entries())
      .map(([modelId, count]) => ({
        model: modelMap.get(modelId),
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [transfers, models]);

  // 4. Models per Area
  const modelsPerArea = useMemo(() => {
    return areas.map((area) => {
      const areaSections = new Set(sections.filter((s) => s.area_id === area.id).map((s) => s.id));
      // Count models placed in these sections
      return {
        areaName: area.name,
        sectionCount: areaSections.size,
      };
    });
  }, [areas, sections]);

  // 5. Combined Activity Stream (Searches, Transfers, Entity Changes - FR-8.1)
  const activityStream = useMemo(() => {
    type ActivityItem = {
      id: string;
      type: 'search' | 'transfer' | 'audit';
      badge: string;
      badgeColor: string;
      description: React.ReactNode;
      created_at: string;
    };

    const items: ActivityItem[] = [];

    // Searches
    for (const s of searchLogs) {
      items.push({
        id: 's-' + s.id,
        type: 'search',
        badge: 'Recherche',
        badgeColor: s.result_count > 0 ? 'var(--accent)' : 'var(--danger)',
        description: (
          <span>
            Recherche de <span className="ref-code">"{s.query_text}"</span>{' '}
            <span style={{ color: s.result_count > 0 ? 'var(--success)' : 'var(--danger)', fontSize: '0.75rem' }}>
              ({s.result_count} résultat{s.result_count > 1 ? 's' : ''})
            </span>
          </span>
        ),
        created_at: s.created_at,
      });
    }

    // Transfers
    const modelMap = new Map(models.map((m) => [m.id, m]));
    const sectionMap = new Map(sections.map((sec) => [sec.id, sec]));

    for (const t of transfers) {
      const m = modelMap.get(t.model_id);
      const toSec = sectionMap.get(t.to_section_id);
      const fromSec = t.from_section_id ? sectionMap.get(t.from_section_id) : null;

      items.push({
        id: 't-' + t.id,
        type: 'transfer',
        badge: 'Transfert',
        badgeColor: '#8B5CF6',
        description: (
          <span>
            Transfert de <span className="ref-code">{m?.reference_code || 'Modèle'}</span>{' '}
            {fromSec ? `de ${fromSec.name} ` : ''}vers{' '}
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{toSec?.name || 'Rayon'}</span>
            {t.performed_by ? ` (par ${t.performed_by})` : ''}
          </span>
        ),
        created_at: t.created_at,
      });
    }

    // Entity Audits
    for (const a of auditLogs) {
      if (a.entity_type === 'transfer') continue; // Avoid duplicate display with transfers

      let actionLabel = 'Action';
      if (a.action === 'create') actionLabel = 'Création';
      else if (a.action === 'update') actionLabel = 'Modification';
      else if (a.action === 'archive') actionLabel = 'Archivage';
      else if (a.action === 'restore') actionLabel = 'Restauration';

      const refCode = a.changes?.reference_code ? ` "${a.changes.reference_code}"` : '';

      items.push({
        id: 'a-' + a.id,
        type: 'audit',
        badge: actionLabel,
        badgeColor: a.action === 'create' ? 'var(--success)' : '#3B82F6',
        description: (
          <span>
            {actionLabel} {a.entity_type}{refCode}
          </span>
        ),
        created_at: a.created_at,
      });
    }

    return items
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 30);
  }, [searchLogs, transfers, auditLogs, models, sections]);

  return (
    <div className="fade-in">
      {/* ZERO-RESULT SEARCHES ALERT CARD (Crucial BRD requirement for gap analysis) */}
      <div
        className="card"
        style={{
          padding: '1.25rem',
          marginBottom: '1rem',
          background: 'var(--danger-light)',
          border: '1px solid var(--danger)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--danger-light)',
              color: 'var(--danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--danger)' }}>
              Recherches sans résultat — Gaps de stock détectés ({zeroResultSearches.length})
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Codes cherchés par les opérateurs mais introuvables. Indique un modèle non enregistré,
              mal étiqueté ou égaré (FR-8.3).
            </p>
          </div>
        </div>

        {zeroResultSearches.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            Aucune recherche infructueuse enregistrée récemment.
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {zeroResultSearches.map((item) => (
              <div
                key={item.query}
                style={{
                  padding: '0.55rem 0.85rem',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--danger)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                }}
              >
                <span className="ref-code" style={{ fontSize: '1rem', color: 'var(--danger)' }}>
                  {item.query}
                </span>
                <span className="badge badge-rose" style={{ fontSize: '0.75rem' }}>
                  {item.count} recherche{item.count > 1 ? 's' : ''} échouée{item.count > 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grid: Most Searched & Most Moved */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        {/* Most Searched */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <TrendingUp size={18} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontSize: '0.98rem', fontWeight: 800 }}>Modèles les plus recherchés</h3>
          </div>

          {mostSearched.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              Aucune statistique de recherche pour l'instant.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {mostSearched.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    background: 'var(--bg-page)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-default)',
                  }}
                >
                  <span className="ref-code">{item.query}</span>
                  <span className="badge badge-amber">{item.count} fois</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Most Moved / Transferred */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <ArrowRightLeft size={18} style={{ color: 'var(--info)' }} />
            <h3 style={{ fontSize: '0.98rem', fontWeight: 800 }}>Modèles les plus déplacés</h3>
          </div>

          {mostTransferred.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              Aucun transfert enregistré pour le moment.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {mostTransferred.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    background: 'var(--bg-page)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-default)',
                  }}
                >
                  <span className="ref-code">
                    {item.model?.reference_code || 'Modèle'}
                  </span>
                  <span className="badge badge-indigo">{item.count} transferts</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Audit Log Stream (FR-8.1) */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={18} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontSize: '0.98rem', fontWeight: 800 }}>
              Journal d’audit & d'activité ({searchLogs.length + transfers.length + auditLogs.length} événements)
            </h3>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Dernières 30 activités
          </span>
        </div>

        <div
          style={{
            maxHeight: '320px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem',
          }}
        >
          {activityStream.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '0.5rem 0' }}>
              Aucune activité enregistrée pour le moment.
            </p>
          ) : (
            activityStream.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.45rem 0.75rem',
                  fontSize: '0.78rem',
                  background: 'var(--bg-page)',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: `3px solid ${item.badgeColor}`,
                  border: '1px solid var(--border-default)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      padding: '0.15rem 0.45rem',
                      borderRadius: 'var(--radius-xs)',
                      background: 'rgba(255, 255, 255, 0.06)',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: item.badgeColor,
                    }}
                  >
                    [{item.badge}]
                  </span>
                  <div>{item.description}</div>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', whiteSpace: 'nowrap', marginLeft: '0.75rem' }}>
                  {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

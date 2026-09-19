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

  return (
    <div className="fade-in">
      {/* ZERO-RESULT SEARCHES ALERT CARD (Crucial BRD requirement for gap analysis) */}
      <div
        className="glass-panel"
        style={{
          padding: '1.25rem',
          marginBottom: '1.25rem',
          background: 'rgba(244, 63, 94, 0.08)',
          border: '1px solid rgba(244, 63, 94, 0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(244, 63, 94, 0.2)',
              color: '#fb7185',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fb7185' }}>
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
                  background: 'rgba(9, 13, 22, 0.7)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                }}
              >
                <span className="ref-code" style={{ fontSize: '1.05rem', color: '#fb7185' }}>
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
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <TrendingUp size={18} style={{ color: 'var(--primary)' }} />
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
                    background: 'rgba(9, 13, 22, 0.4)',
                    borderRadius: 'var(--radius-sm)',
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
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <ArrowRightLeft size={18} style={{ color: '#818cf8' }} />
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
                    background: 'rgba(9, 13, 22, 0.4)',
                    borderRadius: 'var(--radius-sm)',
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
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Clock size={18} style={{ color: 'var(--primary)' }} />
          <h3 style={{ fontSize: '0.98rem', fontWeight: 800 }}>
            Journal d’audit & d'activité ({searchLogs.length + transfers.length} événements)
          </h3>
        </div>

        <div
          style={{
            maxHeight: '260px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem',
          }}
        >
          {searchLogs.slice(0, 15).map((log) => (
            <div
              key={log.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.45rem 0.75rem',
                fontSize: '0.78rem',
                background: 'rgba(9, 13, 22, 0.3)',
                borderRadius: 'var(--radius-sm)',
                borderLeft: `3px solid ${log.result_count > 0 ? '#fbbf24' : '#fb7185'}`,
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)', marginRight: '0.45rem' }}>
                  [Recherche]
                </span>
                <span className="ref-code" style={{ marginRight: '0.45rem' }}>
                  "{log.query_text}"
                </span>
                <span style={{ color: log.result_count > 0 ? '#34d399' : '#fb7185' }}>
                  ({log.result_count} résultat{log.result_count > 1 ? 's' : ''})
                </span>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                {new Date(log.created_at).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

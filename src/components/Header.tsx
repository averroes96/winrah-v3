// ============================================================================
// WINRAH - Header Component
// Features active warehouse selector, online/offline simulator switch,
// sync status pill, and instant 1-click test data seeder.
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  Warehouse as WarehouseIcon,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  Database,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { syncEngine, SyncEngineStatus } from '../lib/syncEngine';
import { seedDemoData } from '../db/seedData';
import { Warehouse } from '../types';
import confetti from 'canvas-confetti';

interface HeaderProps {
  activeWarehouse: Warehouse | null;
  warehouses: Warehouse[];
  onOpenWarehouseModal: () => void;
  onOpenSyncTab: () => void;
  onRefreshData: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeWarehouse,
  onOpenWarehouseModal,
  onOpenSyncTab,
  onRefreshData,
}) => {
  const [syncStatus, setSyncStatus] = useState<SyncEngineStatus>({
    isOnline: true,
    isSyncing: false,
    lastSyncedAt: null,
    pendingChangesCount: 0,
    conflictCount: 0,
    mode: 'simulator',
  });
  const [isSeeding, setIsSeeding] = useState(false);

  useEffect(() => {
    return syncEngine.subscribe(setSyncStatus);
  }, []);

  const handleToggleOffline = () => {
    syncEngine.setSimulatedOffline(syncStatus.isOnline);
  };

  const [seedSuccess, setSeedSuccess] = useState(false);

  const handleSeedData = async () => {
    setIsSeeding(true);
    setSeedSuccess(false);
    try {
      await seedDemoData();
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.2 } });
      await onRefreshData();
      setSeedSuccess(true);
      setTimeout(() => setSeedSuccess(false), 2500);
    } catch (err: any) {
      console.error('Erreur chargement données démo:', err);
      alert('Erreur lors du chargement des données de démo: ' + (err?.message || String(err)));
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <header
      className="glass-panel"
      style={{
        padding: '0.85rem 1.25rem',
        marginBottom: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}
    >
      {/* Brand & Codename */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
          }}
        >
          <span style={{ fontSize: '1.4rem' }}>👟</span>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <h1
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                background: 'linear-gradient(90deg, #f8fafc 0%, #cbd5e1 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              WINRAH
            </h1>
            <span className="badge badge-amber" style={{ fontSize: '0.65rem' }}>
              v3.0
            </span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Où est le modèle ? (Localisation Stock)
          </p>
        </div>
      </div>

      {/* Center: Active Warehouse Selector */}
      <button
        type="button"
        onClick={onOpenWarehouseModal}
        className="btn btn-secondary"
        style={{
          padding: '0.45rem 0.9rem',
          fontSize: '0.82rem',
          gap: '0.45rem',
          borderRadius: 'var(--radius-full)',
        }}
        title="Changer d’entrepôt actif"
      >
        <WarehouseIcon size={16} style={{ color: 'var(--primary)' }} />
        <span style={{ fontWeight: 700, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeWarehouse ? activeWarehouse.name : 'Sélectionner Entrepôt'}
        </span>
        <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
      </button>

      {/* Right Controls: Offline Simulator Toggle, Sync Pill, Quick Seed */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        {/* Offline Simulator Switch */}
        <button
          type="button"
          onClick={handleToggleOffline}
          className="btn"
          style={{
            padding: '0.4rem 0.75rem',
            fontSize: '0.78rem',
            background: syncStatus.isOnline ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.15)',
            color: syncStatus.isOnline ? '#34d399' : '#fb7185',
            border: `1px solid ${syncStatus.isOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
            borderRadius: 'var(--radius-full)',
          }}
          title={syncStatus.isOnline ? 'Cliquer pour simuler le mode HORS-LIGNE' : 'Cliquer pour rétablir la connexion EN LIGNE'}
        >
          {syncStatus.isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>{syncStatus.isOnline ? 'En ligne' : 'Hors-ligne'}</span>
        </button>

        {/* Sync Status Badge */}
        <button
          type="button"
          onClick={onOpenSyncTab}
          className="btn"
          style={{
            padding: '0.4rem 0.75rem',
            fontSize: '0.78rem',
            background:
              syncStatus.conflictCount > 0
                ? 'rgba(244, 63, 94, 0.2)'
                : syncStatus.pendingChangesCount > 0
                ? 'rgba(245, 158, 11, 0.18)'
                : 'rgba(255, 255, 255, 0.08)',
            color:
              syncStatus.conflictCount > 0
                ? '#fb7185'
                : syncStatus.pendingChangesCount > 0
                ? '#fbbf24'
                : 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-full)',
          }}
          title="Consulter l’état de synchronisation"
        >
          {syncStatus.isSyncing ? (
            <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--primary)' }} />
          ) : syncStatus.conflictCount > 0 ? (
            <AlertTriangle size={14} style={{ color: '#fb7185' }} />
          ) : (
            <Database size={14} />
          )}
          <span>
            {syncStatus.conflictCount > 0
              ? `${syncStatus.conflictCount} conflit(s)`
              : syncStatus.pendingChangesCount > 0
              ? `${syncStatus.pendingChangesCount} en attente`
              : 'Synchronisé'}
          </span>
        </button>

        {/* 1-Click Seeder Button */}
        <button
          type="button"
          onClick={handleSeedData}
          disabled={isSeeding}
          className="btn btn-secondary"
          style={{
            padding: '0.4rem 0.75rem',
            fontSize: '0.78rem',
            borderRadius: 'var(--radius-full)',
            gap: '0.35rem',
            color: seedSuccess ? '#34d399' : 'var(--text-primary)',
            borderColor: seedSuccess ? '#10b981' : 'var(--border-subtle)',
          }}
          title="Charger les données d’exemple (Casablanca & Tanger)"
        >
          <Sparkles size={14} style={{ color: seedSuccess ? '#34d399' : '#fbbf24' }} />
          <span>{isSeeding ? 'Chargement...' : seedSuccess ? 'Données chargées !' : 'Démo'}</span>
        </button>
      </div>
    </header>
  );
};

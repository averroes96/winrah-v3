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
  Check,
} from 'lucide-react';
import { syncEngine, SyncEngineStatus } from '../lib/syncEngine';
import { seedDemoData } from '../db/seedData';
import { Warehouse } from '../types';

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
  const [seedSuccess, setSeedSuccess] = useState(false);

  useEffect(() => {
    return syncEngine.subscribe(setSyncStatus);
  }, []);

  const handleToggleOffline = () => {
    syncEngine.setSimulatedOffline(syncStatus.isOnline);
  };

  const handleSeedData = async () => {
    setIsSeeding(true);
    setSeedSuccess(false);
    try {
      await seedDemoData();
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
      style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: '0.75rem 1rem',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        boxShadow: 'var(--shadow-subtle)',
      }}
    >
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <h1
          style={{
            fontSize: '1.25rem',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
          }}
        >
          WINRAH
        </h1>
      </div>

      {/* Center: Active Warehouse Selector */}
      <button
        type="button"
        onClick={onOpenWarehouseModal}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.4rem 0.85rem',
          fontSize: '0.82rem',
          fontWeight: 600,
          fontFamily: 'var(--font-sans)',
          background: 'transparent',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-full)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          transition: 'background 0.15s ease',
        }}
        title="Changer d'entrepôt actif"
      >
        <WarehouseIcon size={15} style={{ color: 'var(--accent)' }} />
        <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeWarehouse ? activeWarehouse.name : 'Sélectionner'}
        </span>
        <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
      </button>

      {/* Right Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
        {/* Online/Offline Toggle */}
        <button
          type="button"
          onClick={handleToggleOffline}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.35rem 0.7rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            fontFamily: 'var(--font-sans)',
            background: syncStatus.isOnline ? 'var(--success-light)' : 'var(--danger-light)',
            color: syncStatus.isOnline ? 'var(--success)' : 'var(--danger)',
            border: 'none',
            borderRadius: 'var(--radius-full)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title={syncStatus.isOnline ? 'Simuler hors-ligne' : 'Rétablir en ligne'}
        >
          {syncStatus.isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
          <span>{syncStatus.isOnline ? 'En ligne' : 'Hors-ligne'}</span>
        </button>

        {/* Sync Status Badge */}
        <button
          type="button"
          onClick={onOpenSyncTab}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.35rem 0.7rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            fontFamily: 'var(--font-sans)',
            background:
              syncStatus.conflictCount > 0
                ? 'var(--danger-light)'
                : syncStatus.pendingChangesCount > 0
                ? 'var(--accent-light)'
                : 'var(--bg-input)',
            color:
              syncStatus.conflictCount > 0
                ? 'var(--danger)'
                : syncStatus.pendingChangesCount > 0
                ? 'var(--accent-dark)'
                : 'var(--text-secondary)',
            border: 'none',
            borderRadius: 'var(--radius-full)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title="État de synchronisation"
        >
          {syncStatus.isSyncing ? (
            <RefreshCw size={13} className="animate-spin" />
          ) : syncStatus.conflictCount > 0 ? (
            <AlertTriangle size={13} />
          ) : (
            <Database size={13} />
          )}
          <span>
            {syncStatus.conflictCount > 0
              ? `${syncStatus.conflictCount} conflit(s)`
              : syncStatus.pendingChangesCount > 0
              ? `${syncStatus.pendingChangesCount} en attente`
              : 'Synchronisé'}
          </span>
        </button>

        {/* Demo Seed Button */}
        <button
          type="button"
          onClick={handleSeedData}
          disabled={isSeeding}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.35rem 0.7rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            fontFamily: 'var(--font-sans)',
            background: seedSuccess ? 'var(--success-light)' : 'var(--bg-input)',
            color: seedSuccess ? 'var(--success)' : 'var(--text-secondary)',
            border: 'none',
            borderRadius: 'var(--radius-full)',
            cursor: isSeeding ? 'not-allowed' : 'pointer',
            opacity: isSeeding ? 0.6 : 1,
            transition: 'all 0.15s ease',
          }}
          title="Charger les données d'exemple"
        >
          {seedSuccess ? <Check size={13} /> : <Sparkles size={13} style={{ color: 'var(--accent)' }} />}
          <span>{isSeeding ? '...' : seedSuccess ? 'Chargé !' : 'Démo'}</span>
        </button>
      </div>
    </header>
  );
};

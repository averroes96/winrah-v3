// ============================================================================
// WINRAH - Header Component
// Streamlined single-row mobile header with active warehouse selector,
// live sync status badge, and instant access to Settings & Tools.
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  Warehouse as WarehouseIcon,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  Settings,
} from 'lucide-react';
import { syncEngine, SyncEngineStatus } from '../lib/syncEngine';
import { Warehouse } from '../types';
import { useI18n } from '../i18n';
import { Logo } from './Logo';

interface HeaderProps {
  activeWarehouse: Warehouse | null;
  warehouses: Warehouse[];
  onOpenWarehouseModal: () => void;
  onOpenSyncTab: () => void;
  onRefreshData?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeWarehouse,
  onOpenWarehouseModal,
  onOpenSyncTab,
}) => {
  const { t } = useI18n();

  const [syncStatus, setSyncStatus] = useState<SyncEngineStatus>({
    isOnline: true,
    isSyncing: false,
    lastSyncedAt: null,
    pendingChangesCount: 0,
    conflictCount: 0,
    mode: 'simulator',
  });

  useEffect(() => {
    return syncEngine.subscribe(setSyncStatus);
  }, []);

  return (
    <header
      style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: '0.5rem 0.85rem',
        marginBottom: '0.85rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'nowrap',
        gap: '0.5rem',
        boxShadow: 'var(--shadow-subtle)',
      }}
    >
      {/* Brand Logo & Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
        <Logo size={30} showText={true} showTagline={false} />
      </div>

      {/* Warehouse Selector & Settings Quick Link */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
        {/* Active Warehouse Selector Pill */}
        <button
          type="button"
          onClick={onOpenWarehouseModal}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.35rem 0.65rem',
            fontSize: '0.8rem',
            fontWeight: 700,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-full)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            transition: 'background 0.15s ease',
            whiteSpace: 'nowrap',
            maxWidth: '150px',
            overflow: 'hidden',
          }}
          title={t('header.change_warehouse')}
        >
          <WarehouseIcon size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeWarehouse ? activeWarehouse.name : t('header.select_warehouse')}
          </span>
          <ChevronDown size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        </button>

        {/* Live Sync Status & Settings Shortcut */}
        <button
          type="button"
          onClick={onOpenSyncTab}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '34px',
            height: '34px',
            borderRadius: 'var(--radius-full)',
            background: !syncStatus.isOnline
              ? 'rgba(239, 68, 68, 0.1)'
              : syncStatus.conflictCount > 0
              ? 'rgba(245, 158, 11, 0.15)'
              : syncStatus.pendingChangesCount > 0
              ? 'rgba(59, 130, 246, 0.12)'
              : 'var(--bg-secondary)',
            color: !syncStatus.isOnline
              ? 'var(--danger)'
              : syncStatus.conflictCount > 0
              ? 'var(--accent-dark)'
              : syncStatus.pendingChangesCount > 0
              ? '#2563eb'
              : 'var(--text-secondary)',
            border: '1px solid var(--border-default)',
            cursor: 'pointer',
            flexShrink: 0,
            position: 'relative',
            transition: 'all 0.15s ease',
          }}
          title={
            !syncStatus.isOnline
              ? 'Hors-ligne - Cliquez pour les paramètres'
              : syncStatus.isSyncing
              ? 'Synchronisation en cours...'
              : 'Paramètres & Statut de synchronisation'
          }
        >
          {syncStatus.isSyncing ? (
            <RefreshCw size={15} className="animate-spin" />
          ) : !syncStatus.isOnline ? (
            <WifiOff size={15} />
          ) : syncStatus.conflictCount > 0 ? (
            <AlertTriangle size={15} />
          ) : (
            <Settings size={16} />
          )}

          {/* Indicator Dot */}
          {syncStatus.isOnline && syncStatus.pendingChangesCount === 0 && (
            <span
              style={{
                position: 'absolute',
                top: '5px',
                right: '5px',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#10b981',
              }}
            />
          )}
          {syncStatus.pendingChangesCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-2px',
                right: '-2px',
                minWidth: '14px',
                height: '14px',
                borderRadius: '7px',
                background: 'var(--accent)',
                color: '#fff',
                fontSize: '0.55rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 2px',
              }}
            >
              {syncStatus.pendingChangesCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};

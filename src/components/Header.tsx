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
  ChevronDown,
  Globe,
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
  const { language, toggleLanguage, t } = useI18n();

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

  const handleToggleOffline = () => {
    syncEngine.setSimulatedOffline(syncStatus.isOnline);
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
      {/* Brand Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Logo size={34} showText={true} showTagline={false} />
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
          background: 'transparent',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-full)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          transition: 'background 0.15s ease',
        }}
        title={t('header.change_warehouse')}
      >
        <WarehouseIcon size={15} style={{ color: 'var(--accent)' }} />
        <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeWarehouse ? activeWarehouse.name : t('header.select_warehouse')}
        </span>
        <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
      </button>

      {/* Right Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
        {/* Language Switcher Button */}
        <button
          type="button"
          onClick={toggleLanguage}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.35rem 0.65rem',
            fontSize: '0.75rem',
            fontWeight: 700,
            background: 'var(--bg-input)',
            color: 'var(--accent-dark)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-full)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title={language === 'ar' ? 'Passer en Français' : 'التحويل إلى العربية'}
        >
          <Globe size={13} style={{ color: 'var(--accent)' }} />
          <span>{language === 'ar' ? 'FR' : 'عربي'}</span>
        </button>

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
            background: syncStatus.isOnline ? 'var(--success-light)' : 'var(--danger-light)',
            color: syncStatus.isOnline ? 'var(--success)' : 'var(--danger)',
            border: 'none',
            borderRadius: 'var(--radius-full)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title={syncStatus.isOnline ? t('header.sim_offline') : t('header.sim_online')}
        >
          {syncStatus.isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
          <span>{syncStatus.isOnline ? t('header.online') : t('header.offline')}</span>
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
          title={t('header.sync_status')}
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
              ? t('header.conflicts', { count: syncStatus.conflictCount })
              : syncStatus.pendingChangesCount > 0
              ? t('header.pending', { count: syncStatus.pendingChangesCount })
              : t('header.synced')}
          </span>
        </button>
      </div>
    </header>
  );
};

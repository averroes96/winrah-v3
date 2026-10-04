// ============================================================================
// WINRAH - Settings & Tools Tab (Paramètres & Outils)
// Consolidates Application Settings, Active Warehouse, Language,
// Cloud Sync, CSV Import/Export, and Database Maintenance in one clean place.
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Warehouse as WarehouseIcon,
  Globe,
  RefreshCw,
  CloudDownload,
  CloudUpload,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Download,
  Upload,
  Trash2,
  Wifi,
  WifiOff,
  FileSpreadsheet,
  Database,
  Sparkles,
  Eye,
  EyeOff,
  Bot,
} from 'lucide-react';
import { syncEngine, SyncEngineStatus } from '../lib/syncEngine';
import { db } from '../db/indexedDb';
import { Warehouse, Area, Section, ShoeModel, ModelSection, SyncQueueItem } from '../types';
import { useI18n } from '../i18n';
import { Logo } from './Logo';
import { exportCatalogToCsv, downloadBlob } from '../lib/csvHelper';
import { fetchFirebaseDatabase, SyncProgressUpdate } from '../lib/firebaseClient';
import { initBaseWarehouse } from '../db/seedData';
import {
  getGeminiConfig,
  setGeminiConfig,
  clearGeminiConfig,
  testGeminiConnection,
  DEFAULT_GEMINI_MODEL,
} from '../lib/geminiClient';

interface SettingsTabProps {
  activeWarehouse: Warehouse | null;
  warehouses: Warehouse[];
  areas: Area[];
  sections: Section[];
  models: ShoeModel[];
  modelSections: ModelSection[];
  onOpenWarehouseModal: () => void;
  onOpenDevicePairing: () => void;
  onOpenImportModal: () => void;
  onRefreshData: () => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  activeWarehouse,
  warehouses,
  areas,
  sections,
  models,
  modelSections,
  onOpenWarehouseModal,
  onOpenDevicePairing,
  onOpenImportModal,
  onRefreshData,
}) => {
  const { language, setLanguage, direction, t } = useI18n();

  const [syncStatus, setSyncStatus] = useState<SyncEngineStatus>({
    isOnline: true,
    isSyncing: false,
    lastSyncedAt: null,
    pendingChangesCount: 0,
    conflictCount: 0,
    mode: 'simulator',
  });

  const [conflicts, setConflicts] = useState<SyncQueueItem[]>([]);
  const [isFetchingServer, setIsFetchingServer] = useState(false);
  const [isPushingServer, setIsPushingServer] = useState(false);
  const [isDeduplicating, setIsDeduplicating] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressUpdate | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<{ success: boolean; text: string } | null>(null);

  // Gemini Vision AI settings state
  const [geminiApiKey, setGeminiApiKey] = useState(() => getGeminiConfig()?.apiKey || '');
  const [geminiModel, setGeminiModel] = useState(() => getGeminiConfig()?.model || DEFAULT_GEMINI_MODEL);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingGemini, setIsTestingGemini] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadSyncData = useCallback(async () => {
    const q = await db.getAll<SyncQueueItem>('sync_queue');
    setConflicts(q.filter((c) => c.status === 'pending'));
  }, []);

  useEffect(() => {
    loadSyncData();
    return syncEngine.subscribe(setSyncStatus);
  }, [loadSyncData]);

  const handleToggleOffline = () => {
    syncEngine.setSimulatedOffline(syncStatus.isOnline);
  };

  const handleSyncNow = async () => {
    setStatusFeedback(null);
    try {
      const res = await syncEngine.syncNow((p) => setSyncProgress(p));
      await db.deduplicateLocalDatabase();
      if (res.pushed === 0) {
        setStatusFeedback({
          success: true,
          text: t('settings.feedback.sync_up_to_date'),
        });
      } else {
        setStatusFeedback({
          success: true,
          text: t('settings.feedback.sync_success', { count: res.pushed }),
        });
      }
      await loadSyncData();
      onRefreshData();
    } catch (err: any) {
      setStatusFeedback({
        success: false,
        text: t('settings.feedback.sync_error', { message: err.message || String(err) }),
      });
    } finally {
      setSyncProgress(null);
    }
  };

  const handleFetchServerDb = async () => {
    setIsFetchingServer(true);
    setStatusFeedback(null);
    try {
      const res = await fetchFirebaseDatabase(true, (p) => setSyncProgress(p));
      setStatusFeedback({
        success: true,
        text: t('settings.feedback.pull_success', { count: res.total }),
      });
      await loadSyncData();
      onRefreshData();
    } catch (err: any) {
      setStatusFeedback({
        success: false,
        text: t('settings.feedback.pull_error', { message: err.message || String(err) }),
      });
    } finally {
      setIsFetchingServer(false);
      setSyncProgress(null);
    }
  };

  const handlePushServerDb = async () => {
    setIsPushingServer(true);
    setStatusFeedback(null);
    try {
      const res = await syncEngine.pushAllToCloud();
      await db.deduplicateLocalDatabase();
      setStatusFeedback({
        success: true,
        text: t('settings.feedback.push_success', { count: res.pushed }),
      });
      await loadSyncData();
      onRefreshData();
    } catch (err: any) {
      setStatusFeedback({
        success: false,
        text: t('settings.feedback.push_error', { message: err.message || String(err) }),
      });
    } finally {
      setIsPushingServer(false);
    }
  };

  const handleDeduplicateLocalDb = async () => {
    setIsDeduplicating(true);
    setStatusFeedback(null);
    try {
      const res = await db.deduplicateLocalDatabase();
      const totalRemoved =
        res.modelsRemoved +
        res.sectionsRemoved +
        res.areasRemoved +
        res.warehousesRemoved +
        res.assignmentsRemoved;

      if (totalRemoved === 0) {
        setStatusFeedback({
          success: true,
          text: t('settings.feedback.dedup_none'),
        });
      } else {
        setStatusFeedback({
          success: true,
          text: t('settings.feedback.dedup_success', { count: totalRemoved }),
        });
        onRefreshData();
      }
    } catch (err: any) {
      setStatusFeedback({
        success: false,
        text: t('settings.feedback.dedup_error', { message: err.message || String(err) }),
      });
    } finally {
      setIsDeduplicating(false);
    }
  };

  const handleClearLocalDb = async () => {
    if (window.confirm(t('settings.danger.clear_confirm'))) {
      setStatusFeedback(null);
      try {
        await initBaseWarehouse();
        setStatusFeedback({
          success: true,
          text: t('settings.feedback.clear_success'),
        });
        await loadSyncData();
        onRefreshData();
      } catch (err: any) {
        setStatusFeedback({
          success: false,
          text: t('settings.feedback.clear_error', { message: err.message || String(err) }),
        });
      }
    }
  };

  const handleExportCsv = () => {
    const csvData = exportCatalogToCsv(models, modelSections, sections, areas, warehouses);
    const filename = `winrah_export_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadBlob(csvData, filename, 'text/csv;charset=utf-8;');
    setStatusFeedback({
      success: true,
      text: t('settings.feedback.export_success', { count: models.length, filename }),
    });
  };

  return (
    <div className="fade-in" dir={direction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Page Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
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
          <Settings size={20} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            {t('settings.title')}
          </h2>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {t('settings.subtitle')}
          </span>
        </div>
      </div>

      {/* Status Feedback Banner */}
      {statusFeedback && (
        <div
          className="fade-in"
          style={{
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: statusFeedback.success ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            color: statusFeedback.success ? '#059669' : '#b91c1c',
            border: `1px solid ${statusFeedback.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            fontSize: '0.82rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {statusFeedback.success ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{statusFeedback.text}</span>
        </div>
      )}

      {/* Progress Bar when syncing */}
      {syncProgress && (
        <div
          className="fade-in"
          style={{
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-card)',
            border: '1px solid var(--accent)',
            boxShadow: 'var(--shadow-subtle)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', fontWeight: 700 }}>
              <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
              <span>{syncProgress.message}</span>
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--accent)' }}>
              {syncProgress.percentage}%
            </span>
          </div>
          <div style={{ width: '100%', height: '6px', background: 'var(--bg-input)', borderRadius: '999px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${syncProgress.percentage}%`,
                height: '100%',
                background: 'var(--accent)',
                borderRadius: '999px',
                transition: 'width 0.25s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* 1. Active Warehouse Card */}
      <div className="card" style={{ padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-light)',
                color: 'var(--accent-dark)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <WarehouseIcon size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-dark)', textTransform: 'uppercase' }}>
                {t('settings.warehouse.title')}
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {activeWarehouse ? activeWarehouse.name : t('settings.warehouse.none')}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {t('settings.warehouse.stats', { warehouses: warehouses.length, models: models.length })}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenWarehouseModal}
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
          >
            {t('settings.warehouse.change')}
          </button>
        </div>
      </div>

      {/* 2. Language Selector */}
      <div className="card" style={{ padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Globe size={18} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontSize: '0.92rem', fontWeight: 800, margin: 0 }}>
            {t('settings.lang.title')}
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setLanguage('ar')}
            style={{
              padding: '0.65rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              border: `1.5px solid ${language === 'ar' ? 'var(--accent)' : 'var(--border-default)'}`,
              background: language === 'ar' ? 'var(--accent-light)' : 'var(--bg-page)',
              color: language === 'ar' ? 'var(--accent-dark)' : 'var(--text-primary)',
              fontFamily: 'var(--font-arabic)',
            }}
          >
            <span>{t('settings.lang.ar')}</span>
            {language === 'ar' && <CheckCircle2 size={16} />}
          </button>

          <button
            type="button"
            onClick={() => setLanguage('fr')}
            style={{
              padding: '0.65rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              border: `1.5px solid ${language === 'fr' ? 'var(--accent)' : 'var(--border-default)'}`,
              background: language === 'fr' ? 'var(--accent-light)' : 'var(--bg-page)',
              color: language === 'fr' ? 'var(--accent-dark)' : 'var(--text-primary)',
            }}
          >
            <span>{t('settings.lang.fr')}</span>
            {language === 'fr' && <CheckCircle2 size={16} />}
          </button>
        </div>
      </div>

      {/* 3. Cloud Sync & Backup Card */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-sm)',
                background: syncStatus.isOnline ? 'var(--success-light)' : 'var(--danger-light)',
                color: syncStatus.isOnline ? 'var(--success)' : 'var(--danger)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Database size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.98rem', fontWeight: 800 }}>{t('settings.sync.title')}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {syncStatus.lastSyncedAt
                  ? t('settings.sync.last_synced', { time: new Date(syncStatus.lastSyncedAt).toLocaleTimeString() })
                  : t('settings.sync.never')}
              </div>
            </div>
          </div>

          {/* Network Simulator Toggle */}
          <button
            type="button"
            onClick={handleToggleOffline}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.7rem',
              fontSize: '0.72rem',
              fontWeight: 700,
              borderRadius: 'var(--radius-full)',
              border: 'none',
              background: syncStatus.isOnline ? 'var(--success-light)' : 'var(--danger-light)',
              color: syncStatus.isOnline ? 'var(--success)' : 'var(--danger)',
              cursor: 'pointer',
            }}
          >
            {syncStatus.isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span>{syncStatus.isOnline ? t('settings.sync.online') : t('settings.sync.offline')}</span>
          </button>
        </div>

        {/* Sync Summary Pills */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '0.3rem 0.65rem',
              borderRadius: 'var(--radius-full)',
              background: syncStatus.pendingChangesCount > 0 ? 'var(--accent-light)' : 'var(--bg-input)',
              color: syncStatus.pendingChangesCount > 0 ? 'var(--accent-dark)' : 'var(--text-secondary)',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            {t('settings.sync.pending_changes', { count: syncStatus.pendingChangesCount })}
          </span>

          {conflicts.length > 0 && (
            <span
              style={{
                padding: '0.3rem 0.65rem',
                borderRadius: 'var(--radius-full)',
                background: 'var(--danger-light)',
                color: 'var(--danger)',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              {t('settings.sync.conflicts', { count: conflicts.length })}
            </span>
          )}
        </div>

        {/* Primary Action Button */}
        <button
          type="button"
          onClick={handleSyncNow}
          disabled={syncStatus.isSyncing || !syncStatus.isOnline}
          className="btn btn-primary"
          style={{ width: '100%', padding: '0.75rem', fontSize: '0.88rem', fontWeight: 700, marginBottom: '0.75rem' }}
        >
          <RefreshCw size={16} className={syncStatus.isSyncing ? 'animate-spin' : ''} />
          <span>{syncStatus.isSyncing ? t('settings.sync.syncing') : t('settings.sync.sync_now')}</span>
        </button>

        {/* Collapsible Secondary Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={handleFetchServerDb}
            disabled={isFetchingServer || !syncStatus.isOnline}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '0.55rem', gap: '0.4rem', justifyContent: 'center' }}
          >
            <CloudDownload size={15} className={isFetchingServer ? 'animate-spin' : ''} />
            <span>{t('settings.sync.pull_server')}</span>
          </button>

          <button
            type="button"
            onClick={handlePushServerDb}
            disabled={isPushingServer || !syncStatus.isOnline}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '0.55rem', gap: '0.4rem', justifyContent: 'center' }}
          >
            <CloudUpload size={15} className={isPushingServer ? 'animate-spin' : ''} />
            <span>{t('settings.sync.push_server')}</span>
          </button>

          <button
            type="button"
            onClick={onOpenDevicePairing}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '0.55rem', gap: '0.4rem', justifyContent: 'center' }}
          >
            <QrCode size={15} />
            <span>{t('settings.sync.qr_direct')}</span>
          </button>

          <button
            type="button"
            onClick={handleDeduplicateLocalDb}
            disabled={isDeduplicating}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '0.55rem', gap: '0.4rem', justifyContent: 'center' }}
          >
            <CheckCircle2 size={15} className={isDeduplicating ? 'animate-spin' : ''} />
            <span>{t('settings.sync.deduplicate')}</span>
          </button>
        </div>
      </div>

      {/* 4. Gemini AI Vision Configuration Card */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(139, 92, 246, 0.3)',
              }}
            >
              <Bot size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0 }}>
                {t('settings.ai.title')}
              </h3>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {t('settings.ai.subtitle')}
              </span>
            </div>
          </div>

          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '999px',
              background: geminiApiKey.trim() ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: geminiApiKey.trim() ? '#10B981' : 'var(--danger)',
            }}
          >
            {geminiApiKey.trim() ? t('settings.ai.status_active') : t('settings.ai.status_unconfigured')}
          </span>
        </div>

        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.85rem', lineHeight: 1.45 }}>
          {t('settings.ai.description')}
        </p>

        {/* API Key Input */}
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.3rem', color: 'var(--text-primary)' }}>
            {t('settings.ai.api_key_label')}
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type={showApiKey ? 'text' : 'password'}
              value={geminiApiKey}
              onChange={(e) => {
                setGeminiApiKey(e.target.value);
                setGeminiTestResult(null);
              }}
              placeholder="AIzaSy..."
              style={{
                width: '100%',
                padding: '0.55rem 2.4rem 0.55rem 0.75rem',
                fontSize: '0.82rem',
                fontFamily: 'monospace',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              style={{
                position: 'absolute',
                right: '0.6rem',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '2px',
              }}
            >
              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Model Selection */}
        <div style={{ marginBottom: '0.85rem' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.3rem', color: 'var(--text-primary)' }}>
            {t('settings.ai.model_label')}
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <select
              value={['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-2.5-flash'].includes(geminiModel) ? geminiModel : 'custom'}
              onChange={(e) => {
                const val = e.target.value;
                if (val !== 'custom') {
                  setGeminiModel(val);
                }
                setGeminiTestResult(null);
              }}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                fontSize: '0.82rem',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="gemini-3.8-flash">{t('settings.ai.model_recommended')}</option>
              <option value="gemini-3.5-flash-lite">{t('settings.ai.model_lite')}</option>
              <option value="gemini-3.7-flash">Gemini 3.7 Flash</option>
              <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
              <option value="gemini-3.1-pro-preview">{t('settings.ai.model_pro')}</option>
              <option value="gemini-2.5-flash">{t('settings.ai.model_restricted')}</option>
              <option value="custom">{t('settings.ai.model_custom')}</option>
            </select>

            {(!['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-2.5-flash'].includes(geminiModel) || geminiModel === 'custom') && (
              <input
                type="text"
                value={geminiModel === 'custom' ? '' : geminiModel}
                onChange={(e) => {
                  setGeminiModel(e.target.value.trim());
                  setGeminiTestResult(null);
                }}
                placeholder={t('settings.ai.custom_placeholder')}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.65rem',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                }}
              />
            )}
          </div>
        </div>

        {/* Feedback Alert */}
        {geminiTestResult && (
          <div
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              background: geminiTestResult.success ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              color: geminiTestResult.success ? '#059669' : '#b91c1c',
              border: `1px solid ${geminiTestResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              fontSize: '0.78rem',
              fontWeight: 600,
              marginBottom: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
            }}
          >
            {geminiTestResult.success ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            <span>{geminiTestResult.message}</span>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={async () => {
              if (!geminiApiKey.trim()) {
                clearGeminiConfig();
                setGeminiTestResult({ success: true, message: t('settings.ai.key_cleared') });
                return;
              }
              setIsTestingGemini(true);
              setGeminiTestResult(null);
              try {
                const res = await testGeminiConnection(geminiApiKey, geminiModel);
                setGeminiTestResult(res);
                if (res.success) {
                  setGeminiConfig(geminiApiKey.trim(), geminiModel);
                }
              } finally {
                setIsTestingGemini(false);
              }
            }}
            disabled={isTestingGemini || !geminiApiKey.trim()}
            className="btn btn-primary"
            style={{
              fontSize: '0.8rem',
              padding: '0.55rem 0.85rem',
              gap: '0.4rem',
              background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
            }}
          >
            <Sparkles size={14} className={isTestingGemini ? 'animate-spin' : ''} />
            <span>{isTestingGemini ? t('settings.ai.testing') : t('settings.ai.save_test')}</span>
          </button>

          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '0.55rem 0.75rem', textDecoration: 'none' }}
          >
            {t('settings.ai.get_free_key')}
          </a>
        </div>
      </div>

      {/* 5. Data Management: Import & Export CSV */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <FileSpreadsheet size={18} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0 }}>
            {t('settings.data.title')}
          </h3>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
          {t('settings.data.subtitle')}
        </p>

        {/* Highlighted WINRAH v2 database 1-click import */}
        <div
          style={{
            padding: '0.85rem 1rem',
            background: 'linear-gradient(135deg, rgba(217, 119, 6, 0.08) 0%, rgba(245, 158, 11, 0.14) 100%)',
            border: '1px solid rgba(217, 119, 6, 0.25)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.6rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                {t('settings.data.v2_title')}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {t('settings.data.v2_stats')}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenImportModal}
            className="btn btn-primary"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.78rem', gap: '0.35rem' }}
          >
            <Database size={14} />
            <span>{t('settings.data.load_v2')}</span>
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
          <button
            type="button"
            onClick={handleExportCsv}
            className="btn btn-secondary"
            style={{ padding: '0.65rem', fontSize: '0.82rem', gap: '0.45rem', justifyContent: 'center' }}
          >
            <Download size={16} style={{ color: 'var(--accent)' }} />
            <span>{t('settings.data.export_csv')}</span>
          </button>

          <button
            type="button"
            onClick={onOpenImportModal}
            className="btn btn-secondary"
            style={{ padding: '0.65rem', fontSize: '0.82rem', gap: '0.45rem', justifyContent: 'center' }}
          >
            <Upload size={16} style={{ color: 'var(--accent)' }} />
            <span>{t('settings.data.import_csv')}</span>
          </button>
        </div>
      </div>

      {/* 5. Maintenance / Danger Zone */}
      <div
        className="card"
        style={{
          padding: '1.1rem 1.25rem',
          background: 'rgba(239, 68, 68, 0.04)',
          border: '1px dashed rgba(239, 68, 68, 0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Trash2 size={18} style={{ color: 'var(--danger)' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--danger)' }}>
                {t('settings.danger.title')}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {t('settings.danger.desc')}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClearLocalDb}
            className="btn"
            style={{
              padding: '0.45rem 0.85rem',
              fontSize: '0.78rem',
              background: 'var(--danger)',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
            }}
          >
            {t('settings.danger.clear_btn')}
          </button>
        </div>
      </div>

      {/* 6. System & Version Footer */}
      <div
        className="card"
        style={{
          padding: '1.25rem',
          textAlign: 'center',
          background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
        }}
      >
        <Logo size={42} showText={true} showTagline={false} />
        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginTop: '0.65rem', flexWrap: 'wrap' }}>
          <span className="badge badge-amber" style={{ fontSize: '0.7rem' }}>{t('app.name')} v3.0</span>
          <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>{t('settings.footer.offline_badge')}</span>
          <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>IndexedDB</span>
        </div>
      </div>
    </div>
  );
};

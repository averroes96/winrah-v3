// ============================================================================
// WINRAH - Settings & Tools Tab (Paramètres & Outils)
// Consolidates Application Settings, Active Warehouse, Language,
// Cloud Sync, CSV Import/Export, and Database Maintenance in one clean place.
// ============================================================================

import React, { useState, useEffect } from 'react';
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
  Clock,
  Download,
  Upload,
  Trash2,
  Wifi,
  WifiOff,
  ChevronRight,
  ShieldCheck,
  FileSpreadsheet,
  Layers,
  Database,
  Info,
} from 'lucide-react';
import { syncEngine, SyncEngineStatus } from '../lib/syncEngine';
import { db } from '../db/indexedDb';
import { Warehouse, Area, Section, ShoeModel, ModelSection, SyncQueueItem, SyncLog } from '../types';
import { useI18n } from '../i18n';
import { Logo } from './Logo';
import { exportCatalogToCsv, downloadBlob } from '../lib/csvHelper';
import { fetchFirebaseDatabase, isFirebaseConfigured, SyncProgressUpdate } from '../lib/firebaseClient';
import { fetchServerDatabase } from '../lib/appwriteClient';
import { initBaseWarehouse } from '../db/seedData';

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
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [isFetchingServer, setIsFetchingServer] = useState(false);
  const [isPushingServer, setIsPushingServer] = useState(false);
  const [isDeduplicating, setIsDeduplicating] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressUpdate | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<{ success: boolean; text: string } | null>(null);
  const [isAdvancedSyncOpen, setIsAdvancedSyncOpen] = useState(false);
  const [isMaintenanceConfirmOpen, setIsMaintenanceConfirmOpen] = useState(false);

  useEffect(() => {
    loadSyncData();
    return syncEngine.subscribe(setSyncStatus);
  }, []);

  const loadSyncData = async () => {
    const q = await db.getAll<SyncQueueItem>('sync_queue');
    setConflicts(q.filter((c) => c.status === 'pending'));

    const logs = await db.getAll<SyncLog>('sync_logs');
    setSyncLogs(logs.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()));
  };

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
          text: 'Synchronisation terminée : tout est à jour.',
        });
      } else {
        setStatusFeedback({
          success: true,
          text: `Synchronisation réussie ! ${res.pushed} modification(s) locale(s) envoyée(s).`,
        });
      }
      await loadSyncData();
      onRefreshData();
    } catch (err: any) {
      setStatusFeedback({
        success: false,
        text: `Erreur de synchronisation : ${err.message || err}`,
      });
    } finally {
      setSyncProgress(null);
    }
  };

  const handleFetchServerDb = async () => {
    setIsFetchingServer(true);
    setStatusFeedback(null);
    try {
      const res = isFirebaseConfigured()
        ? await fetchFirebaseDatabase(true, (p) => setSyncProgress(p))
        : await fetchServerDatabase(true, (p) => setSyncProgress(p));
      const targetName = isFirebaseConfigured() ? 'Firebase Firestore' : 'Appwrite';
      setStatusFeedback({
        success: true,
        text: `Base locale réinitialisée et base serveur (${targetName}) téléchargée avec succès (${res.total} enregistrements chargés).`,
      });
      await loadSyncData();
      onRefreshData();
    } catch (err: any) {
      setStatusFeedback({
        success: false,
        text: `Erreur lors du téléchargement : ${err.message || err}`,
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
        text: `Base locale poussée vers le serveur avec succès (${res.pushed} enregistrements).`,
      });
      await loadSyncData();
      onRefreshData();
    } catch (err: any) {
      setStatusFeedback({
        success: false,
        text: `Erreur lors de l'envoi vers le serveur : ${err.message || err}`,
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
          text: 'Aucun doublon trouvé. La base de données est saine.',
        });
      } else {
        setStatusFeedback({
          success: true,
          text: `Nettoyage réussi : ${totalRemoved} doublon(s) supprimé(s).`,
        });
        onRefreshData();
      }
    } catch (err: any) {
      setStatusFeedback({
        success: false,
        text: `Erreur de nettoyage des doublons : ${err.message || err}`,
      });
    } finally {
      setIsDeduplicating(false);
    }
  };

  const handleClearLocalDb = async () => {
    if (window.confirm('Supprimer l’intégralité des données locales ?\nCette action va vider IndexedDB et réinitialiser un entrepôt BASE propre.')) {
      setStatusFeedback(null);
      try {
        await initBaseWarehouse();
        setStatusFeedback({
          success: true,
          text: 'Base de données locale vidée avec succès. Entrepôt BASE vierge réinitialisé.',
        });
        await loadSyncData();
        onRefreshData();
      } catch (err: any) {
        setStatusFeedback({
          success: false,
          text: `Erreur lors du nettoyage : ${err.message || err}`,
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
      text: `Catalogue exporté (${models.length} modèles). Fichier téléchargé : ${filename}`,
    });
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
            Paramètres & Outils
          </h2>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Configuration générale, synchronisation et gestion des données
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
                Entrepôt Actif
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {activeWarehouse ? activeWarehouse.name : 'Aucun entrepôt'}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {warehouses.length} entrepôt(s) disponible(s) • {models.length} modèles
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenWarehouseModal}
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
          >
            Changer
          </button>
        </div>
      </div>

      {/* 2. Language Selector */}
      <div className="card" style={{ padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Globe size={18} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontSize: '0.92rem', fontWeight: 800, margin: 0 }}>
            Langue de l'application / لغة التطبيق
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
            <span>العربية (Par défaut)</span>
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
            <span>Français</span>
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
              <div style={{ fontSize: '0.98rem', fontWeight: 800 }}>Synchronisation Cloud</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {syncStatus.lastSyncedAt
                  ? `Dernière synchro : ${new Date(syncStatus.lastSyncedAt).toLocaleTimeString()}`
                  : 'Dernière synchro : Jamais'}
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
            <span>{syncStatus.isOnline ? 'En ligne' : 'Hors ligne'}</span>
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
            {syncStatus.pendingChangesCount} modification(s) en attente
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
              {conflicts.length} conflit(s)
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
          <span>{syncStatus.isSyncing ? 'Synchronisation en cours...' : 'Synchroniser maintenant'}</span>
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
            <span>Télécharger serveur</span>
          </button>

          <button
            type="button"
            onClick={handlePushServerDb}
            disabled={isPushingServer || !syncStatus.isOnline}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '0.55rem', gap: '0.4rem', justifyContent: 'center' }}
          >
            <CloudUpload size={15} className={isPushingServer ? 'animate-spin' : ''} />
            <span>Envoyer au serveur</span>
          </button>

          <button
            type="button"
            onClick={onOpenDevicePairing}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '0.55rem', gap: '0.4rem', justifyContent: 'center' }}
          >
            <QrCode size={15} />
            <span>Échange QR direct</span>
          </button>

          <button
            type="button"
            onClick={handleDeduplicateLocalDb}
            disabled={isDeduplicating}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '0.55rem', gap: '0.4rem', justifyContent: 'center' }}
          >
            <CheckCircle2 size={15} className={isDeduplicating ? 'animate-spin' : ''} />
            <span>Nettoyer doublons</span>
          </button>
        </div>
      </div>

      {/* 4. Data Management: Import & Export CSV */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <FileSpreadsheet size={18} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0 }}>
            Données & Catalogue (CSV)
          </h3>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
          Sauvegardez votre catalogue sur votre téléphone ou importez un fichier CSV (compatible v2 et v3).
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
          <button
            type="button"
            onClick={handleExportCsv}
            className="btn btn-secondary"
            style={{ padding: '0.65rem', fontSize: '0.82rem', gap: '0.45rem', justifyContent: 'center' }}
          >
            <Download size={16} style={{ color: 'var(--accent)' }} />
            <span>Exporter CSV</span>
          </button>

          <button
            type="button"
            onClick={onOpenImportModal}
            className="btn btn-secondary"
            style={{ padding: '0.65rem', fontSize: '0.82rem', gap: '0.45rem', justifyContent: 'center' }}
          >
            <Upload size={16} style={{ color: 'var(--accent)' }} />
            <span>Importer CSV</span>
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
                Zone de maintenance locale
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Réinitialise la base locale de cet appareil
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
            Vider la base
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
          <span className="badge badge-amber" style={{ fontSize: '0.7rem' }}>WINRAH v3.0</span>
          <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>100% Hors-ligne</span>
          <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>IndexedDB</span>
        </div>
      </div>
    </div>
  );
};

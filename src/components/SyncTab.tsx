// ============================================================================
// WINRAH - Sync Tab & Conflict Resolution Center (FR-7.1 - FR-7.7)
// Manages offline dirty queue, version-vector conflict resolution,
// device-to-device pairing launcher, and Supabase live credentials.
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Database,
  AlertTriangle,
  QrCode,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  GitMerge,
  CloudDownload,
  CloudUpload,
  Trash2,
} from 'lucide-react';
import { syncEngine, SyncEngineStatus } from '../lib/syncEngine';
import { db } from '../db/indexedDb';
import { SyncQueueItem, SyncLog } from '../types';
import { initBaseWarehouse } from '../db/seedData';

import { fetchServerDatabase, SyncProgressUpdate } from '../lib/appwriteClient';

interface SyncTabProps {
  onOpenDevicePairing: () => void;
  onRefreshData: () => void;
}

export const SyncTab: React.FC<SyncTabProps> = ({
  onOpenDevicePairing,
  onRefreshData,
}) => {
  const [status, setStatus] = useState<SyncEngineStatus>({
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

  useEffect(() => {
    loadData();
    return syncEngine.subscribe(setStatus);
  }, []);

  const loadData = async () => {
    const q = await db.getAll<SyncQueueItem>('sync_queue');
    setConflicts(q.filter((c) => c.status === 'pending'));

    const logs = await db.getAll<SyncLog>('sync_logs');
    setSyncLogs(logs.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()));
  };

  const handleSyncNow = async () => {
    setStatusFeedback(null);
    try {
      const res = await syncEngine.syncNow((p) => setSyncProgress(p));
      await db.deduplicateLocalDatabase();
      if (res.pushed === 0 && res.pulled === 0) {
        setStatusFeedback({
          success: true,
          text: 'Synchronisation terminée : Base locale et serveur déjà synchronisés et résolus sans doublon.',
        });
      } else {
        setStatusFeedback({
          success: true,
          text: `Synchronisation réussie ! ${res.pushed} envoyés vers le serveur, ${res.pulled} reçus et résolus.${res.conflicts > 0 ? ` (${res.conflicts} conflits détectés)` : ''}`,
        });
      }
      await loadData();
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
          text: 'Aucun doublon détecté : la base locale est parfaitement saine et canonique.',
        });
      } else {
        setStatusFeedback({
          success: true,
          text: `Résolution terminée : ${res.modelsRemoved} doublons de modèles éliminés, ${res.sectionsRemoved} rayons fusionnés, ${res.assignmentsRemoved} assignations dédupliquées.`,
        });
      }
      await loadData();
      onRefreshData();
    } catch (err: any) {
      setStatusFeedback({
        success: false,
        text: `Erreur lors de la résolution des doublons : ${err.message || err}`,
      });
    } finally {
      setIsDeduplicating(false);
    }
  };

  const handlePushAllLocalDb = async () => {
    setIsPushingServer(true);
    setStatusFeedback(null);
    try {
      const res = await syncEngine.pushAllToAppwrite((p) => setSyncProgress(p));
      setStatusFeedback({
        success: true,
        text: `Base locale envoyée vers Appwrite avec succès ! ${res.pushed} éléments enregistrés sur le serveur.`,
      });
      await loadData();
      onRefreshData();
    } catch (err: any) {
      setStatusFeedback({
        success: false,
        text: `Erreur lors de l'envoi vers le serveur : ${err.message || err}`,
      });
    } finally {
      setIsPushingServer(false);
      setSyncProgress(null);
    }
  };

  const handleSimulateConflict = async () => {
    await syncEngine.injectSimulatedConflict();
    await loadData();
    onRefreshData();
  };

  const handleResolveConflict = async (
    conflictId: string,
    resolution: 'accept_device' | 'accept_server'
  ) => {
    await syncEngine.resolveConflict(conflictId, resolution);
    await loadData();
    onRefreshData();
  };

  const handleFetchServerDb = async () => {
    setIsFetchingServer(true);
    setStatusFeedback(null);
    try {
      const res = await fetchServerDatabase(true, (p) => setSyncProgress(p));
      setStatusFeedback({
        success: true,
        text: `Base serveur téléchargée avec succès ! ${res.total} enregistrements chargés (${res.models} modèles, ${res.sections} rayons, ${res.warehouses} entrepôts).`,
      });
      await loadData();
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

  const handleClearLocalDb = async () => {
    if (window.confirm('Supprimer l’intégralité des données locales ?\nCette action va vider IndexedDB et réinitialiser un entrepôt BASE propre.')) {
      await initBaseWarehouse();
      setStatusFeedback({
        success: true,
        text: 'Base de données locale vidée avec succès. Entrepôt BASE vierge réinitialisé.',
      });
      await loadData();
      onRefreshData();
    }
  };


  return (
    <div className="fade-in">
      {/* Top Sync Hero Card */}
      <div
        className="card"
        style={{
          padding: '1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-sm)',
              background: status.isOnline ? 'var(--success-light)' : 'var(--danger-light)',
              color: status.isOnline ? 'var(--success)' : 'var(--danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Database size={24} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                {status.isOnline ? 'Prêt à synchroniser' : 'Mode Hors-ligne actif'}
              </h2>
              <span className={`badge ${status.isOnline ? 'badge-emerald' : 'badge-rose'}`}>
                {status.isOnline ? 'Connecté' : 'Déconnecté'}
              </span>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Dernière synchro :{' '}
              {status.lastSyncedAt
                ? new Date(status.lastSyncedAt).toLocaleString()
                : 'Jamais'}
            </p>
          </div>
        </div>

        {/* Action Buttons: 1-Click Server DB Fetch, Push Local to Server, Sync Now & QR */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handlePushAllLocalDb}
            disabled={isPushingServer || !status.isOnline}
            className="btn"
            style={{
              gap: '0.45rem',
              fontSize: '0.85rem',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              padding: '0.55rem 0.9rem',
              fontWeight: 700,
            }}
            title="Envoyer l'intégralité des données locales vers le serveur Appwrite"
          >
            <CloudUpload size={16} className={isPushingServer ? 'animate-spin' : ''} />
            <span>{isPushingServer ? 'Envoi...' : 'Envoyer base locale'}</span>
          </button>

          <button
            type="button"
            onClick={handleFetchServerDb}
            disabled={isFetchingServer || !status.isOnline}
            className="btn"
            style={{
              gap: '0.45rem',
              fontSize: '0.85rem',
              background: '#059669',
              color: '#ffffff',
              border: 'none',
              padding: '0.55rem 0.9rem',
              fontWeight: 700,
            }}
            title="Télécharger l'ensemble des données du serveur Appwrite dans la base locale avec déduplication intégrale"
          >
            <CloudDownload size={16} className={isFetchingServer ? 'animate-spin' : ''} />
            <span>{isFetchingServer ? 'Téléchargement...' : 'Télécharger base serveur'}</span>
          </button>

          <button
            type="button"
            onClick={handleDeduplicateLocalDb}
            disabled={isDeduplicating}
            className="btn"
            style={{
              gap: '0.45rem',
              fontSize: '0.85rem',
              background: '#7c3aed',
              color: '#ffffff',
              border: 'none',
              padding: '0.55rem 0.9rem',
              fontWeight: 700,
            }}
            title="Résoudre, fusionner et éliminer automatiquement tous les doublons de la base locale"
          >
            <CheckCircle2 size={16} className={isDeduplicating ? 'animate-spin' : ''} />
            <span>{isDeduplicating ? 'Résolution...' : 'Résoudre doublons'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenDevicePairing}
            className="btn btn-indigo"
            style={{ gap: '0.45rem', fontSize: '0.85rem' }}
            title="Échanger des données directement entre deux téléphones sans réseau (FR-7.4)"
          >
            <QrCode size={16} />
            <span>Échange QR Direct (FR-7.4)</span>
          </button>

          <button
            type="button"
            onClick={handleSyncNow}
            disabled={status.isSyncing || !status.isOnline}
            className="btn btn-primary"
            style={{ gap: '0.45rem', fontSize: '0.85rem' }}
          >
            <RefreshCw size={16} className={status.isSyncing ? 'animate-spin' : ''} />
            <span>{status.isSyncing ? 'Synchronisation...' : 'Synchroniser maintenant'}</span>
          </button>
        </div>
      </div>

      {syncProgress && (
        <div
          className="fade-in"
          style={{
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1rem',
            background: 'var(--surface-color)',
            border: '1px solid var(--primary-light)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>
              <RefreshCw size={15} className="animate-spin" style={{ color: 'var(--primary-color)' }} />
              <span>{syncProgress.message}</span>
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary-color)' }}>
              {syncProgress.percentage}%
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: '8px',
              backgroundColor: 'rgba(0, 0, 0, 0.08)',
              borderRadius: '999px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${syncProgress.percentage}%`,
                height: '100%',
                backgroundColor: 'var(--primary-color)',
                borderRadius: '999px',
                transition: 'width 0.25s ease',
              }}
            />
          </div>
        </div>
      )}

      {statusFeedback && (
        <div
          className="fade-in"
          style={{
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1rem',
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

      {/* Conflict Resolution Center (FR-7.6) */}
      {conflicts.length > 0 ? (
        <div
          className="card fade-in"
          style={{
            padding: '1.25rem',
            marginBottom: '1rem',
            border: '1px solid var(--danger)',
            background: 'var(--danger-light)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <AlertTriangle size={20} style={{ color: 'var(--danger)' }} />
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--danger)' }}>
                Conflits de synchronisation détectés ({conflicts.length})
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Deux appareils ont modifié la même fiche. Choisissez quelle version conserver (FR-7.6).
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {conflicts.map((c) => (
              <div
                key={c.id}
                style={{
                  background: 'var(--bg-page)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span className="ref-code" style={{ fontSize: '1rem' }}>
                    {c.payload.reference_code || c.entity_type}
                  </span>
                  <span className="badge badge-rose" style={{ fontSize: '0.72rem' }}>
                    Conflit Version (Serveur: v{c.server_version} vs Appareil: v{c.device_version})
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '0.75rem',
                    marginBottom: '1rem',
                    fontSize: '0.8rem',
                  }}
                >
                  {/* Device Version Card */}
                  <div
                    style={{
                      background: 'var(--accent-light)',
                      border: '1px solid var(--accent)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.75rem',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--accent-dark)', marginBottom: '0.35rem' }}>
                      Version de cet appareil
                    </div>
                    <div>Nom : {c.payload.name || 'N/A'}</div>
                    <div>Prix : {c.payload.price ? `${c.payload.price} DA` : 'N/A'}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                      Modifié hors-ligne
                    </div>
                  </div>

                  {/* Server Version Card */}
                  <div
                    style={{
                      background: 'var(--info-light)',
                      border: '1px solid var(--info)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.75rem',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--info)', marginBottom: '0.35rem' }}>
                      Version du Serveur Central
                    </div>
                    <div>Enregistrement actif sur le serveur</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                      Modifié par un autre opérateur
                    </div>
                  </div>
                </div>

                {/* Conflict Resolution Buttons */}
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => handleResolveConflict(c.id, 'accept_device')}
                    className="btn btn-primary"
                    style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}
                  >
                    Conserver version appareil
                  </button>

                  <button
                    type="button"
                    onClick={() => handleResolveConflict(c.id, 'accept_server')}
                    className="btn btn-secondary"
                    style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}
                  >
                    Conserver version serveur
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Test Tool: Conflict Simulator Button */
        <div
          className="card"
          style={{
            padding: '1rem 1.25rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            background: 'var(--accent-light)',
            border: '1px dashed var(--accent)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Sparkles size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                Test local : Simuler un conflit hors-ligne (FR-7.6)
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Génère instantanément un conflit simulé pour tester l'écran de résolution manuelle
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSimulateConflict}
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
          >
            Créer un conflit test
          </button>
        </div>
      )}

      {/* Maintenance / Danger Zone: Reset Local Database */}
      <div
        className="card"
        style={{
          padding: '1rem 1.25rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          background: 'rgba(239, 68, 68, 0.05)',
          border: '1px dashed rgba(239, 68, 68, 0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <Trash2 size={18} style={{ color: 'var(--danger)' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--danger)' }}>
              Zone de maintenance : Vider la base locale
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Supprime tous les modèles, rayons et transferts de l'appareil et recrée un entrepôt BASE vierge
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleClearLocalDb}
          className="btn"
          style={{
            padding: '0.45rem 0.9rem',
            fontSize: '0.8rem',
            background: 'var(--danger)',
            color: '#ffffff',
            border: 'none',
            fontWeight: 700,
          }}
        >
          Vider la base locale
        </button>
      </div>


      {/* Sync Audit History */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Clock size={18} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>Historique des synchronisations</h3>
        </div>

        {syncLogs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Aucune session de synchronisation enregistrée.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {syncLogs.slice(0, 8).map((log) => (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.65rem 0.85rem',
                  background: 'var(--bg-page)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                }}
              >
                <div>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', marginRight: '0.5rem' }}>
                    {log.direction === 'device_to_device'
                      ? '📱 Échange Direct Pair-à-Pair'
                      : '☁️ Synchro Serveur'}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {log.records_pushed} poussés, {log.records_pulled} tirés, {log.conflicts} conflits
                  </span>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  {new Date(log.started_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

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
  Settings,
  Sparkles,
  ArrowRight,
  GitMerge,
  ExternalLink,
} from 'lucide-react';
import { syncEngine, SyncEngineStatus } from '../lib/syncEngine';
import { db } from '../db/indexedDb';
import { SyncQueueItem, SyncLog } from '../types';


import {
  getAppwriteConfig,
  saveAppwriteConfig,
  testAppwriteConnection,
} from '../lib/appwriteClient';

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

  const initialCfg = getAppwriteConfig();
  const [appwriteEndpoint, setAppwriteEndpoint] = useState(initialCfg.endpoint);
  const [appwriteProjectId, setAppwriteProjectId] = useState(initialCfg.projectId);
  const [appwriteDatabaseId, setAppwriteDatabaseId] = useState(initialCfg.databaseId);
  const [isSavedAppwrite, setIsSavedAppwrite] = useState(false);
  const [isTestingAppwrite, setIsTestingAppwrite] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

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
    await syncEngine.syncNow();
    await loadData();
    onRefreshData();
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

  const handleSaveAppwriteConfig = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    saveAppwriteConfig({
      endpoint: appwriteEndpoint,
      projectId: appwriteProjectId,
      databaseId: appwriteDatabaseId,
    });
    setIsSavedAppwrite(true);
    setTimeout(() => setIsSavedAppwrite(false), 2500);
    syncEngine.syncNow();
  };

  const handleTestAppwrite = async () => {
    handleSaveAppwriteConfig();
    setIsTestingAppwrite(true);
    setTestResult(null);
    try {
      const res = await testAppwriteConnection();
      setTestResult(res);
    } finally {
      setIsTestingAppwrite(false);
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

        {/* Action Buttons: Sync Now & Device-to-Device QR */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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

      {/* Appwrite Database Live Configuration */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={18} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>
              Connexion Appwrite Database (Cloud ou Auto-hébergé)
            </h3>
          </div>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '0.2rem 0.6rem',
              borderRadius: 'var(--radius-full)',
              background: status.mode === 'appwrite' ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-input)',
              color: status.mode === 'appwrite' ? '#059669' : 'var(--text-muted)',
            }}
          >
            {status.mode === 'appwrite' ? '● Mode Appwrite Actif' : '○ Mode Simulateur Local'}
          </span>
        </div>

        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Par défaut, WINRAH fonctionne à 100% hors-ligne avec IndexedDB. Si vous possédez un serveur
          Appwrite (Cloud ou Docker auto-hébergé), renseignez vos identifiants pour synchroniser
          vos modèles, rayons et transferts. (Consultez <code style={{ color: 'var(--accent-dark)' }}>/appwrite/APPWRITE_GUIDE.md</code>).
        </p>

        <form onSubmit={handleSaveAppwriteConfig} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
              Appwrite API Endpoint :
            </label>
            <input
              type="text"
              className="input-control"
              placeholder="https://cloud.appwrite.io/v1 ou http://192.168.1.50/v1"
              value={appwriteEndpoint}
              onChange={(e) => setAppwriteEndpoint(e.target.value)}
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Par défaut : https://cloud.appwrite.io/v1
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                Project ID :
              </label>
              <input
                type="text"
                className="input-control"
                placeholder="ex: winrah-project ou 673abc123..."
                value={appwriteProjectId}
                onChange={(e) => setAppwriteProjectId(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                Database ID :
              </label>
              <input
                type="text"
                className="input-control"
                placeholder="winrah_db"
                value={appwriteDatabaseId}
                onChange={(e) => setAppwriteDatabaseId(e.target.value)}
              />
            </div>
          </div>

          {testResult && (
            <div
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.78rem',
                fontWeight: 600,
                background: testResult.success ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                color: testResult.success ? '#059669' : '#b91c1c',
                border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
              }}
            >
              {testResult.message}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleTestAppwrite}
              disabled={isTestingAppwrite || !appwriteProjectId.trim()}
              className="btn btn-secondary"
              style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}
            >
              {isTestingAppwrite ? 'Test en cours...' : 'Tester la connexion'}
            </button>

            <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}>
              Enregistrer configuration
            </button>

            {isSavedAppwrite && (
              <span style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 700 }}>
                ✓ Configuration enregistrée !
              </span>
            )}
          </div>
        </form>
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

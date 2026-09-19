// ============================================================================
// WINRAH - Device-to-Device Offline Pairing Modal (FR-7.4, TDD §8)
// Facilitates direct data exchange between two phones with zero network
// via a pairing QR code and portable JSON changeset format.
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  QrCode,
  X,
  Share2,
  Download,
  Upload,
  CheckCircle2,
  Copy,
  Check,
  AlertCircle,
} from 'lucide-react';
import QRCode from 'qrcode';
import { syncEngine } from '../lib/syncEngine';
import { DeviceChangeset, PairingQrPayload } from '../types';
import { downloadBlob } from '../lib/csvHelper';
import confetti from 'canvas-confetti';

interface DevicePairingModalProps {
  isOpen: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

export const DevicePairingModal: React.FC<DevicePairingModalProps> = ({
  isOpen,
  onSuccess,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'send' | 'receive'>('send');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [changesetJson, setChangesetJson] = useState<string>('');
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Generate pairing payload (TDD §8.2)
    const deviceId = localStorage.getItem('winrah_device_id') || 'dev-local-01';
    const payload: PairingQrPayload = {
      type: 'sw_pair',
      device_id: deviceId,
      device_name: 'Appareil Entrepôt',
      pairing_code: Math.random().toString(36).substring(2, 10).toUpperCase(),
      created_at: new Date().toISOString(),
      protocol_version: 1,
    };

    // Render QR Code Data URL
    QRCode.toDataURL(JSON.stringify(payload), {
      width: 260,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
      .then(setQrDataUrl)
      .catch(console.error);

    // Export Changeset ready for sharing
    syncEngine.exportChangeset().then((cs) => {
      setChangesetJson(JSON.stringify(cs, null, 2));
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(changesetJson);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownloadChangeset = () => {
    downloadBlob(
      changesetJson,
      `winrah_changeset_${Date.now()}.json`,
      'application/json'
    );
  };

  const handleImport = async () => {
    try {
      setImportStatus(null);
      const parsed: DeviceChangeset = JSON.parse(importJsonText);
      if (!parsed.tables) {
        throw new Error('Format de changeset invalide (clé "tables" absente).');
      }

      const res = await syncEngine.importChangeset(parsed);
      setImportStatus(`Succès : ${res.imported} enregistrements intégrés !`);
      confetti({ particleCount: 50, spread: 60 });
      onSuccess();
    } catch (err: any) {
      setImportStatus(`Erreur d'import : ${err.message}`);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 320,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="glass-panel fade-in"
        style={{
          width: '100%',
          maxWidth: '500px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--bg-surface)',
          padding: '1.5rem',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          <X size={22} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(99, 102, 241, 0.2)',
              color: '#818cf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <QrCode size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
              Échange Direct Appareil-à-Appareil (FR-7.4)
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Permet de partager les modifications sans aucun réseau internet
            </p>
          </div>
        </div>

        {/* Tab Switcher: Send vs Receive */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <button
            type="button"
            onClick={() => setActiveTab('send')}
            className={`btn ${activeTab === 'send' ? 'btn-indigo' : 'btn-secondary'}`}
            style={{ flex: 1, padding: '0.55rem', fontSize: '0.85rem' }}
          >
            1. Émettre / Partager
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('receive')}
            className={`btn ${activeTab === 'receive' ? 'btn-indigo' : 'btn-secondary'}`}
            style={{ flex: 1, padding: '0.55rem', fontSize: '0.85rem' }}
          >
            2. Réceptionner / Importer
          </button>
        </div>

        {/* Mode 1: Send / Share Changeset */}
        {activeTab === 'send' && (
          <div className="fade-in" style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Faites scanner ce QR Code d'appairage par l'autre téléphone pour établir la liaison locale,
              ou exportez le fichier de synchronisation.
            </p>

            {/* QR Code Container */}
            {qrDataUrl ? (
              <div
                style={{
                  display: 'inline-block',
                  padding: '12px',
                  background: '#ffffff',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 6px 20px rgba(0, 0, 0, 0.5)',
                  marginBottom: '1rem',
                }}
              >
                <img
                  src={qrDataUrl}
                  alt="Pairing QR Code"
                  style={{ width: '220px', height: '220px', display: 'block' }}
                />
              </div>
            ) : (
              <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Génération du QR...</div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={handleCopy}
                className="btn btn-secondary"
                style={{ fontSize: '0.82rem', gap: '0.4rem' }}
              >
                {isCopied ? <Check size={16} style={{ color: '#34d399' }} /> : <Copy size={16} />}
                <span>{isCopied ? 'Copié !' : 'Copier données'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadChangeset}
                className="btn btn-primary"
                style={{ fontSize: '0.82rem', gap: '0.4rem' }}
              >
                <Download size={16} />
                <span>Télécharger fichier (.json)</span>
              </button>
            </div>
          </div>
        )}

        {/* Mode 2: Receive / Import Changeset */}
        {activeTab === 'receive' && (
          <div className="fade-in">
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              Collez le code de synchronisation reçu de l'autre appareil pour fusionner les modèles et
              transferts sans passer par internet :
            </p>

            <textarea
              rows={8}
              className="input-control"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', marginBottom: '1rem' }}
              placeholder='Collez le JSON du changeset ici {"tables": ...}'
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
            />

            <button
              type="button"
              onClick={handleImport}
              disabled={!importJsonText.trim()}
              className="btn btn-indigo"
              style={{ width: '100%', gap: '0.5rem' }}
            >
              <Upload size={18} />
              <span>Fusionner les modifications dans la base locale</span>
            </button>

            {importStatus && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  background: importStatus.startsWith('Succès')
                    ? 'rgba(16, 185, 129, 0.15)'
                    : 'rgba(244, 63, 94, 0.15)',
                  color: importStatus.startsWith('Succès') ? '#34d399' : '#fb7185',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                }}
              >
                {importStatus}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

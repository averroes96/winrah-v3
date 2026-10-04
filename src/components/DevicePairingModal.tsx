// ============================================================================
// WINRAH - Device Pairing & Offline Data Transfer Modal (FR-7.4)
// Allows direct peer-to-peer data export/import via QR code and JSON
// Completely wipes existing DB and hubs before applying incoming data
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  QrCode,
  Download,
  Upload,
  Copy,
  Check,
  X,
  Camera,
  AlertTriangle,
  FileCode,
} from 'lucide-react';
import QRCode from 'qrcode';
import { syncEngine } from '../lib/syncEngine';
import { DeviceChangeset, PairingQrPayload } from '../types';
import { downloadBlob } from '../lib/csvHelper';
import confetti from 'canvas-confetti';
import { useI18n } from '../i18n';

interface DevicePairingModalProps {
  isOpen: boolean;
  onSuccess: () => void;
  onClose: () => void;
  onOpenScanner?: () => void;
}

export const DevicePairingModal: React.FC<DevicePairingModalProps> = ({
  isOpen,
  onSuccess,
  onClose,
  onOpenScanner,
}) => {
  const { direction, t } = useI18n();
  const [activeTab, setActiveTab] = useState<'send' | 'receive'>('send');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [changesetJson, setChangesetJson] = useState<string>('');
  const [isQrFullData, setIsQrFullData] = useState<boolean>(false);
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const deviceId = localStorage.getItem('winrah_device_id') || 'dev-local-01';
    const fallbackPayload: PairingQrPayload = {
      type: 'sw_pair',
      device_id: deviceId,
      device_name: 'Appareil Entrepôt',
      pairing_code: Math.random().toString(36).substring(2, 10).toUpperCase(),
      created_at: new Date().toISOString(),
      protocol_version: 1,
    };

    // Export Changeset ready for sharing
    syncEngine.exportChangeset().then((cs) => {
      const compactJson = JSON.stringify(cs);
      setChangesetJson(JSON.stringify(cs, null, 2));

      // If changeset is compact enough (< 2200 chars), put complete data directly in QR Code!
      const canFitInQr = compactJson.length < 2200;
      setIsQrFullData(canFitInQr);

      const qrContent = canFitInQr ? compactJson : JSON.stringify(fallbackPayload);
      QRCode.toDataURL(qrContent, {
        width: 260,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      })
        .then(setQrDataUrl)
        .catch(console.error);
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
      `winrah_export_${Date.now()}.json`,
      'application/json'
    );
  };

  const executeImport = async (jsonString: string) => {
    try {
      setImportStatus(null);
      const parsed: DeviceChangeset = JSON.parse(jsonString);
      if (!parsed.tables) {
        throw new Error(t('pairing.error_invalid'));
      }

      await syncEngine.importChangeset(parsed);
      setImportStatus(t('pairing.success'));
      confetti({ particleCount: 50, spread: 60 });
      onSuccess();
    } catch (err: any) {
      setImportStatus(`${err.message || t('pairing.error_invalid')}`);
    }
  };

  const handleManualImport = async () => {
    await executeImport(importJsonText);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        setImportJsonText(content);
        executeImport(content);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 320,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="card fade-in"
        dir={direction}
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#FFFFFF',
          color: 'var(--text-primary)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
          border: '1px solid var(--border-default)',
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
            right: direction === 'rtl' ? 'auto' : '1rem',
            left: direction === 'rtl' ? '1rem' : 'auto',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
          aria-label={t('common.close')}
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
              {t('pairing.title')}
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {t('pairing.subtitle')}
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
            {t('pairing.tab_send')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('receive')}
            className={`btn ${activeTab === 'receive' ? 'btn-indigo' : 'btn-secondary'}`}
            style={{ flex: 1, padding: '0.55rem', fontSize: '0.85rem' }}
          >
            {t('pairing.tab_receive')}
          </button>
        </div>

        {/* Mode 1: Send / Share Changeset */}
        {activeTab === 'send' && (
          <div className="fade-in" style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              {t('pairing.send_desc')}
            </p>

            {isQrFullData ? (
              <div
                style={{
                  display: 'inline-block',
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.6rem',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#059669',
                  fontWeight: 700,
                  marginBottom: '0.75rem',
                }}
              >
                {t('pairing.qr_full_data')}
              </div>
            ) : (
              <div
                style={{
                  display: 'inline-block',
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.6rem',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: '#b45309',
                  fontWeight: 600,
                  marginBottom: '0.75rem',
                }}
              >
                {t('pairing.download_json')}
              </div>
            )}

            {/* QR Code Container */}
            {qrDataUrl ? (
              <div
                style={{
                  display: 'inline-block',
                  padding: '12px',
                  background: '#ffffff',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 6px 20px rgba(0, 0, 0, 0.15)',
                  marginBottom: '1rem',
                }}
              >
                <img
                  src={qrDataUrl}
                  alt="Transfer QR Code"
                  style={{ width: '220px', height: '220px', display: 'block' }}
                />
              </div>
            ) : (
              <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>{t('common.loading')}</div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={handleCopy}
                className="btn btn-secondary"
                style={{ fontSize: '0.82rem', gap: '0.4rem' }}
              >
                {isCopied ? <Check size={16} style={{ color: '#34d399' }} /> : <Copy size={16} />}
                <span>{isCopied ? t('pairing.copied') : t('pairing.copy_json')}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadChangeset}
                className="btn btn-primary"
                style={{ fontSize: '0.82rem', gap: '0.4rem' }}
              >
                <Download size={16} />
                <span>{t('pairing.download_json')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Mode 2: Receive / Import Changeset */}
        {activeTab === 'receive' && (
          <div className="fade-in">
            {/* Warning notice about complete wipe */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#b91c1c',
                fontSize: '0.78rem',
                marginBottom: '1rem',
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>{t('common.error')}:</strong> {t('pairing.warning')}
              </div>
            </div>

            {/* Quick Actions: Scan Camera or Upload File */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
              {onOpenScanner && (
                <button
                  type="button"
                  onClick={onOpenScanner}
                  className="btn btn-primary"
                  style={{ gap: '0.45rem', fontSize: '0.82rem', padding: '0.65rem' }}
                >
                  <Camera size={16} />
                  <span>{t('pairing.scan_camera')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-secondary"
                style={{
                  gap: '0.45rem',
                  fontSize: '0.82rem',
                  padding: '0.65rem',
                  gridColumn: onOpenScanner ? 'auto' : '1 / -1',
                }}
              >
                <FileCode size={16} />
                <span>{t('pairing.import_file')}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              {t('pairing.paste_label')}
            </p>

            <textarea
              rows={6}
              className="input-control"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', marginBottom: '0.75rem' }}
              placeholder={t('pairing.paste_placeholder')}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
            />

            <button
              type="button"
              onClick={handleManualImport}
              disabled={!importJsonText.trim()}
              className="btn btn-indigo"
              style={{ width: '100%', gap: '0.5rem' }}
            >
              <Upload size={18} />
              <span>{t('pairing.apply_btn')}</span>
            </button>

            {importStatus && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  background: importStatus.includes(t('pairing.success'))
                    ? 'rgba(16, 185, 129, 0.15)'
                    : 'rgba(244, 63, 94, 0.15)',
                  color: importStatus.includes(t('pairing.success')) ? '#059669' : '#e11d48',
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

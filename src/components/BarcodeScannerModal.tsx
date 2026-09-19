// ============================================================================
// WINRAH - Barcode Scanner Modal (FR-5.4)
// Uses device camera for real barcode scanning + simulated fast-test buttons
// ============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { ScanBarcode, X, Camera, Zap, AlertCircle } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onScanSuccess: (referenceCode: string) => void;
  onClose: () => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onScanSuccess,
  onClose,
}) => {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'barcode-scanner-video-container';

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    let isMounted = true;

    const startScanner = async () => {
      try {
        setCameraError(null);
        setIsScanning(true);
        const html5Qr = new Html5Qrcode(containerId);
        scannerRef.current = html5Qr;

        await html5Qr.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 180 },
            aspectRatio: 1.33,
          },
          (decodedText) => {
            if (isMounted) {
              stopScanner();
              onScanSuccess(decodedText.trim().toUpperCase());
              onClose();
            }
          },
          () => {
            // scan failure callback (frame with no code) - silent
          }
        );
      } catch (err: any) {
        if (isMounted) {
          setCameraError(
            err?.message ||
              'Accès à la caméra non disponible (ou permission refusée). Utilisez les touches de test rapide ci-dessous.'
          );
          setIsScanning(false);
        }
      }
    };

    // Delay slightly to ensure DOM element is ready
    const t = setTimeout(startScanner, 200);

    return () => {
      isMounted = false;
      clearTimeout(t);
      stopScanner();
    };
  }, [isOpen]);

  const stopScanner = () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      scannerRef.current.stop().catch(() => {}).finally(() => {
        scannerRef.current = null;
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(10px)',
        zIndex: 300,
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
          maxWidth: '460px',
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
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(245, 158, 11, 0.2)',
              color: '#fbbf24',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ScanBarcode size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Scanner Code-Barres</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Visez l’étiquette du modèle ou du carton
            </p>
          </div>
        </div>

        {/* Video Scanner Viewfinder Container */}
        <div
          id={containerId}
          style={{
            width: '100%',
            minHeight: '220px',
            background: '#000',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            marginBottom: '1rem',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {cameraError && (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#fb7185', fontSize: '0.8rem' }}>
              <AlertCircle size={28} style={{ margin: '0 auto 0.5rem auto' }} />
              <div>{cameraError}</div>
            </div>
          )}
        </div>

        {/* Desktop / Quick Test Simulator Buttons (Ensures immediate local testability!) */}
        <div
          style={{
            padding: '0.85rem',
            background: 'rgba(9, 13, 22, 0.6)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.5rem', color: '#fbbf24', fontSize: '0.78rem', fontWeight: 700 }}>
            <Zap size={14} />
            <span>Test rapide sans caméra (Simulation codes stock) :</span>
          </div>

          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            {['HS-21', 'HS-88', 'HS-104', 'MD-45', 'NK-99'].map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => {
                  onScanSuccess(code);
                  onClose();
                }}
                className="btn btn-secondary"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}
              >
                {code}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

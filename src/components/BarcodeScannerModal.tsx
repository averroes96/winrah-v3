// ============================================================================
// WINRAH - Barcode Scanner Modal (FR-5.4)
// Uses device camera for real barcode scanning + simulated fast-test buttons
// ============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { ScanBarcode, X, Zap, AlertCircle } from 'lucide-react';
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
  const isStoppingRef = useRef<boolean>(false);
  const containerId = 'barcode-scanner-video-container';

  const stopScanner = async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    // 1. Terminate all active camera MediaStream tracks directly to instantly free hardware camera
    try {
      const container = document.getElementById(containerId);
      const video = container?.querySelector('video') as HTMLVideoElement | null;
      if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {}
        });
        video.srcObject = null;
      }
    } catch (err) {
      console.warn('Track cleanup error:', err);
    }

    // 2. Safely stop and clear Html5Qrcode instance without throwing unhandled exceptions
    const scanner = scannerRef.current;
    scannerRef.current = null;

    if (scanner) {
      try {
        if (scanner.isScanning) {
          await scanner.stop().catch(() => {});
        }
      } catch (err) {
        console.warn('Html5Qrcode synchronous stop error ignored:', err);
      }

      try {
        scanner.clear();
      } catch (err) {
        console.warn('Html5Qrcode clear error ignored:', err);
      }
    }

    setIsScanning(false);
    isStoppingRef.current = false;
  };

  const handleClose = async () => {
    await stopScanner();
    onClose();
  };

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    let isMounted = true;
    let timer: any = null;

    const startScanner = async () => {
      try {
        setCameraError(null);
        setIsScanning(true);

        // Clear container first to avoid any duplicated video/canvas nodes
        const container = document.getElementById(containerId);
        if (container) {
          container.innerHTML = '';
        }

        const html5Qr = new Html5Qrcode(containerId);
        scannerRef.current = html5Qr;

        await html5Qr.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 180 },
            aspectRatio: 1.33,
          },
          async (decodedText) => {
            if (isMounted) {
              await stopScanner();
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

    // Delay slightly to ensure DOM container is completely rendered
    timer = setTimeout(startScanner, 250);

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
      stopScanner();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="card fade-in"
        style={{
          width: '100%',
          maxWidth: '460px',
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
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'var(--bg-input)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
          aria-label="Fermer"
        >
          <X size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-light)',
              color: 'var(--accent-dark)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ScanBarcode size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>Scanner Code-Barres</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
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
            background: '#0F172A',
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
            <div style={{ padding: '1.5rem', textAlign: 'center', color: '#F87171', fontSize: '0.85rem' }}>
              <AlertCircle size={28} style={{ margin: '0 auto 0.5rem auto' }} />
              <div>{cameraError}</div>
            </div>
          )}
        </div>

        {/* Desktop / Quick Test Simulator Buttons (Ensures immediate local testability!) */}
        <div
          style={{
            padding: '0.85rem 1rem',
            background: 'var(--bg-input)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.5rem', color: 'var(--accent-dark)', fontSize: '0.78rem', fontWeight: 700 }}>
            <Zap size={14} />
            <span>Test rapide sans caméra (Simulation codes stock) :</span>
          </div>

          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            {['545-81', 'HS-21', 'HS-88', '1800-5', 'NK-99'].map((code) => (
              <button
                key={code}
                type="button"
                onClick={async () => {
                  await stopScanner();
                  onScanSuccess(code);
                  onClose();
                }}
                className="btn btn-secondary"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', background: '#FFFFFF' }}
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


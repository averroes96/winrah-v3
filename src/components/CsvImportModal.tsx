// ============================================================================
// WINRAH - CSV & Database Import Modal
// Supports V2 database dumps (1,484+ products across 101 sections) and V3 spreadsheets.
// Features format auto-detection, schema validation, preview, and 1-click execution.
// ============================================================================

import React, { useState, useRef } from 'react';
import {
  X,
  Database,
  Upload,
  Sparkles,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { Warehouse } from '../types';
import {
  parseCsvText,
  getCsvTemplate,
  detectCsvFormat,
  parseV2DatabaseCsv,
  importV2DatabaseToDb,
  importStandardCsvToDb,
  V2ParsedDatabase,
  CsvImportRow,
} from '../lib/csvHelper';
import { useI18n } from '../i18n';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  activeWarehouse: Warehouse | null;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  activeWarehouse,
}) => {
  const { t } = useI18n();

  const [csvContent, setCsvContent] = useState('');
  const [detectedFormat, setDetectedFormat] = useState<'v2' | 'v3' | 'unknown'>('unknown');
  const [parsedV2Data, setParsedV2Data] = useState<V2ParsedDatabase | null>(null);
  const [csvValidationErrors, setCsvValidationErrors] = useState<Array<{ line: number; message: string }>>([]);
  const [parsedRows, setParsedRows] = useState<CsvImportRow[]>([]);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingOriginalV2, setIsLoadingOriginalV2] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleCsvChange = (text: string) => {
    setCsvContent(text);
    setImportSuccessMessage(null);
    const fmt = detectCsvFormat(text);
    setDetectedFormat(fmt);

    if (fmt === 'v2') {
      const res = parseV2DatabaseCsv(text);
      setParsedV2Data(res);
      setCsvValidationErrors(res.errors);
      setParsedRows([]);
    } else if (fmt === 'v3') {
      const res = parseCsvText(text);
      setParsedRows(res.validRows);
      setCsvValidationErrors(res.errors);
      setParsedV2Data(null);
    } else {
      setParsedV2Data(null);
      setParsedRows([]);
      setCsvValidationErrors([]);
    }
  };

  const handleLoadOriginalV2 = async () => {
    try {
      setIsLoadingOriginalV2(true);
      setImportSuccessMessage(null);
      const resp = await fetch('/v2_database.csv');
      if (!resp.ok) throw new Error('Could not fetch /v2_database.csv');
      const text = await resp.text();
      handleCsvChange(text);
    } catch (err) {
      console.error('Failed to load v2_database.csv:', err);
      setCsvValidationErrors([{ line: 1, message: 'Impossible de charger /v2_database.csv. Veuillez sélectionner le fichier manuellement.' }]);
    } finally {
      setIsLoadingOriginalV2(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        handleCsvChange(text);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCommitCsv = async () => {
    setIsImporting(true);
    try {
      if (detectedFormat === 'v2' && parsedV2Data && parsedV2Data.products.length > 0) {
        const result = await importV2DatabaseToDb(parsedV2Data);
        setImportSuccessMessage(
          `Base initialisée avec succès ! ${result.modelsCreated.toLocaleString()} modèles et ${result.sectionsCreated} sections importés dans l'entrepôt BASE.`
        );
        setCsvContent('');
        setParsedV2Data(null);
        setDetectedFormat('unknown');
        onSuccess();
      } else if (detectedFormat === 'v3' && parsedRows.length > 0) {
        const result = await importStandardCsvToDb(parsedRows);
        setImportSuccessMessage(
          `Base initialisée avec succès ! ${result.modelsCreated.toLocaleString()} modèles importés dans l'entrepôt BASE.`
        );
        setCsvContent('');
        setParsedRows([]);
        setDetectedFormat('unknown');
        onSuccess();
      }
    } catch (err) {
      console.error('Import failed:', err);
      setCsvValidationErrors([{ line: 1, message: 'Échec de l’importation dans la base locale.' }]);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--border-default)',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(217, 119, 6, 0.12)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Database size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                Importer un Catalogue CSV
              </h3>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Fichiers compatibles WINRAH v2 et v3 (détection automatique)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-icon"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Quick Action Shortcuts */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.txt"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />

            <button
              type="button"
              onClick={handleLoadOriginalV2}
              disabled={isLoadingOriginalV2}
              className="btn btn-primary"
              style={{ fontSize: '0.78rem', padding: '0.5rem 0.85rem', flex: '1 1 auto', justifyContent: 'center' }}
            >
              {isLoadingOriginalV2 ? (
                <>
                  <Loader2 size={14} className="spin" />
                  <span>Chargement v2...</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>Charger base V2 complète (1 484 modèles)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '0.5rem 0.85rem' }}
            >
              <Upload size={14} />
              <span>Fichier local</span>
            </button>

            <button
              type="button"
              onClick={() => handleCsvChange(getCsvTemplate())}
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '0.5rem 0.85rem' }}
            >
              <FileSpreadsheet size={14} />
              <span>Modèle v3</span>
            </button>
          </div>

          {/* Success Banner */}
          {importSuccessMessage && (
            <div
              style={{
                padding: '0.85rem 1rem',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 'var(--radius-md)',
                color: '#065f46',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              <CheckCircle size={18} style={{ color: '#10b981', flexShrink: 0 }} />
              <span>{importSuccessMessage}</span>
            </div>
          )}

          {/* Detected Format Summary */}
          {detectedFormat === 'v2' && parsedV2Data && (
            <div
              style={{
                padding: '0.85rem 1rem',
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="badge badge-primary" style={{ fontSize: '0.72rem', fontWeight: 800 }}>
                  Format V2 Détecté
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {parsedV2Data.products.length.toLocaleString()} articles • {parsedV2Data.sections.length} rayons
                </span>
              </div>
            </div>
          )}

          {detectedFormat === 'v3' && (
            <div
              style={{
                padding: '0.85rem 1rem',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span className="badge badge-success" style={{ fontSize: '0.72rem', fontWeight: 800 }}>
                Format V3 Détecté
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {parsedRows.length.toLocaleString()} lignes valides prêtes à être importées
              </span>
            </div>
          )}

          {/* Errors Preview */}
          {csvValidationErrors.length > 0 && (
            <div
              style={{
                padding: '0.85rem 1rem',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--danger)', fontWeight: 700, fontSize: '0.78rem', marginBottom: '0.4rem' }}>
                <AlertCircle size={15} />
                <span>{csvValidationErrors.length} avertissement(s) de validation</span>
              </div>
              <div style={{ maxHeight: '100px', overflowY: 'auto', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                {csvValidationErrors.slice(0, 5).map((err, i) => (
                  <div key={i} style={{ marginBottom: '2px' }}>
                    Ligne {err.line}: {err.message}
                  </div>
                ))}
                {csvValidationErrors.length > 5 && (
                  <div style={{ fontStyle: 'italic', marginTop: '4px' }}>
                    + {csvValidationErrors.length - 5} autres erreurs...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Textarea for pasting */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
              Ou collez le contenu CSV brut ci-dessous :
            </label>
            <textarea
              value={csvContent}
              onChange={(e) => handleCsvChange(e.target.value)}
              placeholder="reference_code,name,section,size_range,price..."
              rows={8}
              style={{
                width: '100%',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                resize: 'vertical',
              }}
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderTop: '1px solid var(--border-default)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{ fontSize: '0.82rem' }}
          >
            {t('common.cancel')}
          </button>

          <button
            type="button"
            onClick={handleCommitCsv}
            disabled={isImporting || (detectedFormat === 'unknown' && !parsedRows.length && !parsedV2Data)}
            className="btn btn-primary"
            style={{
              fontSize: '0.82rem',
              padding: '0.55rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {isImporting ? (
              <>
                <Loader2 size={16} className="spin" />
                <span>Importation en cours...</span>
              </>
            ) : (
              <>
                <CheckCircle size={16} />
                <span>Exécuter l'importation</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

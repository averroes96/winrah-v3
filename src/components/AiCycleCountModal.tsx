// ============================================================================
// WINRAH - AI Cycle Count Modal (Feature 2)
// Physical inventory audit using Gemini Vision:
// Counts pairs per model on shelf, breaks down by size and color (from box stickers),
// and saves as a queryable InventorySnapshot in IndexedDB.
// ============================================================================

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ClipboardList,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Settings,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  Section,
  Area,
  ShoeModel,
  Warehouse,
  InventorySnapshot,
  InventoryModelSnapshot,
  InventoryPairDetail,
} from '../types';
import { db } from '../db/indexedDb';
import {
  getGeminiConfig,
  cycleCountSectionPhotos,
  AiCycleCountResult,
} from '../lib/geminiClient';
import { AiPhotoCapture } from './AiPhotoCapture';
import { useI18n } from '../i18n';

interface AiCycleCountModalProps {
  isOpen: boolean;
  onClose: () => void;
  section: Section | null;
  area: Area | null;
  activeWarehouse: Warehouse | null;
  modelsInSection: ShoeModel[];
  onSuccess: () => void;
  onOpenSettings?: () => void;
}

export const AiCycleCountModal: React.FC<AiCycleCountModalProps> = ({
  isOpen,
  onClose,
  section,
  area,
  activeWarehouse,
  modelsInSection,
  onSuccess,
  onOpenSettings,
}) => {
  const { direction, language } = useI18n();

  const [photos, setPhotos] = useState<File[]>([]);
  const [isCounting, setIsCounting] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);
  const [countedModels, setCountedModels] = useState<InventoryModelSnapshot[]>([]);
  const [step, setStep] = useState<'capture' | 'review'>('capture');
  const [isSaving, setIsSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [hasApiKey, setHasApiKey] = useState(true);

  useEffect(() => {
    if (isOpen) {
      const cfg = getGeminiConfig();
      setHasApiKey(Boolean(cfg?.apiKey));
      setPhotos([]);
      setCountedModels([]);
      setCountError(null);
      setNotes('');
      setStep('capture');
    }
  }, [isOpen]);

  if (!isOpen || !section) return null;

  const handleStartCycleCount = async () => {
    if (photos.length === 0) return;
    if (!navigator.onLine) {
      setCountError(
        language === 'ar'
          ? 'الاتصال بالإنترنت مطلوب لإجراء الجرد بالذكاء الاصطناعي.'
          : 'Une connexion Internet active est requise pour le comptage IA Gemini.'
      );
      return;
    }

    setIsCounting(true);
    setCountError(null);

    try {
      const sectionName = `${area?.name || ''} - ${section.name}`;
      const result = await cycleCountSectionPhotos(photos, modelsInSection, sectionName);

      setCountedModels(result.models || []);
      if (result.notes) {
        setNotes(result.notes);
      }
      setStep('review');
    } catch (err: any) {
      setCountError(err.message || 'Erreur lors du comptage IA');
    } finally {
      setIsCounting(false);
    }
  };

  const handleUpdateTotalPairs = (index: number, newTotal: number) => {
    setCountedModels((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        total_pairs: Math.max(0, newTotal),
      };
      return updated;
    });
  };

  const handleRemoveModel = (index: number) => {
    setCountedModels((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveSnapshot = async () => {
    if (countedModels.length === 0) return;

    setIsSaving(true);
    try {
      const warehouseId = activeWarehouse?.id || section.area_id;
      const now = new Date().toISOString();
      const snapshotId = `inv-${section.id}-${Date.now()}`;

      const totalPairs = countedModels.reduce((acc, m) => acc + (m.total_pairs || 0), 0);

      const snapshot: InventorySnapshot = {
        id: snapshotId,
        section_id: section.id,
        warehouse_id: warehouseId,
        performed_at: now,
        models: countedModels,
        total_models: countedModels.length,
        total_pairs: totalPairs,
        photo_count: photos.length,
        status: 'completed',
        notes: notes.trim() || null,
        created_at: now,
        updated_at: now,
        version: 1,
      };

      await db.put('inventory_snapshots', snapshot);

      // Log audit
      await db.logAudit({
        action: 'create',
        entity_type: 'inventory_snapshot',
        entity_id: snapshotId,
        changes: {
          sectionId: section.id,
          totalModels: countedModels.length,
          totalPairs,
        },
      });

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setCountError(err.message || 'Erreur lors de l\'enregistrement de l\'inventaire');
    } finally {
      setIsSaving(false);
    }
  };

  const totalPairsOverall = countedModels.reduce((acc, m) => acc + (m.total_pairs || 0), 0);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        dir={direction}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '580px',
          margin: '0 auto',
          background: '#FFFFFF',
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.2)',
          border: '1px solid var(--border-default)',
          borderBottom: 'none',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* Drag Pill Handle */}
        <div
          style={{
            width: '40px',
            height: '4px',
            borderRadius: '2px',
            background: 'var(--border-default)',
            margin: '10px auto 4px auto',
            flexShrink: 0,
          }}
        />

        {/* Header */}
        <div
          style={{
            padding: '0.85rem 1.25rem',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#FFFFFF',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
              }}
            >
              <ClipboardList size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                {language === 'ar' ? 'جرد كميات الرف (Cycle Count)' : 'Inventaire Cycle Count IA'}
              </h2>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {area?.name} • <strong>{section.name}</strong>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '50%',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '0.4rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.1rem 1.25rem', overflowY: 'auto', flex: 1, color: 'var(--text-primary)' }}>
          {/* Missing API Key Warning */}
          {!hasApiKey && (
            <div
              style={{
                padding: '0.85rem 1rem',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.6rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={18} style={{ color: 'var(--danger)' }} />
                <span style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>
                  {language === 'ar'
                    ? 'يرجى إدخال مفتاح Gemini API في الإعدادات.'
                    : 'Clé API Gemini manquante. Veuillez la configurer dans les Paramètres.'}
                </span>
              </div>
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', gap: '0.3rem' }}
                >
                  <Settings size={13} />
                  <span>{language === 'ar' ? 'الإعدادات' : 'Paramètres'}</span>
                </button>
              )}
            </div>
          )}

          {countError && (
            <div
              style={{
                padding: '0.75rem 1rem',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--danger)',
                fontSize: '0.8rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <AlertCircle size={16} />
              <span>{countError}</span>
            </div>
          )}

          {step === 'capture' && (
            <div>
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.12) 100%)',
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  marginBottom: '1rem',
                  fontSize: '0.82rem',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '0.3rem', color: '#10B981' }}>
                  {language === 'ar' ? 'تعليمات الجرد السريع :' : 'Instructions de comptage :'}
                </div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {language === 'ar'
                    ? 'التقط صوراً شاملة للعلب على الرف. يقرأ النموذج ملصقات العلب (REF | COLOR | SIZE) ويحسب عدد الأزواج المتوفرة لكل مقاس ولون بدقة.'
                    : 'Prenez des photos montrant l\'ensemble des boîtes sur les étagères. Gemini lira les étiquettes (REF | COLOR | SIZE) et dénombrera les paires disponibles par pointure et coloris.'}
                </div>
              </div>

              <AiPhotoCapture
                photos={photos}
                onPhotosChange={setPhotos}
                maxPhotos={5}
                disabled={isCounting}
              />

              <button
                type="button"
                onClick={handleStartCycleCount}
                disabled={photos.length === 0 || isCounting || !hasApiKey}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  marginTop: '1.25rem',
                  padding: '0.85rem',
                  fontSize: '0.95rem',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                }}
              >
                {isCounting ? (
                  <>
                    <Loader2 size={18} className="spin" />
                    <span>
                      {language === 'ar'
                        ? 'جاري فحص وتعداد العلب بالذكاء الاصطناعي...'
                        : 'Comptage des boîtes en cours par Gemini...'}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    <span>
                      {language === 'ar'
                        ? `بدء التعداد (${photos.length} صور)`
                        : `Lancer le comptage (${photos.length} photo${photos.length > 1 ? 's' : ''})`}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {step === 'review' && (
            <div>
              {/* Summary Stats Banner */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.65rem',
                  marginBottom: '1rem',
                }}
              >
                <div
                  style={{
                    padding: '0.75rem',
                    background: 'var(--surface-color)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {language === 'ar' ? 'إجمالي الموديلات' : 'Modèles détectés'}
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {countedModels.length}
                  </div>
                </div>

                <div
                  style={{
                    padding: '0.75rem',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.7rem', color: '#10B981' }}>
                    {language === 'ar' ? 'إجمالي الأزواج المعدودة' : 'Paires totales'}
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10B981' }}>
                    {totalPairsOverall}
                  </div>
                </div>
              </div>

              {/* Models List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {countedModels.map((item, idx) => (
                  <div
                    key={`${item.reference_code}-${idx}`}
                    style={{
                      padding: '0.85rem',
                      background: 'var(--surface-color)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                          {item.reference_code}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {language === 'ar' ? 'أزواج:' : 'Paires:'}
                          </span>
                          <input
                            type="number"
                            min="0"
                            value={item.total_pairs}
                            onChange={(e) =>
                              handleUpdateTotalPairs(idx, parseInt(e.target.value, 10) || 0)
                            }
                            style={{
                              width: '60px',
                              textAlign: 'center',
                              fontWeight: 800,
                              fontSize: '0.9rem',
                              padding: '0.2rem',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--accent)',
                            }}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveModel(idx)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--danger)',
                            cursor: 'pointer',
                            padding: '0.2rem',
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Breakdown by size & color */}
                    {item.details && item.details.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '0.35rem',
                          marginTop: '0.2rem',
                        }}
                      >
                        {item.details.map((det, dIdx) => (
                          <span
                            key={dIdx}
                            style={{
                              fontSize: '0.72rem',
                              padding: '2px 8px',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '12px',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            <strong>{det.size}</strong> • {det.color} :{' '}
                            <strong style={{ color: 'var(--accent)' }}>{det.quantity}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Optional Notes */}
              <div style={{ marginTop: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    marginBottom: '0.25rem',
                  }}
                >
                  {language === 'ar' ? 'ملاحظات إضافية (اختياري)' : 'Remarques (facultatif)'}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    language === 'ar'
                      ? 'أي ملاحظات حول حالة الرف أو العلب غير الواضحة...'
                      : 'Remarques sur l\'état du rayon, cartons abîmés...'
                  }
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    resize: 'none',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'review' && (
          <div
            style={{
              padding: '0.9rem 1.25rem',
              borderTop: '1px solid var(--border-default)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#FFFFFF',
            }}
          >
            <button
              type="button"
              onClick={() => setStep('capture')}
              className="btn btn-secondary"
              style={{ padding: '0.55rem 0.85rem', fontSize: '0.82rem', gap: '0.35rem' }}
            >
              <RefreshCw size={14} />
              <span>{language === 'ar' ? 'إعادة التصوير' : 'Reprendre'}</span>
            </button>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
                style={{ padding: '0.55rem 0.9rem', fontSize: '0.82rem' }}
              >
                {language === 'ar' ? 'إلغاء' : 'Annuler'}
              </button>

              <button
                type="button"
                onClick={handleSaveSnapshot}
                disabled={countedModels.length === 0 || isSaving}
                className="btn btn-primary"
                style={{
                  padding: '0.55rem 1rem',
                  fontSize: '0.85rem',
                  gap: '0.45rem',
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                }}
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    <span>{language === 'ar' ? 'جاري الحفظ...' : 'Enregistrement...'}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>
                      {language === 'ar'
                        ? `حفظ الجرد (${totalPairsOverall} زوج)`
                        : `Enregistrer l'inventaire (${totalPairsOverall} p.)`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

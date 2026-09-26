// ============================================================================
// WINRAH - AI Section Scanner Modal (Feature 1)
// Analyzes photos of a shelf section using Gemini Vision to auto-detect shoe models,
// size ranges, box colors, and shoe colors, allowing review before saving.
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Settings,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Section, Area, ShoeModel, ModelSection, Warehouse } from '../types';
import { db } from '../db/indexedDb';
import {
  getGeminiConfig,
  scanSectionPhotos,
  AiExtractedModel,
} from '../lib/geminiClient';
import { AiPhotoCapture } from './AiPhotoCapture';
import { useI18n } from '../i18n';

interface AiScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  section: Section | null;
  area: Area | null;
  activeWarehouse: Warehouse | null;
  existingModels: ShoeModel[];
  existingModelSections: ModelSection[];
  onSuccess: () => void;
  onOpenSettings?: () => void;
}

interface EditableExtractedModel extends AiExtractedModel {
  id: string;
  selected: boolean;
  colorsInput: string;
  isExistingMatch?: boolean;
  matchedModelId?: string;
}

export const AiScannerModal: React.FC<AiScannerModalProps> = ({
  isOpen,
  onClose,
  section,
  area,
  activeWarehouse,
  existingModels,
  existingModelSections,
  onSuccess,
  onOpenSettings,
}) => {
  const { direction, language } = useI18n();

  const [photos, setPhotos] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [extractedModels, setExtractedModels] = useState<EditableExtractedModel[]>([]);
  const [step, setStep] = useState<'capture' | 'review'>('capture');
  const [isSaving, setIsSaving] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true);

  // Check API key configuration on modal open
  useEffect(() => {
    if (isOpen) {
      const cfg = getGeminiConfig();
      setHasApiKey(Boolean(cfg?.apiKey));
      setPhotos([]);
      setExtractedModels([]);
      setAnalysisError(null);
      setStep('capture');
    }
  }, [isOpen]);

  if (!isOpen || !section) return null;

  const handleStartAnalysis = async () => {
    if (photos.length === 0) return;
    if (!navigator.onLine) {
      setAnalysisError(
        language === 'ar'
          ? 'الاتصال بالإنترنت مطلوب لاستخدام ميزة الذكاء الاصطناعي.'
          : 'Une connexion Internet active est requise pour utiliser l\'analyse IA Gemini.'
      );
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const sectionName = `${area?.name || ''} - ${section.name}`;
      const result = await scanSectionPhotos(photos, sectionName);

      // Map result to editable list and detect existing models in warehouse
      const mapped: EditableExtractedModel[] = (result.models || []).map((m, idx) => {
        const cleanRef = (m.reference_code || '').trim().toUpperCase();
        const existing = existingModels.find(
          (ex) => (ex.reference_code || '').trim().toUpperCase() === cleanRef
        );

        const colorsArr = Array.isArray(m.available_colors) ? m.available_colors : [];

        return {
          id: `extracted-${Date.now()}-${idx}`,
          reference_code: cleanRef || 'NOUVEAU',
          size_range: m.size_range || '36/41',
          box_color: m.box_color || '',
          available_colors: colorsArr,
          colorsInput: colorsArr.join(', '),
          notes: m.notes || '',
          selected: true,
          isExistingMatch: Boolean(existing),
          matchedModelId: existing?.id,
        };
      });

      setExtractedModels(mapped);
      setStep('review');
    } catch (err: any) {
      setAnalysisError(err.message || 'Erreur lors de l\'analyse');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleToggleSelectAll = (checked: boolean) => {
    setExtractedModels((prev) => prev.map((m) => ({ ...m, selected: checked })));
  };

  const handleUpdateItem = (id: string, updates: Partial<EditableExtractedModel>) => {
    setExtractedModels((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const handleRemoveItem = (id: string) => {
    setExtractedModels((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSaveToSection = async () => {
    const selected = extractedModels.filter((m) => m.selected && m.reference_code.trim());
    if (selected.length === 0) return;

    setIsSaving(true);
    try {
      const warehouseId = activeWarehouse?.id || section.area_id;
      const now = new Date().toISOString();

      for (const item of selected) {
        const colors = item.colorsInput
          ? item.colorsInput
              .split(/[,;/]+/)
              .map((c) => c.trim())
              .filter(Boolean)
          : item.available_colors || [];

        let modelId = item.matchedModelId;

        if (modelId) {
          // Update existing model with detected box_color and available_colors if empty
          const existing = await db.getById<ShoeModel>('models', modelId);
          if (existing) {
            const updatedModel: ShoeModel = {
              ...existing,
              box_color: item.box_color?.trim() || existing.box_color || null,
              available_colors:
                colors.length > 0
                  ? Array.from(new Set([...(existing.available_colors || []), ...colors]))
                  : existing.available_colors,
              size_range: item.size_range?.trim() || existing.size_range,
              updated_at: now,
            };
            await db.put('models', updatedModel);
          }
        } else {
          // Create new model
          const newModelId = `model-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const newModel: ShoeModel = {
            id: newModelId,
            warehouse_id: warehouseId,
            reference_code: item.reference_code.trim().toUpperCase(),
            size_range: item.size_range?.trim() || '36/41',
            box_color: item.box_color?.trim() || null,
            available_colors: colors.length > 0 ? colors : null,
            status: 'active',
            created_at: now,
            updated_at: now,
            version: 1,
          };
          await db.put('models', newModel);
          modelId = newModelId;
        }

        // Verify or create ModelSection assignment
        const allAssignments = await db.getAll<ModelSection>('model_sections');
        const existsInSection = allAssignments.some(
          (ms) => ms.model_id === modelId && ms.section_id === section.id
        );

        if (!existsInSection) {
          const newAssignment: ModelSection = {
            id: `ms-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            model_id: modelId!,
            section_id: section.id,
            assigned_at: now,
            updated_at: now,
            version: 1,
          };
          await db.put('model_sections', newAssignment);
        }
      }

      // Log audit
      await db.logAudit({
        action: 'create',
        entity_type: 'section_ai_scan',
        entity_id: section.id,
        changes: {
          scannedCount: selected.length,
          models: selected.map((s) => s.reference_code),
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
      setAnalysisError(err.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCount = extractedModels.filter((m) => m.selected).length;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        className="fade-in"
        style={{
          width: '100%',
          maxWidth: '620px',
          maxHeight: '92vh',
          backgroundColor: 'var(--bg-secondary)',
          borderTopLeftRadius: '1.25rem',
          borderTopRightRadius: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--border-color)',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
          direction,
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--surface-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 2px 8px rgba(139, 92, 246, 0.4)',
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>
                {language === 'ar' ? 'مسح Rayon بالذكاء الاصطناعي' : 'Scanner Rayon par IA'}
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
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '0.3rem',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.1rem 1.25rem', overflowY: 'auto', flex: 1 }}>
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

          {/* Analysis Error Alert */}
          {analysisError && (
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
              <span>{analysisError}</span>
            </div>
          )}

          {step === 'capture' && (
            <div>
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.12) 100%)',
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(139, 92, 246, 0.25)',
                  marginBottom: '1rem',
                  fontSize: '0.82rem',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '0.3rem', color: 'var(--accent)' }}>
                  {language === 'ar' ? 'كيفية الاستخدام :' : 'Instructions :'}
                </div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {language === 'ar'
                    ? 'التقط 1 إلى 5 صور لرفوف هذا الرف. سيقوم الذكاء الاصطناعي بقراءة ملصقات العلب (REF | COLOR | SIZE)، واستخراج كود الموديل، اللون، مقاسات الصندوق ولون العلبة تلقائياً.'
                    : 'Prenez 1 à 5 photos des étagères. L\'IA lira automatiquement les étiquettes des boîtes (REF | COLOR | SIZE), détectera la référence, le pointure, la couleur de la boîte et les coloris disponibles.'}
                </div>
              </div>

              {/* Photo capture component */}
              <AiPhotoCapture
                photos={photos}
                onPhotosChange={setPhotos}
                maxPhotos={5}
                disabled={isAnalyzing}
              />

              {/* Action button */}
              <button
                type="button"
                onClick={handleStartAnalysis}
                disabled={photos.length === 0 || isAnalyzing || !hasApiKey}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  marginTop: '1.25rem',
                  padding: '0.85rem',
                  fontSize: '0.95rem',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
                }}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 size={18} className="spin" />
                    <span>
                      {language === 'ar'
                        ? 'جاري تحليل الصور بالذكاء الاصطناعي...'
                        : 'Analyse par Gemini Vision en cours...'}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    <span>
                      {language === 'ar'
                        ? `بدء فحص الرف (${photos.length} صور)`
                        : `Lancer l'analyse du rayon (${photos.length} photo${photos.length > 1 ? 's' : ''})`}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {step === 'review' && (
            <div>
              {/* Top review header with count and re-analyze */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.85rem',
                }}
              >
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0 }}>
                    {language === 'ar' ? 'النماذج المكتشفة' : 'Modèles identifiés'} (
                    {extractedModels.length})
                  </h3>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {language === 'ar'
                      ? 'تحقق من البيانات قبل تأكيد إضافتها إلى الرف'
                      : 'Vérifiez et ajustez les informations avant validation'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setStep('capture')}
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', gap: '0.3rem' }}
                >
                  <RefreshCw size={13} />
                  <span>{language === 'ar' ? 'إعادة التصوير' : 'Reprendre'}</span>
                </button>
              </div>

              {extractedModels.length === 0 ? (
                <div
                  style={{
                    padding: '2rem 1rem',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                  }}
                >
                  <AlertCircle size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                  <div>
                    {language === 'ar'
                      ? 'لم يتم التعرف على أي موديلات بوضوح. حاول التقاط صور أقرب للملصقات.'
                      : 'Aucun modèle identifié clairement. Rapprochez la caméra des étiquettes.'}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {extractedModels.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '0.75rem',
                        background: item.selected
                          ? 'var(--surface-color)'
                          : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${
                          item.selected ? 'var(--accent)' : 'var(--border-color)'
                        }`,
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                      }}
                    >
                      {/* Row 1: Checkbox + Ref + Existing Badge + Delete */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.5rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={(e) =>
                              handleUpdateItem(item.id, { selected: e.target.checked })
                            }
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          <input
                            type="text"
                            value={item.reference_code}
                            onChange={(e) =>
                              handleUpdateItem(item.id, {
                                reference_code: e.target.value.toUpperCase(),
                              })
                            }
                            placeholder="RÉFÉRENCE"
                            style={{
                              fontWeight: 800,
                              fontSize: '0.92rem',
                              padding: '0.25rem 0.5rem',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--text-primary)',
                              width: '130px',
                            }}
                          />
                          {item.isExistingMatch ? (
                            <span
                              style={{
                                fontSize: '0.65rem',
                                padding: '2px 6px',
                                background: 'rgba(16, 185, 129, 0.15)',
                                color: '#10B981',
                                borderRadius: '4px',
                                fontWeight: 700,
                              }}
                            >
                              {language === 'ar' ? 'موجود مسبقاً' : 'Déjà en base'}
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: '0.65rem',
                                padding: '2px 6px',
                                background: 'rgba(99, 102, 241, 0.15)',
                                color: 'var(--accent)',
                                borderRadius: '4px',
                                fontWeight: 700,
                              }}
                            >
                              {language === 'ar' ? 'جديد' : 'Nouveau'}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
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

                      {/* Row 2: Size range + Box color + Available Colors */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '0.5rem',
                          fontSize: '0.78rem',
                        }}
                      >
                        <div>
                          <label
                            style={{
                              display: 'block',
                              color: 'var(--text-muted)',
                              fontSize: '0.7rem',
                              marginBottom: '2px',
                            }}
                          >
                            {language === 'ar' ? 'المقاسات / Pointure' : 'Pointures'}
                          </label>
                          <input
                            type="text"
                            value={item.size_range || ''}
                            onChange={(e) =>
                              handleUpdateItem(item.id, { size_range: e.target.value })
                            }
                            placeholder="ex: 36/41"
                            style={{
                              width: '100%',
                              padding: '0.25rem 0.45rem',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--text-primary)',
                              fontSize: '0.78rem',
                            }}
                          />
                        </div>

                        <div>
                          <label
                            style={{
                              display: 'block',
                              color: 'var(--text-muted)',
                              fontSize: '0.7rem',
                              marginBottom: '2px',
                            }}
                          >
                            {language === 'ar' ? 'لون العلبة' : 'Couleur boîte'}
                          </label>
                          <input
                            type="text"
                            value={item.box_color || ''}
                            onChange={(e) =>
                              handleUpdateItem(item.id, { box_color: e.target.value })
                            }
                            placeholder="ex: marron, blanc"
                            style={{
                              width: '100%',
                              padding: '0.25rem 0.45rem',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--text-primary)',
                              fontSize: '0.78rem',
                            }}
                          />
                        </div>
                      </div>

                      {/* Row 3: Shoe Colors (from sticker / shoe) */}
                      <div>
                        <label
                          style={{
                            display: 'block',
                            color: 'var(--text-muted)',
                            fontSize: '0.7rem',
                            marginBottom: '2px',
                          }}
                        >
                          {language === 'ar'
                            ? 'الألوان المتوفرة (من الملصق)'
                            : 'Couleurs des modèles (étiquette)'}
                        </label>
                        <input
                          type="text"
                          value={item.colorsInput}
                          onChange={(e) =>
                            handleUpdateItem(item.id, { colorsInput: e.target.value })
                          }
                          placeholder="noir, blanc, beige..."
                          style={{
                            width: '100%',
                            padding: '0.25rem 0.45rem',
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-primary)',
                            fontSize: '0.78rem',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'review' && extractedModels.length > 0 && (
          <div
            style={{
              padding: '0.9rem 1.25rem',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--surface-color)',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {selectedCount} / {extractedModels.length}{' '}
              {language === 'ar' ? 'محدد' : 'sélectionné(s)'}
            </div>

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
                onClick={handleSaveToSection}
                disabled={selectedCount === 0 || isSaving}
                className="btn btn-primary"
                style={{
                  padding: '0.55rem 1rem',
                  fontSize: '0.85rem',
                  gap: '0.45rem',
                  background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
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
                        ? `تأكيد إضافة ${selectedCount} إلى الرف`
                        : `Ajouter ${selectedCount} au rayon`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

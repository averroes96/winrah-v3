// ============================================================================
// WINRAH - Batch Model Import & Delivery Slip Scanner Modal (Feature 3)
// Allows batch inserting shoe models with their respective locations:
// 1. Auto AI recognition from delivery slip photos ("Bon de livraison")
// 2. Direct manual / paste input mode
// 3. Interactive review table with inline editing, section auto-creation & batch save
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Settings,
  Trash2,
  Plus,
  Search,
  ClipboardPaste,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Warehouse, Area, Section, ShoeModel, ModelSection } from '../types';
import { db } from '../db/indexedDb';
import {
  getGeminiConfig,
  extractModelsFromDeliverySlip,
} from '../lib/geminiClient';
import { AiPhotoCapture } from './AiPhotoCapture';
import { useI18n } from '../i18n';

export interface BatchModelItem {
  id: string;
  reference_code: string;
  location: string;
  product_name?: string | null;
  selected: boolean;
}

interface BatchModelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeWarehouse: Warehouse | null;
  sections: Section[];
  areas: Area[];
  existingModels?: ShoeModel[];
  onSuccess: () => void;
  onOpenSettings?: () => void;
}

export const BatchModelImportModal: React.FC<BatchModelImportModalProps> = ({
  isOpen,
  onClose,
  activeWarehouse,
  sections,
  areas,
  onSuccess,
  onOpenSettings,
}) => {
  const { direction, language, t } = useI18n();

  // Mode and view steps
  const [activeTab, setActiveTab] = useState<'ai' | 'manual'>('ai');
  const [photos, setPhotos] = useState<File[]>([]);
  const [manualText, setManualText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(true);

  // Review table items
  const [items, setItems] = useState<BatchModelItem[]>([]);
  const [targetAreaId, setTargetAreaId] = useState<string>('');
  const [tableSearch, setTableSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Filter active warehouse areas & sections
  const activeAreas = useMemo(() => {
    if (!activeWarehouse) return areas;
    return areas.filter((a) => a.warehouse_id === activeWarehouse.id && a.status === 'active');
  }, [areas, activeWarehouse]);

  const activeSections = useMemo(() => {
    const areaIdSet = new Set(activeAreas.map((a) => a.id));
    return sections.filter((s) => areaIdSet.has(s.area_id) && s.status === 'active');
  }, [sections, activeAreas]);

  // Map of normalized section names to Section object
  const sectionNameMap = useMemo(() => {
    const map = new Map<string, Section>();
    for (const sec of activeSections) {
      const cleanName = (sec.name || '').trim().toUpperCase();
      if (cleanName) {
        map.set(cleanName, sec);
      }
    }
    return map;
  }, [activeSections]);

  // Set default target area when areas load
  useEffect(() => {
    if (activeAreas.length > 0 && !targetAreaId) {
      setTargetAreaId(activeAreas[0].id);
    }
  }, [activeAreas, targetAreaId]);

  // Check API key configuration on modal open
  useEffect(() => {
    if (isOpen) {
      const cfg = getGeminiConfig();
      setHasApiKey(Boolean(cfg?.apiKey));
      setPhotos([]);
      setManualText('');
      setItems([]);
      setAnalysisError(null);
      setTableSearch('');
      setActiveTab('ai');
    }
  }, [isOpen]);

  // Resolve target area for a given location code (e.g. "C18" -> Area "Zone C" if exists)
  const resolveTargetAreaForLocation = (locationCode: string): Area | null => {
    if (!locationCode) return null;
    const clean = locationCode.trim().toUpperCase();

    // 1. Try to find an area whose name matches the starting letter (e.g. 'C' for 'C18' -> 'Zone C' or 'C')
    const matchLetter = clean.match(/^[A-Z]+/);
    if (matchLetter) {
      const letter = matchLetter[0];
      const matchingArea = activeAreas.find((a) => {
        const aName = a.name.trim().toUpperCase();
        return (
          aName === letter ||
          aName === `ZONE ${letter}` ||
          aName === `ZONE-${letter}` ||
          aName.startsWith(`ZONE ${letter}`) ||
          aName.startsWith(letter)
        );
      });
      if (matchingArea) return matchingArea;
    }

    // 2. Fallback to explicitly selected targetAreaId
    const fallbackArea = activeAreas.find((a) => a.id === targetAreaId);
    return fallbackArea || activeAreas[0] || null;
  };

  // Helper to check if a location already matches an existing section
  const getExistingSection = (locationCode: string): Section | null => {
    if (!locationCode) return null;
    const clean = locationCode.trim().toUpperCase();
    return sectionNameMap.get(clean) || null;
  };

  // 1. Start AI Analysis of Delivery Slip Photos
  const handleStartAiAnalysis = async () => {
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
      const result = await extractModelsFromDeliverySlip(photos);

      if (!result.items || result.items.length === 0) {
        setAnalysisError(
          language === 'ar'
            ? 'لم يتم التعرف على مراجع في الصورة. تأكد من وضوح الصورة وإضاءة كافية.'
            : 'Aucune référence identifiée dans le document. Vérifiez la netteté et l\'éclairage.'
        );
        return;
      }

      // Convert extracted items to editable items
      const newItems: BatchModelItem[] = result.items.map((it, idx) => ({
        id: `slip-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        reference_code: it.reference_code,
        location: it.location || '',
        product_name: it.product_name || null,
        selected: true,
      }));

      // Infer default target area if most items start with a specific letter (e.g. 'C')
      const firstWithLoc = newItems.find((it) => it.location);
      if (firstWithLoc) {
        const inferredArea = resolveTargetAreaForLocation(firstWithLoc.location);
        if (inferredArea) {
          setTargetAreaId(inferredArea.id);
        }
      }

      setItems(newItems);
    } catch (err: any) {
      console.error('Delivery Slip analysis error:', err);
      setAnalysisError(err.message || 'Erreur lors de l\'analyse');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 2. Parse Manual Text Input into Table
  const handleParseManualText = () => {
    if (!manualText.trim()) return;

    const lines = manualText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const parsedItems: BatchModelItem[] = [];

    lines.forEach((line, idx) => {
      // Split by whitespace, comma, or tab: e.g. "HS-55 C18" or "HS-55, C18" or "HS-55"
      const parts = line.split(/[\s,;\t]+/).filter(Boolean);
      if (parts.length === 0) return;

      const ref = parts[0].toUpperCase();
      const loc = parts.length > 1 ? parts[1].toUpperCase() : '';

      parsedItems.push({
        id: `man-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        reference_code: ref,
        location: loc,
        selected: true,
      });
    });

    if (parsedItems.length > 0) {
      setItems((prev) => [...prev, ...parsedItems]);
      setManualText('');
    }
  };

  // Item modifications
  const handleUpdateItem = (id: string, updates: Partial<BatchModelItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...updates } : it)));
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleAddNewRow = () => {
    const newItem: BatchModelItem = {
      id: `row-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      reference_code: '',
      location: '',
      selected: true,
    };
    setItems((prev) => [newItem, ...prev]);
  };

  const handleToggleSelectAll = (checked: boolean) => {
    setItems((prev) => prev.map((it) => ({ ...it, selected: checked })));
  };

  // Filtered items in review table
  const filteredItems = useMemo(() => {
    if (!tableSearch.trim()) return items;
    const q = tableSearch.trim().toUpperCase();
    return items.filter(
      (it) =>
        it.reference_code.toUpperCase().includes(q) ||
        it.location.toUpperCase().includes(q) ||
        (it.product_name && it.product_name.toUpperCase().includes(q))
    );
  }, [items, tableSearch]);

  const selectedCount = items.filter((it) => it.selected && it.reference_code.trim()).length;

  // 3. Batch Commit: Save Models, Auto-create Sections & Assign
  const handleBatchSave = async () => {
    const validItems = items.filter((it) => it.selected && it.reference_code.trim());
    if (validItems.length === 0 || !activeWarehouse) return;

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const warehouseId = activeWarehouse.id;

      // Cache existing sections in a map for dynamic updates during loop
      const dynamicSectionMap = new Map<string, Section>(sectionNameMap);

      let createdSectionsCount = 0;
      let createdModelsCount = 0;

      for (const item of validItems) {
        const cleanRef = item.reference_code.trim().toUpperCase();
        const cleanLoc = item.location ? item.location.trim().toUpperCase() : '';

        let targetSectionId: string | null = null;

        // A. Resolve or auto-create section if location specified
        if (cleanLoc) {
          if (dynamicSectionMap.has(cleanLoc)) {
            targetSectionId = dynamicSectionMap.get(cleanLoc)!.id;
          } else {
            // Section does not exist yet -> Automatically create it!
            const chosenArea = resolveTargetAreaForLocation(cleanLoc);
            const parentAreaId = chosenArea?.id || targetAreaId || activeAreas[0]?.id;

            if (parentAreaId) {
              const secSlug = cleanLoc.toLowerCase().replace(/[^a-z0-9]/g, '-');
              const newSectionId = `sec-${parentAreaId.replace(/^area-/, '')}-${secSlug}-${Date.now().toString(36).slice(-4)}`;

              const newSection: Section = {
                id: newSectionId,
                area_id: parentAreaId,
                name: cleanLoc,
                status: 'active',
                created_at: now,
                updated_at: now,
                version: 1,
                is_dirty: true,
                local_sync_status: 'pending',
              };

              await db.put('sections', newSection);
              dynamicSectionMap.set(cleanLoc, newSection);
              targetSectionId = newSectionId;
              createdSectionsCount++;
            }
          }
        }

        // B. Create Model
        const modelId = `model-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const newModel: ShoeModel = {
          id: modelId,
          warehouse_id: warehouseId,
          reference_code: cleanRef,
          name: item.product_name?.trim() || null,
          status: 'active',
          created_at: now,
          updated_at: now,
          version: 1,
          is_dirty: true,
          local_sync_status: 'pending',
        };

        await db.put('models', newModel);
        createdModelsCount++;

        // C. Assign to Section if location resolved
        if (targetSectionId) {
          const newAssignment: ModelSection = {
            id: `ms-${modelId}-${targetSectionId}`,
            model_id: modelId,
            section_id: targetSectionId,
            assigned_at: now,
            updated_at: now,
            version: 1,
            is_dirty: true,
            local_sync_status: 'pending',
          };
          await db.put('model_sections', newAssignment);
        }
      }

      // D. Record audit log
      await db.logAudit({
        action: 'create',
        entity_type: 'batch_delivery_import',
        entity_id: `batch-${Date.now()}`,
        changes: {
          warehouse_id: warehouseId,
          modelsCount: createdModelsCount,
          newSectionsCreated: createdSectionsCount,
          references: validItems.map((v) => `${v.reference_code}:${v.location || 'none'}`),
        },
      });

      // Celebration
      try {
        confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.7 },
          colors: ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B'],
        });
      } catch {
        // ignore
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to commit batch import:', err);
      alert(err.message || 'Erreur lors de l\'enregistrement par lot');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        zIndex: 1050,
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
          maxWidth: '680px',
          margin: '0 auto',
          background: '#FFFFFF',
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -12px 48px rgba(0, 0, 0, 0.22)',
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
            width: '44px',
            height: '4px',
            borderRadius: '2px',
            background: 'var(--border-default)',
            margin: '10px auto 4px auto',
            flexShrink: 0,
          }}
        />

        {/* Modal Header */}
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
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)',
              }}
            >
              <FileText size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {t('batch_import.title')}
              </h2>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                {t('batch_import.subtitle', { warehouse: activeWarehouse?.name || 'Entrepôt' })}
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

        {/* Modal Subtabs (AI Scanner vs Manual Input) */}
        <div
          style={{
            display: 'flex',
            padding: '0.5rem 1.25rem 0 1.25rem',
            background: '#FFFFFF',
            borderBottom: '1px solid var(--border-default)',
            gap: '0.5rem',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            style={{
              flex: 1,
              padding: '0.55rem 0.75rem',
              fontSize: '0.82rem',
              fontWeight: 700,
              background: activeTab === 'ai' ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
              color: activeTab === 'ai' ? 'var(--info)' : 'var(--text-secondary)',
              border: 'none',
              borderBottom: activeTab === 'ai' ? '2.5px solid var(--info)' : '2.5px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease',
            }}
          >
            <Sparkles size={16} />
            <span>{t('batch_import.tab_ai')}</span>
            {photos.length > 0 && (
              <span
                style={{
                  background: 'var(--info)',
                  color: '#fff',
                  borderRadius: '999px',
                  padding: '1px 6px',
                  fontSize: '0.65rem',
                }}
              >
                {photos.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            style={{
              flex: 1,
              padding: '0.55rem 0.75rem',
              fontSize: '0.82rem',
              fontWeight: 700,
              background: activeTab === 'manual' ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
              color: activeTab === 'manual' ? 'var(--info)' : 'var(--text-secondary)',
              border: 'none',
              borderBottom: activeTab === 'manual' ? '2.5px solid var(--info)' : '2.5px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease',
            }}
          >
            <ClipboardPaste size={16} />
            <span>{t('batch_import.tab_manual')}</span>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', flex: 1, color: 'var(--text-primary)' }}>
          {/* Missing API Key Alert for AI tab */}
          {!hasApiKey && activeTab === 'ai' && (
            <div
              style={{
                padding: '0.75rem 1rem',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <AlertCircle size={18} style={{ color: 'var(--danger)' }} />
                <span style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>
                  {language === 'ar'
                    ? 'يرجى تهيئة مفتاح Gemini API في الإعدادات.'
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
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem', gap: '0.3rem' }}
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
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--danger)',
                fontSize: '0.78rem',
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

          {/* TAB 1: AI CAMERA / GALLERY SCANNER */}
          {activeTab === 'ai' && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.05) 0%, rgba(99, 102, 241, 0.08) 100%)',
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(37, 99, 235, 0.2)',
                  marginBottom: '1rem',
                  fontSize: '0.82rem',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '0.3rem', color: 'var(--info)' }}>
                  {language === 'ar' ? 'التعرف الذكي على وصل التسليم :' : 'Reconnaissance IA du bon :'}
                </div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {t('batch_import.ai_instructions')}
                </div>
              </div>

              <AiPhotoCapture
                photos={photos}
                onPhotosChange={setPhotos}
                maxPhotos={5}
                disabled={isAnalyzing}
              />

              <button
                type="button"
                onClick={handleStartAiAnalysis}
                disabled={photos.length === 0 || isAnalyzing || !hasApiKey}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  marginTop: '0.85rem',
                  padding: '0.8rem',
                  fontSize: '0.92rem',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                  opacity: photos.length === 0 || isAnalyzing || !hasApiKey ? 0.6 : 1,
                }}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 size={18} className="spin" />
                    <span>{t('batch_import.scanning')}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    <span>
                      {t('batch_import.scan_btn')} ({photos.length})
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 2: MANUAL TEXT / PASTE INPUT */}
          {activeTab === 'manual' && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                {language === 'ar'
                  ? 'أدخل سطراً لكل موديل بالصيغة: [رقم الموديل] [الموقع]'
                  : 'Saisissez ou collez vos données (une ligne par modèle) :'}
              </div>

              <textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder={t('batch_import.manual_placeholder')}
                rows={6}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '0.85rem',
                  fontFamily: 'monospace',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  resize: 'vertical',
                  lineHeight: 1.4,
                  boxSizing: 'border-box',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleParseManualText}
                  disabled={!manualText.trim()}
                  className="btn btn-primary"
                  style={{
                    padding: '0.55rem 1rem',
                    fontSize: '0.82rem',
                    gap: '0.4rem',
                    opacity: !manualText.trim() ? 0.5 : 1,
                  }}
                >
                  <Plus size={16} />
                  <span>{t('batch_import.load_table_btn')}</span>
                </button>
              </div>
            </div>
          )}

          {/* SECTION: INTERACTIVE REVIEW TABLE */}
          {items.length > 0 && (
            <div
              style={{
                marginTop: '1rem',
                paddingTop: '1rem',
                borderTop: '1.5px dashed var(--border-default)',
              }}
            >
              {/* Table Toolbar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.65rem',
                  marginBottom: '0.75rem',
                }}
              >
                <div>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 800, margin: 0 }}>
                    {t('batch_import.models_found', { count: items.length })}
                  </h3>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {selectedCount} / {items.length} {language === 'ar' ? 'محدد' : 'sélectionné(s)'}
                  </div>
                </div>

                {/* Default Target Zone for auto-creating new sections */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {t('batch_import.target_area_label')}
                  </label>
                  <select
                    value={targetAreaId}
                    onChange={(e) => setTargetAreaId(e.target.value)}
                    style={{
                      padding: '0.35rem 0.65rem',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {activeAreas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Filter search & Quick actions */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.65rem',
                }}
              >
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search
                    size={14}
                    style={{
                      position: 'absolute',
                      left: direction === 'rtl' ? 'auto' : '0.6rem',
                      right: direction === 'rtl' ? '0.6rem' : 'auto',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)',
                    }}
                  />
                  <input
                    type="text"
                    placeholder={language === 'ar' ? 'تصفية القائمة...' : 'Filtrer les lignes...'}
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: direction === 'rtl' ? '0.35rem 2rem 0.35rem 0.5rem' : '0.35rem 0.5rem 0.35rem 2rem',
                      fontSize: '0.78rem',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleAddNewRow}
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', gap: '0.3rem', whiteSpace: 'nowrap' }}
                >
                  <Plus size={13} />
                  <span>{t('batch_import.add_row')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleSelectAll(selectedCount !== items.length)}
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                >
                  {selectedCount === items.length ? (language === 'ar' ? 'إلغاء التحديد' : 'Désélectionner') : t('batch_import.select_all')}
                </button>
              </div>

              {/* Items List */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  maxHeight: '340px',
                  overflowY: 'auto',
                  paddingRight: '2px',
                }}
              >
                {filteredItems.map((item, idx) => {
                  const existingSec = getExistingSection(item.location);
                  const resolvedArea = resolveTargetAreaForLocation(item.location);

                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: '0.6rem 0.75rem',
                        background: item.selected ? '#FFFFFF' : 'var(--bg-card)',
                        border: `1.5px solid ${item.selected ? 'var(--info)' : 'var(--border-default)'}`,
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.6rem',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {/* Checkbox + Index */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={(e) => handleUpdateItem(item.id, { selected: e.target.checked })}
                          style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--info)' }}
                        />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', width: '22px' }}>
                          #{idx + 1}
                        </span>
                      </div>

                      {/* Reference Input */}
                      <div style={{ flex: 1.2, minWidth: '110px' }}>
                        <input
                          type="text"
                          required
                          value={item.reference_code}
                          onChange={(e) => handleUpdateItem(item.id, { reference_code: e.target.value.toUpperCase() })}
                          placeholder={t('batch_import.ref_header')}
                          className="ref-code"
                          style={{
                            width: '100%',
                            padding: '0.35rem 0.55rem',
                            fontSize: '0.88rem',
                            fontWeight: 800,
                            letterSpacing: '0.03em',
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-primary)',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>

                      {/* Location Input */}
                      <div style={{ flex: 1, minWidth: '85px' }}>
                        <input
                          type="text"
                          value={item.location}
                          onChange={(e) => handleUpdateItem(item.id, { location: e.target.value.toUpperCase() })}
                          placeholder={t('batch_import.loc_header')}
                          style={{
                            width: '100%',
                            padding: '0.35rem 0.55rem',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-primary)',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>

                      {/* Status / Location badge */}
                      <div style={{ minWidth: '110px', textAlign: 'right' }}>
                        {item.location.trim() ? (
                          existingSec ? (
                            <span
                              className="badge badge-emerald"
                              style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', whiteSpace: 'nowrap' }}
                              title={`Rayon existant dans ${activeAreas.find((a) => a.id === existingSec.area_id)?.name || ''}`}
                            >
                              📍 {existingSec.name}
                            </span>
                          ) : (
                            <span
                              className="badge badge-amber"
                              style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', whiteSpace: 'nowrap' }}
                              title={`Sera créé dans ${resolvedArea?.name || 'Zone'}`}
                            >
                              ✨ +{item.location.toUpperCase()} ({resolvedArea?.name || 'Zone'})
                            </span>
                          )
                        ) : (
                          <span
                            className="badge badge-neutral"
                            style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', whiteSpace: 'nowrap' }}
                          >
                            {t('batch_import.status_no_loc')}
                          </span>
                        )}
                      </div>

                      {/* Delete Row Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          borderRadius: 'var(--radius-sm)',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
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
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
          >
            {t('common.cancel')}
          </button>

          <button
            type="button"
            onClick={handleBatchSave}
            disabled={selectedCount === 0 || isSaving}
            className="btn btn-primary"
            style={{
              padding: '0.6rem 1.25rem',
              fontSize: '0.88rem',
              fontWeight: 700,
              gap: '0.5rem',
              background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
              opacity: selectedCount === 0 || isSaving ? 0.6 : 1,
            }}
          >
            {isSaving ? (
              <>
                <Loader2 size={16} className="spin" />
                <span>{t('batch_import.saving')}</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={17} />
                <span>{t('batch_import.save_btn', { count: selectedCount })}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

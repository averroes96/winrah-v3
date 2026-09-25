// ============================================================================
// WINRAH - Quick Add Model BottomSheet
// Mobile-first intuitive bottomsheet for rapidly registering shoe models on the floor
// ============================================================================

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  X,
  ScanBarcode,
  MapPin,
  Tag,
  Layers,
  Check,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Repeat,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Warehouse, Area, Section, ShoeModel } from '../types';
import { db } from '../db/indexedDb';
import { SectionSearchSelect } from './SectionSearchSelect';

interface QuickAddModelBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  sections: Section[];
  areas: Area[];
  activeWarehouse: Warehouse | null;
  existingModels: ShoeModel[];
  onSuccess: () => void;
  onOpenScanner?: () => void;
  initialReference?: string;
}

const COMMON_SIZE_PRESETS = [
  { label: '36/41', desc: 'Femme' },
  { label: '40/45', desc: 'Homme' },
  { label: '35/40', desc: 'Mixte' },
  { label: '39/44', desc: 'Mixte' },
  { label: '28/35', desc: 'Enfant' },
  { label: 'Unique', desc: 'Accessoire' },
];

export const QuickAddModelBottomSheet: React.FC<QuickAddModelBottomSheetProps> = ({
  isOpen,
  onClose,
  sections,
  areas,
  activeWarehouse,
  existingModels,
  onSuccess,
  onOpenScanner,
  initialReference = '',
}) => {
  const [referenceCode, setReferenceCode] = useState(initialReference);
  const [name, setName] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [sizeRange, setSizeRange] = useState('');
  const [price, setPrice] = useState('');
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const refInputRef = useRef<HTMLInputElement>(null);

  // Sync initial reference if updated
  useEffect(() => {
    if (initialReference) {
      setReferenceCode(initialReference.toUpperCase());
    }
  }, [initialReference]);

  // Focus reference input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => refInputRef.current?.focus(), 250);
    }
  }, [isOpen]);

  // Check if reference already exists in database
  const isDuplicate = useMemo(() => {
    if (!referenceCode.trim()) return false;
    const q = referenceCode.trim().toUpperCase();
    return existingModels.some((m) => m.reference_code.toUpperCase() === q);
  }, [referenceCode, existingModels]);

  const selectedSection = useMemo(() => {
    return sections.find((s) => s.id === sectionId) || null;
  }, [sections, sectionId]);

  const selectedArea = useMemo(() => {
    if (!selectedSection) return null;
    return areas.find((a) => a.id === selectedSection.area_id) || null;
  }, [areas, selectedSection]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referenceCode.trim() || !activeWarehouse || isSaving) return;

    setIsSaving(true);
    const modelId = 'model-' + Date.now();
    const now = new Date().toISOString();
    const cleanRef = referenceCode.trim().toUpperCase();

    try {
      // 1. Create Shoe Model
      await db.put('models', {
        id: modelId,
        warehouse_id: activeWarehouse.id,
        reference_code: cleanRef,
        name: name.trim() || null,
        size_range: sizeRange.trim() || null,
        price: price ? parseFloat(price) : null,
        status: 'active',
        created_at: now,
        updated_at: now,
        version: 1,
        is_dirty: true,
        local_sync_status: 'pending',
      });

      // 2. Assign to section if selected
      if (sectionId) {
        await db.put('model_sections', {
          id: 'ms-' + Date.now(),
          model_id: modelId,
          section_id: sectionId,
          assigned_at: now,
          updated_at: now,
          version: 1,
          is_dirty: true,
          local_sync_status: 'pending',
        });
      }

      // 3. Log Audit Trail
      await db.logAudit({
        action: 'create',
        entity_type: 'model',
        entity_id: modelId,
        changes: {
          reference_code: cleanRef,
          name: name.trim() || null,
          warehouse_id: activeWarehouse.id,
          section_id: sectionId || null,
        },
      });

      // Micro celebration
      try {
        confetti({
          particleCount: 30,
          spread: 50,
          origin: { y: 0.8 },
          colors: ['#D97706', '#F59E0B', '#10B981'],
        });
      } catch {
        // ignore
      }

      onSuccess();

      if (isBatchMode) {
        // Keep section & size range, clear reference & description for next box
        setSuccessToast(`Modèle "${cleanRef}" enregistré avec succès !`);
        setReferenceCode('');
        setName('');
        setTimeout(() => setSuccessToast(null), 3000);
        setTimeout(() => refInputRef.current?.focus(), 100);
      } else {
        // Reset and close
        setReferenceCode('');
        setName('');
        setPrice('');
        setSizeRange('');
        setSectionId('');
        onClose();
      }
    } catch (err) {
      console.error('Failed to create model:', err);
      alert('Erreur lors de la création du modèle');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '560px',
          margin: '0 auto',
          background: '#FFFFFF',
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.16)',
          border: '1px solid var(--border-default)',
          borderBottom: 'none',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* Drag Pill Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '10px', paddingBottom: '4px' }}>
          <div
            style={{
              width: '40px',
              height: '4px',
              borderRadius: '9999px',
              background: 'var(--border-default)',
            }}
          />
        </div>

        {/* Header */}
        <div
          style={{
            padding: '0.6rem 1.25rem 0.85rem 1.25rem',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--accent-light)',
                color: 'var(--accent-dark)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <PlusCircle size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
                Ajouter un Modèle
              </h2>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Enregistrement rapide en rayon • {activeWarehouse?.name || 'Dépôt actif'}
              </span>
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
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Batch Success Toast */}
        {successToast && (
          <div
            className="fade-in"
            style={{
              background: 'var(--success-light)',
              color: 'var(--success)',
              padding: '0.5rem 1rem',
              fontSize: '0.78rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              borderBottom: '1px solid #A7F3D0',
            }}
          >
            <CheckCircle2 size={16} />
            <span>{successToast}</span>
          </div>
        )}

        {/* Scrollable Form Body */}
        <form
          onSubmit={handleSubmit}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1rem 1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {/* 1. Reference Code (Mandatory & Core) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Tag size={15} style={{ color: 'var(--accent)' }} />
                <span>1. Référence Modèle</span>
                <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                  Requis
                </span>
              </label>

              {onOpenScanner && (
                <button
                  type="button"
                  onClick={onOpenScanner}
                  style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.2rem 0.55rem',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                >
                  <ScanBarcode size={14} style={{ color: 'var(--accent)' }} />
                  <span>Scanner Code-barres</span>
                </button>
              )}
            </div>

            <input
              ref={refInputRef}
              type="text"
              required
              className="input-control ref-code"
              placeholder="Ex: HS-104, 545-81, B20..."
              value={referenceCode}
              onChange={(e) => setReferenceCode(e.target.value.toUpperCase())}
              style={{
                fontSize: '1.05rem',
                letterSpacing: '0.04em',
                fontWeight: 700,
                borderColor: referenceCode ? 'var(--accent)' : 'var(--border-default)',
              }}
            />

            {isDuplicate && (
              <div style={{ marginTop: '0.3rem', fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <AlertCircle size={13} style={{ color: 'var(--info)' }} />
                <span>Cette référence existe déjà dans le stock (plusieurs paires autorisées).</span>
              </div>
            )}
          </div>

          {/* 2. Destination Shelf / Rayon */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
              <MapPin size={15} style={{ color: 'var(--accent)' }} />
              <span>2. Rayon d'emplacement</span>
              <span className="badge badge-neutral" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                Recommandé
              </span>
            </label>

            <SectionSearchSelect
              sections={sections}
              areas={areas}
              selectedSectionId={sectionId}
              onSelectSection={setSectionId}
              placeholder="Rechercher un rayon (ex: B1, D27, Zone C)..."
            />
          </div>

          {/* 3. Size Range Selector with Instant Chips */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
              <Layers size={15} style={{ color: 'var(--accent)' }} />
              <span>3. Gamme de Pointures</span>
            </label>

            {/* Quick Preset Chips */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
              {COMMON_SIZE_PRESETS.map((preset) => {
                const isSelected = sizeRange === preset.label;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setSizeRange(isSelected ? '' : preset.label)}
                    style={{
                      padding: '0.3rem 0.65rem',
                      borderRadius: 'var(--radius-full)',
                      border: isSelected ? '1.5px solid var(--accent)' : '1px solid var(--border-default)',
                      background: isSelected ? 'var(--accent-light)' : 'var(--bg-card)',
                      color: isSelected ? 'var(--accent-dark)' : 'var(--text-secondary)',
                      fontSize: '0.75rem',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                  >
                    <span>{preset.label}</span>
                    <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>({preset.desc})</span>
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              className="input-control"
              placeholder="Sélectionnez une pointure ci-dessus ou saisie libre (ex: 38/43)..."
              value={sizeRange}
              onChange={(e) => setSizeRange(e.target.value)}
              style={{ fontSize: '0.85rem', height: '40px' }}
            />
          </div>

          {/* 4. Optional Details: Name & Price */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '0.65rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                Description / Nom (optionnel)
              </label>
              <input
                type="text"
                className="input-control"
                placeholder="Ex: Sneakers Urban..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ fontSize: '0.82rem', height: '42px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                Prix de vente (DA)
              </label>
              <input
                type="number"
                step="0.5"
                className="input-control"
                placeholder="Ex: 2490"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={{ fontSize: '0.82rem', height: '42px' }}
              />
            </div>
          </div>

          {/* Live Preview Card */}
          {referenceCode && (
            <div
              className="fade-in"
              style={{
                background: 'var(--bg-page)',
                border: '1.5px dashed var(--border-focus)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem',
              }}
            >
              <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                Aperçu de la fiche modèle
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                <div>
                  <span className="ref-code" style={{ fontSize: '1rem', color: 'var(--text-primary)', marginRight: '0.4rem' }}>
                    {referenceCode}
                  </span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {name || 'Sans description'}
                  </span>
                  {sizeRange && (
                    <span className="badge badge-neutral" style={{ marginLeft: '0.35rem', fontSize: '0.68rem' }}>
                      {sizeRange}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {selectedSection ? (
                    <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>
                      📍 {selectedSection.name} ({selectedArea?.name || 'Zone'})
                    </span>
                  ) : (
                    <span className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>
                      Non assigné
                    </span>
                  )}
                  {price && (
                    <span className="badge badge-emerald" style={{ fontSize: '0.72rem' }}>
                      {price} DA
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Sticky Bottom Actions inside Form */}
          <div
            style={{
              marginTop: '0.5rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--border-default)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
            }}
          >
            {/* Batch Mode Checkbox */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                userSelect: 'none',
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
              }}
            >
              <input
                type="checkbox"
                checked={isBatchMode}
                onChange={(e) => setIsBatchMode(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
              />
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Repeat size={13} style={{ color: 'var(--accent)' }} />
                <span>Mode Série : garder ouvert pour enregistrer plusieurs boîtes à la chaîne</span>
              </span>
            </label>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
                style={{ flex: 1, minHeight: '46px' }}
              >
                Annuler
              </button>

              <button
                type="submit"
                disabled={!referenceCode.trim() || isSaving}
                className="btn btn-primary"
                style={{
                  flex: 2,
                  minHeight: '46px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  opacity: !referenceCode.trim() || isSaving ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.45rem',
                }}
              >
                <Check size={18} />
                <span>{isBatchMode ? 'Enregistrer & Suivant' : 'Enregistrer le Modèle'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

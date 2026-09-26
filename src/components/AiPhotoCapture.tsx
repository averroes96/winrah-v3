// ============================================================================
// WINRAH - Shared AI Photo Capture Component
// Captures and manages 1 to 5 photos from camera or gallery for Gemini Vision
// ============================================================================

import React, { useRef } from 'react';
import { Camera, Image as ImageIcon, Trash2, Plus, AlertCircle } from 'lucide-react';
import { useI18n } from '../i18n';

interface AiPhotoCaptureProps {
  photos: File[];
  onPhotosChange: (photos: File[]) => void;
  maxPhotos?: number;
  disabled?: boolean;
}

export const AiPhotoCapture: React.FC<AiPhotoCaptureProps> = ({
  photos,
  onPhotosChange,
  maxPhotos = 5,
  disabled = false,
}) => {
  const { direction, language } = useI18n();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFilesAdded = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files);
    const combined = [...photos, ...newFiles].slice(0, maxPhotos);
    onPhotosChange(combined);
  };

  const handleRemovePhoto = (index: number) => {
    const updated = photos.filter((_, i) => i !== index);
    onPhotosChange(updated);
  };

  const isMaxReached = photos.length >= maxPhotos;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFilesAdded(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFilesAdded(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Action Buttons: Camera + Gallery */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={disabled || isMaxReached}
          className="btn btn-primary"
          style={{
            padding: '0.75rem 0.5rem',
            fontSize: '0.85rem',
            justifyContent: 'center',
            gap: '0.45rem',
            opacity: isMaxReached ? 0.5 : 1,
          }}
        >
          <Camera size={18} />
          <span>{language === 'ar' ? 'التقاط بالكاميرا' : 'Prendre photo'}</span>
        </button>

        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          disabled={disabled || isMaxReached}
          className="btn btn-secondary"
          style={{
            padding: '0.75rem 0.5rem',
            fontSize: '0.85rem',
            justifyContent: 'center',
            gap: '0.45rem',
            opacity: isMaxReached ? 0.5 : 1,
          }}
        >
          <ImageIcon size={18} style={{ color: 'var(--accent)' }} />
          <span>{language === 'ar' ? 'من المعرض' : 'Galerie'}</span>
        </button>
      </div>

      {/* Photo Counter & Instructions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          padding: '0 0.2rem',
        }}
      >
        <span>
          {language === 'ar'
            ? 'وجّه الكاميرا نحو ملصقات العلب (REF | COLOR | SIZE)'
            : 'Cadrez bien les étiquettes des boîtes (REF | COLOR | SIZE)'}
        </span>
        <span
          style={{
            fontWeight: 700,
            color: photos.length > 0 ? 'var(--accent)' : 'inherit',
          }}
        >
          {photos.length} / {maxPhotos}
        </span>
      </div>

      {/* Photo Thumbnails Grid */}
      {photos.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(85px, 1fr))',
            gap: '0.6rem',
            background: 'var(--surface-color, rgba(255,255,255,0.03))',
            padding: '0.6rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
          }}
        >
          {photos.map((file, index) => {
            const previewUrl = URL.createObjectURL(file);
            return (
              <div
                key={`${file.name}-${index}`}
                style={{
                  position: 'relative',
                  aspectRatio: '1',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                  border: '1px solid var(--border-color)',
                  background: '#000',
                }}
              >
                <img
                  src={previewUrl}
                  alt={`Photo ${index + 1}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                  onLoad={() => URL.revokeObjectURL(previewUrl)}
                />

                {/* Index badge */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '4px',
                    left: '4px',
                    background: 'rgba(0,0,0,0.7)',
                    color: '#fff',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: '4px',
                  }}
                >
                  #{index + 1}
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => handleRemovePhoto(index)}
                  disabled={disabled}
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    background: 'rgba(239, 68, 68, 0.85)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  title={language === 'ar' ? 'حذف الصورة' : 'Supprimer la photo'}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}

          {!isMaxReached && (
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={disabled}
              style={{
                aspectRatio: '1',
                borderRadius: 'var(--radius-sm)',
                border: '2px dashed var(--border-color)',
                background: 'transparent',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.25rem',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.7rem',
              }}
            >
              <Plus size={18} />
              <span>{language === 'ar' ? 'إضافة' : 'Ajouter'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// WINRAH - Warehouse Selector Modal (FR-1.2, FR-1.4, FR-1.5)
// Lets user select or create an active warehouse.
// ============================================================================

import React, { useState } from 'react';
import { Warehouse as WarehouseIcon, Plus, Check, X, MapPin } from 'lucide-react';
import { Warehouse } from '../types';
import { db } from '../db/indexedDb';

interface WarehouseSelectorModalProps {
  isOpen: boolean;
  warehouses: Warehouse[];
  activeWarehouseId: string | null;
  onSelectWarehouse: (id: string) => void;
  onClose: () => void;
}

export const WarehouseSelectorModal: React.FC<WarehouseSelectorModalProps> = ({
  isOpen,
  warehouses,
  activeWarehouseId,
  onSelectWarehouse,
  onClose,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState('');

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWarehouseName.trim()) return;

    const newWh: Warehouse = {
      id: 'wh-' + Date.now(),
      name: newWarehouseName.trim(),
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      is_dirty: true,
      local_sync_status: 'pending',
    };

    await db.put('warehouses', newWh);
    onSelectWarehouse(newWh.id);
    setNewWarehouseName('');
    setIsCreating(false);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 250,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
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
          maxWidth: '480px',
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
            <WarehouseIcon size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Sélection de l’entrepôt actif
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
              Les recherches et inventaires sont ciblés sur ce site
            </p>
          </div>
        </div>

        {/* Existing Warehouses List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.25rem' }}>
          {warehouses.map((w) => {
            const isSelected = w.id === activeWarehouseId;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => {
                  onSelectWarehouse(w.id);
                  onClose();
                }}
                className="card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem 1rem',
                  cursor: 'pointer',
                  border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border-default)',
                  background: isSelected ? '#FFFBEB' : '#FFFFFF',
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'left',
                  boxShadow: isSelected ? '0 0 0 1px var(--accent)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <MapPin size={20} style={{ color: isSelected ? 'var(--accent-dark)' : 'var(--text-muted)' }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: isSelected ? 'var(--accent-dark)' : 'var(--text-primary)' }}>
                      {w.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                      Créé le {new Date(w.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {isSelected && (
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Check size={16} strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Create New Warehouse Section */}
        {isCreating ? (
          <form onSubmit={handleCreate} className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <input
              type="text"
              autoFocus
              className="input-control"
              placeholder="Ex: Dépôt Marrakech Sud..."
              value={newWarehouseName}
              onChange={(e) => setNewWarehouseName(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                Enregistrer
              </button>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="btn btn-secondary"
              >
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="btn btn-secondary"
            style={{ width: '100%', gap: '0.45rem' }}
          >
            <Plus size={16} />
            <span>Créer un nouvel entrepôt</span>
          </button>
        )}
      </div>
    </div>
  );
};

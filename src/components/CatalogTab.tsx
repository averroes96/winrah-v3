// ============================================================================
// WINRAH - Catalog Tab Component (FR-2, FR-3, FR-4, FR-9.1, FR-9.2)
// Warehouse structure management (Areas, Sections), Model CRUD,
// CSV bulk import with error validation, and CSV export.
// ============================================================================

import React, { useState, useMemo } from 'react';
import {
  FolderTree,
  Plus,
  FileSpreadsheet,
  Download,
  Upload,
  Layers,
  MapPin,
  Trash2,
  CheckCircle,
  AlertCircle,
  X,
} from 'lucide-react';
import {
  Warehouse,
  Area,
  Section,
  ShoeModel,
  ModelSection,
} from '../types';
import { db } from '../db/indexedDb';
import {
  exportCatalogToCsv,
  parseCsvText,
  getCsvTemplate,
  downloadBlob,
  CsvImportRow,
} from '../lib/csvHelper';


interface CatalogTabProps {
  warehouses: Warehouse[];
  areas: Area[];
  sections: Section[];
  models: ShoeModel[];
  modelSections: ModelSection[];
  activeWarehouse: Warehouse | null;
  onRefreshData: () => void;
}

export const CatalogTab: React.FC<CatalogTabProps> = ({
  warehouses,
  areas,
  sections,
  models,
  modelSections,
  activeWarehouse,
  onRefreshData,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'structure' | 'models' | 'import'>('structure');

  // Modal states
  const [isAddAreaOpen, setIsAddAreaOpen] = useState(false);
  const [newAreaName, setNewAreaName] = useState('');

  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
  const [targetAreaId, setTargetAreaId] = useState('');
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionCapacity, setNewSectionCapacity] = useState('');
  const [bulkSectionCount, setBulkSectionCount] = useState('1');

  const [isAddModelOpen, setIsAddModelOpen] = useState(false);
  const [newModelRef, setNewModelRef] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newModelSize, setNewModelSize] = useState('36/41');
  const [newModelPrice, setNewModelPrice] = useState('');
  const [newModelSectionId, setNewModelSectionId] = useState('');
  const [modelSearchQuery, setModelSearchQuery] = useState('');

  // CSV Import State
  const [csvContent, setCsvContent] = useState('');
  const [csvValidationErrors, setCsvValidationErrors] = useState<Array<{ line: number; message: string }>>([]);
  const [parsedRows, setParsedRows] = useState<CsvImportRow[]>([]);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);

  // Filtered areas for active warehouse
  const activeAreas = useMemo(() => {
    if (!activeWarehouse) return areas;
    return areas.filter((a) => a.warehouse_id === activeWarehouse.id && a.status === 'active');
  }, [areas, activeWarehouse]);

  // Handle Add Area (FR-2.1)
  const handleCreateArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAreaName.trim() || !activeWarehouse) return;

    await db.put('areas', {
      id: 'area-' + Date.now(),
      warehouse_id: activeWarehouse.id,
      name: newAreaName.trim(),
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      is_dirty: true,
      local_sync_status: 'pending',
    });

    setNewAreaName('');
    setIsAddAreaOpen(false);
    onRefreshData();
  };

  // Handle Add Section(s) (FR-3.1, FR-3.2 Bulk)
  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetAreaId || !newSectionName.trim()) return;

    const count = parseInt(bulkSectionCount, 10) || 1;

    for (let i = 1; i <= count; i++) {
      const name = count > 1 ? `${newSectionName.trim()}-${i.toString().padStart(2, '0')}` : newSectionName.trim();

      await db.put('sections', {
        id: 'sec-' + Date.now() + '-' + i,
        area_id: targetAreaId,
        name,
        capacity: newSectionCapacity.trim() || null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
        is_dirty: true,
        local_sync_status: 'pending',
      });
    }

    setNewSectionName('');
    setNewSectionCapacity('');
    setBulkSectionCount('1');
    setIsAddSectionOpen(false);
    onRefreshData();
  };

  // Handle Add Model (FR-4.1, FR-4.3, FR-4.7)
  const handleCreateModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModelRef.trim() || !activeWarehouse) return;

    const modelId = 'model-' + Date.now();
    const now = new Date().toISOString();

    // 1. Create Model (duplicate references allowed! FR-4.7)
    await db.put('models', {
      id: modelId,
      warehouse_id: activeWarehouse.id,
      reference_code: newModelRef.trim().toUpperCase(),
      name: newModelName.trim() || null,
      size_range: newModelSize.trim() || null,
      price: newModelPrice ? parseFloat(newModelPrice) : null,
      status: 'active',
      created_at: now,
      updated_at: now,
      version: 1,
      is_dirty: true,
      local_sync_status: 'pending',
    });

    // 2. Assign to Section if selected
    if (newModelSectionId) {
      await db.put('model_sections', {
        id: 'ms-' + Date.now(),
        model_id: modelId,
        section_id: newModelSectionId,
        assigned_at: now,
        updated_at: now,
        version: 1,
        is_dirty: true,
        local_sync_status: 'pending',
      });
    }

    setNewModelRef('');
    setNewModelName('');
    setNewModelPrice('');
    setIsAddModelOpen(false);

    onRefreshData();
  };

  // CSV Validation before commit (FR-9.2)
  const handleValidateCsv = () => {
    const res = parseCsvText(csvContent);
    setCsvValidationErrors(res.errors);
    setParsedRows(res.validRows);
  };

  // Commit valid CSV rows
  const handleCommitCsv = async () => {
    if (parsedRows.length === 0 || !activeWarehouse) return;

    const now = new Date().toISOString();
    let importedCount = 0;

    for (const row of parsedRows) {
      const modelId = 'model-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);

      await db.put('models', {
        id: modelId,
        warehouse_id: activeWarehouse.id,
        reference_code: row.reference_code,
        name: row.name || null,
        size_range: row.size_range || null,
        price: row.price || null,
        photo_url: row.photo_url || null,
        status: 'active',
        created_at: now,
        updated_at: now,
        version: 1,
        is_dirty: true,
        local_sync_status: 'pending',
      });

      // If section specified, look up or assign
      if (row.section_name) {
        const sec = sections.find(
          (s) => s.name.toLowerCase() === row.section_name?.toLowerCase()
        );
        if (sec) {
          await db.put('model_sections', {
            id: 'ms-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
            model_id: modelId,
            section_id: sec.id,
            assigned_at: now,
            updated_at: now,
            version: 1,
            is_dirty: true,
            local_sync_status: 'pending',
          });
        }
      }
      importedCount++;
    }

    setImportSuccessMessage(`${importedCount} modèle(s) importé(s) avec succès !`);
    setCsvContent('');
    setParsedRows([]);

    onRefreshData();
  };

  // Export full catalog to CSV (FR-9.1)
  const handleExportCsv = () => {
    const csv = exportCatalogToCsv(models, modelSections, sections, areas, warehouses);
    const date = new Date().toISOString().split('T')[0];
    downloadBlob(csv, `winrah_catalogue_${date}.csv`);
  };

  return (
    <div className="fade-in">
      {/* Sub-tab Switcher & Export */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.45rem' }}>
          <button
            type="button"
            onClick={() => setActiveSubTab('structure')}
            className={`btn ${activeSubTab === 'structure' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}
          >
            <FolderTree size={16} />
            <span>Zones & Rayons</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('models')}
            className={`btn ${activeSubTab === 'models' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}
          >
            <Layers size={16} />
            <span>Catalogue ({models.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('import')}
            className={`btn ${activeSubTab === 'import' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}
          >
            <FileSpreadsheet size={16} />
            <span>Import CSV</span>
          </button>
        </div>

        {/* CSV Export Button (FR-9.1) */}
        <button
          type="button"
          onClick={handleExportCsv}
          className="btn btn-secondary"
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem', gap: '0.4rem' }}
          title="Exporter tout le catalogue au format CSV"
        >
          <Download size={15} style={{ color: 'var(--accent)' }} />
          <span>Export CSV</span>
        </button>
      </div>

      {/* 1. Structure View: Zones & Rayons Drilldown */}
      {activeSubTab === 'structure' && (
        <div className="fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>
              Structure : {activeWarehouse?.name}
            </h3>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setIsAddAreaOpen(true)}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
              >
                <Plus size={14} />
                <span>Créer Zone</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (activeAreas.length > 0) setTargetAreaId(activeAreas[0].id);
                  setIsAddSectionOpen(true);
                }}
                disabled={activeAreas.length === 0}
                className="btn btn-primary"
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
              >
                <Plus size={14} />
                <span>Créer Rayon(s)</span>
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {activeAreas.map((area) => {
              const areaSections = sections.filter(
                (s) => s.area_id === area.id && s.status === 'active'
              );

              return (
                <div key={area.id} className="card" style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <MapPin size={18} style={{ color: 'var(--accent)' }} />
                      <h4 style={{ fontSize: '1rem', fontWeight: 800 }}>{area.name}</h4>
                      <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                        {areaSections.length} rayon(s)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setTargetAreaId(area.id);
                        setIsAddSectionOpen(true);
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '0.3rem 0.65rem', fontSize: '0.72rem' }}
                    >
                      + Rayon
                    </button>
                  </div>

                  {/* Section Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.65rem' }}>
                    {areaSections.map((sec) => {
                      const prodsInSection = modelSections.filter((ms) => ms.section_id === sec.id);

                      return (
                        <div
                          key={sec.id}
                          style={{
                            background: 'var(--bg-page)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-md)',
                            padding: '0.75rem',
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                            {sec.name}
                          </div>
                          {sec.capacity && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              Capacité : {sec.capacity}
                            </div>
                          )}
                          <div style={{ marginTop: '0.45rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {prodsInSection.length} modèle(s) présent(s)
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Models Catalog View */}
      {activeSubTab === 'models' && (
        <div className="fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Fiches Modèles ({models.length})</h3>
            <button
              type="button"
              onClick={() => setIsAddModelOpen(true)}
              className="btn btn-primary"
              style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
            >
              <Plus size={16} />
              <span>Ajouter un modèle</span>
            </button>
          </div>

          {/* Quick search input */}
          <div style={{ marginBottom: '0.85rem' }}>
            <input
              type="text"
              className="input-control"
              placeholder="Filtrer par référence ou nom (ex: HS-21)…"
              value={modelSearchQuery}
              onChange={(e) => setModelSearchQuery(e.target.value)}
              style={{ fontSize: '0.8125rem' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {models
              .filter((m) => {
                if (!modelSearchQuery.trim()) return true;
                const q = modelSearchQuery.trim().toUpperCase();
                return (
                  m.reference_code.toUpperCase().includes(q) ||
                  (m.name && m.name.toUpperCase().includes(q))
                );
              })
              .map((m) => (
              <div
                key={m.id}
                className="card"
                style={{
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <span className="ref-code" style={{ fontSize: '1rem', marginRight: '0.5rem' }}>
                    {m.reference_code}
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {m.name || 'Sans description'}
                  </span>
                  {m.size_range && (
                    <span className="badge badge-neutral" style={{ marginLeft: '0.45rem', fontSize: '0.7rem' }}>
                      {m.size_range}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {m.price && (
                    <span className="badge badge-emerald" style={{ fontSize: '0.75rem' }}>
                      {m.price} DH
                    </span>
                  )}
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {new Date(m.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. CSV Import View (FR-4.5, FR-9.2) */}
      {activeSubTab === 'import' && (
        <div className="card fade-in" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Import CSV en masse</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Validation automatique des colonnes avant validation
              </p>
            </div>

            <button
              type="button"
              onClick={() => setCsvContent(getCsvTemplate())}
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
            >
              Insérer modèle d'exemple
            </button>
          </div>

          <textarea
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            rows={8}
            className="input-control"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', marginBottom: '1rem' }}
            placeholder="Collez le texte CSV ici..."
          />

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={handleValidateCsv}
              disabled={!csvContent.trim()}
              className="btn btn-secondary"
            >
              1. Valider le format CSV
            </button>

            <button
              type="button"
              onClick={handleCommitCsv}
              disabled={parsedRows.length === 0 || csvValidationErrors.length > 0}
              className="btn btn-primary"
            >
              2. Importer ({parsedRows.length} lignes valides)
            </button>
          </div>

          {/* Validation Errors */}
          {csvValidationErrors.length > 0 && (
            <div
              style={{
                padding: '0.85rem',
                background: 'var(--danger-light)',
                border: '1px solid var(--danger)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '1rem',
              }}
            >
              <h4 style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Erreurs de validation détectées :
              </h4>
              <ul style={{ paddingLeft: '1.25rem', fontSize: '0.8rem', color: 'var(--danger)' }}>
                {csvValidationErrors.map((err, i) => (
                  <li key={i}>
                    Ligne {err.line} : {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {importSuccessMessage && (
            <div
              style={{
                padding: '0.85rem',
                background: 'var(--success-light)',
                border: '1px solid var(--success)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--success)',
                fontSize: '0.85rem',
                fontWeight: 700,
              }}
            >
              {importSuccessMessage}
            </div>
          )}
        </div>
      )}

      {/* Modal: Add Area (FR-2.1) */}
      {isAddAreaOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 250,
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: '420px', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>
              Nouvelle Zone ({activeWarehouse?.name})
            </h3>
            <form onSubmit={handleCreateArea}>
              <input
                type="text"
                autoFocus
                className="input-control"
                placeholder="Ex: Zone Baskets Homme"
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
                style={{ marginBottom: '1rem' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Créer
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddAreaOpen(false)}
                  className="btn btn-secondary"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Section(s) (FR-3.1, FR-3.2) */}
      {isAddSectionOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 250,
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>
              Nouveau Rayon / Emplacement
            </h3>
            <form onSubmit={handleCreateSection} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  Zone parente :
                </label>
                <select
                  value={targetAreaId}
                  onChange={(e) => setTargetAreaId(e.target.value)}
                  className="input-control"
                >
                  {activeAreas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  Nom ou Préfixe (Ex: Rayon A-01 ou Rayon B) :
                </label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ex: Rayon R-10"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  Nombre à générer en série (FR-3.2 Bulk) :
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  className="input-control"
                  value={bulkSectionCount}
                  onChange={(e) => setBulkSectionCount(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  Capacité ou notes (optionnel, FR-3.5) :
                </label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ex: 50 cartons, Étagère haute..."
                  value={newSectionCapacity}
                  onChange={(e) => setNewSectionCapacity(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Créer
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddSectionOpen(false)}
                  className="btn btn-secondary"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Model (FR-4.1, FR-4.3, FR-4.7) */}
      {isAddModelOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 250,
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: '460px', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.25rem' }}>
              Ajouter une fiche modèle
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Les doublons de référence sont autorisés (FR-4.7) et désambiguïsés automatiquement.
            </p>

            <form onSubmit={handleCreateModel} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  Code Référence * (ex: HS-21) :
                </label>
                <input
                  type="text"
                  required
                  className="input-control ref-code"
                  placeholder="HS-21"
                  value={newModelRef}
                  onChange={(e) => setNewModelRef(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  Description / Nom :
                </label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ex: Sneakers Urban Flow Blanche"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                    Pointures (FR-4.1) :
                  </label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="36/41"
                    value={newModelSize}
                    onChange={(e) => setNewModelSize(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                    Prix (DH) :
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    className="input-control"
                    placeholder="249.00"
                    value={newModelPrice}
                    onChange={(e) => setNewModelPrice(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  Associer immédiatement à un rayon :
                </label>
                <select
                  value={newModelSectionId}
                  onChange={(e) => setNewModelSectionId(e.target.value)}
                  className="input-control"
                >
                  <option value="">-- Aucun pour l’instant --</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Enregistrer
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddModelOpen(false)}
                  className="btn btn-secondary"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

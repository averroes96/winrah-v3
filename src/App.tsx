// ============================================================================
// WINRAH - Main Application Shell
// Full offline-first Shoe Warehouse Locator with tactile floor-friendly UX
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  ArrowRightLeft,
  Layers,
  Database,
  BarChart3,
  QrCode,
  ScanBarcode,
} from 'lucide-react';
import { Header } from './components/Header';
import { SearchTab } from './components/SearchTab';
import { TransfersTab } from './components/TransfersTab';
import { CatalogTab } from './components/CatalogTab';
import { SyncTab } from './components/SyncTab';
import { AnalyticsTab } from './components/AnalyticsTab';

import { WarehouseSelectorModal } from './components/WarehouseSelectorModal';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { TransferModal } from './components/TransferModal';
import { ModelDetailModal } from './components/ModelDetailModal';
import { DevicePairingModal } from './components/DevicePairingModal';

import { db } from './db/indexedDb';
import { seedDemoData } from './db/seedData';
import {
  Warehouse,
  Area,
  Section,
  ShoeModel,
  ModelSection,
  TransferLog,
  SearchLog,
  AuditLog,
  DisambiguatedModelResult,
} from './types';

type ActiveTab = 'search' | 'transfers' | 'catalog' | 'sync' | 'analytics';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('search');

  // Database state
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [models, setModels] = useState<ShoeModel[]>([]);
  const [modelSections, setModelSections] = useState<ModelSection[]>([]);
  const [transfers, setTransfers] = useState<TransferLog[]>([]);
  const [searchLogs, setSearchLogs] = useState<SearchLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Active warehouse selection (FR-1.4, FR-1.5)
  const [activeWarehouseId, setActiveWarehouseId] = useState<string | null>(
    localStorage.getItem('winrah_active_warehouse_id')
  );

  // Modal visibility states
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);

  // Transfer modal state
  const [transferTargetModel, setTransferTargetModel] = useState<ShoeModel | null>(null);
  const [transferFromSectionId, setTransferFromSectionId] = useState<string | undefined>(undefined);

  // Model detail modal state
  const [detailModalItem, setDetailModalItem] = useState<DisambiguatedModelResult | null>(null);

  // Search query state
  const [searchQuery, setSearchQuery] = useState('');

  const isSeedingRef = React.useRef(false);

  // Load all local data from IndexedDB
  const refreshData = useCallback(async () => {
    if (isSeedingRef.current) return;
    await db.init();
    const [w, a, s, m, ms, t, sl, al] = await Promise.all([
      db.getAll<Warehouse>('warehouses'),
      db.getAll<Area>('areas'),
      db.getAll<Section>('sections'),
      db.getAll<ShoeModel>('models'),
      db.getAll<ModelSection>('model_sections'),
      db.getAll<TransferLog>('transfers'),
      db.getAll<SearchLog>('search_logs'),
      db.getAll<AuditLog>('audit_logs'),
    ]);

    // If empty on first launch, auto-seed with realistic Moroccan sample data
    if (w.length === 0 && !isSeedingRef.current) {
      isSeedingRef.current = true;
      try {
        await seedDemoData();
      } finally {
        isSeedingRef.current = false;
      }
      return;
    }

    setWarehouses(w);
    setAreas(a);
    setSections(s);
    setModels(m);
    setModelSections(ms);
    setTransfers(t.sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime()));
    setSearchLogs(sl.sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime()));
    setAuditLogs(al);

    // Sync active warehouse ID with available warehouses
    const storedWh = localStorage.getItem('winrah_active_warehouse_id');
    if (storedWh && w.some((item) => item.id === storedWh)) {
      setActiveWarehouseId(storedWh);
    } else if (w.length > 0) {
      setActiveWarehouseId(w[0].id);
      localStorage.setItem('winrah_active_warehouse_id', w[0].id);
    }
  }, []);

  useEffect(() => {
    refreshData();
    return db.subscribe(refreshData);
  }, [refreshData]);

  const activeWarehouse = warehouses.find((w) => w.id === activeWarehouseId) || null;

  const handleSelectWarehouse = (id: string) => {
    setActiveWarehouseId(id);
    localStorage.setItem('winrah_active_warehouse_id', id);
  };

  const handleStartTransfer = (model: ShoeModel, fromSecId?: string) => {
    setTransferTargetModel(model);
    setTransferFromSectionId(fromSecId);
  };

  const handleBarcodeScanned = (code: string) => {
    // When a barcode is scanned, switch to search tab and pre-fill query
    setSearchQuery(code);
    setActiveTab('search');
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <Header
        activeWarehouse={activeWarehouse}
        warehouses={warehouses}
        onOpenWarehouseModal={() => setIsWarehouseModalOpen(true)}
        onOpenSyncTab={() => setActiveTab('sync')}
        onRefreshData={refreshData}
      />

      {/* Main Tab Views */}
      <main style={{ minHeight: '65vh' }}>
        {activeTab === 'search' && (
          <SearchTab
            models={models}
            modelSections={modelSections}
            sections={sections}
            areas={areas}
            warehouses={warehouses}
            activeWarehouse={activeWarehouse}
            onOpenBarcodeScanner={() => setIsBarcodeModalOpen(true)}
            onInitiateTransfer={handleStartTransfer}
            onViewModelDetails={(item) => setDetailModalItem(item)}
            query={searchQuery}
            onQueryChange={setSearchQuery}
          />
        )}

        {activeTab === 'transfers' && (
          <TransfersTab
            models={models}
            modelSections={modelSections}
            sections={sections}
            areas={areas}
            warehouses={warehouses}
            activeWarehouse={activeWarehouse}
            transfers={transfers}
            onRefreshData={refreshData}
          />
        )}

        {activeTab === 'catalog' && (
          <CatalogTab
            warehouses={warehouses}
            areas={areas}
            sections={sections}
            models={models}
            modelSections={modelSections}
            activeWarehouse={activeWarehouse}
            onRefreshData={refreshData}
          />
        )}

        {activeTab === 'sync' && (
          <SyncTab
            onOpenDevicePairing={() => setIsPairingModalOpen(true)}
            onRefreshData={refreshData}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsTab
            searchLogs={searchLogs}
            transfers={transfers}
            auditLogs={auditLogs}
            models={models}
            sections={sections}
            areas={areas}
            activeWarehouse={activeWarehouse}
          />
        )}
      </main>

      {/* Floor-Friendly Mobile Bottom Navigation Bar (FR Usability) */}
      <nav className="bottom-nav">
        <button
          type="button"
          onClick={() => setActiveTab('search')}
          className={`nav-item ${activeTab === 'search' ? 'active' : ''}`}
        >
          <Search size={20} />
          <span>Trouver</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('transfers')}
          className={`nav-item ${activeTab === 'transfers' ? 'active' : ''}`}
        >
          <ArrowRightLeft size={20} />
          <span>Transférer</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`nav-item ${activeTab === 'catalog' ? 'active' : ''}`}
        >
          <Layers size={20} />
          <span>Structure</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sync')}
          className={`nav-item ${activeTab === 'sync' ? 'active' : ''}`}
        >
          <Database size={20} />
          <span>Synchro</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('analytics')}
          className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
        >
          <BarChart3 size={20} />
          <span>Audit & Gaps</span>
        </button>
      </nav>

      {/* Modals */}
      <WarehouseSelectorModal
        isOpen={isWarehouseModalOpen}
        warehouses={warehouses}
        activeWarehouseId={activeWarehouseId}
        onSelectWarehouse={handleSelectWarehouse}
        onClose={() => setIsWarehouseModalOpen(false)}
      />

      <BarcodeScannerModal
        isOpen={isBarcodeModalOpen}
        onScanSuccess={handleBarcodeScanned}
        onClose={() => setIsBarcodeModalOpen(false)}
      />

      <TransferModal
        model={transferTargetModel}
        fromSectionId={transferFromSectionId}
        sections={sections}
        areas={areas}
        activeWarehouse={activeWarehouse}
        onSuccess={refreshData}
        onClose={() => setTransferTargetModel(null)}
      />

      <ModelDetailModal
        item={detailModalItem}
        transfers={transfers}
        sections={sections}
        onInitiateTransfer={handleStartTransfer}
        onClose={() => setDetailModalItem(null)}
      />

      <DevicePairingModal
        isOpen={isPairingModalOpen}
        onSuccess={refreshData}
        onClose={() => setIsPairingModalOpen(false)}
      />
    </div>
  );
}

export default App;

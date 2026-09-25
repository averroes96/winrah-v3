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
  Plus,
  QrCode,
  ScanBarcode,
} from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { Header } from './components/Header';
import { SearchTab } from './components/SearchTab';
import { TransfersTab } from './components/TransfersTab';
import { CatalogTab } from './components/CatalogTab';
import { SyncTab } from './components/SyncTab';

import { WarehouseSelectorModal } from './components/WarehouseSelectorModal';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { TransferModal } from './components/TransferModal';
import { ModelDetailModal } from './components/ModelDetailModal';
import { DevicePairingModal } from './components/DevicePairingModal';
import { QuickAddModelBottomSheet } from './components/QuickAddModelBottomSheet';

import { db } from './db/indexedDb';
import { initBaseWarehouse } from './db/seedData';
import { syncEngine } from './lib/syncEngine';
import { useI18n } from './i18n';
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

type ActiveTab = 'search' | 'transfers' | 'catalog' | 'sync';

export function App() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<ActiveTab>('search');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [scannerTargetCallback, setScannerTargetCallback] = useState<((code: string) => void) | null>(null);
  const [quickAddInitialRef, setQuickAddInitialRef] = useState('');

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

    // One-time purge of previous local DB content to ensure clean BASE warehouse
    const DB_RESET_KEY = 'winrah_reset_clean_base_v4';
    if (!localStorage.getItem(DB_RESET_KEY)) {
      localStorage.setItem(DB_RESET_KEY, 'true');
      isSeedingRef.current = true;
      try {
        await initBaseWarehouse();
      } finally {
        isSeedingRef.current = false;
      }
      return;
    }

    // One-time cleanup of legacy single-character / empty search logs
    const CLEAN_SEARCH_LOGS_KEY = 'winrah_clean_fragmented_search_logs_v1';
    if (!localStorage.getItem(CLEAN_SEARCH_LOGS_KEY)) {
      localStorage.setItem(CLEAN_SEARCH_LOGS_KEY, 'true');
      await db.cleanupFragmentedSearchLogs();
    }

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

    // If empty on first launch/login, auto-create the BASE warehouse
    if (w.length === 0 && !isSeedingRef.current) {
      isSeedingRef.current = true;
      try {
        await initBaseWarehouse();
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
    setAuditLogs(al.sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime()));

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

  const handleBarcodeScanned = async (code: string) => {
    if (scannerTargetCallback) {
      scannerTargetCallback(code);
      setScannerTargetCallback(null);
      return;
    }

    const trimmed = code.trim();
    // Check if scanned QR code contains peer database / changeset transfer
    if (trimmed.startsWith('{') && (trimmed.includes('"tables"') || trimmed.includes('"from_device_id"'))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.tables) {
          const res = await syncEngine.importChangeset(parsed);
          alert(`Transfert QR Code réussi ! La base locale et les entrepôts ont été réinitialisés avec ${res.imported} enregistrements.`);
          refreshData();
          return;
        }
      } catch (err) {
        console.warn('Scanned QR code JSON parse failed:', err);
      }
    }

    setSearchQuery(code);
    setActiveTab('search');
  };

  // Intercept Android hardware Back Button to gracefully close modals and navigate without white-screening
  useEffect(() => {
    let listenerPromise: any = null;
    try {
      listenerPromise = CapApp.addListener('backButton', ({ canGoBack }) => {
        // 0. If Quick Add bottomsheet is open, close it
        if (isQuickAddOpen) {
          setIsQuickAddOpen(false);
          return;
        }
        // 1. If Barcode Scanner modal is open, close it cleanly!
        if (isBarcodeModalOpen) {
          setIsBarcodeModalOpen(false);
          return;
        }
        // 2. If Warehouse modal is open, close it
        if (isWarehouseModalOpen) {
          setIsWarehouseModalOpen(false);
          return;
        }
        // 3. If Pairing modal is open, close it
        if (isPairingModalOpen) {
          setIsPairingModalOpen(false);
          return;
        }
        // 4. If Transfer modal is open, close it
        if (transferTargetModel) {
          setTransferTargetModel(null);
          return;
        }
        // 5. If Detail modal is open, close it
        if (detailModalItem) {
          setDetailModalItem(null);
          return;
        }
        // 6. If on any tab other than search, switch to search
        if (activeTab !== 'search') {
          setActiveTab('search');
          return;
        }
        // 7. If on main search with no modals, minimize/exit
        if (canGoBack) {
          window.history.back();
        } else {
          CapApp.exitApp();
        }
      });
    } catch (e) {
      console.warn('CapApp backButton listener setup ignored (web mode):', e);
    }

    return () => {
      if (listenerPromise) {
        listenerPromise.then((handle: any) => handle?.remove?.()).catch(() => {});
      }
    };
  }, [
    isBarcodeModalOpen,
    isWarehouseModalOpen,
    isPairingModalOpen,
    transferTargetModel,
    detailModalItem,
    activeTab,
  ]);

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
            onOpenQuickAdd={() => {
              setQuickAddInitialRef('');
              setIsQuickAddOpen(true);
            }}
            onNavigateToSearch={(q) => {
              setActiveTab('search');
              if (q) setSearchQuery(q);
            }}
          />
        )}

        {activeTab === 'sync' && (
          <SyncTab
            onOpenDevicePairing={() => setIsPairingModalOpen(true)}
            onRefreshData={refreshData}
          />
        )}
      </main>

      {/* Floor-Friendly Mobile Bottom Navigation Bar with Center Quick Add Button */}
      <nav className="bottom-nav">
        <button
          type="button"
          onClick={() => setActiveTab('search')}
          className={`nav-item ${activeTab === 'search' ? 'active' : ''}`}
        >
          <Search size={20} />
          <span>{t('nav.search')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('transfers')}
          className={`nav-item ${activeTab === 'transfers' ? 'active' : ''}`}
        >
          <ArrowRightLeft size={20} />
          <span>{t('nav.transfers')}</span>
        </button>

        {/* Center Prominent Quick Add Model Button */}
        <button
          type="button"
          onClick={() => {
            setQuickAddInitialRef('');
            setIsQuickAddOpen(true);
          }}
          className="nav-item"
          style={{
            position: 'relative',
            top: '-8px',
            background: 'transparent',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            cursor: 'pointer',
            padding: '0',
          }}
          title={t('modal.quick_add.title')}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(217, 119, 6, 0.4), 0 2px 4px rgba(0, 0, 0, 0.1)',
              transition: 'transform 0.15s ease',
            }}
          >
            <Plus size={24} strokeWidth={2.6} />
          </div>
          <span
            style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              color: 'var(--accent)',
              marginTop: '2px',
            }}
          >
            {t('nav.add')}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`nav-item ${activeTab === 'catalog' ? 'active' : ''}`}
        >
          <Layers size={20} />
          <span>{t('nav.structure')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sync')}
          className={`nav-item ${activeTab === 'sync' ? 'active' : ''}`}
        >
          <Database size={20} />
          <span>{t('nav.sync')}</span>
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
        onOpenScanner={() => {
          setIsPairingModalOpen(false);
          setIsBarcodeModalOpen(true);
        }}
      />

      {/* Quick Add Model BottomSheet */}
      <QuickAddModelBottomSheet
        isOpen={isQuickAddOpen}
        onClose={() => {
          setIsQuickAddOpen(false);
          setScannerTargetCallback(null);
        }}
        sections={sections}
        areas={areas}
        activeWarehouse={activeWarehouse}
        existingModels={models}
        initialReference={quickAddInitialRef}
        onSuccess={refreshData}
        onOpenScanner={() => {
          setScannerTargetCallback(() => (scannedCode: string) => {
            setQuickAddInitialRef(scannedCode);
            setIsQuickAddOpen(true);
          });
          setIsBarcodeModalOpen(true);
        }}
      />
    </div>
  );
}

export default App;

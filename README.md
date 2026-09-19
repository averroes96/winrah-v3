# WINRAH — Shoe Warehouse Management App (v3.0)

> **Codename:** `winrah` (وين راه — *"Where is it?"*)  
> Mobile-first, offline-first application designed for shoe warehouse operations.

---

## 👟 Overview & Philosophy

Traditional shoe warehouses struggle with slow retrieval and lost stock because inventory tracking is manual or tied to unreliable internet connections in large concrete/metal warehouse facilities.

**WINRAH** solves this with an **offline-first** design:
1. **Tracks Location, NOT Quantities:** The app’s primary job is to answer *"Where is model HS-21 right now?"* rather than counting units.
2. **Duplicate References Allowed & Disambiguated (FR-4.7 & FR-4.8):** Different entries can share the same reference code (e.g. `HS-21`). The app automatically disambiguates them in search and edit views with an auto-generated display index (`HS-21 (1)`, `HS-21 (2)`), current section, and creation date.
3. **100% Offline-First (IndexedDB):** All writes, searches, and transfers happen locally first and are never lost on crash or force-close.
4. **Device-to-Device Offline Exchange (FR-7.4):** Two phones on the warehouse floor with zero network connection can exchange data directly via an appairing QR code and portable JSON changeset.
5. **Zero-Result Search Gap Detection (FR-8.2, FR-8.3):** Every search is logged. Failed searches immediately flag potential stock or labeling gaps in an analytics dashboard.

---

## 🚀 Quick Start (Local Testing)

The dev server runs locally with zero setup or external dependencies:

```bash
cd winrah-v3
npm install
npm run dev
```

Open your browser at **`http://localhost:5173/`** (or access from your mobile phone on the same Wi-Fi using the displayed network IP).

---

## 🧪 Interactive Local Test Guide

WINRAH comes equipped with built-in test tools directly accessible from the UI:

| Feature | How to Test Locally in 1 Click |
|---|---|
| **1-Click Demo Data** | Click the **`Démo`** button in the top header. It loads realistic Moroccan warehouse data: Dépôt Central (Casablanca) & Annexe Nord (Tanger), zones, sections, transfers, and duplicate reference models (`HS-21`). |
| **Search & Disambiguation (FR-4.8)** | In the search bar, type `HS-21`. Notice how it immediately presents both `HS-21 (1)` (Rayon A-01) and `HS-21 (2)` (Rayon A-02) with distinct visual badges and locations. |
| **Zero-Result Gap Alert (FR-8.3)** | Type a non-existent code like `NK-99`. Switch to the **`Audit & Gaps`** tab to see it flagged in the "Recherches sans résultat" gap detection alert! |
| **Stock Transfer & Undo (FR-6.6)** | Click **`Transférer`** on any card. Select a destination section (e.g., Rayon B-01) and confirm. Notice the 15-second **`Annuler`** banner enabling instant rollback! |
| **Offline Simulator Toggle** | Click the **`En ligne` / `Hors-ligne`** button in the header. Make changes while offline; notice the pending counter increment. Toggle back to "En ligne" to observe automatic reconciliation. |
| **Simulated Conflict Resolution (FR-7.6)** | Go to the **`Synchro`** tab and click **`Créer un conflit test`**. Compare the local device version vs. server version and resolve with 1 click! |
| **Device-to-Device QR Exchange (FR-7.4)** | In the **`Synchro`** tab, click **`Échange QR Direct (FR-7.4)`** to inspect the pairing QR payload and export/import changesets. |
| **Barcode Scanner Simulation** | Click the **`Scanner`** button. In addition to device camera support, use the instant simulation buttons (`HS-21`, `HS-88`, etc.) for instant desktop testing. |
| **CSV Bulk Import & Export** | Go to **`Structure`** > **`Import CSV`**. Insert the sample template, validate column headers, and import models in bulk. |

---

## 🗄️ Database Schema & Supabase Migrations

The central PostgreSQL / Supabase backend architecture (TDD §4–§7) is fully codified in `supabase/`:

- **`supabase/migrations/001_initial_schema.sql`**  
  Creates the 11 entities (`warehouse`, `area`, `section`, `device`, `model`, `model_section`, `transfer_log`, `sync_log`, `search_log`, `audit_log`, `sync_queue`) with `pg_trgm` indexes for fast partial matching and composite indexes for zero-result queries.
- **`supabase/migrations/002_rls_policies.sql`**  
  Complete Row Level Security policies:
  - All authenticated devices can read and write active entities.
  - Hard deletes are blocked (`DELETE USING (false)`).
  - Append-only logs (`transfer_log`, `search_log`, `audit_log`) restrict INSERT to `device_id = auth_device_id()`.
  - `sync_queue` is writable only by `service_role`.
- **`supabase/migrations/003_sync_rpcs.sql`**  
  Implements version-vector RPCs: `sync_push`, `sync_pull` (high-water mark based), and `resolve_conflict`.
- **`supabase/seed.sql`**  
  Sample initial data script.

---

## 🛠️ Technology Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** Vanilla CSS design system (`src/styles/theme.css`) with high-contrast tactile elements for warehouse floor use
- **Local Persistence:** Native IndexedDB (`winrah_db`) with typed reactive subscriptions
- **Barcode & QR:** `html5-qrcode` & `qrcode`
- **Cloud Backend (Optional):** Supabase PostgreSQL + RLS + Version-Vector RPCs

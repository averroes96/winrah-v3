# WINRAH — Shoe Warehouse Management App (v1.1.3)

> **Codename:** `winrah` (وين راه — *"Where is it?"*)  
> A mobile-first, offline-first physical inventory localization platform tailored for shoe wholesale and warehouse operations.

[![Release](https://img.shields.io/badge/Release-v1.1.3-amber.svg)](https://github.com/averroes96/winrah-v3/releases/tag/v1.1.3)
[![CI/CD Android](https://github.com/averroes96/winrah-v3/actions/workflows/deploy-android.yml/badge.svg)](https://github.com/averroes96/winrah-v3/actions/workflows/deploy-android.yml)
[![CI/CD iOS](https://github.com/averroes96/winrah-v3/actions/workflows/deploy-ios.yml/badge.svg)](https://github.com/averroes96/winrah-v3/actions/workflows/deploy-ios.yml)
[![React 19](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
[![Capacitor 8](https://img.shields.io/badge/Capacitor-8-119EFF.svg)](https://capacitorjs.com/)
[![Firebase Firestore](https://img.shields.io/badge/Firebase-Firestore-FFA611.svg)](https://firebase.google.com/)

---

## 👟 Overview & Philosophy

In shoe wholesale and distribution facilities, staff lose hours daily hunting for specific shoe models across hundreds of shelves. Standard ERPs fail because:
1. Large concrete and steel warehouses frequently have **zero cellular or Wi-Fi connectivity**.
2. Staff only need to answer one critical question: **"Where is model HS-108 right now?"** (Location tracking, **not** quantity/unit counting).
3. Shoe manufacturers routinely reuse reference codes across seasons or product lines (**duplicate references**), causing rigid ERP databases to throw uniqueness validation errors.

**WINRAH** is designed from the ground up to solve these problems:

* **Location-First, Not Unit-Counting:** Pinpoints physical shelf placement (e.g. `Rayon A10`, `Zone A`) in <100ms.
* **Smart Reference Disambiguation (FR-4.7 & FR-4.8):** Multiple distinct shoe models can legally share identical reference codes (e.g. `HS-21`). WINRAH automatically disambiguates them in search and edit views with visual index chips (`HS-21 (1)`, `HS-21 (2)`), thumbnail previews, price, and current shelf locations.
* **100% Offline-First Architecture:** Built on IndexedDB (`winrah_db`). All searches, moves, scans, and structure edits execute instantaneously on-device and persist locally across crashes or battery drains.
* **Zero-Result Gap Telemetry (FR-8.2 & FR-8.3):** Unanswered searches are logged locally. An audit dashboard detects missing stock, misplaced pairs, or barcode discrepancies before customers walk away.
* **Peer-to-Peer Offline Sync (FR-7.4):** Warehouse workers can sync changes between phones completely offline via animated pairing QR codes and JSON delta change-sets.

---

## ✨ Key Features

### 🔍 1. Floor-Optimized Fast Search
* **High-Visibility Shelf Positioning:** Each search card features a dedicated location badge on the right displaying the **Position Pin `📍` + Shelf Code (`A10`)** and **Zone Name (`Zone A`)** in high-contrast amber styling.
* **Instant Prefix & Fuzzy Filtering:** Filter in real-time by model reference code, commercial shoe name, shelf ID, or zone.
* **Multi-Warehouse Scoping:** Toggle between current active warehouse or "Search Everywhere" across regional facilities.
* **Integrated Barcode Scanner:** Camera-powered Code-128 and EAN-13 scanning with desktop simulation mode for rapid testing.

### 🏢 2. Warehouse Structure & 2D Interactive Map
* **Clean Folded Accordion:** Hierarchical navigation (`Warehouses` ➔ `Zones / Areas` ➔ `Shelves / Sections`), collapsed by default with 1-tap "Tout déplier / Tout replier" expansion.
* **2D Layout Canvas (`Plan Carte 2D`):**
  * Visual floorplan with pinch-to-zoom, pan, and coordinate grid.
  * Real-time shelf density heatmaps (Empty, Low, Medium, Dense).
  * Interactive drag-and-drop & directional nudge adjustments.
  * Shelf Drawer inspection: View all models currently resting on any clicked shelf.

### 🤖 3. Multimodal Gemini AI Scanning & Cycle Counting
* **Shelf Box Sticker Extraction:** Powered by Google Gemini 2.5 Flash via Firebase AI Logic. Captures shelf photos and extracts `REF`, `COLOR`, and `SIZE` range directly from physical box label stickers.
* **AI Cycle Counting:** Operators snap a photo of any shelf to automatically count boxes, compare against database placement records, detect discrepancies, and reconcile inventory.

### ⚡ 4. Smart Transfer Engine
* **Demand-Driven Re-allocation:** Analyzes 30-day search frequencies to recommend moving fast-moving shoe references to primary picking aisles (Zone A).
* **Shelf Capacity Guard:** Monitors shelf capacity limits and redirects stock to secondary zones when shelves reach maximum thresholds.
* **15-Second Instant Rollback:** Relocating a shoe model triggers a 15-second "Annuler" banner for accidental floor moves.

### 🔄 5. Dual-Layer Sync & Data Portability
* **Firebase Firestore Cloud Sync:** Pre-configured default cloud sync with real-time listeners and automatic offline change queue. No complex server setup required.
* **Direct QR Code Device-to-Device Exchange:** Sync databases between two phones in an offline basement with zero internet using QR pairing.
* **CSV Bulk Import/Export:** Import thousands of catalog models with column mapping and schema validation.

### 🌐 6. Clean Light Design System & Multilingual
* **Mobile-First Utility Theme:** Tailored for warehouse lighting with high-contrast text, clear typography (`Inter` & `Cairo`), and distinct semantic badges.
* **Bilingual Support:** Full French (`fr`) and Arabic (`ar` with native RTL layout).

---

## 🚀 Quick Start (Local Development)

### Prerequisites
* Node.js 18+
* npm or pnpm

### Installation
```bash
git clone https://github.com/averroes96/winrah-v3.git
cd winrah-v3
npm install
npm run dev
```

Open your browser at **`http://localhost:5173/`** or scan the terminal QR code to open the app on any phone connected to the same Wi-Fi network.

---

## 📱 Mobile App Builds (Android & iOS)

WINRAH is configured with **Capacitor 8** for native performance on Android and iOS devices.

### Local Native Builds
```bash
# Build web bundle and sync native platforms
npm run build:mobile

# Open in Android Studio
npm run open:android

# Open in Xcode
npm run open:ios
```

### Automated CI/CD Workflows
Pushing a release tag automatically triggers GitHub Actions workflows to build signed binaries:

```bash
git tag v1.1.3
git push origin v1.1.3
```

* **Android Workflow (`.github/workflows/deploy-android.yml`):** Compiles, signs, and attaches universal `.apk` and `.aab` bundles to the GitHub Release.
* **iOS Workflow (`.github/workflows/deploy-ios.yml`):** Builds and archives the signed `.ipa` artifact.

Refer to [`DEPLOYMENT_GUIDE.md`](./DEPLOYMENT_GUIDE.md) for signing credentials and secrets setup.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Core Framework** | React 19, TypeScript, Vite 8 |
| **Mobile Runtime** | Capacitor 8 (`@capacitor/android`, `@capacitor/ios`) |
| **Local Database** | Native IndexedDB (`winrah_db`) with reactive event subscriptions |
| **Cloud Backend** | Google Cloud Firestore (Firebase SDK v12) |
| **AI Vision Logic** | Gemini 2.5 Flash via Firebase AI Logic SDK |
| **Barcode / QR** | `html5-qrcode`, `qrcode` |
| **Styling** | Vanilla CSS design tokens (`src/styles/theme.css`), Lucide React icons |
| **CI/CD** | GitHub Actions (`ubuntu-latest` for Android, `macos-15` Xcode 16 for iOS) |

---

## 📄 License

Proprietary — Internal warehouse operations platform. All rights reserved.

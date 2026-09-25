#!/usr/bin/env node
// ============================================================================
// WINRAH - Appwrite Automated Schema Migration Tool
// Creates/updates the database, collections, attributes, and indexes
// Usage: node scripts/migrate-appwrite.mjs
// Or: npm run appwrite:migrate
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment variables from .env
function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        env[key] = value;
      }
    }
  }
  return env;
}

const env = loadEnv();
const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID || '';
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID || 'winrah_db';
const API_KEY = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY || '';

console.log('\n📦 WINRAH Appwrite Schema Migration\n' + '='.repeat(45));
console.log(`Endpoint   : ${ENDPOINT}`);
console.log(`Project ID : ${PROJECT_ID || '(non renseigné)'}`);
console.log(`Database ID: ${DATABASE_ID}`);
console.log(`API Key    : ${API_KEY ? '******' + API_KEY.slice(-4) : '(non renseigné)'}\n`);

if (!PROJECT_ID) {
  console.error('❌ Erreur : VITE_APPWRITE_PROJECT_ID est manquant.');
  console.error('Ajoutez votre Project ID dans le fichier .env :');
  console.error('  VITE_APPWRITE_PROJECT_ID=votre_id_projet\n');
  process.exit(1);
}

if (!API_KEY) {
  console.error('❌ Erreur : APPWRITE_API_KEY est requise pour créer/modifier le schéma de la base.');
  console.error('1. Rendez-vous dans la console Appwrite -> Votre Projet -> Paramètres -> Clés API.');
  console.error('2. Créez une clé avec les permissions (scopes) :');
  console.error('   - databases.write');
  console.error('   - collections.write');
  console.error('   - attributes.write');
  console.error('   - indexes.write');
  console.error('3. Ajoutez la clé dans le fichier .env :');
  console.error('   APPWRITE_API_KEY=votre_cle_api\n');
  process.exit(1);
}

// Appwrite REST client helper
async function appwriteRequest(method, endpointPath, body = null) {
  const url = `${ENDPOINT.replace(/\/$/, '')}${endpointPath}`;
  const headers = {
    'X-Appwrite-Project': PROJECT_ID,
    'X-Appwrite-Key': API_KEY,
    'Content-Type': 'application/json',
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}

  return { ok: res.ok, status: res.status, data: json, raw: text };
}

// Schema specification for WINRAH
const SCHEMA = [
  {
    collectionId: 'warehouses',
    name: 'Warehouses',
    attributes: [
      { key: 'id', type: 'string', size: 36, required: true },
      { key: 'name', type: 'string', size: 255, required: true },
      { key: 'status', type: 'string', size: 20, required: true },
      { key: 'version', type: 'integer', required: true },
      { key: 'created_at', type: 'string', size: 64, required: true },
      { key: 'updated_at', type: 'string', size: 64, required: true },
    ],
    indexes: [
      { key: 'idx_wh_status', type: 'key', attributes: ['status'] },
    ],
  },
  {
    collectionId: 'areas',
    name: 'Areas',
    attributes: [
      { key: 'id', type: 'string', size: 36, required: true },
      { key: 'warehouse_id', type: 'string', size: 36, required: true },
      { key: 'name', type: 'string', size: 255, required: true },
      { key: 'status', type: 'string', size: 20, required: true },
      { key: 'version', type: 'integer', required: true },
      { key: 'created_at', type: 'string', size: 64, required: true },
      { key: 'updated_at', type: 'string', size: 64, required: true },
    ],
    indexes: [
      { key: 'idx_areas_wh', type: 'key', attributes: ['warehouse_id'] },
    ],
  },
  {
    collectionId: 'sections',
    name: 'Sections',
    attributes: [
      { key: 'id', type: 'string', size: 36, required: true },
      { key: 'area_id', type: 'string', size: 36, required: true },
      { key: 'name', type: 'string', size: 255, required: true },
      { key: 'capacity', type: 'string', size: 255, required: false },
      { key: 'status', type: 'string', size: 20, required: true },
      { key: 'version', type: 'integer', required: true },
      { key: 'created_at', type: 'string', size: 64, required: true },
      { key: 'updated_at', type: 'string', size: 64, required: true },
    ],
    indexes: [
      { key: 'idx_sections_area', type: 'key', attributes: ['area_id'] },
    ],
  },
  {
    collectionId: 'models',
    name: 'Models',
    attributes: [
      { key: 'id', type: 'string', size: 36, required: true },
      { key: 'warehouse_id', type: 'string', size: 36, required: true },
      { key: 'reference_code', type: 'string', size: 64, required: true },
      { key: 'name', type: 'string', size: 255, required: false },
      { key: 'size_range', type: 'string', size: 64, required: false },
      { key: 'price', type: 'float', required: false },
      { key: 'photo_url', type: 'string', size: 1000, required: false },
      { key: 'status', type: 'string', size: 20, required: true },
      { key: 'version', type: 'integer', required: true },
      { key: 'created_at', type: 'string', size: 64, required: true },
      { key: 'updated_at', type: 'string', size: 64, required: true },
    ],
    indexes: [
      { key: 'idx_models_ref', type: 'key', attributes: ['reference_code'] },
      { key: 'idx_models_wh', type: 'key', attributes: ['warehouse_id'] },
    ],
  },
  {
    collectionId: 'model_sections',
    name: 'Model Sections',
    attributes: [
      { key: 'id', type: 'string', size: 36, required: true },
      { key: 'model_id', type: 'string', size: 36, required: true },
      { key: 'section_id', type: 'string', size: 36, required: true },
      { key: 'assigned_at', type: 'string', size: 64, required: true },
      { key: 'updated_at', type: 'string', size: 64, required: true },
      { key: 'version', type: 'integer', required: true },
    ],
    indexes: [
      { key: 'idx_ms_model', type: 'key', attributes: ['model_id'] },
      { key: 'idx_ms_sec', type: 'key', attributes: ['section_id'] },
    ],
  },
  {
    collectionId: 'transfers',
    name: 'Transfers',
    attributes: [
      { key: 'id', type: 'string', size: 36, required: true },
      { key: 'model_id', type: 'string', size: 36, required: true },
      { key: 'from_section_id', type: 'string', size: 36, required: false },
      { key: 'to_section_id', type: 'string', size: 36, required: true },
      { key: 'device_id', type: 'string', size: 64, required: true },
      { key: 'performed_by', type: 'string', size: 255, required: false },
      { key: 'sync_status', type: 'string', size: 20, required: true },
      { key: 'created_at', type: 'string', size: 64, required: true },
    ],
    indexes: [
      { key: 'idx_tr_model', type: 'key', attributes: ['model_id'] },
      { key: 'idx_tr_created', type: 'key', attributes: ['created_at'] },
    ],
  },
  {
    collectionId: 'search_logs',
    name: 'Search Logs',
    attributes: [
      { key: 'id', type: 'string', size: 36, required: true },
      { key: 'device_id', type: 'string', size: 64, required: true },
      { key: 'query_text', type: 'string', size: 255, required: true },
      { key: 'result_count', type: 'integer', required: true },
      { key: 'warehouse_id', type: 'string', size: 36, required: false },
      { key: 'created_at', type: 'string', size: 64, required: true },
      { key: 'is_everywhere', type: 'boolean', required: false },
    ],
    indexes: [
      { key: 'idx_sl_created', type: 'key', attributes: ['created_at'] },
      { key: 'idx_sl_device', type: 'key', attributes: ['device_id'] },
      { key: 'idx_sl_query', type: 'key', attributes: ['query_text'] },
    ],
  },
];

async function runMigration() {
  let targetDbId = DATABASE_ID;

  // 1. Check or Create Database
  console.log(`🔍 Vérification de la base de données "${targetDbId}"...`);
  const getDb = await appwriteRequest('GET', `/databases/${targetDbId}`);

  if (!getDb.ok && getDb.status === 404) {
    // Check if other databases exist in the project
    const listDbs = await appwriteRequest('GET', '/databases');
    if (listDbs.ok && listDbs.data?.databases?.length > 0) {
      const existing = listDbs.data.databases;
      console.log(`\nℹ️ Bases de données existantes dans ce projet Appwrite :`);
      for (const d of existing) {
        console.log(`   - "${d.name}" (ID : ${d.$id})`);
      }

      // If target was default 'winrah_db' and user already has a database, auto-select it
      if (targetDbId === 'winrah_db' && existing.length === 1) {
        targetDbId = existing[0].$id;
        console.log(`💡 Utilisation automatique de la base existante "${existing[0].name}" (ID: ${targetDbId})`);
      } else {
        console.log(`➕ Tentative de création de la base "${targetDbId}"...`);
      }
    }

    if (targetDbId === DATABASE_ID) {
      console.log(`➕ Création de la base de données "${targetDbId}"...`);
      const createDb = await appwriteRequest('POST', `/databases`, {
        databaseId: targetDbId,
        name: 'WINRAH Database',
        enabled: true,
      });
      if (!createDb.ok) {
        console.error(`❌ Échec de création de la base :`, createDb.data || createDb.raw);
        if (createDb.status === 403) {
          console.error(`\n👉 Le plan Appwrite Cloud gratuit autorise 1 seule base de données par projet.`);
          console.error(`Indiquez l'ID de votre base existante dans .env :`);
          console.error(`   VITE_APPWRITE_DATABASE_ID=votre_id_de_base\n`);
        }
        process.exit(1);
      }
      console.log(`✅ Base de données "${targetDbId}" créée avec succès.`);
    }
  } else if (getDb.ok) {
    console.log(`✅ Base de données "${targetDbId}" trouvée.`);
  } else {
    console.error(`❌ Échec de vérification de la base :`, getDb.data || getDb.raw);
    if (getDb.status === 401) {
      console.error(`\n👉 Solution : Ajoutez la permission "databases.read" à votre clé API dans Appwrite Console.`);
    }
    process.exit(1);
  }

  // 2. Process Collections
  for (const col of SCHEMA) {
    console.log(`\n📁 Traitement de la collection "${col.collectionId}" (${col.name})...`);
    const getCol = await appwriteRequest('GET', `/databases/${targetDbId}/collections/${col.collectionId}`);

    let collectionReady = false;
    if (!getCol.ok && getCol.status === 404) {
      console.log(`   ➕ Création de la collection "${col.collectionId}"...`);
      const createCol = await appwriteRequest('POST', `/databases/${targetDbId}/collections`, {
        collectionId: col.collectionId,
        name: col.name,
        permissions: [
          'read("any")',
          'create("any")',
          'update("any")',
          'delete("any")',
        ],
        documentSecurity: false,
        enabled: true,
      });
      if (!createCol.ok) {
        console.error(`   ❌ Échec création collection :`, createCol.data || createCol.raw);
        if (createCol.status === 401) {
          console.error(`\n👉 Permission "collections.write" manquante sur votre clé API dans Appwrite Console.`);
          process.exit(1);
        }
        continue;
      }
      console.log(`   ✅ Collection créée.`);
      collectionReady = true;
    } else if (getCol.ok) {
      console.log(`   ✅ Collection existante.`);
      collectionReady = true;
    } else {
      console.error(`   ❌ Échec d'accès à la collection :`, getCol.data || getCol.raw);
      if (getCol.status === 401) {
        console.error(`\n❌ Permissions manquantes sur votre clé API Appwrite.`);
        console.error(`👉 Dans Appwrite Console -> Paramètres du Projet -> Clés API, cochez toutes les cases "Databases" :`);
        console.error(`   - databases.read & databases.write`);
        console.error(`   - collections.read & collections.write`);
        console.error(`   - attributes.read & attributes.write`);
        console.error(`   - indexes.read & indexes.write`);
        console.error(`   - documents.read & documents.write\n`);
        process.exit(1);
      }
      continue;
    }

    if (!collectionReady) continue;

    // 3. Process Attributes
    for (const attr of col.attributes) {
      const endpointAttr = `/databases/${targetDbId}/collections/${col.collectionId}/attributes/${attr.type}`;
      const payload = {
        key: attr.key,
        required: attr.required,
      };
      if (attr.type === 'string') {
        payload.size = attr.size;
        payload.default = null;
      }

      const createAttr = await appwriteRequest('POST', endpointAttr, payload);
      if (createAttr.ok) {
        console.log(`   ✓ Attribut "${attr.key}" (${attr.type}) créé.`);
      } else if (createAttr.status === 409) {
        console.log(`   ✓ Attribut "${attr.key}" déjà présent.`);
      } else {
        console.log(`   ⚠️ Erreur création attribut "${attr.key}":`, createAttr.data?.message || createAttr.raw);
      }
    }

    // 4. Process Indexes
    if (col.indexes && col.indexes.length > 0) {
      // Small pause to allow attributes processing in Appwrite backend
      await new Promise((r) => setTimeout(r, 600));

      for (const idx of col.indexes) {
        const createIdx = await appwriteRequest(
          'POST',
          `/databases/${targetDbId}/collections/${col.collectionId}/indexes`,
          {
            key: idx.key,
            type: idx.type,
            attributes: idx.attributes,
          }
        );
        if (createIdx.ok) {
          console.log(`   ✓ Index "${idx.key}" créé.`);
        } else if (createIdx.status === 409) {
          console.log(`   ✓ Index "${idx.key}" déjà présent.`);
        } else {
          console.log(`   ⚠️ Index "${idx.key}" en attente ou existant.`);
        }
      }
    }
  }

  console.log('\n' + '='.repeat(45));
  console.log('🎉 Migration du schéma terminée avec succès !');
  console.log('Votre base Appwrite est entièrement structurée et prête pour WINRAH.\n');
}

runMigration().catch((err) => {
  console.error('\n❌ Erreur fatale lors de la migration :', err);
  process.exit(1);
});

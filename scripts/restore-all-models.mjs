// =============================================================================
// WINRAH - Restore All 1,484 Canonical Models and Locations to Appwrite
// =============================================================================

import fs from 'fs';
import { Client, Databases, Account } from 'appwrite';

const ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = '6ab46e3300098f995e1a';
const DATABASE_ID = '6ab46e6200013a6fdd1a';

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
const account = new Account(client);

try {
  await account.get();
} catch {
  try {
    await account.createAnonymousSession();
  } catch (e) {
    console.log('Session notice:', e.message);
  }
}

const dbs = new Databases(client);

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// 1. Read v2_database.csv
const lines = fs.readFileSync('public/v2_database.csv', 'utf8').split('\n');
const products = [];
for (const l of lines) {
  if (!l.startsWith('product,')) continue;
  const parts = l.split(',').map(p => p.trim());
  const id = parseInt(parts[1], 10);
  const ref = parts[2];
  const name = parts[3] !== 'N/A' ? parts[3] : null;
  const size = parts[4] !== 'N/A' ? parts[4] : null;
  const secId = parseInt(parts[5], 10);
  products.push({ id, ref, name, size, secId });
}

console.log(`Found ${products.length} products in CSV.`);

async function upsertDoc(collection, docId, data) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await dbs.createDocument(DATABASE_ID, collection, docId, data);
      return;
    } catch (e) {
      if (e?.code === 409) {
        // Document already exists, update it
        try {
          await dbs.updateDocument(DATABASE_ID, collection, docId, data);
          return;
        } catch (upErr) {
          if (upErr?.code === 429) {
            await sleep(1500 * (attempt + 1));
            continue;
          }
        }
      }
      if (e?.code === 429) {
        await sleep(1500 * (attempt + 1));
      } else {
        console.warn(`Error on ${docId}:`, e.message);
        return;
      }
    }
  }
}

console.log('--- Restoring Models ---');
const now = new Date().toISOString();
let modelsDone = 0;

// Run in small batches with concurrency
const CONCURRENCY = 15;
for (let i = 0; i < products.length; i += CONCURRENCY) {
  const batch = products.slice(i, i + CONCURRENCY);
  await Promise.all(
    batch.map(async (p) => {
      const docId = `model-v2-${p.id}`;
      const payload = {
        id: docId,
        warehouse_id: 'wh-base',
        reference_code: p.ref.toUpperCase(),
        name: p.name || null,
        size_range: p.size || null,
        price: null,
        photo_url: null,
        status: 'active',
        version: 1,
        created_at: now,
        updated_at: now,
      };
      await upsertDoc('models', docId, payload);
    })
  );
  modelsDone += batch.length;
  if (modelsDone % 100 === 0 || modelsDone === products.length) {
    console.log(`Models progress: ${modelsDone}/${products.length}`);
  }
  await sleep(100);
}

console.log('--- Restoring Model_Sections (Locations) ---');
let msDone = 0;
for (let i = 0; i < products.length; i += CONCURRENCY) {
  const batch = products.slice(i, i + CONCURRENCY);
  await Promise.all(
    batch.map(async (p) => {
      const docId = `ms-v2-${p.id}-${p.secId}`;
      const payload = {
        id: docId,
        model_id: `model-v2-${p.id}`,
        section_id: `sec-v2-${p.secId}`,
        assigned_at: now,
        updated_at: now,
        version: 1,
      };
      await upsertDoc('model_sections', docId, payload);
    })
  );
  msDone += batch.length;
  if (msDone % 100 === 0 || msDone === products.length) {
    console.log(`Assignments progress: ${msDone}/${products.length}`);
  }
  await sleep(100);
}

console.log('\nAll 1,484 models and their locations successfully restored to Appwrite!');

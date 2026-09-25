import { Client, Databases, Account, Query } from 'appwrite';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const client = new Client()
  .setEndpoint(env.VITE_APPWRITE_ENDPOINT)
  .setProject(env.VITE_APPWRITE_PROJECT_ID);

const databases = new Databases(client);
const account = new Account(client);

await account.createAnonymousSession();

const collections = [
  'model_sections',
  'transfers',
  'models',
  'sections',
  'areas',
  'warehouses'
];

console.log('🚀 Wiping Appwrite collections to oblivion...');
console.log('Preserving: search_logs and audit_logs\n');

for (const col of collections) {
  let colDeleted = 0;
  console.log(`🧹 Wiping collection "${col}"...`);

  while (true) {
    let docs = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await databases.listDocuments(env.VITE_APPWRITE_DATABASE_ID, col, [
          Query.limit(100)
        ]);
        docs = res.documents || [];
        break;
      } catch (err) {
        if (err?.code === 404) { docs = []; break; }
        if (err?.code === 429) {
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
        if (attempt === 4) throw err;
        await new Promise(r => setTimeout(r, 400));
      }
    }

    if (docs.length === 0) {
      console.log(`✅ "${col}" is completely wiped clean! (Total: ${colDeleted})\n`);
      break;
    }

    let nextIdx = 0;
    const concurrency = 6;
    const workers = Array.from({ length: concurrency }, async () => {
      while (nextIdx < docs.length) {
        const doc = docs[nextIdx++];
        for (let attempt = 0; attempt < 6; attempt++) {
          try {
            await databases.deleteDocument(env.VITE_APPWRITE_DATABASE_ID, col, doc.$id);
            colDeleted++;
            await new Promise(r => setTimeout(r, 40));
            break;
          } catch (err) {
            if (err?.code === 404) {
              colDeleted++;
              break;
            }
            if (err?.code === 429) {
              await new Promise(r => setTimeout(r, 600 * (attempt + 1) + Math.random() * 200));
              continue;
            }
            if (attempt === 5) {
              console.warn(`Failed ${doc.$id}:`, err?.message);
              break;
            }
            await new Promise(r => setTimeout(r, 300));
          }
        }
      }
    });

    await Promise.all(workers);
    console.log(`  -> ${col}: ${colDeleted} deleted...`);
  }
}

console.log('🎉 Server wipe complete! Verifying remaining counts:');
const checkCols = ['warehouses', 'areas', 'sections', 'models', 'model_sections', 'transfers', 'search_logs'];
for (const c of checkCols) {
  const r = await databases.listDocuments(env.VITE_APPWRITE_DATABASE_ID, c, [Query.limit(1)]);
  console.log(`  ${c}: ${r.total} remaining`);
}

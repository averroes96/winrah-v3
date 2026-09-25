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

const collectionsToWipe = [
  'model_sections',
  'transfers',
  'models',
  'sections',
  'areas',
  'warehouses'
];

console.log('🚀 Smart Wipe started using Appwrite SDK...');
console.log('Preserving: search_logs and audit_logs\n');

for (const col of collectionsToWipe) {
  let colDeleted = 0;
  console.log(`\n🧹 Starting wipe of "${col}"...`);

  while (true) {
    let docs = [];
    for (let fetchAttempt = 0; fetchAttempt < 5; fetchAttempt++) {
      try {
        const res = await databases.listDocuments(env.VITE_APPWRITE_DATABASE_ID, col, [
          Query.limit(100)
        ]);
        docs = res.documents || [];
        break;
      } catch (err) {
        if (err?.code === 404) { docs = []; break; }
        if (err?.code === 429) {
          console.log(`[429 limit on list] Waiting 5s...`);
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }
        if (fetchAttempt === 4) {
          console.warn(`Error listing ${col}:`, err?.message);
          docs = [];
          break;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (docs.length === 0) {
      console.log(`✅ Collection "${col}" is completely wiped clean! (Total: ${colDeleted})`);
      break;
    }

    for (const doc of docs) {
      for (let delAttempt = 0; delAttempt < 6; delAttempt++) {
        try {
          await databases.deleteDocument(env.VITE_APPWRITE_DATABASE_ID, col, doc.$id);
          colDeleted++;
          if (colDeleted % 20 === 0) {
            console.log(`  -> ${col}: ${colDeleted} deleted...`);
          }
          // Paced at 950ms to cleanly stay within Appwrite Cloud's 60 req/min limit
          await new Promise(r => setTimeout(r, 950));
          break;
        } catch (err) {
          if (err?.code === 404) {
            colDeleted++;
            break;
          }
          if (err?.code === 429) {
            console.log(`  [429 limit hit] Waiting 12s...`);
            await new Promise(r => setTimeout(r, 12000));
            continue;
          }
          console.warn(`Error deleting ${doc.$id} in ${col}:`, err?.message);
          break;
        }
      }
    }
  }
}

console.log('\n🎉 ALL COLLECTIONS WIPED TO OBLIVION!');
console.log('Final check:');
const checkCols = ['warehouses', 'areas', 'sections', 'models', 'model_sections', 'transfers', 'search_logs'];
for (const c of checkCols) {
  const r = await databases.listDocuments(env.VITE_APPWRITE_DATABASE_ID, c, [Query.limit(1)]);
  console.log(`  ${c}: ${r.total} remaining`);
}

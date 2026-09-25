import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

console.log('Testing Firestore connectivity for project:', firebaseConfig.projectId);

try {
  const testRef = doc(firestore, 'test_conn', 'ping');
  await setDoc(testRef, {
    message: 'WINRAH Firestore connection successful!',
    timestamp: new Date().toISOString()
  });
  console.log('✅ Write operation succeeded!');

  const snap = await getDoc(testRef);
  console.log('✅ Read operation succeeded:', snap.data());

  await deleteDoc(testRef);
  console.log('✅ Delete operation succeeded!');
  console.log('\n🎉 Cloud Firestore is completely ready and active for WINRAH!');
} catch (err) {
  console.error('\n❌ Firestore Error:', err.code, err.message);
  if (err.message.includes('has not been used in project') || err.code === 'permission-denied') {
    console.log('\n👉 ACTION REQUIRED: Enable Cloud Firestore in your Firebase Console:');
    console.log(`https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore`);
    console.log('Click "Create Database" -> select location -> choose "Start in test mode"');
  }
}
process.exit(0);

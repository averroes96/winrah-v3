// ============================================================================
// WINRAH - Legacy Appwrite Client (Deprecated)
// WINRAH has fully migrated to Firebase Firestore.
// ============================================================================

import { fetchFirebaseDatabase } from './firebaseClient';

export const isAppwriteConfigured = () => false;
export const getAppwriteConfig = () => ({
  endpoint: '',
  projectId: '',
  databaseId: '',
  apiKey: '',
});
export const getAppwriteClient = () => null;
export const fetchServerDatabase = fetchFirebaseDatabase;
export const pushRecordsToAppwrite = async () => ({ pushed: 0, errors: 0, lastError: null });

export interface ClientFirebaseConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
  oAuthClientId?: string;
  recaptchaSiteKey?: string;
}

export const PRODUCTION_CLIENT_IDENTIFIERS = {
  projectId: 'apaibay-marketplace-premium',
  firestoreDatabaseId: 'ai-studio-apaibaymarketpla-99b738bb-1596-4812-bdf8-877c3a04a892',
  storageBucket: 'apaibay-marketplace-premium.firebasestorage.app',
  authDomain: 'apaibay-marketplace-premium.firebaseapp.com',
} as const;

/**
 * Resolves frontend Firebase Web SDK configuration with strict staging isolation.
 *
 * - Production / default build: preserves firebase-applet-config.json unchanged.
 * - Staging build (VITE_APP_ENV === 'staging'):
 *   - NEVER falls back to production firebase-applet-config.json.
 *   - Requires all explicit VITE_FIREBASE_* values and rejects any production identifier.
 */
export function resolveClientFirebaseConfig(
  env: Record<string, any>,
  productionBaseConfig: ClientFirebaseConfig
): ClientFirebaseConfig {
  const viteAppEnv = String(env?.VITE_APP_ENV || '').trim().toLowerCase();

  if (viteAppEnv === 'staging') {
    const projectId = String(env?.VITE_FIREBASE_PROJECT_ID || '').trim();
    const apiKey = String(env?.VITE_FIREBASE_API_KEY || '').trim();
    const authDomain = String(env?.VITE_FIREBASE_AUTH_DOMAIN || '').trim();
    const firestoreDatabaseId = String(env?.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '').trim();
    const storageBucket = String(env?.VITE_FIREBASE_STORAGE_BUCKET || '').trim();
    const appId = String(env?.VITE_FIREBASE_APP_ID || '').trim();

    const missing: string[] = [];
    if (!projectId) missing.push('VITE_FIREBASE_PROJECT_ID');
    if (!apiKey) missing.push('VITE_FIREBASE_API_KEY');
    if (!authDomain) missing.push('VITE_FIREBASE_AUTH_DOMAIN');
    if (!firestoreDatabaseId) missing.push('VITE_FIREBASE_FIRESTORE_DATABASE_ID');
    if (!storageBucket) missing.push('VITE_FIREBASE_STORAGE_BUCKET');
    if (!appId) missing.push('VITE_FIREBASE_APP_ID');

    if (missing.length > 0) {
      throw new Error(
        `FIREBASE_STAGING_ISOLATION_ERROR: Staging build refuses fallback to production firebase-applet-config.json. Missing: ${missing.join(', ')}`
      );
    }

    if (
      projectId === PRODUCTION_CLIENT_IDENTIFIERS.projectId ||
      firestoreDatabaseId === PRODUCTION_CLIENT_IDENTIFIERS.firestoreDatabaseId ||
      storageBucket === PRODUCTION_CLIENT_IDENTIFIERS.storageBucket ||
      storageBucket.includes(PRODUCTION_CLIENT_IDENTIFIERS.projectId) ||
      authDomain === PRODUCTION_CLIENT_IDENTIFIERS.authDomain ||
      authDomain.includes(PRODUCTION_CLIENT_IDENTIFIERS.projectId)
    ) {
      throw new Error(
        'FIREBASE_STAGING_ISOLATION_ERROR: Staging frontend configuration cannot reference production Firebase identifiers.'
      );
    }

    return {
      projectId,
      apiKey,
      authDomain,
      firestoreDatabaseId,
      storageBucket,
      appId,
      messagingSenderId: String(env?.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim() || undefined,
      oAuthClientId: String(env?.VITE_FIREBASE_OAUTH_CLIENT_ID || '').trim() || undefined,
    };
  }

  // Validate against accidental staging overrides in non-staging builds
  const overrideProject = String(env?.VITE_FIREBASE_PROJECT_ID || '').trim();
  const overrideDb = String(env?.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '').trim();
  const overrideBucket = String(env?.VITE_FIREBASE_STORAGE_BUCKET || '').trim();

  if (
    (overrideProject && overrideProject !== productionBaseConfig.projectId) ||
    (overrideDb && overrideDb !== productionBaseConfig.firestoreDatabaseId) ||
    (overrideBucket && overrideBucket !== productionBaseConfig.storageBucket)
  ) {
    throw new Error(
      'FIREBASE_PRODUCTION_CONFIG_MISMATCH: Explicit VITE_FIREBASE_* overrides do not match production firebase-applet-config.json without VITE_APP_ENV=staging.'
    );
  }

  return productionBaseConfig;
}

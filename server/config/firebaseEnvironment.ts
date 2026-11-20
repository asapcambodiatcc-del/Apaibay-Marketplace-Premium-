import fs from 'fs';
import path from 'path';

export interface FirebaseConfig {
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

export type AppEnvironment = 'development' | 'test' | 'staging' | 'production';

export const PRODUCTION_FIREBASE_IDENTIFIERS = Object.freeze({
  projectId: 'apaibay-marketplace-premium',
  firestoreDatabaseId: 'ai-studio-apaibaymarketpla-99b738bb-1596-4812-bdf8-877c3a04a892',
  storageBucket: 'apaibay-marketplace-premium.firebasestorage.app',
  authDomain: 'apaibay-marketplace-premium.firebaseapp.com',
});

export interface FirebaseIsolationReport {
  appEnv: string;
  valid: boolean;
  isolated: boolean;
  violations: string[];
  warnings: string[];
  config: FirebaseConfig;
  credentialProjectId?: string;
  usesProductionFallback: boolean;
}

export function loadBaseFirebaseAppletConfig(): FirebaseConfig {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw) as FirebaseConfig;
  }
  throw new Error('firebase-applet-config.json not found');
}

export function resolveAppEnvironment(env: NodeJS.ProcessEnv = process.env): {
  appEnv: AppEnvironment | 'invalid';
  raw?: string;
} {
  const raw = env.APP_ENV?.trim().toLowerCase();
  if (raw) {
    if (raw === 'development' || raw === 'test' || raw === 'staging' || raw === 'production') {
      return { appEnv: raw, raw };
    }
    return { appEnv: 'invalid', raw };
  }

  const nodeEnv = env.NODE_ENV?.trim().toLowerCase();
  if (nodeEnv === 'test') return { appEnv: 'test' };
  if (nodeEnv === 'production') return { appEnv: 'production' };
  return { appEnv: 'development' };
}

export function extractCredentialProjectId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const rawJson = env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    try {
      const decoded = rawJson.startsWith('{')
        ? rawJson
        : Buffer.from(rawJson, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed.project_id === 'string' && parsed.project_id.trim()) {
        return parsed.project_id.trim();
      }
    } catch {
      return undefined;
    }
  }

  const credsPath = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (credsPath && fs.existsSync(credsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      if (parsed && typeof parsed.project_id === 'string' && parsed.project_id.trim()) {
        return parsed.project_id.trim();
      }
    } catch {
      return undefined;
    }
  }

  const managedProject = (env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT || '').trim();
  if (env.K_SERVICE && managedProject) {
    return managedProject;
  }

  return undefined;
}

/**
 * Resolves and validates Firebase configuration with strict Staging-vs-Production isolation.
 *
 * - In APP_ENV=staging:
 *   - NEVER falls back to production values in firebase-applet-config.json.
 *   - Requires explicit staging FIREBASE_PROJECT_ID, FIREBASE_FIRESTORE_DATABASE_ID,
 *     FIREBASE_STORAGE_BUCKET, and FIREBASE_AUTH_DOMAIN.
 *   - Rejects any staging config or service account referencing production identifiers.
 *   - Rejects PAYMENT_ENVIRONMENT=production in staging.
 *
 * - In APP_ENV=production:
 *   - Preserves production firebase-applet-config.json identifiers.
 *   - Rejects conflicting staging overrides or mismatched service account project_id.
 */
export function resolveServerFirebaseConfig(options?: {
  env?: NodeJS.ProcessEnv;
  baseConfig?: FirebaseConfig;
}): FirebaseIsolationReport {
  const env = options?.env || process.env;
  const baseConfig = options?.baseConfig || loadBaseFirebaseAppletConfig();
  const { appEnv, raw } = resolveAppEnvironment(env);
  const violations: string[] = [];
  const warnings: string[] = [];

  if (appEnv === 'invalid') {
    violations.push(`INVALID_APP_ENV: Unsupported APP_ENV value '${raw}'. Allowed: development, test, staging, production.`);
  }

  const envProjectId = env.FIREBASE_PROJECT_ID?.trim() || '';
  const envDbId = env.FIREBASE_FIRESTORE_DATABASE_ID?.trim() || '';
  const envBucket = env.FIREBASE_STORAGE_BUCKET?.trim() || '';
  const envAuthDomain = env.FIREBASE_AUTH_DOMAIN?.trim() || '';
  const credentialProjectId = extractCredentialProjectId(env);
  const paymentEnv = (env.PAYMENT_ENVIRONMENT || 'sandbox').trim().toLowerCase();

  // Check optional frontend VITE_ env alignment when exposed in shared container env
  const viteAppEnv = env.VITE_APP_ENV?.trim().toLowerCase() || '';
  const viteProjectId = env.VITE_FIREBASE_PROJECT_ID?.trim() || '';
  const viteDbId = env.VITE_FIREBASE_FIRESTORE_DATABASE_ID?.trim() || '';
  const viteBucket = env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || '';

  if (appEnv === 'staging') {
    // STRICT ISOLATION: Staging must NEVER fall back to production firebase-applet-config.json
    const missing: string[] = [];
    if (!envProjectId) missing.push('FIREBASE_PROJECT_ID');
    if (!envDbId) missing.push('FIREBASE_FIRESTORE_DATABASE_ID');
    if (!envBucket) missing.push('FIREBASE_STORAGE_BUCKET');
    if (!envAuthDomain) missing.push('FIREBASE_AUTH_DOMAIN');

    if (missing.length > 0) {
      violations.push(
        `STAGING_CONFIG_MISSING: APP_ENV=staging refuses fallback to production firebase-applet-config.json. Missing required staging env vars: ${missing.join(', ')}.`
      );
    }

    if (envProjectId === PRODUCTION_FIREBASE_IDENTIFIERS.projectId) {
      violations.push(
        `STAGING_ISOLATION_VIOLATION: FIREBASE_PROJECT_ID cannot target production project '${PRODUCTION_FIREBASE_IDENTIFIERS.projectId}' when APP_ENV=staging.`
      );
    }
    if (envDbId === PRODUCTION_FIREBASE_IDENTIFIERS.firestoreDatabaseId) {
      violations.push(
        `STAGING_ISOLATION_VIOLATION: FIREBASE_FIRESTORE_DATABASE_ID cannot target production database '${PRODUCTION_FIREBASE_IDENTIFIERS.firestoreDatabaseId}' when APP_ENV=staging.`
      );
    }
    if (
      envBucket === PRODUCTION_FIREBASE_IDENTIFIERS.storageBucket ||
      envBucket.includes(PRODUCTION_FIREBASE_IDENTIFIERS.projectId)
    ) {
      violations.push(
        `STAGING_ISOLATION_VIOLATION: FIREBASE_STORAGE_BUCKET cannot target production bucket '${PRODUCTION_FIREBASE_IDENTIFIERS.storageBucket}' when APP_ENV=staging.`
      );
    }
    if (
      envAuthDomain === PRODUCTION_FIREBASE_IDENTIFIERS.authDomain ||
      envAuthDomain.includes(PRODUCTION_FIREBASE_IDENTIFIERS.projectId)
    ) {
      violations.push(
        `STAGING_ISOLATION_VIOLATION: FIREBASE_AUTH_DOMAIN cannot target production authDomain '${PRODUCTION_FIREBASE_IDENTIFIERS.authDomain}' when APP_ENV=staging.`
      );
    }

    if (credentialProjectId) {
      if (credentialProjectId === PRODUCTION_FIREBASE_IDENTIFIERS.projectId) {
        violations.push(
          `STAGING_CREDENTIAL_ISOLATION_VIOLATION: Admin credentials belong to production project '${PRODUCTION_FIREBASE_IDENTIFIERS.projectId}', which is strictly forbidden in APP_ENV=staging.`
        );
      } else if (envProjectId && credentialProjectId !== envProjectId) {
        violations.push(
          `STAGING_CREDENTIAL_PROJECT_MISMATCH: Admin credentials project_id ('${credentialProjectId}') does not match staging FIREBASE_PROJECT_ID ('${envProjectId}').`
        );
      }
    }

    if (paymentEnv === 'production') {
      violations.push(
        'STAGING_LIVE_PAYMENT_FORBIDDEN: PAYMENT_ENVIRONMENT=production is strictly forbidden in APP_ENV=staging.'
      );
    }

    if (viteAppEnv && viteAppEnv !== 'staging') {
      violations.push(
        `STAGING_FRONTEND_ENV_MISMATCH: VITE_APP_ENV='${viteAppEnv}' cannot be mixed with APP_ENV=staging.`
      );
    }
    if (viteProjectId && (viteProjectId === PRODUCTION_FIREBASE_IDENTIFIERS.projectId || (envProjectId && viteProjectId !== envProjectId))) {
      violations.push(
        `STAGING_FRONTEND_ISOLATION_VIOLATION: VITE_FIREBASE_PROJECT_ID ('${viteProjectId}') conflicts with isolated staging backend project ('${envProjectId || 'unconfigured'}').`
      );
    }
    if (viteDbId && (viteDbId === PRODUCTION_FIREBASE_IDENTIFIERS.firestoreDatabaseId || (envDbId && viteDbId !== envDbId))) {
      violations.push(
        `STAGING_FRONTEND_ISOLATION_VIOLATION: VITE_FIREBASE_FIRESTORE_DATABASE_ID conflicts with isolated staging backend database.`
      );
    }
    if (viteBucket && (viteBucket === PRODUCTION_FIREBASE_IDENTIFIERS.storageBucket || (envBucket && viteBucket !== envBucket))) {
      violations.push(
        `STAGING_FRONTEND_ISOLATION_VIOLATION: VITE_FIREBASE_STORAGE_BUCKET conflicts with isolated staging backend storage bucket.`
      );
    }

    const stagingConfig: FirebaseConfig = {
      projectId: envProjectId,
      appId: env.FIREBASE_APP_ID?.trim() || '',
      apiKey: env.FIREBASE_WEB_API_KEY?.trim() || '',
      authDomain: envAuthDomain,
      firestoreDatabaseId: envDbId,
      storageBucket: envBucket,
      messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID?.trim() || '',
      measurementId: '',
      oAuthClientId: env.FIREBASE_OAUTH_CLIENT_ID?.trim() || '',
      recaptchaSiteKey: '',
    };

    const valid = violations.length === 0;
    return {
      appEnv: 'staging',
      valid,
      isolated: valid,
      violations,
      warnings,
      config: stagingConfig,
      credentialProjectId,
      usesProductionFallback: false,
    };
  }

  // Production / Development / Test resolution (preserves production firebase-applet-config.json)
  const effectiveConfig: FirebaseConfig = {
    ...baseConfig,
  };

  if (appEnv === 'production') {
    if (envProjectId && envProjectId !== PRODUCTION_FIREBASE_IDENTIFIERS.projectId) {
      violations.push(
        `PRODUCTION_ISOLATION_VIOLATION: FIREBASE_PROJECT_ID ('${envProjectId}') does not match production project '${PRODUCTION_FIREBASE_IDENTIFIERS.projectId}'. Set APP_ENV=staging for non-production environments.`
      );
    }
    if (envDbId && envDbId !== PRODUCTION_FIREBASE_IDENTIFIERS.firestoreDatabaseId) {
      violations.push(
        `PRODUCTION_ISOLATION_VIOLATION: FIREBASE_FIRESTORE_DATABASE_ID does not match production database ID.`
      );
    }
    if (envBucket && envBucket !== PRODUCTION_FIREBASE_IDENTIFIERS.storageBucket) {
      violations.push(
        `PRODUCTION_ISOLATION_VIOLATION: FIREBASE_STORAGE_BUCKET ('${envBucket}') does not match production bucket '${PRODUCTION_FIREBASE_IDENTIFIERS.storageBucket}'.`
      );
    }
    if (envAuthDomain && envAuthDomain !== PRODUCTION_FIREBASE_IDENTIFIERS.authDomain) {
      violations.push(
        `PRODUCTION_ISOLATION_VIOLATION: FIREBASE_AUTH_DOMAIN ('${envAuthDomain}') does not match production authDomain.`
      );
    }
    if (credentialProjectId && credentialProjectId !== effectiveConfig.projectId) {
      violations.push(
        `PRODUCTION_CREDENTIAL_PROJECT_MISMATCH: Admin credentials project_id ('${credentialProjectId}') does not match production project '${effectiveConfig.projectId}'.`
      );
    }
    if (viteAppEnv === 'staging') {
      violations.push(
        'PRODUCTION_FRONTEND_ISOLATION_VIOLATION: VITE_APP_ENV=staging cannot be mixed with APP_ENV=production.'
      );
    }
    if (viteProjectId && viteProjectId !== effectiveConfig.projectId) {
      violations.push(
        `PRODUCTION_FRONTEND_ISOLATION_VIOLATION: VITE_FIREBASE_PROJECT_ID ('${viteProjectId}') conflicts with production project '${effectiveConfig.projectId}'.`
      );
    }
  } else {
    // development or test
    if (envProjectId && envProjectId !== effectiveConfig.projectId) {
      violations.push(
        `DEV_FIREBASE_PROJECT_OVERRIDE_REJECTED: FIREBASE_PROJECT_ID override ('${envProjectId}') requires APP_ENV=staging so environments are explicitly isolated.`
      );
    }
    if (credentialProjectId && credentialProjectId !== effectiveConfig.projectId) {
      violations.push(
        `CREDENTIAL_PROJECT_MISMATCH: Admin credentials project_id ('${credentialProjectId}') does not match configured project '${effectiveConfig.projectId}'.`
      );
    }
    if (viteAppEnv === 'staging') {
      violations.push(
        'ENV_MIXING_VIOLATION: VITE_APP_ENV=staging cannot be mixed with non-staging backend APP_ENV.'
      );
    }
  }

  return {
    appEnv: appEnv === 'invalid' ? String(raw || 'invalid') : appEnv,
    valid: violations.length === 0,
    isolated: violations.length === 0,
    violations,
    warnings,
    config: effectiveConfig,
    credentialProjectId,
    usesProductionFallback: appEnv !== 'production',
  };
}

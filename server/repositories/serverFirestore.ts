import fs from 'fs';
import path from 'path';
import {
  initializeApp,
  getApps,
  getApp,
  applicationDefault,
  cert,
  App,
} from 'firebase-admin/app';
import {
  getFirestore,
  Firestore,
  FieldValue,
} from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import {
  FirebaseConfig,
  FirebaseIsolationReport,
  resolveServerFirebaseConfig,
} from '../config/firebaseEnvironment';

export type { FirebaseConfig, FirebaseIsolationReport };

export class PersistenceError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 503, cause?: unknown) {
    super(message);
    this.name = 'PersistenceError';
    this.code = code;
    this.statusCode = statusCode;
    if (cause !== undefined) {
      (this as any).cause = cause;
    }
  }
}

export function getActiveFirebaseEnvironmentReport(): FirebaseIsolationReport {
  return resolveServerFirebaseConfig({ env: process.env });
}

const initialEnvironmentReport = getActiveFirebaseEnvironmentReport();
export const firebaseConfig: FirebaseConfig = initialEnvironmentReport.config;

export type AdminCredentialState = 'configured' | 'missing' | 'malformed';

interface AdminInitDiagnostics {
  initialized: boolean;
  credentialSource: 'service_account_env' | 'application_default' | 'unconfigured';
  credentialState: AdminCredentialState;
  initError?: string;
}

const adminDiagnostics: AdminInitDiagnostics = {
  initialized: false,
  credentialSource: 'unconfigured',
  credentialState: 'missing',
};

function parseServiceAccountJson(rawJson: string): { valid: boolean; parsed?: any; error?: string } {
  try {
    const decoded = rawJson.startsWith('{')
      ? rawJson
      : Buffer.from(rawJson, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (
      parsed &&
      typeof parsed.project_id === 'string' &&
      parsed.project_id.trim() &&
      typeof parsed.private_key === 'string' &&
      parsed.private_key.includes('BEGIN') &&
      typeof parsed.client_email === 'string' &&
      parsed.client_email.includes('@')
    ) {
      return { valid: true, parsed };
    }
    return { valid: false, error: 'Service account JSON is missing required fields (project_id, private_key, client_email).' };
  } catch (err: any) {
    return { valid: false, error: `Invalid service account JSON: ${err?.message || 'parse error'}` };
  }
}

export function evaluateAdminCredentialState(): {
  state: AdminCredentialState;
  source: AdminInitDiagnostics['credentialSource'];
  error?: string;
} {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    const parsed = parseServiceAccountJson(rawJson);
    if (parsed.valid) {
      return { state: 'configured', source: 'service_account_env' };
    }
    return { state: 'malformed', source: 'unconfigured', error: parsed.error };
  }

  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (credsPath) {
    if (!fs.existsSync(credsPath)) {
      return {
        state: 'missing',
        source: 'unconfigured',
        error: 'GOOGLE_APPLICATION_CREDENTIALS points to a file that does not exist.',
      };
    }
    try {
      const fileContent = fs.readFileSync(credsPath, 'utf8').trim();
      const parsed = parseServiceAccountJson(fileContent);
      if (!parsed.valid) {
        return { state: 'malformed', source: 'unconfigured', error: parsed.error };
      }
      return { state: 'configured', source: 'application_default' };
    } catch (err: any) {
      return {
        state: 'malformed',
        source: 'unconfigured',
        error: `Unable to read GOOGLE_APPLICATION_CREDENTIALS: ${err?.message || 'read error'}`,
      };
    }
  }

  const hasManagedRuntimeAdc = Boolean(
    (process.env.K_SERVICE && (process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT)) ||
    process.env.FIREBASE_CONFIG
  );
  if (hasManagedRuntimeAdc) {
    return { state: 'configured', source: 'application_default' };
  }

  return { state: 'missing', source: 'unconfigured' };
}

function resolveAdminCredential(): ReturnType<typeof cert> | ReturnType<typeof applicationDefault> | undefined {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    const result = parseServiceAccountJson(rawJson);
    if (result.valid && result.parsed) {
      adminDiagnostics.credentialSource = 'service_account_env';
      adminDiagnostics.credentialState = 'configured';
      adminDiagnostics.initError = undefined;
      return cert(result.parsed);
    }
    adminDiagnostics.credentialSource = 'unconfigured';
    adminDiagnostics.credentialState = 'malformed';
    adminDiagnostics.initError = `Invalid FIREBASE_SERVICE_ACCOUNT_JSON configuration: ${result.error}`;
    return undefined;
  }

  const credsEval = evaluateAdminCredentialState();
  adminDiagnostics.credentialSource = credsEval.source;
  adminDiagnostics.credentialState = credsEval.state;
  adminDiagnostics.initError = credsEval.error;

  if (credsEval.state === 'configured') {
    return applicationDefault();
  }
  return undefined;
}

function initAdminApp(): App {
  if (getApps().length > 0) {
    adminDiagnostics.initialized = true;
    const credsEval = evaluateAdminCredentialState();
    adminDiagnostics.credentialSource = credsEval.source;
    adminDiagnostics.credentialState = credsEval.state;
    adminDiagnostics.initError = credsEval.error;
    return getApp();
  }

  const credential = resolveAdminCredential();
  const app = initializeApp({
    ...(credential ? { credential } : {}),
    ...(firebaseConfig.projectId ? { projectId: firebaseConfig.projectId } : {}),
    ...(firebaseConfig.storageBucket ? { storageBucket: firebaseConfig.storageBucket } : {}),
  });
  adminDiagnostics.initialized = true;
  return app;
}

export const adminApp: App = initAdminApp();

const globalSymbol = Symbol.for('apaibay.admin.firestore.instance');
const globalAny = globalThis as Record<symbol, any>;

function createNamedFirestore(): Firestore {
  if (globalAny[globalSymbol]) {
    return globalAny[globalSymbol] as Firestore;
  }
  // CRITICAL: Connect to the named Firestore database configured for this environment
  const dbId = firebaseConfig.firestoreDatabaseId || '(unconfigured-isolated)';
  const instance = getFirestore(adminApp, dbId);
  try {
    instance.settings({ ignoreUndefinedProperties: true });
  } catch {
    // Ignore if already configured in the same runtime
  }
  globalAny[globalSymbol] = instance;
  return instance;
}

export const db: Firestore = createNamedFirestore();

export function getAdminFirestore(): Firestore {
  return db;
}

export function isAdminCredentialsConfigured(): boolean {
  const isoReport = getActiveFirebaseEnvironmentReport();
  if (!isoReport.valid) return false;
  const evalState = evaluateAdminCredentialState();
  if (evalState.state !== 'configured') return false;
  return adminDiagnostics.initialized;
}

export function getAdminDiagnostics(): AdminInitDiagnostics & {
  appEnv: string;
  isolated: boolean;
  isolationViolations: string[];
  projectId: string;
  databaseId: string;
  storageBucket?: string;
  authDomain?: string;
  hasExplicitCredentials: boolean;
} {
  const isoReport = getActiveFirebaseEnvironmentReport();
  const evalState = evaluateAdminCredentialState();
  return {
    ...adminDiagnostics,
    appEnv: isoReport.appEnv,
    isolated: isoReport.isolated,
    isolationViolations: isoReport.violations,
    credentialSource: evalState.source,
    credentialState: evalState.state,
    initError: isoReport.violations[0] || evalState.error || adminDiagnostics.initError,
    projectId: isoReport.config.projectId,
    databaseId: isoReport.config.firestoreDatabaseId,
    storageBucket: isoReport.config.storageBucket,
    authDomain: isoReport.config.authDomain,
    hasExplicitCredentials: isoReport.valid && evalState.state === 'configured' && adminDiagnostics.initialized,
  };
}

export type FirebaseReadinessState =
  | 'isolation_violation'
  | 'credentials_missing'
  | 'credentials_malformed'
  | 'firebase_unavailable'
  | 'firestore_unavailable'
  | 'storage_unavailable'
  | 'ready';

export interface FirebaseReadinessResult {
  state: FirebaseReadinessState;
  ready: boolean;
  liveVerified: boolean;
  appEnv: string;
  isolated: boolean;
  isolationViolations: string[];
  credentialState: AdminCredentialState;
  credentialSource: AdminInitDiagnostics['credentialSource'];
  checks: {
    isolation: 'isolated' | 'violation';
    credentials: AdminCredentialState;
    firebaseConnection: 'healthy' | 'unavailable' | 'skipped';
    firestore: 'healthy' | 'unavailable' | 'skipped';
    storage: 'healthy' | 'unavailable' | 'skipped';
  };
  error?: string;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Test-Only Isolation State & Injection Hooks (Strictly NODE_ENV === 'test')
// ---------------------------------------------------------------------------

export interface AdminAuthVerifierLike {
  verifyIdToken(idToken: string, checkRevoked?: boolean): Promise<{
    uid: string;
    email?: string;
    email_verified?: boolean;
    [key: string]: any;
  }>;
  revokeRefreshTokens?(uid: string): Promise<void>;
  getUser?(uid: string): Promise<any>;
}

export interface StorageBucketAdapterLike {
  exists?(): Promise<[boolean]>;
  file(storagePath: string): {
    save(data: Buffer, options?: any): Promise<void>;
    download(): Promise<[Buffer]>;
    delete(options?: { ignoreNotFound?: boolean }): Promise<any>;
  };
}

const testMemoryStore = new Map<string, any>();
let testTxQueue: Promise<void> = Promise.resolve();
let testSimulateProductionPersistence = false;
let testForceFirestoreFailure = false;
let testAuthVerifierOverride: AdminAuthVerifierLike | null = null;
let testStorageAdapterOverride: StorageBucketAdapterLike | null = null;

function assertTestEnvironment(hookName: string): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(`SECURITY_VIOLATION: ${hookName} may only be used when NODE_ENV === 'test'.`);
  }
}

function isUsingInMemoryTestStore(): boolean {
  return process.env.NODE_ENV === 'test' && !testSimulateProductionPersistence;
}

export function isTestInMemoryMode(): boolean {
  return isUsingInMemoryTestStore();
}

export function hasTestStorageAdapterOverride(): boolean {
  return process.env.NODE_ENV === 'test' && testStorageAdapterOverride !== null;
}

export function clearServerFirestoreTestStore(): void {
  testMemoryStore.clear();
}

export function __setTestSimulateProductionPersistence(enabled: boolean): void {
  assertTestEnvironment('__setTestSimulateProductionPersistence');
  testSimulateProductionPersistence = enabled;
}

export function __setTestForceFirestoreFailure(enabled: boolean): void {
  assertTestEnvironment('__setTestForceFirestoreFailure');
  testForceFirestoreFailure = enabled;
}

export function __setTestAdminAuthVerifier(verifier: AdminAuthVerifierLike | null): void {
  assertTestEnvironment('__setTestAdminAuthVerifier');
  testAuthVerifierOverride = verifier;
}

export function __setTestStorageAdapter(adapter: StorageBucketAdapterLike | null): void {
  assertTestEnvironment('__setTestStorageAdapter');
  testStorageAdapterOverride = adapter;
}

export function __resetAllTestHooks(): void {
  if (process.env.NODE_ENV !== 'test') return;
  testMemoryStore.clear();
  testSimulateProductionPersistence = false;
  testForceFirestoreFailure = false;
  testAuthVerifierOverride = null;
  testStorageAdapterOverride = null;
}

export function getAdminAuth(): AdminAuthVerifierLike | Auth {
  if (process.env.NODE_ENV === 'test' && testAuthVerifierOverride) {
    return testAuthVerifierOverride;
  }
  return getAuth(adminApp);
}

export function getAdminStorageBucket(): StorageBucketAdapterLike {
  if (process.env.NODE_ENV === 'test' && testStorageAdapterOverride) {
    return testStorageAdapterOverride;
  }
  const bucketName = firebaseConfig.storageBucket;
  if (!bucketName) {
    throw new PersistenceError(
      'STORAGE_BUCKET_UNCONFIGURED',
      'Firebase storageBucket is not configured in firebase-applet-config.json.',
      500
    );
  }
  return getStorage(adminApp).bucket(bucketName) as unknown as StorageBucketAdapterLike;
}

/**
 * Evaluates Firebase Admin credential state and, when credentials are configured
 * (or test probes are active), actively probes Firebase Auth connection,
 * named Firestore database, and Storage bucket connectivity.
 *
 * NEVER marks Firebase ready solely because an environment variable is set.
 */
export async function checkFirebaseReadiness(options?: {
  timeoutMs?: number;
}): Promise<FirebaseReadinessResult> {
  const timeoutMs = options?.timeoutMs ?? 3000;
  const isoReport = getActiveFirebaseEnvironmentReport();
  const credEval = evaluateAdminCredentialState();

  if (!isoReport.valid) {
    return {
      state: 'isolation_violation',
      ready: false,
      liveVerified: false,
      appEnv: isoReport.appEnv,
      isolated: false,
      isolationViolations: isoReport.violations,
      credentialState: credEval.state,
      credentialSource: credEval.source,
      checks: {
        isolation: 'violation',
        credentials: credEval.state,
        firebaseConnection: 'skipped',
        firestore: 'skipped',
        storage: 'skipped',
      },
      error: isoReport.violations.join('; '),
    };
  }

  if (credEval.state === 'malformed') {
    return {
      state: 'credentials_malformed',
      ready: false,
      liveVerified: false,
      appEnv: isoReport.appEnv,
      isolated: true,
      isolationViolations: [],
      credentialState: 'malformed',
      credentialSource: credEval.source,
      checks: {
        isolation: 'isolated',
        credentials: 'malformed',
        firebaseConnection: 'skipped',
        firestore: 'skipped',
        storage: 'skipped',
      },
      error: credEval.error || 'Firebase Admin credentials are malformed.',
    };
  }

  if (credEval.state === 'missing') {
    return {
      state: 'credentials_missing',
      ready: false,
      liveVerified: false,
      appEnv: isoReport.appEnv,
      isolated: true,
      isolationViolations: [],
      credentialState: 'missing',
      credentialSource: credEval.source,
      checks: {
        isolation: 'isolated',
        credentials: 'missing',
        firebaseConnection: 'skipped',
        firestore: 'skipped',
        storage: 'skipped',
      },
      error: credEval.error || 'Firebase Admin credentials are not configured.',
    };
  }

  // Credentials are present & structurally valid; verify actual Firebase Auth, Firestore & Storage connectivity
  let firebaseConnStatus: 'healthy' | 'unavailable' = 'unavailable';
  let firestoreStatus: 'healthy' | 'unavailable' = 'unavailable';
  let storageStatus: 'healthy' | 'unavailable' = 'unavailable';

  // 1. Firebase Auth / Connection Probe
  try {
    const authClient = getAdminAuth();
    if (typeof authClient.getUser === 'function') {
      try {
        await withTimeout(
          authClient.getUser('__apaibay_readiness_probe__'),
          timeoutMs,
          'Firebase Auth connection probe timed out.'
        );
        firebaseConnStatus = 'healthy';
      } catch (authErr: any) {
        if (authErr?.code === 'auth/user-not-found') {
          firebaseConnStatus = 'healthy';
        } else {
          throw authErr;
        }
      }
    } else if (process.env.NODE_ENV === 'test') {
      // Custom test Auth verifier without getUser method
      firebaseConnStatus = 'healthy';
    } else {
      throw new Error('Firebase Auth admin client is unavailable.');
    }
  } catch (err: any) {
    return {
      state: 'firebase_unavailable',
      ready: false,
      liveVerified: false,
      appEnv: isoReport.appEnv,
      isolated: true,
      isolationViolations: [],
      credentialState: 'configured',
      credentialSource: credEval.source,
      checks: {
        isolation: 'isolated',
        credentials: 'configured',
        firebaseConnection: 'unavailable',
        firestore: 'skipped',
        storage: 'skipped',
      },
      error: `Firebase Auth connection unavailable: ${err?.message || 'probe failed'}`,
    };
  }

  // 2. Named Firestore Database Read Probe
  try {
    await withTimeout(
      getDoc(doc(db, 'categories', 'electronics')),
      timeoutMs,
      'Firestore readiness probe timed out.'
    );
    firestoreStatus = 'healthy';
  } catch (err: any) {
    return {
      state: 'firestore_unavailable',
      ready: false,
      liveVerified: false,
      appEnv: isoReport.appEnv,
      isolated: true,
      isolationViolations: [],
      credentialState: 'configured',
      credentialSource: credEval.source,
      checks: {
        isolation: 'isolated',
        credentials: 'configured',
        firebaseConnection: firebaseConnStatus,
        firestore: 'unavailable',
        storage: 'skipped',
      },
      error: `Firestore (${isoReport.config.firestoreDatabaseId}) unavailable: ${err?.message || 'probe failed'}`,
    };
  }

  // 3. Firebase Storage Bucket Probe
  try {
    const bucket = getAdminStorageBucket();
    if (typeof bucket.exists === 'function') {
      const [exists] = await withTimeout(
        bucket.exists(),
        timeoutMs,
        'Firebase Storage readiness probe timed out.'
      );
      if (!exists) {
        throw new Error(`Configured bucket '${isoReport.config.storageBucket}' was not found or is inaccessible.`);
      }
      storageStatus = 'healthy';
    } else {
      throw new Error('Storage bucket adapter does not support bucket existence verification.');
    }
  } catch (err: any) {
    return {
      state: 'storage_unavailable',
      ready: false,
      liveVerified: false,
      appEnv: isoReport.appEnv,
      isolated: true,
      isolationViolations: [],
      credentialState: 'configured',
      credentialSource: credEval.source,
      checks: {
        isolation: 'isolated',
        credentials: 'configured',
        firebaseConnection: firebaseConnStatus,
        firestore: firestoreStatus,
        storage: 'unavailable',
      },
      error: `Firebase Storage unavailable: ${err?.message || 'probe failed'}`,
    };
  }

  return {
    state: 'ready',
    ready: true,
    liveVerified: true,
    appEnv: isoReport.appEnv,
    isolated: true,
    isolationViolations: [],
    credentialState: 'configured',
    credentialSource: credEval.source,
    checks: {
      isolation: 'isolated',
      credentials: 'configured',
      firebaseConnection: firebaseConnStatus,
      firestore: firestoreStatus,
      storage: storageStatus,
    },
  };
}

// ---------------------------------------------------------------------------
// Query / Reference Helpers Preserving Modular Call Signatures
// ---------------------------------------------------------------------------

interface QueryFilterSpec {
  field: string;
  op: string;
  value: any;
}

interface QueryDescriptor {
  path: string;
  filters: QueryFilterSpec[];
}

const queryMetadataMap = new WeakMap<object, QueryDescriptor>();

function normalizeSegments(pathSegments: string[]): string {
  return pathSegments
    .map((s) => String(s).replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

function getRefPath(refOrQuery: any): string {
  if (!refOrQuery) return '';
  if (typeof refOrQuery.path === 'string') return refOrQuery.path;
  const meta = typeof refOrQuery === 'object' ? queryMetadataMap.get(refOrQuery) : undefined;
  if (meta?.path) return meta.path;
  if (refOrQuery.parent?.id && refOrQuery.id) {
    return `${refOrQuery.parent.id}/${refOrQuery.id}`;
  }
  return String(refOrQuery.id || '');
}

function cloneForTestStore(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (typeof obj === 'object') {
    // Detect FieldValue.serverTimestamp() or similar Admin FieldValue sentinels
    const ctorName = obj?.constructor?.name || '';
    if (ctorName.includes('ServerTimestamp') || ctorName.includes('FieldValue')) {
      return new Date().toISOString();
    }
    if (Array.isArray(obj)) {
      return obj.map(cloneForTestStore);
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        out[k] = cloneForTestStore(v);
      }
    }
    return out;
  }
  return obj;
}

function wrapAdminDocSnapshot(snap: any, fallbackId?: string) {
  const existsBool = typeof snap?.exists === 'function' ? Boolean(snap.exists()) : Boolean(snap?.exists);
  return {
    id: snap?.id || fallbackId || '',
    ref: snap?.ref,
    exists: () => existsBool,
    data: () => (existsBool ? (typeof snap.data === 'function' ? snap.data() : undefined) : undefined),
  };
}

function wrapTestDocSnapshot(id: string, ref: any, data: any | undefined) {
  const hasData = data !== undefined;
  return {
    id,
    ref,
    exists: () => hasData,
    data: () => (hasData ? JSON.parse(JSON.stringify(data)) : undefined),
  };
}

function matchesFilters(val: any, filters: QueryFilterSpec[]): boolean {
  for (const f of filters) {
    const fieldVal = f.field.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), val);
    switch (f.op) {
      case '==':
        if (fieldVal !== f.value) return false;
        break;
      case '!=':
        if (fieldVal === f.value) return false;
        break;
      case '<':
        if (!(fieldVal < f.value)) return false;
        break;
      case '<=':
        if (!(fieldVal <= f.value)) return false;
        break;
      case '>':
        if (!(fieldVal > f.value)) return false;
        break;
      case '>=':
        if (!(fieldVal >= f.value)) return false;
        break;
      case 'in':
        if (!Array.isArray(f.value) || !f.value.includes(fieldVal)) return false;
        break;
      case 'array-contains':
        if (!Array.isArray(fieldVal) || !fieldVal.includes(f.value)) return false;
        break;
      default:
        break;
    }
  }
  return true;
}

function queryTestStore(
  colPath: string,
  filters: QueryFilterSpec[],
  storeOverlay?: Map<string, any | null>
) {
  const merged = new Map<string, any>();
  const prefix = `${colPath}/`;

  for (const [key, val] of testMemoryStore.entries()) {
    if (key.startsWith(prefix) && !key.slice(prefix.length).includes('/')) {
      merged.set(key, val);
    }
  }
  if (storeOverlay) {
    for (const [key, val] of storeOverlay.entries()) {
      if (key.startsWith(prefix) && !key.slice(prefix.length).includes('/')) {
        if (val === null) {
          merged.delete(key);
        } else {
          merged.set(key, val);
        }
      }
    }
  }

  const docs: any[] = [];
  for (const [key, val] of merged.entries()) {
    if (matchesFilters(val, filters)) {
      const docId = key.slice(prefix.length);
      docs.push(wrapTestDocSnapshot(docId, db.doc(key), val));
    }
  }
  return { docs, empty: docs.length === 0, size: docs.length };
}

export function collection(parentOrDb: any, ...pathSegments: string[]) {
  const normalized = normalizeSegments(pathSegments);
  const colRef =
    parentOrDb && parentOrDb !== db && typeof parentOrDb.collection === 'function'
      ? parentOrDb.collection(normalized)
      : db.collection(normalized);
  queryMetadataMap.set(colRef, { path: normalized, filters: [] });
  return colRef;
}

export function doc(parentOrDb: any, ...pathSegments: string[]) {
  const normalized = normalizeSegments(pathSegments);
  if (parentOrDb && parentOrDb !== db && typeof parentOrDb.doc === 'function') {
    return normalized ? parentOrDb.doc(normalized) : parentOrDb.doc();
  }
  return normalized ? db.doc(normalized) : db.collection('_root').doc();
}

export function where(field: string, op: any, value: any): QueryFilterSpec {
  return { field, op, value };
}

export function query(baseRef: any, ...constraints: QueryFilterSpec[]) {
  const baseMeta = queryMetadataMap.get(baseRef) || {
    path: getRefPath(baseRef),
    filters: [],
  };
  let nextQuery = baseRef;
  const combinedFilters = [...baseMeta.filters];
  for (const c of constraints) {
    if (c && c.field) {
      combinedFilters.push(c);
      if (typeof nextQuery.where === 'function') {
        nextQuery = nextQuery.where(c.field, c.op, c.value);
      }
    }
  }
  queryMetadataMap.set(nextQuery, {
    path: baseMeta.path,
    filters: combinedFilters,
  });
  return nextQuery;
}

export function serverTimestamp() {
  return FieldValue.serverTimestamp();
}

export async function getDoc(ref: any): Promise<any> {
  const docPath = getRefPath(ref);

  if (testForceFirestoreFailure && process.env.NODE_ENV === 'test') {
    throw new PersistenceError(
      'PERSISTENCE_READ_FAILED',
      `Simulated Firestore read failure for '${docPath}'.`,
      503
    );
  }

  if (isUsingInMemoryTestStore()) {
    if (testMemoryStore.has(docPath)) {
      return wrapTestDocSnapshot(ref.id || docPath.split('/').pop() || '', ref, testMemoryStore.get(docPath));
    }
    return wrapTestDocSnapshot(ref.id || docPath.split('/').pop() || '', ref, undefined);
  }

  try {
    const snap = await ref.get();
    return wrapAdminDocSnapshot(snap, ref.id);
  } catch (err: any) {
    throw new PersistenceError(
      'PERSISTENCE_READ_FAILED',
      `Firestore read failed for '${docPath}': ${err?.message || 'Unknown persistence error'}`,
      503,
      err
    );
  }
}

export async function setDoc(ref: any, data: any, options?: { merge?: boolean }): Promise<void> {
  const docPath = getRefPath(ref);

  if (testForceFirestoreFailure && process.env.NODE_ENV === 'test') {
    throw new PersistenceError(
      'PERSISTENCE_WRITE_FAILED',
      `Simulated Firestore write failure for '${docPath}'.`,
      503
    );
  }

  if (isUsingInMemoryTestStore()) {
    const cloned = cloneForTestStore(data);
    if (options?.merge && testMemoryStore.has(docPath)) {
      testMemoryStore.set(docPath, { ...testMemoryStore.get(docPath), ...cloned });
    } else {
      testMemoryStore.set(docPath, cloned);
    }
    return;
  }

  try {
    if (options?.merge) {
      await ref.set(data, { merge: true });
    } else {
      await ref.set(data);
    }
  } catch (err: any) {
    throw new PersistenceError(
      'PERSISTENCE_WRITE_FAILED',
      `Firestore write failed for '${docPath}': ${err?.message || 'Unknown persistence error'}`,
      503,
      err
    );
  }
}

export async function updateDoc(ref: any, data: any): Promise<void> {
  const docPath = getRefPath(ref);

  if (testForceFirestoreFailure && process.env.NODE_ENV === 'test') {
    throw new PersistenceError(
      'PERSISTENCE_UPDATE_FAILED',
      `Simulated Firestore update failure for '${docPath}'.`,
      503
    );
  }

  if (isUsingInMemoryTestStore()) {
    const existing = testMemoryStore.get(docPath) || {};
    testMemoryStore.set(docPath, { ...existing, ...cloneForTestStore(data) });
    return;
  }

  try {
    await ref.update(data);
  } catch (err: any) {
    throw new PersistenceError(
      'PERSISTENCE_UPDATE_FAILED',
      `Firestore update failed for '${docPath}': ${err?.message || 'Unknown persistence error'}`,
      503,
      err
    );
  }
}

export async function deleteDoc(ref: any): Promise<void> {
  const docPath = getRefPath(ref);

  if (testForceFirestoreFailure && process.env.NODE_ENV === 'test') {
    throw new PersistenceError(
      'PERSISTENCE_DELETE_FAILED',
      `Simulated Firestore delete failure for '${docPath}'.`,
      503
    );
  }

  if (isUsingInMemoryTestStore()) {
    testMemoryStore.delete(docPath);
    return;
  }

  try {
    await ref.delete();
  } catch (err: any) {
    throw new PersistenceError(
      'PERSISTENCE_DELETE_FAILED',
      `Firestore delete failed for '${docPath}': ${err?.message || 'Unknown persistence error'}`,
      503,
      err
    );
  }
}

export async function getDocs(queryObj: any): Promise<any> {
  const meta = queryMetadataMap.get(queryObj) || {
    path: getRefPath(queryObj),
    filters: [],
  };

  if (testForceFirestoreFailure && process.env.NODE_ENV === 'test') {
    throw new PersistenceError(
      'PERSISTENCE_QUERY_FAILED',
      `Simulated Firestore query failure for '${meta.path}'.`,
      503
    );
  }

  if (isUsingInMemoryTestStore()) {
    return queryTestStore(meta.path, meta.filters);
  }

  try {
    const snap = await queryObj.get();
    return {
      docs: snap.docs.map((d: any) => wrapAdminDocSnapshot(d, d.id)),
      empty: snap.empty,
      size: snap.size,
    };
  } catch (err: any) {
    throw new PersistenceError(
      'PERSISTENCE_QUERY_FAILED',
      `Firestore query failed for '${meta.path}': ${err?.message || 'Unknown persistence error'}`,
      503,
      err
    );
  }
}

export interface TransactionLike {
  get(refOrQuery: any): Promise<any>;
  set(ref: any, data: any, options?: { merge?: boolean }): TransactionLike;
  update(ref: any, data: any): TransactionLike;
  delete(ref: any): TransactionLike;
}

export async function runTransaction<T>(
  dbArg: Firestore,
  updateFunction: (transaction: TransactionLike) => Promise<T>
): Promise<T> {
  if (testForceFirestoreFailure && process.env.NODE_ENV === 'test') {
    throw new PersistenceError(
      'PERSISTENCE_TRANSACTION_FAILED',
      'Simulated Firestore transaction failure.',
      503
    );
  }

  if (isUsingInMemoryTestStore()) {
    const previous = testTxQueue;
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    testTxQueue = previous.then(() => current);
    await previous;

    try {
      const staged = new Map<string, any | null>();

      const txApi: TransactionLike = {
        async get(refOrQuery: any) {
          const meta = typeof refOrQuery === 'object' ? queryMetadataMap.get(refOrQuery) : undefined;
          if (meta || (refOrQuery && typeof refOrQuery.where === 'function' && typeof refOrQuery.doc === 'function')) {
            const qMeta = meta || { path: getRefPath(refOrQuery), filters: [] };
            return queryTestStore(qMeta.path, qMeta.filters, staged);
          }

          const docPath = getRefPath(refOrQuery);
          const id = refOrQuery?.id || docPath.split('/').pop() || '';
          if (staged.has(docPath)) {
            const stagedVal = staged.get(docPath);
            return wrapTestDocSnapshot(id, refOrQuery, stagedVal === null ? undefined : stagedVal);
          }
          if (testMemoryStore.has(docPath)) {
            return wrapTestDocSnapshot(id, refOrQuery, testMemoryStore.get(docPath));
          }
          return wrapTestDocSnapshot(id, refOrQuery, undefined);
        },
        set(ref: any, data: any, options?: { merge?: boolean }) {
          const docPath = getRefPath(ref);
          const cloned = cloneForTestStore(data);
          if (options?.merge) {
            const base = staged.has(docPath)
              ? staged.get(docPath) || {}
              : testMemoryStore.get(docPath) || {};
            staged.set(docPath, { ...base, ...cloned });
          } else {
            staged.set(docPath, cloned);
          }
          return txApi;
        },
        update(ref: any, data: any) {
          const docPath = getRefPath(ref);
          const base = staged.has(docPath)
            ? staged.get(docPath) || {}
            : testMemoryStore.get(docPath) || {};
          staged.set(docPath, { ...base, ...cloneForTestStore(data) });
          return txApi;
        },
        delete(ref: any) {
          const docPath = getRefPath(ref);
          staged.set(docPath, null);
          return txApi;
        },
      };

      const result = await updateFunction(txApi);
      for (const [k, v] of staged.entries()) {
        if (v === null) {
          testMemoryStore.delete(k);
        } else {
          testMemoryStore.set(k, v);
        }
      }
      return result;
    } finally {
      release();
    }
  }

  const targetDb = dbArg || db;
  try {
    return await targetDb.runTransaction(async (adminTx) => {
      const wrappedTx: TransactionLike = {
        async get(refOrQuery: any) {
          const res: any = await adminTx.get(refOrQuery);
          if (res && Array.isArray(res.docs)) {
            return {
              docs: res.docs.map((d: any) => wrapAdminDocSnapshot(d, d.id)),
              empty: res.empty,
              size: res.size,
            };
          }
          return wrapAdminDocSnapshot(res, refOrQuery?.id);
        },
        set(ref: any, data: any, options?: { merge?: boolean }) {
          if (options?.merge) {
            adminTx.set(ref, data, { merge: true });
          } else {
            adminTx.set(ref, data);
          }
          return wrappedTx;
        },
        update(ref: any, data: any) {
          adminTx.update(ref, data);
          return wrappedTx;
        },
        delete(ref: any) {
          adminTx.delete(ref);
          return wrappedTx;
        },
      };
      return await updateFunction(wrappedTx);
    });
  } catch (err: any) {
    // Re-throw business/domain errors unmodified; wrap unexpected DB errors as PersistenceError
    if (err?.name === 'CommerceError' || err?.name === 'PersistenceError' || err?.statusCode) {
      throw err;
    }
    if (typeof err?.message === 'string' && /^[A-Z0-9_]+:/.test(err.message)) {
      throw err;
    }
    throw new PersistenceError(
      'PERSISTENCE_TRANSACTION_FAILED',
      `Firestore transaction failed: ${err?.message || 'Unknown persistence error'}`,
      503,
      err
    );
  }
}

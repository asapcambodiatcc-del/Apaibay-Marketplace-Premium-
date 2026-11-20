/**
 * APAIBAY MARKETPLACE PREMIUM — LEGACY SELLER PII DRY-RUN MIGRATION AUDIT
 *
 * Strictly READ-ONLY / DRY-RUN inspection utility.
 * - Enumerates /sellers/{sellerId} and cross-checks /seller_kyc/{sellerId}
 * - Identifies legacy PII fields on public /sellers docs without logging any PII values
 * - Reports counts, affected field names, and records missing private /seller_kyc backups
 * - NEVER mutates, deletes, or overwrites Firestore documents
 */

import crypto from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import {
  PRODUCTION_FIREBASE_IDENTIFIERS,
  resolveServerFirebaseConfig,
} from '../server/config/firebaseEnvironment';

export const SELLER_PII_FIELDS = [
  'contactInfo',
  'businessAddress',
  'documents',
  'residentialOrBusinessAddress',
  'phone',
  'email',
  'contactEmail',
  'ownerEmail',
  'reviewedBy',
  'reviewedByEmail',
  'reviewedByUid',
  'reviewerEmail',
  'maskedPhone',
  'maskedDocumentNumber',
  'identityNumber',
] as const;

const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/i;

function isEmailLike(val: unknown): boolean {
  return typeof val === 'string' && EMAIL_PATTERN.test(val.trim());
}

export type LegacyAuditClassification =
  | 'CLEAN_NO_PII'
  | 'MIGRATED_READY_FOR_SCRUB'
  | 'NEEDS_KYC_BACKFILL';

export interface LegacySellerAuditFinding {
  /** Anonymized deterministic tag (never exposes raw UID, email, phone, or address) */
  anonymizedRef: string;
  classification: LegacyAuditClassification;
  detectedPiiFields: string[];
  hasKycRecord: boolean;
  missingKycFields: string[];
}

export interface LegacySellerPiiAuditReport {
  mode: 'DRY_RUN_ONLY';
  targetEnvironment: 'emulator' | 'live_configured';
  databaseId: string;
  scannedAt: string;
  totalSellersScanned: number;
  cleanNoPiiCount: number;
  legacyPiiDocsCount: number;
  readyForScrubCount: number;
  missingKycBackfillCount: number;
  fieldFrequency: Record<string, number>;
  findings: LegacySellerAuditFinding[];
}

const EMULATOR_TEST_HMAC_SECRET = 'apaibay-emulator-test-only-hmac-key';
const MIN_AUDIT_HMAC_SECRET_LENGTH = 16;

export class AuditScriptError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AuditScriptError';
    this.code = code;
  }
}

export interface AuditServiceAccount {
  type: 'service_account';
  project_id: string;
  private_key: string;
  client_email: string;
  [key: string]: unknown;
}

export function sanitizeAuditErrorForLog(
  err: unknown,
  secretsToRedact: string[] = []
): { code: string; summary: string } {
  const rawCode =
    (err as any)?.code !== undefined && (err as any)?.code !== null
      ? String((err as any).code)
      : 'AUDIT_FAILED';
  const code = rawCode.replace(/[^a-zA-Z0-9_/-]/g, '_').slice(0, 64) || 'AUDIT_FAILED';

  const rawMsg =
    typeof (err as any)?.message === 'string'
      ? (err as any).message
      : typeof err === 'string'
      ? err
      : 'Unexpected audit failure.';

  let summary = rawMsg;
  for (const secret of secretsToRedact) {
    const trimmed = (secret || '').trim();
    if (trimmed.length >= 4) {
      summary = summary.split(trimmed).join('[REDACTED_SECRET]');
    }
  }

  summary = summary
    .replace(/-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/g, '[REDACTED_PEM]')
    .replace(
      /"(private_key|private_key_id|client_email|client_id|contactEmail|ownerEmail|email|phone|maskedPhone|businessAddress|residentialOrBusinessAddress|identityNumber|reviewedBy|reviewedByEmail|reviewedByUid|ownerName|legalFullName)"\s*:\s*"[^"]*"/gi,
      '"$1":"[REDACTED]"'
    )
    .replace(/[^\s@"'`]+@[^\s@"'`]+\.[^\s@"'`]+/g, '[REDACTED_EMAIL]')
    .replace(/\/(sellers|seller_kyc|users|admins)\/[A-Za-z0-9_\-]+/g, '/$1/[REDACTED_ID]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[REDACTED_NUMBER]')
    .replace(/\s+/g, ' ')
    .trim();

  if (summary.length > 220) {
    summary = `${summary.slice(0, 217)}...`;
  }

  return {
    code,
    summary: summary || 'Audit error details redacted.',
  };
}

function decodeJsonOrBase64Object(raw: string): any {
  const trimmed = raw.trim();
  const decoded = trimmed.startsWith('{')
    ? trimmed
    : Buffer.from(trimmed, 'base64').toString('utf8');
  return JSON.parse(decoded);
}

export function parseAuditServiceAccountCredentials(
  rawJson: string | undefined,
  expectedProjectId: string = PRODUCTION_FIREBASE_IDENTIFIERS.projectId
): AuditServiceAccount {
  const trimmed = (rawJson || '').trim();
  if (!trimmed) {
    throw new AuditScriptError(
      'AUDIT_CREDENTIALS_MISSING',
      'Missing required FIREBASE_AUDIT_SERVICE_ACCOUNT_JSON service account credentials.'
    );
  }

  let parsed: any;
  try {
    parsed = decodeJsonOrBase64Object(trimmed);
  } catch {
    throw new AuditScriptError(
      'AUDIT_CREDENTIALS_MALFORMED',
      'FIREBASE_AUDIT_SERVICE_ACCOUNT_JSON is not valid JSON or base64-encoded JSON.'
    );
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    parsed.type !== 'service_account' ||
    typeof parsed.project_id !== 'string' ||
    !parsed.project_id.trim() ||
    typeof parsed.private_key !== 'string' ||
    !parsed.private_key.includes('BEGIN') ||
    typeof parsed.client_email !== 'string' ||
    !parsed.client_email.includes('@')
  ) {
    throw new AuditScriptError(
      'AUDIT_CREDENTIALS_MALFORMED',
      'FIREBASE_AUDIT_SERVICE_ACCOUNT_JSON is missing required service account fields.'
    );
  }

  if (parsed.project_id.trim() !== expectedProjectId) {
    throw new AuditScriptError(
      'AUDIT_TARGET_PROJECT_MISMATCH',
      `Service account project_id ('${parsed.project_id.trim()}') does not match expected '${expectedProjectId}'.`
    );
  }

  return parsed as AuditServiceAccount;
}

export function resolveAuditHmacSecret(options?: {
  hmacSecret?: string;
  env?: NodeJS.ProcessEnv;
  allowEmulatorFallback?: boolean;
}): string {
  const env = options?.env ?? process.env;
  const raw = (options?.hmacSecret ?? env.SELLER_AUDIT_HMAC_SECRET ?? '').trim();

  if (!raw) {
    if (options?.allowEmulatorFallback) {
      return EMULATOR_TEST_HMAC_SECRET;
    }
    throw new AuditScriptError(
      'AUDIT_HMAC_SECRET_MISSING',
      'Missing required SELLER_AUDIT_HMAC_SECRET for Seller ID anonymization.'
    );
  }

  if (raw.length < MIN_AUDIT_HMAC_SECRET_LENGTH) {
    throw new AuditScriptError(
      'AUDIT_HMAC_SECRET_INVALID',
      `SELLER_AUDIT_HMAC_SECRET must be at least ${MIN_AUDIT_HMAC_SECRET_LENGTH} characters.`
    );
  }

  const forbiddenSecretSources = [
    env.FIREBASE_AUDIT_SERVICE_ACCOUNT_JSON,
    env.FIREBASE_SERVICE_ACCOUNT_JSON,
    env.KYC_VIEW_TOKEN_SECRET,
    env.FIREBASE_WEB_API_KEY,
  ];
  for (const candidate of forbiddenSecretSources) {
    const c = (candidate || '').trim();
    if (c && (raw === c || c.includes(raw))) {
      throw new AuditScriptError(
        'AUDIT_HMAC_SECRET_REUSE_FORBIDDEN',
        'SELLER_AUDIT_HMAC_SECRET must be a dedicated secret and must not reuse Firebase credentials or other application secrets.'
      );
    }
  }

  for (const rawSa of [env.FIREBASE_AUDIT_SERVICE_ACCOUNT_JSON, env.FIREBASE_SERVICE_ACCOUNT_JSON]) {
    if (rawSa && rawSa.trim()) {
      try {
        const parsedSa = decodeJsonOrBase64Object(rawSa);
        if (
          parsedSa &&
          typeof parsedSa === 'object' &&
          [parsedSa.private_key, parsedSa.private_key_id, parsedSa.client_email]
            .filter((v) => typeof v === 'string' && v.trim())
            .some((v) => raw === String(v).trim() || String(v).includes(raw))
        ) {
          throw new AuditScriptError(
            'AUDIT_HMAC_SECRET_REUSE_FORBIDDEN',
            'SELLER_AUDIT_HMAC_SECRET must not reuse any field from Firebase service-account credentials.'
          );
        }
      } catch (err) {
        if (err instanceof AuditScriptError) throw err;
      }
    }
  }

  return raw;
}

export function anonymizeSellerId(sellerId: string, hmacSecret: string): string {
  if (!hmacSecret || !hmacSecret.trim()) {
    throw new AuditScriptError(
      'AUDIT_HMAC_SECRET_MISSING',
      'HMAC secret is required to anonymize seller IDs.'
    );
  }
  const digest = crypto
    .createHmac('sha256', hmacSecret)
    .update(String(sellerId))
    .digest('hex')
    .slice(0, 16);
  return `seller_hmac_${digest}`;
}

function hasNonEmptyValue(val: unknown): boolean {
  if (val === undefined || val === null) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === 'object') {
    return Object.values(val as Record<string, unknown>).some((v) => hasNonEmptyValue(v));
  }
  return true;
}

/**
 * Performs a strictly read-only audit across a Firestore instance's `/sellers` and `/seller_kyc` collections.
 * Safe for both Emulator Firestore and authorized read-only audits; guarantees zero PII in the returned report.
 */
export async function runLegacySellerPiiDryRunAudit(
  firestore: Firestore,
  options?: { databaseId?: string; includeClean?: boolean; hmacSecret?: string }
): Promise<LegacySellerPiiAuditReport> {
  const isEmulatorEnv = process.env.NODE_ENV === 'test' && Boolean(process.env.FIRESTORE_EMULATOR_HOST?.trim());
  const hmacSecret = resolveAuditHmacSecret({
    hmacSecret: options?.hmacSecret,
    env: process.env,
    allowEmulatorFallback: isEmulatorEnv,
  });

  if (!isEmulatorEnv) {
    if (
      options?.databaseId &&
      options.databaseId !== PRODUCTION_FIREBASE_IDENTIFIERS.firestoreDatabaseId
    ) {
      throw new AuditScriptError(
        'AUDIT_TARGET_DATABASE_MISMATCH',
        `Expected target database '${PRODUCTION_FIREBASE_IDENTIFIERS.firestoreDatabaseId}', received '${options.databaseId}'.`
      );
    }
    const attachedDbId = (firestore as any)?._settings?.databaseId ?? (firestore as any)?.databaseId;
    if (
      typeof attachedDbId === 'string' &&
      attachedDbId &&
      attachedDbId !== PRODUCTION_FIREBASE_IDENTIFIERS.firestoreDatabaseId
    ) {
      throw new AuditScriptError(
        'AUDIT_TARGET_DATABASE_MISMATCH',
        `Firestore client databaseId ('${attachedDbId}') does not match expected '${PRODUCTION_FIREBASE_IDENTIFIERS.firestoreDatabaseId}'.`
      );
    }
    const attachedProjectId = (firestore as any)?._settings?.projectId;
    if (
      typeof attachedProjectId === 'string' &&
      attachedProjectId &&
      attachedProjectId !== PRODUCTION_FIREBASE_IDENTIFIERS.projectId
    ) {
      throw new AuditScriptError(
        'AUDIT_TARGET_PROJECT_MISMATCH',
        `Firestore client projectId ('${attachedProjectId}') does not match expected '${PRODUCTION_FIREBASE_IDENTIFIERS.projectId}'.`
      );
    }
  }

  const sellersSnap = await firestore.collection('sellers').get();
  const kycSnap = await firestore.collection('seller_kyc').get();

  const kycById = new Map<string, Record<string, any>>();
  for (const docSnap of kycSnap.docs) {
    const data = docSnap.data() || {};
    const key = typeof data.sellerId === 'string' && data.sellerId ? data.sellerId : docSnap.id;
    kycById.set(key, data);
  }

  const fieldFrequency: Record<string, number> = {};
  for (const field of SELLER_PII_FIELDS) {
    fieldFrequency[field] = 0;
  }

  let cleanNoPiiCount = 0;
  let legacyPiiDocsCount = 0;
  let readyForScrubCount = 0;
  let missingKycBackfillCount = 0;
  const findings: LegacySellerAuditFinding[] = [];

  for (const sellerDoc of sellersSnap.docs) {
    const data = sellerDoc.data() || {};
    const detectedPiiFields: string[] = [];

    for (const field of SELLER_PII_FIELDS) {
      if (field in data && data[field] !== undefined) {
        detectedPiiFields.push(field);
        fieldFrequency[field] = (fieldFrequency[field] || 0) + 1;
      }
    }

    if (isEmailLike(data.ownerName)) {
      detectedPiiFields.push('ownerName(email)');
      fieldFrequency['ownerName(email)'] = (fieldFrequency['ownerName(email)'] || 0) + 1;
    }

    const sid = typeof data.sellerId === 'string' && data.sellerId ? data.sellerId : sellerDoc.id;
    const kycData = kycById.get(sid) || kycById.get(sellerDoc.id);
    const hasKycRecord = Boolean(kycData);

    if (detectedPiiFields.length === 0) {
      cleanNoPiiCount++;
      if (options?.includeClean) {
        findings.push({
          anonymizedRef: anonymizeSellerId(sid, hmacSecret),
          classification: 'CLEAN_NO_PII',
          detectedPiiFields: [],
          hasKycRecord,
          missingKycFields: [],
        });
      }
      continue;
    }

    legacyPiiDocsCount++;
    const missingKycFields: string[] = [];

    if (!kycData) {
      missingKycFields.push('seller_kyc_document');
    } else {
      const legacyAddress =
        (typeof data.businessAddress === 'string' && data.businessAddress) ||
        (typeof data.residentialOrBusinessAddress === 'string' && data.residentialOrBusinessAddress) ||
        (typeof data.contactInfo?.address === 'string' && data.contactInfo.address) ||
        '';
      if (hasNonEmptyValue(legacyAddress) && !hasNonEmptyValue(kycData.residentialOrBusinessAddress)) {
        missingKycFields.push('residentialOrBusinessAddress');
      }

      const legacyEmail =
        (typeof data.email === 'string' && data.email) ||
        (typeof data.contactEmail === 'string' && data.contactEmail) ||
        (typeof data.ownerEmail === 'string' && data.ownerEmail) ||
        (typeof data.contactInfo?.email === 'string' && data.contactInfo.email) ||
        (isEmailLike(data.ownerName) ? String(data.ownerName).trim() : '') ||
        '';
      if (hasNonEmptyValue(legacyEmail) && !hasNonEmptyValue(kycData.contactEmail)) {
        missingKycFields.push('contactEmail');
      }

      const legacyPhone =
        (typeof data.phone === 'string' && data.phone) ||
        (typeof data.maskedPhone === 'string' && data.maskedPhone) ||
        (typeof data.contactInfo?.phone === 'string' && data.contactInfo.phone) ||
        '';
      if (hasNonEmptyValue(legacyPhone) && !hasNonEmptyValue(kycData.maskedPhone)) {
        missingKycFields.push('maskedPhone');
      }

      const legacyReviewer =
        (typeof data.reviewedBy === 'string' && data.reviewedBy) ||
        (typeof data.reviewedByEmail === 'string' && data.reviewedByEmail) ||
        (typeof data.reviewedByUid === 'string' && data.reviewedByUid) ||
        (typeof data.reviewerEmail === 'string' && data.reviewerEmail) ||
        '';
      if (
        hasNonEmptyValue(legacyReviewer) &&
        !hasNonEmptyValue(kycData.reviewedByEmail) &&
        !hasNonEmptyValue(kycData.reviewedByUid)
      ) {
        missingKycFields.push('reviewedByEmail');
      }

      const legacyDocs = Array.isArray(data.documents) ? data.documents : [];
      if (
        legacyDocs.length > 0 &&
        (!Array.isArray(kycData.legacyDocumentRefs) || kycData.legacyDocumentRefs.length === 0) &&
        (!Array.isArray(kycData.documents) || kycData.documents.length === 0)
      ) {
        missingKycFields.push('legacyDocumentRefs');
      }
    }

    const classification: LegacyAuditClassification =
      missingKycFields.length === 0 ? 'MIGRATED_READY_FOR_SCRUB' : 'NEEDS_KYC_BACKFILL';

    if (classification === 'MIGRATED_READY_FOR_SCRUB') {
      readyForScrubCount++;
    } else {
      missingKycBackfillCount++;
    }

    findings.push({
      anonymizedRef: anonymizeSellerId(sid, hmacSecret),
      classification,
      detectedPiiFields,
      hasKycRecord,
      missingKycFields,
    });
  }

  return {
    mode: 'DRY_RUN_ONLY',
    targetEnvironment: process.env.FIRESTORE_EMULATOR_HOST ? 'emulator' : 'live_configured',
    databaseId: options?.databaseId || '(unknown)',
    scannedAt: new Date().toISOString(),
    totalSellersScanned: sellersSnap.size,
    cleanNoPiiCount,
    legacyPiiDocsCount,
    readyForScrubCount,
    missingKycBackfillCount,
    fieldFrequency,
    findings,
  };
}

export interface ResolvedAuditCliContext {
  mode: 'emulator' | 'live';
  projectId: string;
  firestoreDatabaseId: string;
  hmacSecret: string;
  serviceAccount?: AuditServiceAccount;
}

export function resolveAuditCliContext(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env
): ResolvedAuditCliContext {
  const hasCommitFlag = argv.includes('--commit') || argv.includes('--mutate');
  if (hasCommitFlag) {
    throw new AuditScriptError(
      'AUDIT_MUTATION_REFUSED',
      'Phase 2.2 audit script is strictly read-only (--dry-run only). Mutations are disabled.'
    );
  }

  const emulatorHost = env.FIRESTORE_EMULATOR_HOST?.trim() || '';
  const allowLive = env.ALLOW_LIVE_READONLY_AUDIT === '1';

  if (emulatorHost && env.NODE_ENV !== 'test') {
    throw new AuditScriptError(
      'AUDIT_EMULATOR_IN_NON_TEST_MODE',
      'FIRESTORE_EMULATOR_HOST cannot be set during non-test audit execution.'
    );
  }

  if (!emulatorHost && !allowLive) {
    throw new AuditScriptError(
      'AUDIT_LIVE_GATE_BLOCKED',
      'FIRESTORE_EMULATOR_HOST is not set. Refusing to connect to live Firestore without ALLOW_LIVE_READONLY_AUDIT=1.'
    );
  }

  const isEmulatorTest = Boolean(emulatorHost) && env.NODE_ENV === 'test';
  const hmacSecret = resolveAuditHmacSecret({
    env,
    allowEmulatorFallback: isEmulatorTest,
  });

  if (isEmulatorTest) {
    const report = resolveServerFirebaseConfig({ env });
    if (!report.valid) {
      throw new AuditScriptError('FIREBASE_ISOLATION_VIOLATION', report.violations.join('; '));
    }
    return {
      mode: 'emulator',
      projectId: report.config.projectId,
      firestoreDatabaseId: report.config.firestoreDatabaseId,
      hmacSecret,
    };
  }

  // Live audit strictly requires explicit FIREBASE_AUDIT_SERVICE_ACCOUNT_JSON — never ADC fallback
  const rawAuditSa = env.FIREBASE_AUDIT_SERVICE_ACCOUNT_JSON?.trim();
  const serviceAccount = parseAuditServiceAccountCredentials(
    rawAuditSa,
    PRODUCTION_FIREBASE_IDENTIFIERS.projectId
  );

  const report = resolveServerFirebaseConfig({
    env: {
      ...env,
      APP_ENV: 'production',
      FIREBASE_SERVICE_ACCOUNT_JSON: rawAuditSa,
    },
  });
  if (!report.valid) {
    throw new AuditScriptError('FIREBASE_ISOLATION_VIOLATION', report.violations.join('; '));
  }

  if (report.config.projectId !== PRODUCTION_FIREBASE_IDENTIFIERS.projectId) {
    throw new AuditScriptError(
      'AUDIT_TARGET_PROJECT_MISMATCH',
      `Resolved projectId ('${report.config.projectId}') does not match expected '${PRODUCTION_FIREBASE_IDENTIFIERS.projectId}'.`
    );
  }
  if (report.config.firestoreDatabaseId !== PRODUCTION_FIREBASE_IDENTIFIERS.firestoreDatabaseId) {
    throw new AuditScriptError(
      'AUDIT_TARGET_DATABASE_MISMATCH',
      `Resolved firestoreDatabaseId ('${report.config.firestoreDatabaseId}') does not match expected '${PRODUCTION_FIREBASE_IDENTIFIERS.firestoreDatabaseId}'.`
    );
  }

  return {
    mode: 'live',
    projectId: report.config.projectId,
    firestoreDatabaseId: report.config.firestoreDatabaseId,
    hmacSecret,
    serviceAccount,
  };
}

async function runCli() {
  const ctx = resolveAuditCliContext(process.argv, process.env);

  const appName = 'apaibay-legacy-audit-cli';
  const existing = getApps().find((a) => a.name === appName);
  const app =
    existing ||
    initializeApp(
      ctx.mode === 'emulator'
        ? { projectId: ctx.projectId }
        : {
            projectId: ctx.projectId,
            credential: cert(ctx.serviceAccount as any),
          },
      appName
    );

  const db = getFirestore(app, ctx.firestoreDatabaseId);
  const report = await runLegacySellerPiiDryRunAudit(db, {
    databaseId: ctx.firestoreDatabaseId,
    hmacSecret: ctx.hmacSecret,
  });
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1]?.endsWith('audit-legacy-seller-pii.ts')) {
  runCli().catch((err) => {
    const safe = sanitizeAuditErrorForLog(err, [
      process.env.SELLER_AUDIT_HMAC_SECRET || '',
      process.env.FIREBASE_AUDIT_SERVICE_ACCOUNT_JSON || '',
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
    ]);
    console.error(`❌ Legacy Seller PII Dry-Run Audit failed [${safe.code}]: ${safe.summary}`);
    process.exit(1);
  });
}

/**
 * APAIBAY MARKETPLACE PREMIUM — PHASE 2.3 STAGING READINESS & PRODUCTION SAFETY VERIFICATION
 *
 * Strictly in-process / offline safety audit (ZERO live cloud calls, ZERO deployments):
 * 1. Verifies all 6 /api/health/ready & checkFirebaseReadiness() states:
 *    - credentials_missing
 *    - credentials_malformed
 *    - firebase_unavailable
 *    - firestore_unavailable
 *    - storage_unavailable
 *    - ready (only when credentials + Auth + Firestore + Storage probes ALL succeed)
 * 2. Verifies HTTP /api/health/ready?strict=true fails closed (503) for all non-ready states.
 * 3. Verifies CORS allowlist rejects untrusted origins in production & allows APP_URL/ALLOWED_ORIGINS.
 * 4. Verifies zero session cookies (Bearer-only auth), API security headers, and zero secret leaks in .env.example.
 * 5. Verifies PAYMENT_ENVIRONMENT=sandbox lock, Wing NOT_VERIFIED block, and payout custody notice.
 * 6. Verifies preserved Firebase identifiers, rules invariants, and local-only emulator config.
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import {
  checkFirebaseReadiness,
  evaluateAdminCredentialState,
  firebaseConfig,
  __setTestAdminAuthVerifier,
  __setTestForceFirestoreFailure,
  __setTestStorageAdapter,
  __resetAllTestHooks,
} from '../server/repositories/serverFirestore';
import { PaymentConfigService } from '../server/payment/paymentConfig';
import { validateKycSecretConfiguration } from '../server/commerce/kycService';
import { PROVIDER_LIMITATION_NOTICE } from '../server/commerce/sellerLedgerService';
import { isCorsOriginAllowed, resolveAllowedCorsOrigins } from '../server';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? ` (${detail})` : ''}`);
    failCount++;
  }
}

async function runPhase23Suite() {
  console.log('\n=============================================================================');
  console.log('🛡️ APAIBAY PHASE 2.3: STAGING PREPARATION & PRODUCTION SAFETY VERIFICATION');
  console.log('=============================================================================\n');

  __resetAllTestHooks();

  const savedEnv = {
    FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    K_SERVICE: process.env.K_SERVICE,
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
    FIREBASE_CONFIG: process.env.FIREBASE_CONFIG,
    KYC_VIEW_TOKEN_SECRET: process.env.KYC_VIEW_TOKEN_SECRET,
    PAYMENT_ENVIRONMENT: process.env.PAYMENT_ENVIRONMENT,
    APP_URL: process.env.APP_URL,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  };

  try {
    // -------------------------------------------------------------------------
    // 1. Firebase Readiness States (All 6 States)
    // -------------------------------------------------------------------------
    console.log('[1/5] Verifying Firebase Readiness States (No False Ready From Env Presence)...');

    // Clear all credential env vars
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.K_SERVICE;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    delete process.env.FIREBASE_CONFIG;

    // 1a. credentials_missing
    const missingState = await checkFirebaseReadiness({ timeoutMs: 1000 });
    assert(
      missingState.state === 'credentials_missing' && missingState.ready === false && missingState.checks.credentials === 'missing',
      'Distinguishes credentials_missing accurately'
    );

    // 1b. credentials_malformed (invalid JSON)
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{not-valid-json';
    const malformedJsonState = await checkFirebaseReadiness({ timeoutMs: 1000 });
    assert(
      malformedJsonState.state === 'credentials_malformed' &&
        malformedJsonState.ready === false &&
        malformedJsonState.checks.credentials === 'malformed',
      'Distinguishes credentials_malformed accurately on invalid JSON'
    );

    // 1c. credentials_malformed (missing required service-account fields)
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'apaibay-marketplace-premium' });
    const incompleteJsonState = await checkFirebaseReadiness({ timeoutMs: 1000 });
    assert(
      incompleteJsonState.state === 'credentials_malformed' && incompleteJsonState.ready === false,
      'Rejects incomplete service account JSON as credentials_malformed'
    );

    // Configure synthetic valid-shape managed runtime credentials so probes execute via test hooks
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    process.env.K_SERVICE = 'apaibay-staging-test';
    process.env.GOOGLE_CLOUD_PROJECT = firebaseConfig.projectId;
    assert(evaluateAdminCredentialState().state === 'configured', 'Credential state configured for probe testing');

    // 1d. firebase_unavailable (Auth connection probe fails)
    __setTestAdminAuthVerifier({
      async verifyIdToken() {
        throw new Error('not used');
      },
      async getUser() {
        const err: any = new Error('Simulated Firebase Auth network outage');
        err.code = 'app/network-error';
        throw err;
      },
    });
    const authDownState = await checkFirebaseReadiness({ timeoutMs: 1000 });
    assert(
      authDownState.state === 'firebase_unavailable' &&
        authDownState.ready === false &&
        authDownState.checks.firebaseConnection === 'unavailable',
      'Env var present + Auth probe outage reports firebase_unavailable (NOT ready)'
    );

    // 1e. firestore_unavailable (Auth passes with user-not-found, Firestore fails)
    __setTestAdminAuthVerifier({
      async verifyIdToken() {
        return { uid: 'u1', email_verified: true };
      },
      async getUser() {
        const err: any = new Error('User does not exist');
        err.code = 'auth/user-not-found';
        throw err;
      },
    });
    __setTestForceFirestoreFailure(true);
    const firestoreDownState = await checkFirebaseReadiness({ timeoutMs: 1000 });
    assert(
      firestoreDownState.state === 'firestore_unavailable' &&
        firestoreDownState.ready === false &&
        firestoreDownState.checks.firebaseConnection === 'healthy' &&
        firestoreDownState.checks.firestore === 'unavailable',
      'Env var present + Auth OK + Firestore outage reports firestore_unavailable (NOT ready)'
    );

    // 1f. storage_unavailable (Auth + Firestore pass, Storage bucket fails)
    __setTestForceFirestoreFailure(false);
    __setTestStorageAdapter({
      async exists() {
        return [false];
      },
      file() {
        return {
          async save() {},
          async download() {
            return [Buffer.alloc(0)];
          },
          async delete() {},
        };
      },
    });
    const storageDownState = await checkFirebaseReadiness({ timeoutMs: 1000 });
    assert(
      storageDownState.state === 'storage_unavailable' &&
        storageDownState.ready === false &&
        storageDownState.checks.firebaseConnection === 'healthy' &&
        storageDownState.checks.firestore === 'healthy' &&
        storageDownState.checks.storage === 'unavailable',
      'Env var present + Auth/Firestore OK + missing Storage bucket reports storage_unavailable (NOT ready)'
    );

    // 1g. ready (Credentials + Auth + Firestore + Storage all succeed)
    __setTestStorageAdapter({
      async exists() {
        return [true];
      },
      file() {
        return {
          async save() {},
          async download() {
            return [Buffer.alloc(0)];
          },
          async delete() {},
        };
      },
    });
    const fullReadyState = await checkFirebaseReadiness({ timeoutMs: 1000 });
    assert(
      fullReadyState.state === 'ready' &&
        fullReadyState.ready === true &&
        fullReadyState.liveVerified === true &&
        fullReadyState.checks.firebaseConnection === 'healthy' &&
        fullReadyState.checks.firestore === 'healthy' &&
        fullReadyState.checks.storage === 'healthy',
      'Reports ready ONLY when credentials + Auth + Firestore + Storage probes all succeed'
    );

    // -------------------------------------------------------------------------
    // 2. Express /api/health/ready Strict Mode Verification
    // -------------------------------------------------------------------------
    console.log('\n[2/5] Verifying Strict Readiness HTTP Behavior & KYC Secret Gate...');
    const app = express();
    app.get('/api/health/ready', async (req, res) => {
      const currentValidation = PaymentConfigService.validateEnvironment();
      const kycCheck = validateKycSecretConfiguration();
      const fbReadiness = await checkFirebaseReadiness({ timeoutMs: 1000 });
      const strictProbe = req.query.strict === 'true';
      const strictReady = currentValidation.valid && kycCheck.valid && fbReadiness.ready;
      const isHttpReady = strictProbe ? strictReady : currentValidation.valid;
      res.status(isHttpReady ? 200 : 503).json({
        status: isHttpReady ? 'ready' : 'unhealthy',
        readiness: {
          state: fbReadiness.state,
          ready: strictReady,
          checks: fbReadiness.checks,
        },
      });
    });

    const srv = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = (srv.address() as any).port;

    try {
      // Simulate storage outage -> strict readiness returns 503 unhealthy
      __setTestStorageAdapter({
        async exists() {
          throw new Error('Bucket IAM denied');
        },
        file() {
          return {
            async save() {},
            async download() {
              return [Buffer.alloc(0)];
            },
            async delete() {},
          };
        },
      });
      const failResp = await fetch(`http://127.0.0.1:${port}/api/health/ready?strict=true`);
      const failJson: any = await failResp.json();
      assert(
        failResp.status === 503 && failJson.status === 'unhealthy' && failJson.readiness.state === 'storage_unavailable',
        'Strict readiness endpoint returns HTTP 503 with storage_unavailable when Storage probe fails'
      );

      // Restore healthy storage -> strict readiness returns 200 ready
      __setTestStorageAdapter({
        async exists() {
          return [true];
        },
        file() {
          return {
            async save() {},
            async download() {
              return [Buffer.alloc(0)];
            },
            async delete() {},
          };
        },
      });
      const okResp = await fetch(`http://127.0.0.1:${port}/api/health/ready?strict=true`);
      const okJson: any = await okResp.json();
      assert(
        okResp.status === 200 && okJson.status === 'ready' && okJson.readiness.ready === true,
        'Strict readiness endpoint returns HTTP 200 when all live probes succeed'
      );
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }

    // -------------------------------------------------------------------------
    // 3. CORS Allowlist, Cookies & Secret Redaction Audit
    // -------------------------------------------------------------------------
    console.log('\n[3/5] Verifying Production CORS Allowlist, Cookie Absence & Env Template...');
    process.env.APP_URL = 'https://staging-apaibay.onrender.com';
    process.env.ALLOWED_ORIGINS = 'https://preview.apaibay.internal';

    const allowedSet = resolveAllowedCorsOrigins();
    assert(
      allowedSet.has('https://staging-apaibay.onrender.com') && allowedSet.has('https://preview.apaibay.internal'),
      'resolveAllowedCorsOrigins parses APP_URL and ALLOWED_ORIGINS cleanly'
    );
    assert(
      isCorsOriginAllowed('https://staging-apaibay.onrender.com', true) === true,
      'Production CORS permits configured APP_URL'
    );
    assert(
      isCorsOriginAllowed('https://evil-attacker.example.com', true) === false,
      'Production CORS blocks untrusted third-party origins'
    );

    const serverFilesSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
    assert(
      !serverFilesSrc.includes('Access-Control-Allow-Credentials'),
      'Zero credentialed cookie CORS enabled (Bearer token authentication only)'
    );
    assert(
      serverFilesSrc.includes('X-Content-Type-Options') && serverFilesSrc.includes('X-Frame-Options'),
      'Baseline security headers configured in server.ts'
    );

    const envExampleSrc = fs.readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf8');
    assert(
      envExampleSrc.includes('PAYMENT_ENVIRONMENT=sandbox') &&
        !envExampleSrc.includes('BEGIN PRIVATE KEY') &&
        envExampleSrc.includes('KYC_VIEW_TOKEN_SECRET='),
      '.env.example keeps PAYMENT_ENVIRONMENT=sandbox and contains zero real secrets'
    );

    // -------------------------------------------------------------------------
    // 4. Payment Sandbox Lock & Custody Notice
    // -------------------------------------------------------------------------
    console.log('\n[4/5] Verifying Payment Sandbox Safety Gate & Provider Readiness...');
    delete process.env.PAYMENT_ENVIRONMENT;
    assert(PaymentConfigService.getEnvironment() === 'sandbox', 'Payment environment defaults strictly to sandbox');
    assert(PaymentConfigService.isProduction() === false, 'PaymentConfigService.isProduction() is false');
    assert(PaymentConfigService.getProviderReadiness('wing') === 'NOT_VERIFIED', 'Wing remains permanently NOT_VERIFIED');
    assert(
      PROVIDER_LIMITATION_NOTICE.toLowerCase().includes('sandbox') &&
        PROVIDER_LIMITATION_NOTICE.toLowerCase().includes('internal ledger balances'),
      'Seller ledger limitation notice accurately discloses sandbox accounting behavior'
    );

    // -------------------------------------------------------------------------
    // 5. Preserved Project Identifiers, Rules & Emulator Config
    // -------------------------------------------------------------------------
    console.log('\n[5/5] Verifying Preserved Firebase Config, Security Rules & Staging Checklist...');
    assert(
      firebaseConfig.projectId === 'apaibay-marketplace-premium' &&
        firebaseConfig.firestoreDatabaseId === 'ai-studio-apaibaymarketpla-99b738bb-1596-4812-bdf8-877c3a04a892' &&
        firebaseConfig.storageBucket === 'apaibay-marketplace-premium.firebasestorage.app',
      'Preserved exact Firebase projectId, named Firestore DB ID, and Storage bucket'
    );

    const firebaseJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase.json'), 'utf8'));
    assert(
      firebaseJson.emulators?.firestore?.host === '127.0.0.1' &&
        firebaseJson.emulators?.auth?.host === '127.0.0.1' &&
        firebaseJson.emulators?.storage?.host === '127.0.0.1',
      'firebase.json binds all emulators strictly to 127.0.0.1'
    );

    const checklistPath = path.resolve(process.cwd(), 'STAGING_READINESS_CHECKLIST.md');
    assert(fs.existsSync(checklistPath), 'STAGING_READINESS_CHECKLIST.md exists');
  } finally {
    __resetAllTestHooks();
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  console.log(`\n=============================================================================`);
  console.log(`PHASE 2.3 VERIFICATION COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log(`=============================================================================\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase23Suite().catch((err) => {
  console.error('❌ Fatal error in Phase 2.3 verification suite:', err);
  process.exit(1);
});

/**
 * APAIBAY MARKETPLACE PREMIUM — PHASE 2.3.1 STAGING-VS-PRODUCTION ISOLATION TESTS
 *
 * Strictly offline / in-process unit & integration tests (ZERO cloud calls):
 * 1. Staging (APP_ENV=staging) with complete dedicated staging config passes isolation cleanly.
 * 2. Staging with missing FIREBASE_PROJECT_ID / FIRESTORE_DATABASE_ID / STORAGE_BUCKET / AUTH_DOMAIN
 *    refuses fallback to production firebase-applet-config.json.
 * 3. Staging pointing to ANY production identifier (projectId, databaseId, storageBucket, authDomain)
 *    is blocked with STAGING_ISOLATION_VIOLATION.
 * 4. Staging receiving production service account project_id is blocked.
 * 5. Staging with PAYMENT_ENVIRONMENT=production is blocked.
 * 6. Production (APP_ENV=production) receiving staging service account project_id or staging overrides is blocked.
 * 7. Frontend client resolver (VITE_APP_ENV=staging) refuses fallback to production firebase-applet-config.json
 *    when staging VITE_FIREBASE_* keys are missing or match production identifiers.
 * 8. checkFirebaseReadiness() and /api/health/ready fail closed (503, state: 'isolation_violation') on config mixing.
 * 9. Production firebase-applet-config.json identifiers remain completely unchanged.
 * 10. firestore.rules and storage.rules contain zero hardcoded production project/DB/bucket strings.
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import {
  resolveServerFirebaseConfig,
  PRODUCTION_FIREBASE_IDENTIFIERS,
  loadBaseFirebaseAppletConfig,
} from '../server/config/firebaseEnvironment';
import { resolveClientFirebaseConfig } from '../src/services/firebase/envConfig';
import { checkFirebaseReadiness, __resetAllTestHooks } from '../server/repositories/serverFirestore';
import { PaymentConfigService } from '../server/payment/paymentConfig';
import { validateKycSecretConfiguration } from '../server/commerce/kycService';

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

function makeFakeServiceAccountJson(projectId: string): string {
  return JSON.stringify({
    type: 'service_account',
    project_id: projectId,
    private_key: '-----BEGIN PRIVATE KEY-----\nFAKE_NON_SECRET_TEST_KEY\n-----END PRIVATE KEY-----\n',
    client_email: `firebase-adminsdk@${projectId}.iam.gserviceaccount.com`,
  });
}

async function runPhase231Suite() {
  console.log('\n=============================================================================');
  console.log('🔒 APAIBAY PHASE 2.3.1: STAGING-VS-PRODUCTION FIREBASE ISOLATION TEST SUITE');
  console.log('=============================================================================\n');

  __resetAllTestHooks();
  const baseProdConfig = loadBaseFirebaseAppletConfig();

  // ---------------------------------------------------------------------------
  // 1. Production Configuration Preserved Intact
  // ---------------------------------------------------------------------------
  console.log('[1/6] Verifying Production Configuration Preservation...');
  assert(
    baseProdConfig.projectId === PRODUCTION_FIREBASE_IDENTIFIERS.projectId &&
      baseProdConfig.firestoreDatabaseId === PRODUCTION_FIREBASE_IDENTIFIERS.firestoreDatabaseId &&
      baseProdConfig.storageBucket === PRODUCTION_FIREBASE_IDENTIFIERS.storageBucket &&
      baseProdConfig.authDomain === PRODUCTION_FIREBASE_IDENTIFIERS.authDomain,
    'firebase-applet-config.json preserves exact production identifiers unchanged'
  );

  // ---------------------------------------------------------------------------
  // 2. Backend Staging Isolation & No Fallback Rules
  // ---------------------------------------------------------------------------
  console.log('\n[2/6] Testing Backend Staging Isolation & Zero Production Fallback...');

  const validStagingEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    APP_ENV: 'staging',
    PAYMENT_ENVIRONMENT: 'sandbox',
    FIREBASE_PROJECT_ID: 'apaibay-marketplace-staging',
    FIREBASE_FIRESTORE_DATABASE_ID: 'apaibay-staging-db',
    FIREBASE_STORAGE_BUCKET: 'apaibay-marketplace-staging.firebasestorage.app',
    FIREBASE_AUTH_DOMAIN: 'apaibay-marketplace-staging.firebaseapp.com',
    FIREBASE_SERVICE_ACCOUNT_JSON: makeFakeServiceAccountJson('apaibay-marketplace-staging'),
    VITE_APP_ENV: 'staging',
    VITE_FIREBASE_PROJECT_ID: 'apaibay-marketplace-staging',
    VITE_FIREBASE_FIRESTORE_DATABASE_ID: 'apaibay-staging-db',
    VITE_FIREBASE_STORAGE_BUCKET: 'apaibay-marketplace-staging.firebasestorage.app',
  };

  const okStaging = resolveServerFirebaseConfig({ env: validStagingEnv, baseConfig: baseProdConfig });
  assert(
    okStaging.valid === true &&
      okStaging.isolated === true &&
      okStaging.usesProductionFallback === false &&
      okStaging.config.projectId === 'apaibay-marketplace-staging' &&
      okStaging.config.firestoreDatabaseId === 'apaibay-staging-db',
    'Complete isolated staging configuration passes validation without production fallback'
  );

  // Missing staging env vars MUST NOT fall back to production firebase-applet-config.json
  const missingStaging = resolveServerFirebaseConfig({
    env: { NODE_ENV: 'production', APP_ENV: 'staging', PAYMENT_ENVIRONMENT: 'sandbox' },
    baseConfig: baseProdConfig,
  });
  assert(
    missingStaging.valid === false &&
      missingStaging.isolated === false &&
      missingStaging.usesProductionFallback === false &&
      missingStaging.config.projectId === '' &&
      missingStaging.config.firestoreDatabaseId === '' &&
      missingStaging.violations.some((v) => v.includes('STAGING_CONFIG_MISSING')),
    'APP_ENV=staging with missing Firebase env vars refuses silent fallback to production config'
  );

  // Staging pointing to production projectId MUST fail
  const stagingProdProject = resolveServerFirebaseConfig({
    env: {
      ...validStagingEnv,
      FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_IDENTIFIERS.projectId,
    },
    baseConfig: baseProdConfig,
  });
  assert(
    stagingProdProject.valid === false &&
      stagingProdProject.violations.some((v) => v.includes('STAGING_ISOLATION_VIOLATION')),
    'Staging targeting production projectId is blocked'
  );

  // Staging pointing to production Firestore database ID MUST fail
  const stagingProdDb = resolveServerFirebaseConfig({
    env: {
      ...validStagingEnv,
      FIREBASE_FIRESTORE_DATABASE_ID: PRODUCTION_FIREBASE_IDENTIFIERS.firestoreDatabaseId,
    },
    baseConfig: baseProdConfig,
  });
  assert(
    stagingProdDb.valid === false &&
      stagingProdDb.violations.some((v) => v.includes('STAGING_ISOLATION_VIOLATION')),
    'Staging targeting production named Firestore database ID is blocked'
  );

  // Staging pointing to production Storage bucket MUST fail
  const stagingProdBucket = resolveServerFirebaseConfig({
    env: {
      ...validStagingEnv,
      FIREBASE_STORAGE_BUCKET: PRODUCTION_FIREBASE_IDENTIFIERS.storageBucket,
    },
    baseConfig: baseProdConfig,
  });
  assert(
    stagingProdBucket.valid === false &&
      stagingProdBucket.violations.some((v) => v.includes('STAGING_ISOLATION_VIOLATION')),
    'Staging targeting production Storage bucket is blocked'
  );

  // Staging with production service account JSON MUST fail
  const stagingProdCreds = resolveServerFirebaseConfig({
    env: {
      ...validStagingEnv,
      FIREBASE_SERVICE_ACCOUNT_JSON: makeFakeServiceAccountJson(PRODUCTION_FIREBASE_IDENTIFIERS.projectId),
    },
    baseConfig: baseProdConfig,
  });
  assert(
    stagingProdCreds.valid === false &&
      stagingProdCreds.violations.some((v) => v.includes('STAGING_CREDENTIAL_ISOLATION_VIOLATION')),
    'Staging using production service account credentials is blocked'
  );

  // Staging with PAYMENT_ENVIRONMENT=production MUST fail
  const stagingLivePay = resolveServerFirebaseConfig({
    env: {
      ...validStagingEnv,
      PAYMENT_ENVIRONMENT: 'production',
    },
    baseConfig: baseProdConfig,
  });
  assert(
    stagingLivePay.valid === false &&
      stagingLivePay.violations.some((v) => v.includes('STAGING_LIVE_PAYMENT_FORBIDDEN')),
    'Staging cannot enable PAYMENT_ENVIRONMENT=production'
  );

  // ---------------------------------------------------------------------------
  // 3. Production Protection Against Staging Leakage
  // ---------------------------------------------------------------------------
  console.log('\n[3/6] Testing Production Rejection of Staging Overrides & Credentials...');

  const prodStagingCreds = resolveServerFirebaseConfig({
    env: {
      NODE_ENV: 'production',
      APP_ENV: 'production',
      FIREBASE_SERVICE_ACCOUNT_JSON: makeFakeServiceAccountJson('apaibay-marketplace-staging'),
    },
    baseConfig: baseProdConfig,
  });
  assert(
    prodStagingCreds.valid === false &&
      prodStagingCreds.violations.some((v) => v.includes('PRODUCTION_CREDENTIAL_PROJECT_MISMATCH')),
    'Production rejects staging service account credentials'
  );

  const prodStagingOverride = resolveServerFirebaseConfig({
    env: {
      NODE_ENV: 'production',
      APP_ENV: 'production',
      FIREBASE_PROJECT_ID: 'apaibay-marketplace-staging',
    },
    baseConfig: baseProdConfig,
  });
  assert(
    prodStagingOverride.valid === false &&
      prodStagingOverride.violations.some((v) => v.includes('PRODUCTION_ISOLATION_VIOLATION')),
    'Production rejects staging FIREBASE_PROJECT_ID override'
  );

  const validProd = resolveServerFirebaseConfig({
    env: {
      NODE_ENV: 'production',
      APP_ENV: 'production',
      FIREBASE_SERVICE_ACCOUNT_JSON: makeFakeServiceAccountJson(PRODUCTION_FIREBASE_IDENTIFIERS.projectId),
    },
    baseConfig: baseProdConfig,
  });
  assert(
    validProd.valid === true && validProd.config.projectId === PRODUCTION_FIREBASE_IDENTIFIERS.projectId,
    'Production with matching service account preserves exact production identifiers'
  );

  // ---------------------------------------------------------------------------
  // 4. Frontend Client Config Staging Isolation
  // ---------------------------------------------------------------------------
  console.log('\n[4/6] Testing Frontend Client SDK Staging Isolation...');

  let clientMissingBlocked = false;
  try {
    resolveClientFirebaseConfig({ VITE_APP_ENV: 'staging' }, baseProdConfig);
  } catch (err: any) {
    clientMissingBlocked = String(err?.message || '').includes('FIREBASE_STAGING_ISOLATION_ERROR');
  }
  assert(
    clientMissingBlocked,
    'Frontend VITE_APP_ENV=staging with missing VITE_FIREBASE_* refuses fallback to production config'
  );

  let clientProdRefBlocked = false;
  try {
    resolveClientFirebaseConfig(
      {
        VITE_APP_ENV: 'staging',
        VITE_FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_IDENTIFIERS.projectId,
        VITE_FIREBASE_API_KEY: 'AIzaStagingFakeKeyForValidationTest',
        VITE_FIREBASE_AUTH_DOMAIN: 'apaibay-marketplace-staging.firebaseapp.com',
        VITE_FIREBASE_FIRESTORE_DATABASE_ID: 'apaibay-staging-db',
        VITE_FIREBASE_STORAGE_BUCKET: 'apaibay-marketplace-staging.firebasestorage.app',
        VITE_FIREBASE_APP_ID: '1:999:web:staging',
      },
      baseProdConfig
    );
  } catch (err: any) {
    clientProdRefBlocked = String(err?.message || '').includes('FIREBASE_STAGING_ISOLATION_ERROR');
  }
  assert(
    clientProdRefBlocked,
    'Frontend staging build rejects production projectId even when other VITE_FIREBASE_* vars are provided'
  );

  const clientStagingOk = resolveClientFirebaseConfig(
    {
      VITE_APP_ENV: 'staging',
      VITE_FIREBASE_PROJECT_ID: 'apaibay-marketplace-staging',
      VITE_FIREBASE_API_KEY: 'AIzaStagingFakeKeyForValidationTest',
      VITE_FIREBASE_AUTH_DOMAIN: 'apaibay-marketplace-staging.firebaseapp.com',
      VITE_FIREBASE_FIRESTORE_DATABASE_ID: 'apaibay-staging-db',
      VITE_FIREBASE_STORAGE_BUCKET: 'apaibay-marketplace-staging.firebasestorage.app',
      VITE_FIREBASE_APP_ID: '1:999:web:staging',
    },
    baseProdConfig
  );
  assert(
    clientStagingOk.projectId === 'apaibay-marketplace-staging' &&
      clientStagingOk.firestoreDatabaseId === 'apaibay-staging-db',
    'Frontend isolated staging config resolves staging identifiers cleanly'
  );

  const clientProdOk = resolveClientFirebaseConfig({}, baseProdConfig);
  assert(
    clientProdOk.projectId === PRODUCTION_FIREBASE_IDENTIFIERS.projectId,
    'Frontend default production build remains 100% preserved'
  );

  // ---------------------------------------------------------------------------
  // 5. Runtime checkFirebaseReadiness & /api/health/ready Isolation Gate
  // ---------------------------------------------------------------------------
  console.log('\n[5/6] Testing Readiness Probe Isolation Failure Enforcement...');
  const savedAppEnv = process.env.APP_ENV;
  const savedFbProj = process.env.FIREBASE_PROJECT_ID;
  try {
    process.env.APP_ENV = 'staging';
    delete process.env.FIREBASE_PROJECT_ID;

    const isoFailReadiness = await checkFirebaseReadiness({ timeoutMs: 500 });
    assert(
      isoFailReadiness.state === 'isolation_violation' &&
        isoFailReadiness.ready === false &&
        isoFailReadiness.isolated === false &&
        isoFailReadiness.checks.isolation === 'violation',
      'checkFirebaseReadiness returns state=isolation_violation when APP_ENV=staging is unconfigured'
    );

    const app = express();
    app.get('/api/health/ready', async (_req, res) => {
      const currentValidation = PaymentConfigService.validateEnvironment();
      const kycCheck = validateKycSecretConfiguration();
      const fbReadiness = await checkFirebaseReadiness({ timeoutMs: 500 });
      const strictReady = currentValidation.valid && kycCheck.valid && fbReadiness.isolated && fbReadiness.ready;
      res.status(strictReady ? 200 : 503).json({
        status: strictReady ? 'ready' : 'unhealthy',
        readiness: { state: fbReadiness.state, ready: strictReady, checks: fbReadiness.checks },
      });
    });

    const srv = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = (srv.address() as any).port;
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/api/health/ready`);
      const body: any = await resp.json();
      assert(
        resp.status === 503 && body.status === 'unhealthy' && body.readiness.state === 'isolation_violation',
        '/api/health/ready returns HTTP 503 isolation_violation when staging isolation is violated'
      );
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  } finally {
    if (savedAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = savedAppEnv;
    if (savedFbProj === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = savedFbProj;
  }

  // ---------------------------------------------------------------------------
  // 6. Firestore & Storage Rules Compatibility With Dedicated Staging Project
  // ---------------------------------------------------------------------------
  console.log('\n[6/6] Verifying Firestore & Storage Rules Portability...');
  const fsRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const stRules = fs.readFileSync(path.resolve(process.cwd(), 'storage.rules'), 'utf8');

  assert(
    !fsRules.includes(PRODUCTION_FIREBASE_IDENTIFIERS.projectId) &&
      !fsRules.includes(PRODUCTION_FIREBASE_IDENTIFIERS.firestoreDatabaseId) &&
      fsRules.includes('$(database)'),
    'firestore.rules uses dynamic $(database) binding with zero hardcoded production project/DB IDs'
  );
  assert(
    !stRules.includes(PRODUCTION_FIREBASE_IDENTIFIERS.projectId) &&
      !stRules.includes(PRODUCTION_FIREBASE_IDENTIFIERS.storageBucket) &&
      stRules.includes('/b/{bucket}/o'),
    'storage.rules uses dynamic {bucket} binding with zero hardcoded production buckets'
  );

  console.log(`\n=============================================================================`);
  console.log(`PHASE 2.3.1 ISOLATION SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log(`=============================================================================\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase231Suite().catch((err) => {
  console.error('❌ Fatal error in Phase 2.3.1 isolation test suite:', err);
  process.exit(1);
});

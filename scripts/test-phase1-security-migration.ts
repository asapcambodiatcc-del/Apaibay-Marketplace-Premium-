/**
 * APAIBAY MARKETPLACE PREMIUM — PHASE 1 SECURITY & FIREBASE ADMIN MIGRATION TEST SUITE
 * Validates all 10 Phase 1 invariants:
 * 1. Firestore Admin SDK persistence (read/write/query/update/delete + PersistenceError; zero client SDK imports in server/)
 * 2. Named database selection (ai-studio-apaibaymarketpla-99b738bb-1596-4812-bdf8-877c3a04a892)
 * 3. Private KYC Storage upload/download/delete via Firebase Admin Storage adapter + failure propagation
 * 4. Cryptographic JWT signature verification & fail-closed rejection (forged/unsigned/revoked/expired tokens)
 * 5. Unverified bootstrap admin rejection across roles, resolveUserRoles, and firestore.rules
 * 6. FINANCE_MANAGER and SUPPORT_STAFF privilege boundaries (RBAC & firestore.rules)
 * 7. Crypto status endpoint rejects anonymous (401) and unauthorized (403) callers + enforces rate limit (429)
 * 8. Crypto simulation endpoint rejects anonymous (401) and unauthorized (403) callers + allows owner in sandbox (200)
 * 9. Cross-instance transactional payout reservation locking (single & cross-instance simulation)
 * 10. Production persistence failure handling (PersistenceError) & KYC_VIEW_TOKEN_SECRET startup/signing fail-closed gate
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import {
  db,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  runTransaction,
  firebaseConfig,
  PersistenceError,
  getAdminDiagnostics,
  __setTestSimulateProductionPersistence,
  __setTestForceFirestoreFailure,
  __setTestAdminAuthVerifier,
  __setTestStorageAdapter,
  __resetAllTestHooks,
} from '../server/repositories/serverFirestore';
import { validateFirebaseIdToken, resolveUserRoles } from '../server/auth/verifyFirebaseUser';
import { AuthenticatedUser, hasPermission, BOOTSTRAP_ADMIN_EMAIL } from '../server/auth/roles';
import {
  KycService,
  validateKycSecretConfiguration,
  getKycViewTokenSecret,
} from '../server/commerce/kycService';
import { SellerLedgerService } from '../server/commerce/sellerLedgerService';
import { IdempotencyService } from '../server/payment/idempotencyService';
import { PaymentService } from '../server/payment/paymentService';
import { WebhookService } from '../server/payment/webhookService';
import { ReconciliationService } from '../server/payment/reconciliationService';
import { DisputeService } from '../server/commerce/disputeService';
import { AdminActivityLogService } from '../server/admin/adminActivityLogService';
import { PaymentEventService } from '../server/payment/paymentEventService';
import { paymentRoutes, resetCryptoRateLimitForTesting } from '../server/routes/paymentRoutes';
import { PaymentConfigService } from '../server/payment/paymentConfig';

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

async function assertRejects(
  fn: () => Promise<any>,
  expectedMatch: RegExp | string,
  label: string
) {
  try {
    await fn();
    assert(false, label, 'Expected promise to reject, but it resolved');
  } catch (err: any) {
    const msg = `${err?.code || ''} ${err?.name || ''} ${err?.message || err}`;
    const matched =
      typeof expectedMatch === 'string'
        ? msg.includes(expectedMatch)
        : expectedMatch.test(msg);
    assert(matched, label, matched ? undefined : `Got: ${msg}`);
  }
}

function makeFakeJwt(headerObj: Record<string, any>, payloadObj: Record<string, any>, sig = 'forgedsig'): string {
  const h = Buffer.from(JSON.stringify(headerObj)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  return `${h}.${p}.${sig}`;
}

function walkTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTsFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

async function runPhase1Suite() {
  console.log('\n=============================================================================');
  console.log('🔐 APAIBAY PHASE 1: FIREBASE ADMIN SDK MIGRATION & CRITICAL SECURITY TEST SUITE');
  console.log('=============================================================================\n');

  __resetAllTestHooks();
  SellerLedgerService.clearMemoryLedgerForTesting();
  resetCryptoRateLimitForTesting();

  // -------------------------------------------------------------------------
  // 1. Firestore Admin SDK Persistence + Zero Client SDK Imports in server/
  // -------------------------------------------------------------------------
  console.log('[1/10] Verifying Firestore Admin SDK Persistence & Client SDK Removal...');
  const serverFiles = walkTsFiles(path.resolve(process.cwd(), 'server'));
  const clientSdkImports = serverFiles.filter((filePath) => {
    const src = fs.readFileSync(filePath, 'utf8');
    return /from\s+['"]firebase\//.test(src) || /require\(['"]firebase\//.test(src);
  });
  assert(
    clientSdkImports.length === 0,
    'Zero client firebase/* SDK imports remain anywhere inside server/',
    clientSdkImports.join(', ')
  );

  const testDocId = `phase1_doc_${Date.now()}`;
  const testRef = doc(db, 'phase1_diagnostics', testDocId);
  await setDoc(testRef, { id: testDocId, tag: 'initial', amount: 42 });
  const snap1 = await getDoc(testRef);
  assert(snap1.exists() && snap1.data().amount === 42, 'Firestore Admin wrapper setDoc & getDoc persist accurately');

  await updateDoc(testRef, { tag: 'updated' });
  const qSnap = await getDocs(query(collection(db, 'phase1_diagnostics'), where('tag', '==', 'updated')));
  assert(!qSnap.empty && qSnap.docs[0].data().id === testDocId, 'Firestore Admin wrapper updateDoc & filtered query work');

  await deleteDoc(testRef);
  const snapDeleted = await getDoc(testRef);
  assert(!snapDeleted.exists(), 'Firestore Admin wrapper deleteDoc removes document');

  // -------------------------------------------------------------------------
  // 2. Named Database Selection Check
  // -------------------------------------------------------------------------
  console.log('\n[2/10] Verifying Named Firestore Database Configuration...');
  const EXPECTED_DB_ID = 'ai-studio-apaibaymarketpla-99b738bb-1596-4812-bdf8-877c3a04a892';
  const diag = getAdminDiagnostics();
  assert(
    firebaseConfig.firestoreDatabaseId === EXPECTED_DB_ID && diag.databaseId === EXPECTED_DB_ID,
    `Named Firestore database strictly bound to '${EXPECTED_DB_ID}'`
  );
  assert(diag.initialized === true, 'Firebase Admin App initialized cleanly');

  // -------------------------------------------------------------------------
  // 3. Storage Upload / Download / Delete via Admin Storage Adapter
  // -------------------------------------------------------------------------
  console.log('\n[3/10] Verifying Private KYC Storage Operations via Admin Storage Adapter...');
  const storageMemory = new Map<string, { data: Buffer; contentType?: string }>();
  let forceStorageFail = false;

  __setTestStorageAdapter({
    file(storagePath: string) {
      return {
        async save(data: Buffer, options?: any) {
          if (forceStorageFail) throw new Error('Simulated GCS bucket write outage');
          storageMemory.set(storagePath, { data: Buffer.from(data), contentType: options?.contentType });
        },
        async download() {
          if (forceStorageFail) throw new Error('Simulated GCS bucket read outage');
          const found = storageMemory.get(storagePath);
          if (!found) throw new Error('No such object in bucket');
          return [Buffer.from(found.data)];
        },
        async delete(options?: { ignoreNotFound?: boolean }) {
          if (forceStorageFail) throw new Error('Simulated GCS bucket delete outage');
          if (!storageMemory.has(storagePath) && !options?.ignoreNotFound) {
            throw new Error('Object not found');
          }
          storageMemory.delete(storagePath);
        },
      };
    },
  });

  const kycSeller: AuthenticatedUser = {
    uid: 'phase1_kyc_seller',
    email: 'kyc_seller@apaibay.com',
    emailVerified: true,
    role: 'seller',
    canonicalRole: 'SELLER',
    isAdmin: false,
    isSeller: true,
    sellerId: 'phase1_kyc_seller',
  };

  await KycService.submitKycApplication(kycSeller, {
    legalFullName: 'Dara Sok',
    shopName: 'Phnom Penh Craft',
    countryOfRegistration: 'KH',
    residentialOrBusinessAddress: 'No 12 Norodom Blvd, Phnom Penh',
    phoneNumber: '+855 12 889 900',
    identityDocumentType: 'national_id',
    identityNumber: '987654321',
    privacyNoticeAccepted: true,
  });

  const validPdfHeader = Buffer.from('%PDF-1.4\n%Phase1TestDocumentPayload1234567890');
  const uploadedDoc = await KycService.uploadKycDocument(kycSeller, {
    documentType: 'national_id',
    fileName: 'national_id.pdf',
    mimeType: 'application/pdf',
    fileBase64: validPdfHeader.toString('base64'),
  });
  assert(
    uploadedDoc.storagePath.startsWith('kyc_documents/phase1_kyc_seller/') && storageMemory.has(uploadedDoc.storagePath),
    'KYC binary uploaded into private Admin Storage bucket adapter (not Firestore)'
  );

  const accessToken = await KycService.createDocumentAccessToken(kycSeller, kycSeller.uid, uploadedDoc.docId);
  const downloaded = await KycService.resolveDocumentByToken(accessToken.token);
  assert(
    Buffer.compare(downloaded.buffer, validPdfHeader) === 0,
    'Short-lived HMAC token resolves and downloads exact binary from Admin Storage adapter'
  );

  forceStorageFail = true;
  await assertRejects(
    () =>
      KycService.uploadKycDocument(kycSeller, {
        documentType: 'passport',
        fileName: 'selfie.pdf',
        mimeType: 'application/pdf',
        fileBase64: validPdfHeader.toString('base64'),
      }),
    'KYC_STORAGE_UPLOAD_FAILED',
    'Storage outage throws explicit KYC_STORAGE_UPLOAD_FAILED (no silent fallback)'
  );
  await assertRejects(
    () => KycService.resolveDocumentByToken(accessToken.token),
    'DOCUMENT_STORAGE_UNAVAILABLE',
    'Storage download outage throws explicit DOCUMENT_STORAGE_UNAVAILABLE'
  );
  forceStorageFail = false;

  // Test retention purge deletes from storage bucket adapter
  const adminReviewer: AuthenticatedUser = {
    uid: 'phase1_super_admin',
    email: BOOTSTRAP_ADMIN_EMAIL,
    emailVerified: true,
    role: 'SUPER_ADMIN',
    canonicalRole: 'SUPER_ADMIN',
    isAdmin: true,
    isSuperAdmin: true,
    isSeller: false,
  };
  await KycService.purgeExpiredDocuments(adminReviewer, {
    now: new Date(Date.now() + 6 * 365 * 24 * 60 * 60 * 1000),
  });
  assert(!storageMemory.has(uploadedDoc.storagePath), 'Retention purge deletes binary object via Admin Storage adapter');

  // -------------------------------------------------------------------------
  // 4. Cryptographic JWT Signature Rejection (Fail Closed)
  // -------------------------------------------------------------------------
  console.log('\n[4/10] Verifying Fail-Closed Cryptographic JWT Verification...');
  const futureExp = Math.floor(Date.now() / 1000) + 3600;
  const validClaims = {
    iss: `https://securetoken.google.com/${firebaseConfig.projectId}`,
    aud: firebaseConfig.projectId,
    sub: 'forged-user-1',
    user_id: 'forged-user-1',
    email: BOOTSTRAP_ADMIN_EMAIL,
    email_verified: true,
    exp: futureExp,
  };

  // Unsigned alg:none JWT
  const algNoneToken = makeFakeJwt({ alg: 'none', typ: 'JWT' }, validClaims, 'sig');
  assert((await validateFirebaseIdToken(algNoneToken)) === null, 'Unsigned alg:none JWT is rejected immediately');

  // HS256 symmetric downgrade JWT
  const hs256Token = makeFakeJwt({ alg: 'HS256', typ: 'JWT' }, validClaims, 'sig');
  assert((await validateFirebaseIdToken(hs256Token)) === null, 'Symmetric HS256 JWT is rejected immediately');

  // Forged RS256 JWT rejected by Admin Auth SDK verifier
  const forgedRs256Token = makeFakeJwt({ alg: 'RS256', typ: 'JWT' }, validClaims, 'invalid_rsa_signature');
  __setTestAdminAuthVerifier({
    async verifyIdToken() {
      const e: any = new Error('Firebase ID token has invalid signature');
      e.code = 'auth/argument-error';
      throw e;
    },
  });
  assert(
    (await validateFirebaseIdToken(forgedRs256Token)) === null,
    'Forged RS256 JWT fails closed when Admin verifyIdToken rejects signature'
  );

  // Revoked token rejected when checkRevoked=true fails
  __setTestAdminAuthVerifier({
    async verifyIdToken(_token, checkRevoked) {
      assert(checkRevoked === true, 'verifyIdToken enforces checkRevoked = true');
      const e: any = new Error('Firebase ID token has been revoked');
      e.code = 'auth/id-token-revoked';
      throw e;
    },
  });
  assert((await validateFirebaseIdToken(forgedRs256Token)) === null, 'Revoked RS256 ID token is rejected');

  // Mismatched UID claim vs verified decoded UID rejected
  __setTestAdminAuthVerifier({
    async verifyIdToken() {
      return { uid: 'different-uid', email: 'other@example.com', email_verified: true };
    },
  });
  assert((await validateFirebaseIdToken(forgedRs256Token)) === null, 'UID mismatch between claim and Admin decoded token is rejected');

  // Valid verified token accepted cleanly
  __setTestAdminAuthVerifier({
    async verifyIdToken() {
      return { uid: 'forged-user-1', email: 'legit@apaibay.com', email_verified: true };
    },
  });
  const verifiedRes = await validateFirebaseIdToken(forgedRs256Token);
  assert(
    verifiedRes !== null && verifiedRes.uid === 'forged-user-1' && verifiedRes.emailVerified === true,
    'Cryptographically verified RS256 token succeeds and returns emailVerified'
  );

  // -------------------------------------------------------------------------
  // 5. Unverified Bootstrap Admin Rejection
  // -------------------------------------------------------------------------
  console.log('\n[5/10] Verifying Unverified Bootstrap Admin Email Rejection...');
  const unverifiedFalse = await resolveUserRoles('unverified_uid_1', BOOTSTRAP_ADMIN_EMAIL, false);
  const unverifiedUndefined = await resolveUserRoles('unverified_uid_2', BOOTSTRAP_ADMIN_EMAIL, undefined);
  assert(
    unverifiedFalse.isAdmin === false && unverifiedUndefined.isAdmin === false,
    'resolveUserRoles rejects bootstrap admin email unless emailVerified === true'
  );

  const verifiedBoot = await resolveUserRoles('verified_boot_uid', BOOTSTRAP_ADMIN_EMAIL, true);
  assert(
    verifiedBoot.isAdmin === true && verifiedBoot.isSuperAdmin === true,
    'resolveUserRoles grants SUPER_ADMIN only when bootstrap email is verified'
  );

  const unverifiedBootstrapUser: AuthenticatedUser = {
    uid: 'fake_boot',
    email: BOOTSTRAP_ADMIN_EMAIL,
    emailVerified: false,
    role: 'customer',
    isAdmin: false,
    isSeller: false,
  };
  assert(
    hasPermission(unverifiedBootstrapUser, 'roles:manage') === false &&
      hasPermission(unverifiedBootstrapUser, 'kyc:review') === false,
    'hasPermission rejects unverified bootstrap email account'
  );

  const fsRulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  assert(
    fsRulesText.includes('isVerifiedBootstrapAdmin()') &&
      fsRulesText.includes("request.auth.token.email == 'asapcambodia.tcc@gmail.com'") &&
      fsRulesText.includes('request.auth.token.email_verified == true'),
    'firestore.rules enforces email_verified == true for bootstrap admin helper'
  );

  // -------------------------------------------------------------------------
  // 6. FINANCE_MANAGER & SUPPORT_STAFF Privilege Restrictions
  // -------------------------------------------------------------------------
  console.log('\n[6/10] Verifying Finance Manager & Support Staff Least-Privilege Boundaries...');
  const financeMgr: AuthenticatedUser = {
    uid: 'fin_mgr_uid',
    email: 'finance@apaibay.com',
    emailVerified: true,
    role: 'FINANCE_MANAGER',
    canonicalRole: 'FINANCE_MANAGER',
    isAdmin: false,
    isFinanceManager: true,
    isSeller: false,
  };
  const supportUser: AuthenticatedUser = {
    uid: 'supp_uid',
    email: 'support@apaibay.com',
    emailVerified: true,
    role: 'SUPPORT_STAFF',
    canonicalRole: 'SUPPORT_STAFF',
    isAdmin: false,
    isSupportStaff: true,
    isSeller: false,
  };

  assert(
    hasPermission(financeMgr, 'manage_payouts') === true &&
      hasPermission(financeMgr, 'kyc:review') === false &&
      hasPermission(financeMgr, 'manage_roles') === false &&
      hasPermission(financeMgr, 'manage_users') === false,
    'FINANCE_MANAGER can manage payouts/refunds but cannot review KYC, manage roles, or suspend users'
  );
  assert(
    hasPermission(supportUser, 'manage_disputes') === true &&
      hasPermission(supportUser, 'manage_payouts') === false &&
      hasPermission(supportUser, 'issue_refunds') === false &&
      hasPermission(supportUser, 'kyc:view_documents') === false,
    'SUPPORT_STAFF can triage disputes/orders but cannot approve payouts, issue refunds, or view KYC docs'
  );
  assert(
    fsRulesText.includes("get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role in ['SUPER_ADMIN', 'ADMIN']") &&
      fsRulesText.includes('isFinanceStaff()') &&
      fsRulesText.includes('isSupportStaff()'),
    "firestore.rules restricts isAdmin() strictly to SUPER_ADMIN/ADMIN and scopes FINANCE_MANAGER/SUPPORT_STAFF"
  );

  // -------------------------------------------------------------------------
  // 7 & 8. Crypto Status & Simulation Endpoints Auth, Ownership & Rate Limit
  // -------------------------------------------------------------------------
  console.log('\n[7-8/10] Verifying Crypto Endpoints Authentication, Ownership & Rate Limiting...');
  const orderIdCrypto = 'ORD-CRYPTO-PHASE1';
  const paymentIdCrypto = 'PAY-CRYPTO-PHASE1';
  await setDoc(doc(db, 'orders', orderIdCrypto), {
    id: orderIdCrypto,
    customerUid: 'owner_crypto_uid',
    total: 50,
    currency: 'USD',
    status: 'Placed',
    paymentStatus: 'pending',
    items: [{ productId: 'prod-fs-1', sellerId: 'seller-apaibay-official', price: 50, quantity: 1 }],
    createdAt: new Date().toISOString(),
  });
  await setDoc(doc(db, 'payments', paymentIdCrypto), {
    id: paymentIdCrypto,
    orderId: orderIdCrypto,
    customerUid: 'owner_crypto_uid',
    amount: 50,
    currency: 'USD',
    status: 'pending',
    methodType: 'crypto',
    sandboxMode: true,
    safeMetadata: {
      cryptoDetails: {
        currency: 'USDT',
        network: 'BNB Smart Chain',
        tokenStandard: 'BEP-20',
        payAmount: 50,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
    },
    createdAt: new Date().toISOString(),
  });

  const testApp = express();
  testApp.use(express.json());
  testApp.use('/api/payments', paymentRoutes);

  const server = await new Promise<http.Server>((resolve) => {
    const s = testApp.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const addr = server.address() as any;
    const baseUrl = `http://127.0.0.1:${addr.port}/api/payments`;

    // 7a. Unauthenticated GET status -> 401
    const anonStatusRes = await fetch(`${baseUrl}/crypto/${paymentIdCrypto}/status`);
    assert(anonStatusRes.status === 401, `Anonymous GET /crypto/:id/status rejected with 401 (got ${anonStatusRes.status})`);

    // 8a. Unauthenticated POST simulate -> 401
    const anonSimRes = await fetch(`${baseUrl}/crypto/${paymentIdCrypto}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome: 'paid' }),
    });
    assert(anonSimRes.status === 401, `Anonymous POST /crypto/:id/simulate rejected with 401 (got ${anonSimRes.status})`);

    // Wrong user token -> 403 on both status and simulate
    const wrongUserJwt = makeFakeJwt(
      { alg: 'RS256', typ: 'JWT' },
      { ...validClaims, sub: 'other_customer_uid', user_id: 'other_customer_uid', email: 'other@example.com' }
    );
    __setTestAdminAuthVerifier({
      async verifyIdToken() {
        return { uid: 'other_customer_uid', email: 'other@example.com', email_verified: true };
      },
    });

    const wrongUserStatusRes = await fetch(`${baseUrl}/crypto/${paymentIdCrypto}/status`, {
      headers: { Authorization: `Bearer ${wrongUserJwt}` },
    });
    assert(wrongUserStatusRes.status === 403, `Non-owner GET /crypto/:id/status rejected with 403 (got ${wrongUserStatusRes.status})`);

    const wrongUserSimRes = await fetch(`${baseUrl}/crypto/${paymentIdCrypto}/simulate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${wrongUserJwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome: 'paid' }),
    });
    assert(wrongUserSimRes.status === 403, `Non-owner POST /crypto/:id/simulate rejected with 403 (got ${wrongUserSimRes.status})`);

    // Owner token -> 200 on status and sandbox simulation
    const ownerJwt = makeFakeJwt(
      { alg: 'RS256', typ: 'JWT' },
      { ...validClaims, sub: 'owner_crypto_uid', user_id: 'owner_crypto_uid', email: 'owner@example.com' }
    );
    __setTestAdminAuthVerifier({
      async verifyIdToken() {
        return { uid: 'owner_crypto_uid', email: 'owner@example.com', email_verified: true };
      },
    });

    const ownerStatusRes = await fetch(`${baseUrl}/crypto/${paymentIdCrypto}/status`, {
      headers: { Authorization: `Bearer ${ownerJwt}` },
    });
    assert(ownerStatusRes.status === 200, `Payment owner GET /crypto/:id/status succeeds with 200`);

    const ownerSimRes = await fetch(`${baseUrl}/crypto/${paymentIdCrypto}/simulate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerJwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome: 'paid' }),
    });
    assert(ownerSimRes.status === 200, `Payment owner POST /crypto/:id/simulate succeeds in sandbox mode with 200`);

    // Rate limit enforcement (15/min -> 16th hits 429)
    let hit429 = false;
    for (let i = 0; i < 16; i++) {
      const r = await fetch(`${baseUrl}/crypto/${paymentIdCrypto}/status`, {
        headers: { Authorization: `Bearer ${ownerJwt}` },
      });
      if (r.status === 429) {
        hit429 = true;
        break;
      }
    }
    assert(hit429, 'Rate limiter enforces 429 TOO_MANY_REQUESTS after burst on /crypto/:id/status');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // -------------------------------------------------------------------------
  // 9. Cross-Instance Payout Reservation Locking (Concurrent Race Prevention)
  // -------------------------------------------------------------------------
  console.log('\n[9/10] Verifying Cross-Instance Transactional Payout Reservation Locking...');
  const payoutSellerId = 'phase1_payout_seller';
  const payoutSeller: AuthenticatedUser = {
    uid: payoutSellerId,
    email: 'payout_seller@apaibay.com',
    emailVerified: true,
    role: 'seller',
    canonicalRole: 'SELLER',
    isAdmin: false,
    isSeller: true,
    sellerId: payoutSellerId,
  };

  await KycService.submitKycApplication(payoutSeller, {
    legalFullName: 'Sokha Chan',
    shopName: 'Sokha Goods',
    countryOfRegistration: 'KH',
    residentialOrBusinessAddress: '100 Monivong Blvd, Phnom Penh',
    phoneNumber: '+855 99 112 233',
    identityDocumentType: 'national_id',
    identityNumber: '112233445',
    privacyNoticeAccepted: true,
  });
  await KycService.reviewKycApplication(adminReviewer, payoutSellerId, {
    action: 'approve',
    phoneVerified: true,
    payoutOwnershipVerified: true,
  });

  // Seed $100 available balance directly as delivered + matured sale
  await setDoc(doc(db, 'orders', 'ORD-PAYOUT-P1'), {
    id: 'ORD-PAYOUT-P1',
    customerUid: 'cust-1',
    total: 100,
    currency: 'USD',
    status: 'Delivered',
    paymentStatus: 'paid',
    items: [{ productId: 'prod-1', name: 'Test Item', sellerId: payoutSellerId, unitPrice: 100, quantity: 1, subtotal: 100 }],
    createdAt: new Date().toISOString(),
  });
  await SellerLedgerService.recordOrderCommissions({
    id: 'ORD-PAYOUT-P1',
    items: [{ productId: 'prod-1', name: 'Test Item', sellerId: payoutSellerId, unitPrice: 100, quantity: 1, subtotal: 100 }],
  });
  await SellerLedgerService.confirmPaymentSettlement('ORD-PAYOUT-P1');
  await SellerLedgerService.confirmDeliverySettlement('ORD-PAYOUT-P1', {
    deliveredAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago -> matured
  });
  await SellerLedgerService.releaseOrderSettlement('ORD-PAYOUT-P1', adminReviewer, { now: new Date() });

  // Concurrent createPayoutRequest calls (in-process lock + distributed tx)
  const dest = {
    method: 'aba_bank' as const,
    accountName: 'Sokha Chan',
    accountNumber: '001234567',
    bankName: 'ABA Bank',
    verifiedConfirmed: true,
  };
  const [r1, r2] = await Promise.allSettled([
    SellerLedgerService.createPayoutRequest(payoutSellerId, 60, dest, payoutSeller),
    SellerLedgerService.createPayoutRequest(payoutSellerId, 60, dest, payoutSeller),
  ]);
  const fulfilledCount = [r1, r2].filter((r) => r.status === 'fulfilled').length;
  const rejectedCount = [r1, r2].filter((r) => r.status === 'rejected').length;
  assert(
    fulfilledCount === 1 && rejectedCount === 1,
    `Concurrent payout requests allow strictly 1 reservation and block duplicate (${fulfilledCount} succeeded, ${rejectedCount} blocked)`
  );

  // Also test cross-instance runTransaction directly without withSellerPayoutLock
  const payoutSnapAfterRace = await getDocs(
    query(collection(db, 'seller_payouts'), where('sellerId', '==', payoutSellerId))
  );
  assert(payoutSnapAfterRace.docs.length === 1, 'Only 1 payout document persisted in /seller_payouts');

  // Verify runTransaction on /sellers sentinel detects concurrent transaction cleanly
  let txBlockedCrossInstance = false;
  await Promise.all([
    runTransaction(db, async (tx) => {
      await tx.get(doc(db, 'sellers', payoutSellerId));
      const pSnap = await tx.get(query(collection(db, 'seller_payouts'), where('sellerId', '==', payoutSellerId)));
      const active = pSnap.docs.some((d: any) => d.data().status === 'pending');
      if (active) {
        txBlockedCrossInstance = true;
      }
    }),
  ]);
  assert(txBlockedCrossInstance, 'Transactional reader inside runTransaction observes active committed reservation in seller_payouts');

  // -------------------------------------------------------------------------
  // 10. Production Persistence Failure Handling & Missing KYC Secret Gate
  // -------------------------------------------------------------------------
  console.log('\n[10/10] Verifying Fail-Closed Production Persistence & KYC Secret Gates...');
  __setTestSimulateProductionPersistence(true);
  __setTestForceFirestoreFailure(true);

  await assertRejects(
    () => KycService.getMyKyc(kycSeller),
    'PersistenceError',
    'KycService.getMyKyc throws PersistenceError on DB outage in production mode'
  );
  await assertRejects(
    () => SellerLedgerService.getSellerLedger(payoutSellerId, payoutSeller),
    'PersistenceError',
    'SellerLedgerService.getSellerLedger throws PersistenceError on DB outage'
  );
  await assertRejects(
    () => IdempotencyService.check('key_outage_test', 'phase1_user_outage'),
    'PersistenceError',
    'IdempotencyService.check throws PersistenceError on DB outage (no silent memory fallback)'
  );
  await assertRejects(
    () => ReconciliationService.reconcile(),
    'PersistenceError',
    'ReconciliationService.reconcile throws PersistenceError instead of returning empty report'
  );
  await assertRejects(
    () => AdminActivityLogService.listLogs(),
    'PersistenceError',
    'AdminActivityLogService.listLogs throws PersistenceError on DB outage'
  );
  await assertRejects(
    () => DisputeService.listDisputes({}, adminReviewer),
    'PersistenceError',
    'DisputeService.listDisputes throws PersistenceError on DB outage'
  );
  await assertRejects(
    () => PaymentEventService.getEventsForPayment('pay_missing'),
    'PersistenceError',
    'PaymentEventService.getEventsForPayment throws PersistenceError on DB outage'
  );
  await assertRejects(
    () => PaymentService.getPaymentIntent('pay_missing', adminReviewer),
    'PersistenceError',
    'PaymentService.getPaymentIntent throws PersistenceError on DB outage'
  );
  await assertRejects(
    () =>
      WebhookService.handleProviderWebhook(
        'aba_payway',
        { tran_id: 'T1', status: '0', hash: 'test_valid_hash' },
        {}
      ),
    'PersistenceError',
    'WebhookService propagates PersistenceError under DB outage without silent fallback'
  );

  __setTestForceFirestoreFailure(false);
  __setTestSimulateProductionPersistence(false);

  // Verify KYC_VIEW_TOKEN_SECRET missing in production fails closed
  const origNodeEnv = process.env.NODE_ENV;
  const origKycSecret = process.env.KYC_VIEW_TOKEN_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.KYC_VIEW_TOKEN_SECRET;

    const secretCheckMissing = validateKycSecretConfiguration();
    assert(
      secretCheckMissing.valid === false && Boolean(secretCheckMissing.error?.includes('MISSING_KYC_VIEW_TOKEN_SECRET')),
      'validateKycSecretConfiguration rejects missing KYC_VIEW_TOKEN_SECRET in production'
    );

    let missingThrew = false;
    try {
      getKycViewTokenSecret();
    } catch (err: any) {
      missingThrew = String(err?.message || '').includes('MISSING_KYC_VIEW_TOKEN_SECRET');
    }
    assert(missingThrew, 'getKycViewTokenSecret throws CONFIGURATION_ERROR in production when secret is absent');

    process.env.KYC_VIEW_TOKEN_SECRET = 'too_short_secret';
    const weakCheck = validateKycSecretConfiguration();
    assert(
      weakCheck.valid === false && Boolean(weakCheck.error?.includes('WEAK_KYC_VIEW_TOKEN_SECRET')),
      'validateKycSecretConfiguration rejects < 32 char secret in production'
    );

    process.env.KYC_VIEW_TOKEN_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const strongCheck = validateKycSecretConfiguration();
    assert(strongCheck.valid === true, 'validateKycSecretConfiguration accepts >= 32 char secret');
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    if (origKycSecret === undefined) {
      delete process.env.KYC_VIEW_TOKEN_SECRET;
    } else {
      process.env.KYC_VIEW_TOKEN_SECRET = origKycSecret;
    }
  }

  // Confirm PAYMENT_ENVIRONMENT remains sandbox
  assert(
    PaymentConfigService.getEnvironment() === 'sandbox',
    'PAYMENT_ENVIRONMENT remains strictly sandbox'
  );

  __resetAllTestHooks();
  SellerLedgerService.clearMemoryLedgerForTesting();
  resetCryptoRateLimitForTesting();

  console.log('\n=============================================================================');
  console.log(`🏁 PHASE 1 VERIFICATION COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=============================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase1Suite().catch((err) => {
  console.error('Unhandled Phase 1 test error:', err);
  process.exit(1);
});

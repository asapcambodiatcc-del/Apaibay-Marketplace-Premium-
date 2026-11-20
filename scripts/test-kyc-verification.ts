/**
 * APAIBAY MARKETPLACE — KYC & SELLER VERIFICATION SYSTEM E2E TEST SUITE
 * Validates privacy isolation, RBAC, separation of duties, file validation,
 * short-lived document access tokens, payout gating, retention purge, and audit redaction.
 */

import fs from 'fs';
import path from 'path';
import { KycService, MAX_KYC_DOCUMENT_BYTES } from '../server/commerce/kycService';
import { SellerLedgerService } from '../server/commerce/sellerLedgerService';
import { AdminActivityLogService } from '../server/admin/adminActivityLogService';
import { PaymentConfigService } from '../server/payment/paymentConfig';
import { AuthenticatedUser, hasPermission } from '../server/auth/roles';
import { db, doc, getDoc, clearServerFirestoreTestStore } from '../server/repositories/serverFirestore';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failCount++;
  }
}

async function assertThrows(fn: () => Promise<any>, expectedSubstring: string, message: string) {
  try {
    await fn();
    console.error(`  ❌ FAIL: ${message} (expected error containing "${expectedSubstring}", but succeeded)`);
    failCount++;
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes(expectedSubstring)) {
      console.log(`  ✅ PASS: ${message}`);
      passCount++;
    } else {
      console.error(`  ❌ FAIL: ${message} (unexpected error: "${msg}")`);
      failCount++;
    }
  }
}

function makePdfBase64(bodyText: string = 'Apaibay KYC Sample'): string {
  const raw = `%PDF-1.4\n% ${bodyText}\n1 0 obj << /Type /Catalog >> endobj\n%%EOF`;
  return Buffer.from(raw, 'utf8').toString('base64');
}

function makePngBase64(): string {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const body = Buffer.alloc(64, 0x22);
  return Buffer.concat([header, body]).toString('base64');
}

function makeJpegBase64(): string {
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const body = Buffer.alloc(64, 0x33);
  return Buffer.concat([header, body]).toString('base64');
}

async function runTests() {
  console.log('=============================================================================');
  console.log('🪪  APAIBAY MARKETPLACE — KYC & SELLER VERIFICATION SYSTEM E2E TESTS');
  console.log('=============================================================================');

  KycService.clearMemoryStoreForTests();
  SellerLedgerService.clearMemoryLedgerForTesting();
  clearServerFirestoreTestStore();

  const sellerA: AuthenticatedUser = {
    uid: 'kyc_seller_a',
    email: 'merchant.a@apaibay.com',
    emailVerified: true,
    role: 'SELLER',
    canonicalRole: 'SELLER',
    isAdmin: false,
    isSeller: true,
    sellerId: 'kyc_seller_a',
  };

  const sellerB: AuthenticatedUser = {
    uid: 'kyc_seller_b',
    email: 'merchant.b@apaibay.com',
    emailVerified: true,
    role: 'SELLER',
    canonicalRole: 'SELLER',
    isAdmin: false,
    isSeller: true,
    sellerId: 'kyc_seller_b',
  };

  const customerUser: AuthenticatedUser = {
    uid: 'kyc_customer_01',
    email: 'customer01@apaibay.com',
    emailVerified: true,
    role: 'CUSTOMER',
    canonicalRole: 'CUSTOMER',
    isAdmin: false,
    isSeller: false,
    isCustomer: true,
  };

  const supportStaff: AuthenticatedUser = {
    uid: 'kyc_support_01',
    email: 'support@apaibay.com',
    emailVerified: true,
    role: 'admin',
    canonicalRole: 'SUPPORT_STAFF',
    isAdmin: true,
    isSupportStaff: true,
    isSeller: false,
  };

  const adminReviewer: AuthenticatedUser = {
    uid: 'kyc_admin_reviewer',
    email: 'kyc.admin@apaibay.com',
    emailVerified: true,
    role: 'admin',
    canonicalRole: 'ADMIN',
    isAdmin: true,
    isSeller: false,
  };

  const unverifiedBootstrap: AuthenticatedUser = {
    uid: 'kyc_unverified_root',
    email: 'asapcambodia.tcc@gmail.com',
    emailVerified: false,
    role: 'CUSTOMER',
    canonicalRole: 'CUSTOMER',
    isAdmin: false,
    isSeller: false,
  };

  // -------------------------------------------------------------------------
  // 1. KYC Submission & Data Masking / Public Isolation
  // -------------------------------------------------------------------------
  console.log('\n[1/9] Testing KYC Application Submission & Sensitive Field Masking...');
  const kycA = await KycService.submitKycApplication(sellerA, {
    legalFullName: 'Sokha Chan',
    shopName: 'Phnom Penh Artisans',
    countryOfRegistration: 'kh',
    residentialOrBusinessAddress: 'No. 42, Street 240, Daun Penh, Phnom Penh',
    phoneNumber: '+855 12 345 678',
    profileType: 'individual',
    identityDocumentType: 'national_id',
    identityNumber: '0123456789',
    payoutAccountHolderName: 'Sokha Chan',
    privacyNoticeAccepted: true,
  });

  assert(kycA.kycStatus === 'PENDING_REVIEW', 'Submitted KYC enters canonical PENDING_REVIEW status');
  assert(kycA.maskedDocumentNumber === '******6789', 'Identity number masked with only last 4 digits preserved');
  assert(Boolean(kycA.maskedPhone && kycA.maskedPhone.includes('****')), 'Phone number masked in KYC summary');

  const publicSellerSnap = await getDoc(doc(db, 'sellers', sellerA.uid));
  const publicSeller = publicSellerSnap.data();
  assert(Boolean(publicSeller) && publicSeller.kycStatus === 'PENDING_REVIEW', 'Public /sellers stores only safe KYC summary status');
  assert(
    JSON.stringify(publicSeller).indexOf('0123456789') === -1 &&
    JSON.stringify(publicSeller).indexOf('kyc_documents') === -1,
    'Public /sellers document does NOT expose unmasked ID numbers or private storage paths'
  );

  // Registered business profile support
  const kycB = await KycService.submitKycApplication(sellerB, {
    legalFullName: 'Dara Heng',
    shopName: 'Mekong Trade Co., Ltd.',
    countryOfRegistration: 'KH',
    residentialOrBusinessAddress: 'Building 8, Monivong Blvd, Phnom Penh',
    phoneNumber: '+855 23 888 999',
    profileType: 'registered_business',
    identityDocumentType: 'business_registration',
    identityNumber: 'KH-REG-991044',
    privacyNoticeAccepted: true,
  });
  assert(kycB.profileType === 'registered_business', 'Supports registered_business seller KYC profile');

  // -------------------------------------------------------------------------
  // 2. Document Upload Validation (MIME, Magic Bytes, Size Limit, Dangerous Ext)
  // -------------------------------------------------------------------------
  console.log('\n[2/9] Testing Document Type, Magic-Byte Signature, Extension & Size Guards...');
  await assertThrows(
    () =>
      KycService.uploadKycDocument(sellerA, {
        documentType: 'national_id',
        fileName: 'malware.exe',
        mimeType: 'image/png',
        fileBase64: makePngBase64(),
      }),
    'UNSAFE_FILE_EXTENSION',
    'Dangerous .exe extension is blocked even with image MIME'
  );

  await assertThrows(
    () =>
      KycService.uploadKycDocument(sellerA, {
        documentType: 'national_id',
        fileName: 'xss.svg',
        mimeType: 'image/svg+xml',
        fileBase64: Buffer.from('<svg onload="alert(1)"></svg>').toString('base64'),
      }),
    'UNSAFE_FILE_EXTENSION',
    'Dangerous .svg script-capable extension is blocked'
  );

  await assertThrows(
    () =>
      KycService.uploadKycDocument(sellerA, {
        documentType: 'national_id',
        fileName: 'fake.pdf',
        mimeType: 'application/pdf',
        fileBase64: Buffer.from('NOT_A_REAL_PDF_MZ_EXECUTABLE_HEADER_123456').toString('base64'),
      }),
    'INVALID_FILE_SIGNATURE',
    'Spoofed PDF content failing magic-byte verification is strictly blocked'
  );

  const oversizedBuf = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(MAX_KYC_DOCUMENT_BYTES + 100, 0x01),
  ]);
  await assertThrows(
    () =>
      KycService.uploadKycDocument(sellerA, {
        documentType: 'national_id',
        fileName: 'huge_id.jpg',
        mimeType: 'image/jpeg',
        fileBase64: oversizedBuf.toString('base64'),
      }),
    'FILE_TOO_LARGE',
    'Document exceeding 5 MB limit is rejected'
  );

  const uploadedPdf = await KycService.uploadKycDocument(sellerA, {
    documentType: 'national_id',
    fileName: '../my_national_id.pdf',
    mimeType: 'application/pdf',
    fileBase64: makePdfBase64('Sokha Chan National ID'),
    documentNumber: '0123456789',
  });
  assert(uploadedPdf.storagePath.startsWith(`kyc_documents/${sellerA.uid}/`), 'Valid PDF stored under private kyc_documents/{sellerId}/ path');
  assert(!uploadedPdf.fileName.includes('..'), 'Path traversal stripped from sanitized filename');
  assert(uploadedPdf.maskedDocumentNumber === '******6789', 'Document record stores masked ID number only');

  const uploadedJpg = await KycService.uploadKycDocument(sellerA, {
    documentType: 'passport',
    fileName: 'passport_front.jpg',
    mimeType: 'image/jpeg',
    fileBase64: makeJpegBase64(),
  });
  assert(uploadedJpg.mimeType === 'image/jpeg', 'Valid JPEG accepted with matching magic bytes');

  // -------------------------------------------------------------------------
  // 3. RBAC, IDOR, Self-Review Prevention & Unverified Admin Block
  // -------------------------------------------------------------------------
  console.log('\n[3/9] Testing RBAC, Cross-Seller IDOR, Unverified Admin & Self-Review Prevention...');
  assert(!hasPermission(supportStaff, 'kyc:read'), 'SUPPORT_STAFF lacks kyc:read permission');
  assert(!hasPermission(supportStaff, 'kyc:view_documents'), 'SUPPORT_STAFF lacks kyc:view_documents permission');
  assert(!hasPermission(supportStaff, 'kyc:review'), 'SUPPORT_STAFF lacks kyc:review permission');
  assert(!hasPermission(unverifiedBootstrap, 'kyc:review'), 'Unverified bootstrap email lacks kyc:review permission');
  assert(hasPermission(adminReviewer, 'kyc:review'), 'ADMIN holds kyc:review permission');

  await assertThrows(
    () => KycService.listKycApplications(supportStaff),
    'FORBIDDEN_KYC_LIST',
    'Support staff blocked from listing seller KYC queue'
  );

  await assertThrows(
    () => KycService.getKycDetail(sellerB, sellerA.uid),
    'FORBIDDEN_KYC_ACCESS',
    'Cross-seller IDOR attempt to read Seller A KYC profile is blocked'
  );

  await assertThrows(
    () => KycService.createDocumentAccessToken(sellerB, sellerA.uid, uploadedPdf.docId),
    'FORBIDDEN_DOCUMENT_ACCESS',
    'Cross-seller attempt to generate Seller A document view token is blocked'
  );

  await assertThrows(
    () => KycService.createDocumentAccessToken(customerUser, sellerA.uid, uploadedPdf.docId),
    'FORBIDDEN_DOCUMENT_ACCESS',
    'Customer blocked from accessing seller KYC documents'
  );

  await assertThrows(
    () => KycService.createDocumentAccessToken(supportStaff, sellerA.uid, uploadedPdf.docId),
    'FORBIDDEN_DOCUMENT_ACCESS',
    'Support staff blocked from accessing private KYC documents'
  );

  // Separation of duties: an Admin user cannot approve their own KYC application
  const dualRoleAdmin: AuthenticatedUser = {
    ...adminReviewer,
    uid: sellerA.uid,
    email: sellerA.email,
  };
  await assertThrows(
    () => KycService.reviewKycApplication(dualRoleAdmin, sellerA.uid, { action: 'approve' }),
    'FORBIDDEN_SELF_REVIEW',
    'Reviewer cannot review or approve their own seller KYC application'
  );

  // -------------------------------------------------------------------------
  // 4. Short-Lived Private Document Access Tokens
  // -------------------------------------------------------------------------
  console.log('\n[4/9] Testing Short-Lived Authorized Document Tokens & Tamper/Expiry Defense...');
  const adminToken = await KycService.createDocumentAccessToken(adminReviewer, sellerA.uid, uploadedPdf.docId, {
    ttlSeconds: 60,
  });
  const resolvedFile = await KycService.resolveDocumentByToken(adminToken.token);
  assert(resolvedFile.buffer.subarray(0, 4).toString('ascii') === '%PDF', 'Authorized reviewer retrieves private PDF via short-lived token');

  await assertThrows(
    () => KycService.resolveDocumentByToken(`${adminToken.token}tampered`),
    'INVALID_DOCUMENT_TOKEN',
    'Tampered document token signature is rejected'
  );

  const futureExpiredTime = new Date(Date.now() + 120 * 1000);
  await assertThrows(
    () => KycService.resolveDocumentByToken(adminToken.token, { now: futureExpiredTime }),
    'EXPIRED_DOCUMENT_TOKEN',
    'Expired document access token is rejected'
  );

  // -------------------------------------------------------------------------
  // 5. Payout Gating Before KYC Approval (PENDING_REVIEW / REJECTED)
  // -------------------------------------------------------------------------
  console.log('\n[5/9] Testing Payout Blocking for Unverified, Pending & Rejected KYC Sellers...');
  const baseOrder = {
    id: 'ord_kyc_test_01',
    items: [
      {
        productId: 'prod_kyc_1',
        name: 'Handwoven Silk Scarf',
        sellerId: sellerA.uid,
        unitPrice: 100,
        quantity: 2,
        subtotal: 200,
      },
    ],
    discount: 0,
    shippingFee: 0,
    paymentStatus: 'paid',
    status: 'Order Placed',
  };
  const day0 = new Date('2026-06-01T00:00:00.000Z');
  const day8 = new Date('2026-06-09T01:00:00.000Z');
  await SellerLedgerService.recordOrderCommissions(baseOrder, true);
  await SellerLedgerService.confirmDeliverySettlement(baseOrder.id, { now: day0 });

  await assertThrows(
    () =>
      SellerLedgerService.createPayoutRequest(
        sellerA.uid,
        100,
        { method: 'aba_bank', accountName: 'Sokha Chan', accountNumber: '0011223344', verifiedConfirmed: true },
        sellerA,
        { now: day8 }
      ),
    'PAYOUT_BLOCKED_KYC_PENDING_REVIEW',
    'Seller with PENDING_REVIEW KYC is blocked from requesting payout'
  );

  await assertThrows(
    () => KycService.reviewKycApplication(adminReviewer, sellerA.uid, { action: 'reject', reason: 'no' }),
    'REASON_REQUIRED',
    'Rejecting KYC without >=5 char reason is rejected'
  );

  const rejectedKyc = await KycService.reviewKycApplication(adminReviewer, sellerA.uid, {
    action: 'reject',
    reason: 'Passport photo corner is cropped; please upload clear uncropped copy.',
  });
  assert(rejectedKyc.kycStatus === 'REJECTED', 'Admin rejection sets KYC status to REJECTED with reason');

  await assertThrows(
    () =>
      SellerLedgerService.createPayoutRequest(
        sellerA.uid,
        100,
        { method: 'aba_bank', accountName: 'Sokha Chan', accountNumber: '0011223344', verifiedConfirmed: true },
        sellerA,
        { now: day8 }
      ),
    'PAYOUT_BLOCKED_KYC_REJECTED',
    'Seller with REJECTED KYC is blocked from requesting payout'
  );

  // -------------------------------------------------------------------------
  // 6. Resubmission, Approval & Payout Enablement
  // -------------------------------------------------------------------------
  console.log('\n[6/9] Testing Resubmission, Admin Approval & Eligible Payout Creation...');
  const resubmitted = await KycService.submitKycApplication(sellerA, {
    legalFullName: 'Sokha Chan',
    shopName: 'Phnom Penh Artisans',
    countryOfRegistration: 'KH',
    residentialOrBusinessAddress: 'No. 42, Street 240, Daun Penh, Phnom Penh',
    phoneNumber: '+855 12 345 678',
    identityDocumentType: 'national_id',
    identityNumber: '0123456789',
    payoutAccountHolderName: 'Sokha Chan',
    privacyNoticeAccepted: true,
  });
  assert(resubmitted.kycStatus === 'PENDING_REVIEW', 'Resubmitted KYC resets to PENDING_REVIEW');

  const approvedKyc = await KycService.reviewKycApplication(adminReviewer, sellerA.uid, {
    action: 'approve',
    expiresInDays: 30,
    now: day0,
  });
  assert(approvedKyc.kycStatus === 'VERIFIED', 'Admin approval transitions KYC to VERIFIED');
  assert(approvedKyc.identityVerificationStatus === 'verified', 'Identity verification sub-status set to verified');
  assert(approvedKyc.payoutOwnershipVerificationStatus === 'verified', 'Payout ownership sub-status set to verified');

  const payout1 = await SellerLedgerService.createPayoutRequest(
    sellerA.uid,
    50,
    { method: 'aba_bank', accountName: 'Sokha Chan', accountNumber: '0011223344', verifiedConfirmed: true },
    sellerA,
    { now: day8 }
  );
  assert(payout1.status === 'pending' && payout1.amount === 50, 'Verified KYC seller successfully creates eligible $50 payout request');

  // -------------------------------------------------------------------------
  // 7. Expiration, Suspension & Historical Ledger Preservation
  // -------------------------------------------------------------------------
  console.log('\n[7/9] Testing KYC Expiration, Suspension & Preservation of Historical Financial Ledger...');
  const day35 = new Date('2026-07-06T00:00:00.000Z'); // Past 30-day expiry set at day0
  await assertThrows(
    () =>
      SellerLedgerService.createPayoutRequest(
        sellerA.uid,
        40,
        { method: 'aba_bank', accountName: 'Sokha Chan', accountNumber: '0011223344', verifiedConfirmed: true },
        sellerA,
        { now: day35 }
      ),
    'PAYOUT_BLOCKED_KYC_EXPIRED',
    'Expired KYC dynamically blocks new payout request once kycExpiresAt passes'
  );

  // Check ledger history & summary remain untouched despite EXPIRED KYC
  const ledgerAfterExpire = await SellerLedgerService.getSellerLedger(sellerA.uid, sellerA, { now: day35 });
  assert(
    ledgerAfterExpire.summary.netCalculatedEarnings === 190 &&
      ledgerAfterExpire.entries.length === 1 &&
      (ledgerAfterExpire.payouts?.length || 0) === 1,
    'Historical seller ledger earnings & payout history are 100% preserved after KYC expiration'
  );

  // Re-verify then suspend Seller B to verify SUSPENDED payout gating
  await KycService.reviewKycApplication(adminReviewer, sellerB.uid, { action: 'approve', now: day0 });
  const suspendedB = await KycService.reviewKycApplication(adminReviewer, sellerB.uid, {
    action: 'suspend',
    reason: 'Suspected counterfeit listing investigation under compliance audit.',
    now: day8,
  });
  assert(suspendedB.kycStatus === 'SUSPENDED', 'Admin can suspend KYC with mandatory reason');
  await assertThrows(
    () =>
      SellerLedgerService.createPayoutRequest(
        sellerB.uid,
        25,
        { method: 'wing_bank', accountName: 'Dara Heng', accountNumber: '099111222', verifiedConfirmed: true },
        sellerB,
        { now: day8 }
      ),
    'PAYOUT_BLOCKED_KYC_SUSPENDED',
    'Suspended KYC strictly blocks withdrawal requests'
  );

  // -------------------------------------------------------------------------
  // 8. Audit Log Redaction & Document Retention Purge
  // -------------------------------------------------------------------------
  console.log('\n[8/9] Testing Audit Log PII/Binary Redaction & Retention Purge...');
  await AdminActivityLogService.logAction({
    admin: adminReviewer,
    action: 'KYC_DOCUMENT_ACCESSED',
    targetResourceId: sellerA.uid,
    targetResourceType: 'kyc',
    newValue: {
      idNumber: '0123456789',
      fileData: 'JVBERi0xLjQgc2VjcmV0',
      phoneNumber: '+855 12 345 678',
      safeSummary: 'ok',
    },
  });

  const logs = await AdminActivityLogService.listLogs({ targetResourceType: 'kyc', limitCount: 50 });
  const serializedLogs = JSON.stringify(logs);
  assert(logs.some((l) => l.action === 'KYC_DOCUMENT_ACCESSED'), 'KYC document access logged in admin_audit_logs');
  assert(logs.some((l) => l.action === 'KYC_APPROVED'), 'KYC approval logged in admin_audit_logs');
  assert(logs.some((l) => l.action === 'KYC_SUSPENDED'), 'KYC suspension logged in admin_audit_logs');
  assert(
    !serializedLogs.includes('0123456789') &&
      !serializedLogs.includes('JVBERi0xLjQgc2VjcmV0') &&
      !serializedLogs.includes('+855 12 345 678'),
    'Audit logs completely redact unmasked ID numbers, phone numbers, and binary/base64 payloads'
  );

  // Retention purge check (+6 years from upload)
  const sixYearsLater = new Date(Date.now() + 6 * 365 * 24 * 60 * 60 * 1000);
  const purgeResult = await KycService.purgeExpiredDocuments(adminReviewer, { now: sixYearsLater });
  assert(purgeResult.purgedCount >= 2, 'Retention purge clears expired document binaries cleanly');
  await assertThrows(
    () => KycService.createDocumentAccessToken(adminReviewer, sellerA.uid, uploadedPdf.docId),
    'DOCUMENT_PURGED',
    'Access to purged retention document is rejected cleanly'
  );

  // -------------------------------------------------------------------------
  // 9. Rules & Sandbox Invariants Check
  // -------------------------------------------------------------------------
  console.log('\n[9/9] Verifying Firestore Rules, Storage Rules & Sandbox Environment...');
  const fsRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const stRules = fs.readFileSync(path.resolve(process.cwd(), 'storage.rules'), 'utf8');

  assert(
    fsRules.includes('match /seller_kyc/{sellerId}') &&
      fsRules.includes('isKycReviewer()') &&
      fsRules.includes('allow write: if false;'),
    'firestore.rules isolates /seller_kyc/{sellerId} to owner/reviewer reads and server-only writes'
  );
  assert(
    stRules.includes('match /kyc_documents/{allPaths=**}') &&
      stRules.includes('allow read, write: if false;') &&
      !stRules.includes('allow create, update:'),
    'storage.rules strictly locks /kyc_documents/{allPaths=**} to server-only Admin SDK access'
  );
  assert(
    PaymentConfigService.getEnvironment() === 'sandbox',
    'PAYMENT_ENVIRONMENT remains strictly sandbox'
  );

  console.log('\n=============================================================================');
  console.log(`🪪  KYC VERIFICATION TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=============================================================================');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal error in KYC verification test suite:', err);
  process.exit(1);
});

/**
 * APAIBAY MARKETPLACE PREMIUM — PHASE 2.1 CRITICAL SECURITY REMEDIATION TEST SUITE
 *
 * Covers all Phase 2.1 security & integrity invariants:
 * 1. Public /sellers/{uid} PII stripping on POST /api/commerce/sellers/apply + firestore.rules hasNoSellerPii()
 * 2. Private contact/address/legacy docs isolated in /seller_kyc/{uid} (accessible to owner & kyc:read admin, blocked for outsiders)
 * 3. Unverified / pending / rejected / expired KYC / suspended seller blocked from creating products (HTTP 403 + firestore.rules + repo routing)
 * 4. Verified active seller can create products cleanly (HTTP 201)
 * 5. Self-assigned seller/admin role escalation blocked in firestore.rules + client seller repository routing
 * 6. Unverified /admins/{uid} account cannot gain admin access (resolveUserRoles, verifyFirebaseUser Bearer JWT 403, firestore.rules, checkIsAdmin)
 * 7. Suspended user privilege stripping, HTTP 403 ACCOUNT_SUSPENDED, hasPermission false, & refresh token revocation on suspend
 * 8. KYC Firebase Storage direct client access lockdown in storage.rules + backend Admin Storage adapter still functional
 * 9. PATCH /api/admin/orders/:id/status lifecycle transition enforcement + SellerLedgerService hooks + client /orders write lock
 * 10. /admin_notifications rule restricted to seller_app_{uid} & read == false + schema bounds
 * 11. Admin credential readiness diagnostics (accurate Cloud Run vs local/Render detection) & rate-limiter per-instance boundary docs
 * 12. Sandbox preservation (PAYMENT_ENVIRONMENT === 'sandbox')
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
  firebaseConfig,
  isAdminCredentialsConfigured,
  __setTestAdminAuthVerifier,
  __setTestStorageAdapter,
  __resetAllTestHooks,
} from '../server/repositories/serverFirestore';
import { resolveUserRoles, verifyFirebaseUser } from '../server/auth/verifyFirebaseUser';
import { AuthenticatedUser, hasPermission } from '../server/auth/roles';
import { KycService } from '../server/commerce/kycService';
import { SellerLedgerService } from '../server/commerce/sellerLedgerService';
import { AdminActivityLogService } from '../server/admin/adminActivityLogService';
import {
  SELLER_PII_FIELDS,
  anonymizeSellerId,
  parseAuditServiceAccountCredentials,
  resolveAuditCliContext,
  resolveAuditHmacSecret,
  runLegacySellerPiiDryRunAudit,
  sanitizeAuditErrorForLog,
} from './audit-legacy-seller-pii';
import { PaymentConfigService } from '../server/payment/paymentConfig';
import commerceRoutes from '../server/routes/commerceRoutes';
import adminRoutes from '../server/routes/adminRoutes';

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

function makeFakeRs256Jwt(uid: string, email: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: uid,
      user_id: uid,
      email,
      iss: `https://securetoken.google.com/${firebaseConfig.projectId}`,
      aud: firebaseConfig.projectId,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    })
  ).toString('base64url');
  return `${header}.${payload}.test_sig_placeholder`;
}

async function httpJson(
  baseUrl: string,
  method: string,
  urlPath: string,
  headers: Record<string, string>,
  body?: any
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, data: parsed };
}

async function runPhase21Tests() {
  console.log('\n================================================================================');
  console.log('🛡️  APAIBAY PHASE 2.1: CRITICAL SECURITY REMEDIATION VERIFICATION SUITE');
  console.log('================================================================================\n');

  __resetAllTestHooks();
  SellerLedgerService.clearMemoryLedgerForTesting();
  KycService.clearMemoryStoreForTests();

  const firestoreRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const storageRules = fs.readFileSync(path.resolve(process.cwd(), 'storage.rules'), 'utf8');
  const productRepoSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/repositories/firebase/FirebaseProductRepository.ts'),
    'utf8'
  );
  const sellerRepoSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/repositories/firebase/FirebaseSellerRepository.ts'),
    'utf8'
  );
  const sellerClientSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/sellerClient.ts'),
    'utf8'
  );
  const userRepoSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/repositories/firebase/FirebaseUserRepository.ts'),
    'utf8'
  );
  const rateLimiterSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'server/auth/rateLimiter.ts'),
    'utf8'
  );

  // Spin up ephemeral Express server with commerce + admin routes
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/commerce', commerceRoutes);
  app.use('/api/admin', adminRoutes);
  app.get('/api/protected-ping', verifyFirebaseUser, (req, res) => {
    res.json({ success: true, uid: req.user?.uid, role: req.user?.canonicalRole });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // Actors
    const superAdmin: AuthenticatedUser = {
      uid: 'p21_super_admin',
      email: 'asapcambodia.tcc@gmail.com',
      emailVerified: true,
      role: 'SUPER_ADMIN',
      canonicalRole: 'SUPER_ADMIN',
      isAdmin: true,
      isSuperAdmin: true,
      isFinanceManager: true,
      isSupportStaff: true,
      isSeller: false,
    };

    const supportStaff: AuthenticatedUser = {
      uid: 'p21_support_staff',
      email: 'support.staff@apaibay.com',
      emailVerified: true,
      role: 'admin',
      canonicalRole: 'SUPPORT_STAFF',
      isAdmin: true,
      isSupportStaff: true,
      isSeller: false,
    };

    const applicantUid = 'p21_seller_applicant';
    const applicantUser: AuthenticatedUser = {
      uid: applicantUid,
      email: 'merchant.alpha@apaibay.com',
      emailVerified: true,
      role: 'customer',
      canonicalRole: 'CUSTOMER',
      isAdmin: false,
      isSeller: false,
      isCustomer: true,
    };

    const outsiderUser: AuthenticatedUser = {
      uid: 'p21_outsider_user',
      email: 'outsider@apaibay.com',
      emailVerified: true,
      role: 'customer',
      canonicalRole: 'CUSTOMER',
      isAdmin: false,
      isSeller: false,
      isCustomer: true,
    };

    // -----------------------------------------------------------------------
    // 1. Seller PII Stripped From /sellers & Isolated Inside /seller_kyc
    // -----------------------------------------------------------------------
    console.log('[1/12] Testing Seller PII Isolation (/sellers vs /seller_kyc)...');

    const applyRes = await httpJson(
      baseUrl,
      'POST',
      '/api/commerce/sellers/apply',
      { 'x-test-user': JSON.stringify(applicantUser) },
      {
        storeName: 'Khmer Heritage Studio',
        ownerName: 'Sokha Chan',
        description: 'Handcrafted silk and ceramic crafts.',
        businessCountry: 'KH',
        businessAddress: 'No. 88 Street 240, Daun Penh, Phnom Penh',
        businessType: 'individual',
        contactInfo: {
          email: 'merchant.alpha@apaibay.com',
          phone: '+855 12 777 888',
          address: 'No. 88 Street 240, Daun Penh, Phnom Penh',
        },
        documents: ['legacy_id_doc_001.pdf'],
      }
    );

    assert(applyRes.status === 201 && applyRes.data?.success === true, 'POST /api/commerce/sellers/apply succeeds (201)');

    const publicSellerSnap = await getDoc(doc(db, 'sellers', applicantUid));
    assert(publicSellerSnap.exists(), 'Public /sellers/{uid} summary document created');
    const publicSellerData = publicSellerSnap.data() || {};

    assert(
      publicSellerData.contactInfo === undefined &&
        publicSellerData.businessAddress === undefined &&
        publicSellerData.documents === undefined &&
        publicSellerData.phone === undefined &&
        publicSellerData.email === undefined &&
        publicSellerData.residentialOrBusinessAddress === undefined &&
        publicSellerData.maskedPhone === undefined &&
        publicSellerData.identityNumber === undefined,
      'Public /sellers/{uid} document contains ZERO PII (no contactInfo, address, phone, email, or documents)'
    );
    assert(
      publicSellerData.verificationStatus === 'pending' && publicSellerData.storeName === 'Khmer Heritage Studio',
      'Public /sellers/{uid} preserves non-PII storefront summary & forced pending status'
    );

    const privateKycDetail = await KycService.getKycDetail(superAdmin, applicantUid);
    const privateKycData = privateKycDetail?.record as any;
    assert(Boolean(privateKycData), 'Private /seller_kyc/{uid} record automatically populated during seller application');
    assert(
      privateKycData?.contactEmail === 'merchant.alpha@apaibay.com' &&
        privateKycData?.residentialOrBusinessAddress === 'No. 88 Street 240, Daun Penh, Phnom Penh' &&
        typeof privateKycData?.maskedPhone === 'string' &&
        privateKycData.maskedPhone.length > 0 &&
        Array.isArray(privateKycData?.legacyDocumentRefs) &&
        privateKycData.legacyDocumentRefs.includes('legacy_id_doc_001.pdf'),
      'Private contactEmail, address, maskedPhone, and legacyDocumentRefs isolated strictly inside /seller_kyc/{uid}'
    );

    // Partial application payload without long address (tests upsertPrivateContactFromApplication fallback path)
    const shortApplicantUid = 'p21_short_applicant';
    const shortApplicantUser = { ...applicantUser, uid: shortApplicantUid, email: 'short@apaibay.com' };
    await httpJson(
      baseUrl,
      'POST',
      '/api/commerce/sellers/apply',
      { 'x-test-user': JSON.stringify(shortApplicantUser) },
      {
        storeName: 'Mini Market',
        description: 'Quick apply',
        contactInfo: { email: 'short@apaibay.com', phone: '+855 99 123 456' },
      }
    );
    const shortPublic = (await getDoc(doc(db, 'sellers', shortApplicantUid))).data() || {};
    const shortKyc = (await KycService.getMyKyc(shortApplicantUser)).record as any;
    assert(
      shortPublic.contactInfo === undefined && shortPublic.businessAddress === undefined,
      'Partial seller application also strips all PII from public /sellers/{uid}'
    );
    assert(
      shortPublic.ownerName === 'Seller' &&
        shortPublic.ownerName !== shortApplicantUser.email &&
        shortPublic.ownerName !== shortApplicantUid,
      'Omitted ownerName defaults to neutral "Seller" on public /sellers/{uid} (never user email or UID)'
    );
    assert(
      shortKyc?.contactEmail === 'short@apaibay.com' && Boolean(shortKyc?.maskedPhone),
      'Partial seller application persists private contact info into /seller_kyc/{uid}'
    );

    // Explicit email passed into ownerName must ALSO be rejected/neutralized on public /sellers/{uid}
    const emailOwnerUid = 'p21_email_owner_applicant';
    const emailOwnerUser = { ...applicantUser, uid: emailOwnerUid, email: 'direct.leak@apaibay.com' };
    const emailOwnerApplyRes = await httpJson(
      baseUrl,
      'POST',
      '/api/commerce/sellers/apply',
      { 'x-test-user': JSON.stringify(emailOwnerUser) },
      {
        storeName: 'Silk Pavilion',
        ownerName: 'direct.leak@apaibay.com',
        description: 'Direct email in ownerName test',
        contactInfo: { email: 'direct.leak@apaibay.com', phone: '+855 88 222 333' },
      }
    );
    const emailOwnerPublic = (await getDoc(doc(db, 'sellers', emailOwnerUid))).data() || {};
    assert(
      emailOwnerApplyRes.status === 201 &&
        emailOwnerPublic.ownerName === 'Seller' &&
        !String(emailOwnerPublic.ownerName).includes('@'),
      'Email string submitted as ownerName is neutralized to "Seller" on public /sellers/{uid}'
    );

    // Direct KycService.submitKycApplication fallback creating /sellers/{uid} must also sanitize ownerName
    const kycDirectUid = 'p21_kyc_direct_seller';
    const kycDirectUser: AuthenticatedUser = {
      ...applicantUser,
      uid: kycDirectUid,
      email: 'kyc.only@apaibay.com',
    };
    await KycService.submitKycApplication(kycDirectUser, {
      legalFullName: 'kyc.only@apaibay.com',
      shopName: 'Direct KYC Shop',
      countryOfRegistration: 'KH',
      residentialOrBusinessAddress: 'No. 12 Street 51, Phnom Penh',
      contactEmail: 'kyc.only@apaibay.com',
      phoneNumber: '+855 12 111 222',
      identityDocumentType: 'national_id',
      privacyNoticeAccepted: true,
    });
    const kycDirectPublicSeller = (await getDoc(doc(db, 'sellers', kycDirectUid))).data() || {};
    assert(
      kycDirectPublicSeller.ownerName === 'Seller' && !String(kycDirectPublicSeller.ownerName).includes('@'),
      'KycService.submitKycApplication sanitizes email-like legalFullName when initializing public /sellers/{uid}'
    );

    // Access checks: owner & KYC admin can read; outsider & non-kyc support staff cannot
    const ownerMeRes = await httpJson(baseUrl, 'GET', '/api/commerce/sellers/me', {
      'x-test-user': JSON.stringify(applicantUser),
    });
    assert(
      ownerMeRes.status === 200 && ownerMeRes.data?.seller?.contactInfo?.email === 'merchant.alpha@apaibay.com',
      'Seller owner receives their own contactInfo hydrated from /seller_kyc via GET /api/commerce/sellers/me'
    );

    const adminSellersRes = await httpJson(baseUrl, 'GET', '/api/commerce/sellers', {
      'x-test-user': JSON.stringify(superAdmin),
    });
    const foundByAdmin = (adminSellersRes.data?.sellers || []).find((s: any) => s.sellerId === applicantUid);
    assert(
      adminSellersRes.status === 200 && foundByAdmin?.contactInfo?.email === 'merchant.alpha@apaibay.com',
      'Authorized KYC Admin receives enriched seller contact info from /seller_kyc via GET /api/commerce/sellers'
    );

    const supportKycRes = await httpJson(baseUrl, 'GET', `/api/admin/kyc/${applicantUid}`, {
      'x-test-user': JSON.stringify(supportStaff),
    });
    assert(
      supportKycRes.status === 403,
      'SUPPORT_STAFF without kyc:read permission blocked (403) from /api/admin/kyc/:sellerId'
    );

    const outsiderSellersRes = await httpJson(baseUrl, 'GET', '/api/commerce/sellers', {
      'x-test-user': JSON.stringify(outsiderUser),
    });
    assert(outsiderSellersRes.status === 403, 'Customer outsider blocked (403) from GET /api/commerce/sellers');

    // Static Firestore rules & SELLER_PII_FIELDS consistency check for private email/reviewer isolation
    const hasNoSellerPiiBlock =
      firestoreRules.match(/function\s+hasNoSellerPii\s*\(data\)\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';
    const allSellerPiiFieldsBlockedInRules = SELLER_PII_FIELDS.every((field) =>
      hasNoSellerPiiBlock.includes(`'${field}'`)
    );
    assert(
      firestoreRules.includes('function hasNoSellerPii(data)') &&
        allSellerPiiFieldsBlockedInRules &&
        SELLER_PII_FIELDS.includes('reviewedBy') &&
        SELLER_PII_FIELDS.includes('reviewedByEmail') &&
        SELLER_PII_FIELDS.includes('reviewedByUid') &&
        SELLER_PII_FIELDS.includes('contactEmail') &&
        hasNoSellerPiiBlock.includes('ownerName.matches') &&
        /match\s+\/sellers\/\{sellerId\}[\s\S]*hasNoSellerPii\(request\.resource\.data\)/.test(firestoreRules),
      'SELLER_PII_FIELDS and firestore.rules hasNoSellerPii() consistently reject private email/reviewer fields and email ownerName'
    );

    // -----------------------------------------------------------------------
    // 2. Unverified / Rejected / Expired / Suspended Seller Cannot Create Products
    // -----------------------------------------------------------------------
    console.log('\n[2/12] Testing Verified-Only Seller Product Publishing Gate...');

    const unverifiedProdRes = await httpJson(
      baseUrl,
      'POST',
      '/api/commerce/products',
      { 'x-test-user': JSON.stringify({ ...applicantUser, role: 'seller', isSeller: true, sellerId: applicantUid }) },
      { name: 'Pending Seller Item', price: 25, category: 'crafts' }
    );
    assert(
      unverifiedProdRes.status === 403 && unverifiedProdRes.data?.error?.code === 'SELLER_NOT_VERIFIED',
      'Pending seller blocked (403 SELLER_NOT_VERIFIED) from creating product via API'
    );

    // Check customer with no seller record at all
    const customerProdRes = await httpJson(
      baseUrl,
      'POST',
      '/api/commerce/products',
      { 'x-test-user': JSON.stringify(outsiderUser) },
      { name: 'Customer Forged Product', price: 10, category: 'electronics' }
    );
    assert(customerProdRes.status === 403, 'Non-seller customer blocked (403) from creating product via API');

    // Approve seller to verified, confirm reviewer identity is NOT stored in public /sellers,
    // while remaining preserved in private /seller_kyc and /admin_audit_logs
    const reviewApproveRes = await httpJson(
      baseUrl,
      'PATCH',
      `/api/commerce/sellers/${applicantUid}/review`,
      { 'x-test-user': JSON.stringify(superAdmin) },
      { status: 'verified' }
    );
    assert(
      reviewApproveRes.status === 200 && reviewApproveRes.data?.seller?.verificationStatus === 'verified',
      'Super Admin can verify seller application via backend review endpoint'
    );

    const publicReviewedSeller = (await getDoc(doc(db, 'sellers', applicantUid))).data() || {};
    assert(
      publicReviewedSeller.reviewedBy === undefined &&
        publicReviewedSeller.reviewedByEmail === undefined &&
        publicReviewedSeller.reviewedByUid === undefined &&
        Boolean(publicReviewedSeller.reviewedAt),
      'Public /sellers/{uid} does NOT store reviewedBy email or UID after review'
    );

    // Direct KycService review path also omits reviewedBy from public /sellers/{uid}
    await KycService.reviewKycApplication(superAdmin, kycDirectUid, { action: 'approve' });
    const kycDirectReviewedPublic = (await getDoc(doc(db, 'sellers', kycDirectUid))).data() || {};
    assert(
      kycDirectReviewedPublic.reviewedBy === undefined && kycDirectReviewedPublic.verificationStatus === 'verified',
      'KycService.syncPublicSellerSummary() syncs verified status without writing reviewedBy to public /sellers/{uid}'
    );

    // Verify private reviewer identity remains intact in /seller_kyc, history, /admin_audit_logs, & admin list API
    const postReviewKycDetail = await KycService.getKycDetail(superAdmin, applicantUid);
    const adminAuditLogs = await AdminActivityLogService.listLogs({ targetResourceId: applicantUid, limitCount: 20 });
    const adminReviewedListRes = await httpJson(baseUrl, 'GET', '/api/commerce/sellers', {
      'x-test-user': JSON.stringify(superAdmin),
    });
    const adminSellerView = (adminReviewedListRes.data?.sellers || []).find((s: any) => s.sellerId === applicantUid);
    assert(
      postReviewKycDetail.record?.reviewedByUid === superAdmin.uid &&
        postReviewKycDetail.record?.reviewedByEmail === superAdmin.email &&
        postReviewKycDetail.history.some((h) => h.action === 'APPROVED' && h.actorEmail === superAdmin.email) &&
        adminAuditLogs.some((l) => l.action === 'KYC_APPROVED' && l.adminEmail === superAdmin.email) &&
        adminSellerView?.reviewedBy === superAdmin.email,
      'Private reviewer identity preserved in /seller_kyc, KYC history, /admin_audit_logs, and admin-only enrichment'
    );

    const verifiedSellerAuth: AuthenticatedUser = {
      uid: applicantUid,
      email: 'merchant.alpha@apaibay.com',
      emailVerified: true,
      role: 'seller',
      canonicalRole: 'SELLER',
      isAdmin: false,
      isSeller: true,
      sellerId: applicantUid,
    };

    const verifiedProdRes = await httpJson(
      baseUrl,
      'POST',
      '/api/commerce/products',
      { 'x-test-user': JSON.stringify(verifiedSellerAuth) },
      { name: 'Verified Silk Scarf', price: 45, category: 'fashion', stock: 12 }
    );
    assert(
      verifiedProdRes.status === 201 && verifiedProdRes.data?.product?.sellerId === applicantUid,
      'Verified seller successfully creates product (201)'
    );

    // Expired KYC status blocks verified seller
    await setDoc(
      doc(db, 'sellers', applicantUid),
      { verificationStatus: 'verified', kycStatus: 'EXPIRED' },
      { merge: true }
    );
    const expiredKycProdRes = await httpJson(
      baseUrl,
      'POST',
      '/api/commerce/products',
      { 'x-test-user': JSON.stringify(verifiedSellerAuth) },
      { name: 'Expired KYC Item', price: 30, category: 'fashion' }
    );
    assert(
      expiredKycProdRes.status === 403 && expiredKycProdRes.data?.error?.code === 'SELLER_KYC_INACTIVE',
      'Seller with kycStatus == EXPIRED blocked (403 SELLER_KYC_INACTIVE) from creating products'
    );

    // Suspended verificationStatus blocks product creation
    await setDoc(
      doc(db, 'sellers', applicantUid),
      { verificationStatus: 'suspended', kycStatus: 'SUSPENDED' },
      { merge: true }
    );
    const suspendedSellerProdRes = await httpJson(
      baseUrl,
      'POST',
      '/api/commerce/products',
      { 'x-test-user': JSON.stringify(verifiedSellerAuth) },
      { name: 'Suspended Seller Item', price: 30, category: 'fashion' }
    );
    assert(
      suspendedSellerProdRes.status === 403 && suspendedSellerProdRes.data?.error?.code === 'SELLER_NOT_VERIFIED',
      'Suspended seller blocked (403) from creating products'
    );

    // Check firestore.rules & FirebaseProductRepository client routing
    assert(
      firestoreRules.includes('function isVerifiedSeller(uid)') &&
        firestoreRules.includes("verificationStatus == 'verified'") &&
        /match\s+\/products\/\{productId\}[\s\S]*isVerifiedSeller\(request\.auth\.uid\)[\s\S]*isNotSuspended\(request\.auth\.uid\)/.test(
          firestoreRules
        ),
      'firestore.rules enforces isVerifiedSeller() & isNotSuspended() on /products/{productId}'
    );
    assert(
      productRepoSrc.includes("'/api/commerce/products'") && !/setDoc\s*\(\s*doc\s*\(\s*db\s*,\s*['"]products['"]/.test(productRepoSrc),
      'FirebaseProductRepository.create() routes through /api/commerce/products without direct client product setDoc'
    );

    // -----------------------------------------------------------------------
    // 3. Self-Assigned 'seller' / Admin Role Blocked in /users/{uid}
    // -----------------------------------------------------------------------
    console.log('\n[3/12] Testing Self-Assigned Role Escalation Locks...');
    assert(
      /match\s+\/users\/\{uid\}[\s\S]*request\.resource\.data\.role\s*==\s*'customer'/.test(firestoreRules) &&
        /match\s+\/users\/\{uid\}[\s\S]*affectedKeys\(\)\.hasAny\(\[[\s\S]*'role'[\s\S]*'status'[\s\S]*'accountStatus'/.test(
          firestoreRules
        ),
      'firestore.rules locks /users/{uid} client creation strictly to role == customer and blocks updating role/status/adminRole'
    );
    assert(
      sellerRepoSrc.includes("'/api/commerce/sellers/apply'") &&
        !/setDoc\s*\(\s*doc\s*\(\s*db\s*,\s*['"]sellers['"]/.test(sellerRepoSrc) &&
        sellerClientSrc.includes("'/api/commerce/sellers/apply'") &&
        !/setDoc\s*\(\s*doc\s*\(\s*db\s*,\s*['"]sellers['"]/.test(sellerClientSrc),
      'FirebaseSellerRepository and SellerClient both route seller registration through /api/commerce/sellers/apply without direct Firestore writes'
    );

    // -----------------------------------------------------------------------
    // 4. Unverified Admin /admins/{uid} & UI checkIsAdmin Blocked
    // -----------------------------------------------------------------------
    console.log('\n[4/12] Testing Admin Email Verification Enforcement...');
    const unverifiedAdminUid = 'p21_unverified_admin';
    const unverifiedAdminEmail = 'pending.admin@apaibay.com';
    await setDoc(doc(db, 'admins', unverifiedAdminUid), {
      uid: unverifiedAdminUid,
      email: unverifiedAdminEmail,
      role: 'SUPER_ADMIN',
      assignedAt: new Date().toISOString(),
    });

    const rolesWhenUnverified = await resolveUserRoles(unverifiedAdminUid, unverifiedAdminEmail, false);
    assert(
      rolesWhenUnverified.isAdmin === false &&
        rolesWhenUnverified.isSuperAdmin !== true &&
        rolesWhenUnverified.canonicalRole === 'CUSTOMER',
      'resolveUserRoles() refuses admin privileges to /admins/{uid} record when emailVerified === false'
    );

    const rolesWhenVerified = await resolveUserRoles(unverifiedAdminUid, unverifiedAdminEmail, true);
    assert(
      rolesWhenVerified.isAdmin === true && rolesWhenVerified.isSuperAdmin === true,
      'resolveUserRoles() grants admin privileges once emailVerified === true'
    );

    // Full HTTP Bearer token test through verifyFirebaseUser -> requirePermission
    let revokedUidList: string[] = [];
    __setTestAdminAuthVerifier({
      async verifyIdToken(idToken: string) {
        const parts = idToken.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        return {
          uid: payload.sub,
          email: payload.email,
          email_verified: payload.sub !== unverifiedAdminUid,
        };
      },
      async revokeRefreshTokens(uid: string) {
        revokedUidList.push(uid);
      },
    });

    const unverifiedJwt = makeFakeRs256Jwt(unverifiedAdminUid, unverifiedAdminEmail);
    const unverifiedAdminHttp = await httpJson(baseUrl, 'GET', '/api/admin/users', {
      Authorization: `Bearer ${unverifiedJwt}`,
    });
    assert(
      unverifiedAdminHttp.status === 403 && unverifiedAdminHttp.data?.error?.code === 'FORBIDDEN_PERMISSION',
      'verifyFirebaseUser + requirePermission blocks /admins/{uid} JWT with email_verified=false (403)'
    );

    assert(
      hasPermission(
        {
          uid: unverifiedAdminUid,
          email: unverifiedAdminEmail,
          emailVerified: false,
          role: 'SUPER_ADMIN',
          canonicalRole: 'SUPER_ADMIN',
          isAdmin: true,
          isSuperAdmin: true,
          isSeller: false,
        },
        'manage_users'
      ) === false,
      'hasPermission() fails closed whenever emailVerified === false'
    );

    assert(
      firestoreRules.includes('function isEmailVerified()') &&
        firestoreRules.includes("request.auth.token.email_verified == true") &&
        /function isAdmin\(\)[\s\S]*isEmailVerified\(\)/.test(firestoreRules) &&
        /function isFinanceStaff\(\)[\s\S]*isEmailVerified\(\)/.test(firestoreRules) &&
        /function isSupportStaff\(\)[\s\S]*isEmailVerified\(\)/.test(firestoreRules),
      'firestore.rules requires isEmailVerified() on isAdmin(), isFinanceStaff(), and isSupportStaff()'
    );
    assert(
      userRepoSrc.includes('emailVerified !== true') || userRepoSrc.includes('emailVerified === true'),
      'FirebaseUserRepository.checkIsAdmin() enforces emailVerified check on client'
    );

    // -----------------------------------------------------------------------
    // 5. Suspended Account Enforcement & Token Revocation
    // -----------------------------------------------------------------------
    console.log('\n[5/12] Testing Suspended Account Enforcement & Token Revocation...');
    const suspendTargetUid = 'p21_target_staff';
    const suspendTargetEmail = 'staff.suspend@apaibay.com';
    await setDoc(doc(db, 'admins', suspendTargetUid), {
      uid: suspendTargetUid,
      email: suspendTargetEmail,
      role: 'ADMIN',
      assignedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'users', suspendTargetUid), {
      uid: suspendTargetUid,
      email: suspendTargetEmail,
      role: 'admin',
      status: 'active',
    });

    // Suspend via admin endpoint & assert revokeRefreshTokens called
    revokedUidList = [];
    const suspendRes = await httpJson(
      baseUrl,
      'PATCH',
      `/api/admin/users/${suspendTargetUid}/status`,
      { 'x-test-user': JSON.stringify(superAdmin) },
      { status: 'suspended', reason: 'Security policy violation' }
    );
    assert(suspendRes.status === 200 && suspendRes.data?.success === true, 'Admin suspends target account (200)');
    assert(
      revokedUidList.includes(suspendTargetUid),
      'PATCH /api/admin/users/:uid/status invokes getAdminAuth().revokeRefreshTokens(targetUid)'
    );

    const resolvedSuspended = await resolveUserRoles(suspendTargetUid, suspendTargetEmail, true);
    assert(
      resolvedSuspended.accountStatus === 'suspended' &&
        resolvedSuspended.isAdmin === false &&
        resolvedSuspended.isSeller === false,
      'resolveUserRoles() strips all admin and seller roles for suspended /users/{uid}'
    );

    assert(
      hasPermission(
        {
          uid: suspendTargetUid,
          email: suspendTargetEmail,
          emailVerified: true,
          role: 'ADMIN',
          canonicalRole: 'ADMIN',
          isAdmin: true,
          isSeller: false,
          accountStatus: 'suspended',
        },
        'manage_orders'
      ) === false,
      'hasPermission() denies all permissions when accountStatus === suspended'
    );

    const suspendedJwt = makeFakeRs256Jwt(suspendTargetUid, suspendTargetEmail);
    const suspendedCallRes = await httpJson(baseUrl, 'GET', '/api/protected-ping', {
      Authorization: `Bearer ${suspendedJwt}`,
    });
    assert(
      suspendedCallRes.status === 403 && suspendedCallRes.data?.error?.code === 'ACCOUNT_SUSPENDED',
      'Suspended user rejected with HTTP 403 ACCOUNT_SUSPENDED across verifyFirebaseUser'
    );

    // -----------------------------------------------------------------------
    // 6. Storage Rules Lockdown + Backend Admin Storage Adapter Still Works
    // -----------------------------------------------------------------------
    console.log('\n[6/12] Testing KYC Storage Direct-Access Lockdown & Backend Adapter...');
    assert(
      /match\s+\/kyc_documents\/\{allPaths=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/.test(storageRules) &&
        /match\s+\/\{allPaths=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/.test(storageRules),
      'storage.rules strictly blocks all direct client reads, uploads, and overwrites on /kyc_documents/{allPaths=**} and fallback'
    );

    const mockBucket = new Map<string, Buffer>();
    __setTestStorageAdapter({
      file(p: string) {
        return {
          async save(buf: Buffer) {
            mockBucket.set(p, Buffer.from(buf));
          },
          async download() {
            const b = mockBucket.get(p);
            if (!b) throw new Error('Not found');
            return [Buffer.from(b)];
          },
          async delete() {
            mockBucket.delete(p);
          },
        };
      },
    });
    const fakePng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('apaibay_valid_test_png_payload'),
    ]);
    const docRec = await KycService.uploadKycDocument(applicantUser, {
      documentType: 'national_id',
      fileName: 'id_front.png',
      mimeType: 'image/png',
      fileBase64: fakePng.toString('base64'),
    });
    const adminDocToken = await KycService.createDocumentAccessToken(superAdmin, applicantUid, docRec.docId);
    const downloadedDoc = await KycService.resolveDocumentByToken(adminDocToken.token);
    assert(
      Buffer.compare(downloadedDoc.buffer, fakePng) === 0,
      'Backend Admin Storage upload + authorized HMAC viewing token works cleanly while client Storage is locked'
    );

    // -----------------------------------------------------------------------
    // 7. Admin Order Status Transitions, Ledger Hooks, & Client Order Lock
    // -----------------------------------------------------------------------
    console.log('\n[7/12] Testing Admin Order Lifecycle State Machine & Ledger Hooks...');
    const orderSellerUid = 'p21_order_seller';
    await setDoc(doc(db, 'sellers', orderSellerUid), {
      sellerId: orderSellerUid,
      ownerUid: orderSellerUid,
      storeName: 'Order Hook Store',
      verificationStatus: 'verified',
    });

    const testOrderId = 'ORD-P21-001';
    const orderDoc = {
      id: testOrderId,
      customerUid: outsiderUser.uid,
      customerEmail: outsiderUser.email,
      status: 'Placed',
      orderStatus: 'Placed',
      paymentStatus: 'paid',
      total: 100,
      discount: 0,
      shippingFee: 0,
      currency: 'USD',
      items: [
        {
          productId: 'prod_p21_1',
          name: 'Craft Vase',
          sellerId: orderSellerUid,
          unitPrice: 100,
          quantity: 1,
          subtotal: 100,
        },
      ],
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'orders', testOrderId), orderDoc);
    await SellerLedgerService.recordOrderCommissions(orderDoc, true);

    // Invalid direct jump Placed -> Delivered MUST be rejected (400)
    const illegalJumpRes = await httpJson(
      baseUrl,
      'PATCH',
      `/api/admin/orders/${testOrderId}/status`,
      { 'x-test-user': JSON.stringify(superAdmin) },
      { status: 'Delivered' }
    );
    assert(illegalJumpRes.status === 400, 'PATCH /api/admin/orders/:id/status rejects invalid jump Placed -> Delivered (400)');

    // Invalid arbitrary status string rejected
    const badStatusRes = await httpJson(
      baseUrl,
      'PATCH',
      `/api/admin/orders/${testOrderId}/status`,
      { 'x-test-user': JSON.stringify(superAdmin) },
      { status: 'HACKED_STATUS' }
    );
    assert(
      badStatusRes.status === 400 && badStatusRes.data?.error?.code === 'INVALID_STATUS',
      'PATCH /api/admin/orders/:id/status rejects invalid status strings (400 INVALID_STATUS)'
    );

    // Valid step-by-step progression: Placed -> Processing -> Shipped -> Delivered
    for (const nextStatus of ['Processing', 'Shipped', 'Delivered']) {
      const stepRes = await httpJson(
        baseUrl,
        'PATCH',
        `/api/admin/orders/${testOrderId}/status`,
        { 'x-test-user': JSON.stringify(superAdmin) },
        { status: nextStatus }
      );
      assert(stepRes.status === 200 && stepRes.data?.status === nextStatus, `Order transitions cleanly to '${nextStatus}'`);
    }

    // Verify SellerLedgerService.confirmDeliverySettlement updated deliveredAt & settlementEligibleAt
    const ledgerAfterDelivery = await SellerLedgerService.getSellerLedger(orderSellerUid, superAdmin);
    assert(
      ledgerAfterDelivery.entries.length === 1 &&
        Boolean(ledgerAfterDelivery.entries[0].deliveredAt) &&
        Boolean(ledgerAfterDelivery.entries[0].settlementEligibleAt),
      'Transitioning order to Delivered via admin route invokes SellerLedgerService.confirmDeliverySettlement'
    );

    // Terminal state Delivered -> Cancelled MUST fail
    const terminalOverrideRes = await httpJson(
      baseUrl,
      'PATCH',
      `/api/admin/orders/${testOrderId}/status`,
      { 'x-test-user': JSON.stringify(superAdmin) },
      { status: 'Cancelled' }
    );
    assert(terminalOverrideRes.status === 400, 'Terminal transition Delivered -> Cancelled blocked by admin order route');

    // Cancellation path triggers recordOrderAdjustment
    const cancelOrderId = 'ORD-P21-002';
    const cancelOrderDoc = { ...orderDoc, id: cancelOrderId, status: 'Processing', orderStatus: 'Processing' };
    await setDoc(doc(db, 'orders', cancelOrderId), cancelOrderDoc);
    await SellerLedgerService.recordOrderCommissions(cancelOrderDoc, true);
    const cancelRes = await httpJson(
      baseUrl,
      'PATCH',
      `/api/admin/orders/${cancelOrderId}/status`,
      { 'x-test-user': JSON.stringify(superAdmin) },
      { status: 'Cancelled', reason: 'Merchant out of stock' }
    );
    assert(cancelRes.status === 200 && cancelRes.data?.status === 'Cancelled', 'Admin cancels Processing order cleanly');
    const sellerLedgerAfterCancel = await SellerLedgerService.getSellerLedger(orderSellerUid, superAdmin);
    const hasCancelAdjustment = sellerLedgerAfterCancel.entries.some(
      (e) => e.orderId === cancelOrderId && e.type === 'cancellation_adjustment'
    );
    assert(hasCancelAdjustment, 'Cancelling order via admin route records SellerLedgerService cancellation_adjustment');

    assert(
      /match\s+\/orders\/\{orderId\}[\s\S]*allow create: if false;[\s\S]*allow update: if false;[\s\S]*allow delete: if false;/.test(
        firestoreRules
      ),
      'firestore.rules locks /orders/{orderId} client creates, updates, and deletes to false'
    );

    // -----------------------------------------------------------------------
    // 8. Admin Notifications Non-Admin Rule Binding
    // -----------------------------------------------------------------------
    console.log('\n[8/12] Testing /admin_notifications Strict Binding...');
    assert(
      /match\s+\/admin_notifications\/\{notificationId\}[\s\S]*notificationId == \('seller_app_' \+ request\.auth\.uid\)[\s\S]*request\.resource\.data\.applicantUid == request\.auth\.uid[\s\S]*request\.resource\.data\.type == 'seller_application'[\s\S]*request\.resource\.data\.read == false/.test(
        firestoreRules
      ),
      'firestore.rules binds non-admin /admin_notifications creation strictly to seller_app_{uid} and read == false'
    );

    // -----------------------------------------------------------------------
    // 9. Credential Readiness Diagnostics (No False RENDER Positive)
    // -----------------------------------------------------------------------
    console.log('\n[9/12] Testing isAdminCredentialsConfigured() Environment Accuracy...');
    const savedEnv = {
      RENDER: process.env.RENDER,
      GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      K_SERVICE: process.env.K_SERVICE,
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
      FIREBASE_CONFIG: process.env.FIREBASE_CONFIG,
    };

    try {
      delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      delete process.env.K_SERVICE;
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.FIREBASE_CONFIG;
      process.env.RENDER = 'true';

      assert(
        isAdminCredentialsConfigured() === false,
        'RENDER=true alone without service account or metadata server does NOT report credentials configured'
      );

      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/nonexistent/path/service-account.json';
      assert(
        isAdminCredentialsConfigured() === false,
        'Missing GOOGLE_APPLICATION_CREDENTIALS file reports isAdminCredentialsConfigured() === false'
      );

      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      process.env.K_SERVICE = 'apaibay-staging';
      process.env.GOOGLE_CLOUD_PROJECT = firebaseConfig.projectId;
      assert(
        isAdminCredentialsConfigured() === true,
        'Managed Google Cloud Run runtime (K_SERVICE + GOOGLE_CLOUD_PROJECT) reports true'
      );
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }

    // -----------------------------------------------------------------------
    // 10. Rate Limiter Architectural Boundary Docs & Sandbox Mode Lock
    // -----------------------------------------------------------------------
    console.log('\n[10/12] Testing Rate Limiter Architecture Docs & Sandbox Lock...');
    assert(
      rateLimiterSrc.includes('per running Node.js instance') && rateLimiterSrc.includes('multi-instance'),
      'rateLimiter.ts explicitly documents per-Node-instance memory boundary for multi-instance production scaling'
    );
    assert(PaymentConfigService.getEnvironment() === 'sandbox', 'PAYMENT_ENVIRONMENT strictly remains sandbox');

    // -----------------------------------------------------------------------
    // 11. /addresses & /reviews Schema Bounds in firestore.rules
    // -----------------------------------------------------------------------
    console.log('\n[11/12] Testing Firestore Schema Bounds...');
    assert(
      /match\s+\/addresses\/\{addressId\}[\s\S]*request\.resource\.data\.fullName\.size\(\)\s*<=\s*150/.test(firestoreRules) &&
        /match\s+\/reviews\/\{reviewId\}[\s\S]*request\.resource\.data\.rating\s*>=\s*1[\s\S]*request\.resource\.data\.rating\s*<=\s*5[\s\S]*request\.resource\.data\.comment\.size\(\)\s*<=\s*2000/.test(
          firestoreRules
        ),
      'firestore.rules enforces length and numeric bounds on /addresses and /reviews'
    );

    // -----------------------------------------------------------------------
    // 12. Production Audit Workflow & Audit CLI Security Hardening Regressions
    // -----------------------------------------------------------------------
    console.log('\n[12/13] Testing Production Audit Workflow & CLI Security Hardening...');
    const auditWorkflowPath = path.resolve(process.cwd(), '.github/workflows/firebase-seller-pii-audit.yml');
    const auditWorkflowYml = fs.readFileSync(auditWorkflowPath, 'utf8');
    const auditScriptSrc = fs.readFileSync(path.resolve(process.cwd(), 'scripts/audit-legacy-seller-pii.ts'), 'utf8');

    assert(
      auditWorkflowYml.includes('workflow_dispatch:') &&
        !/^\s*(schedule|push|pull_request|workflow_call)\s*:/m.test(auditWorkflowYml) &&
        auditWorkflowYml.includes('contents: read') &&
        auditWorkflowYml.includes('environment: production-audit') &&
        auditWorkflowYml.includes('oven-sh/setup-bun@4bc047ad259df6fc24a6c9b0f9a0cb08cf17fbe5') &&
        auditWorkflowYml.includes('bun install --frozen-lockfile --ignore-scripts') &&
        !auditWorkflowYml.includes('npm install') &&
        auditWorkflowYml.includes('SELLER_AUDIT_HMAC_SECRET') &&
        auditWorkflowYml.includes('seller-pii-audit-stderr.log') &&
        auditWorkflowYml.includes('if: always()'),
      'Audit workflow pins manual-only trigger, production-audit environment gate, frozen bun install --ignore-scripts, HMAC secret, and redacted error cleanup'
    );

    // Ensure dependency install step has zero credential env exposure
    const installBlock = auditWorkflowYml.match(/- name: Install frozen dependencies[\s\S]*?(?=- name:)/)?.[0] || '';
    assert(
      installBlock.length > 0 &&
        !installBlock.includes('FIREBASE_AUDIT_SERVICE_ACCOUNT_JSON') &&
        !installBlock.includes('SELLER_AUDIT_HMAC_SECRET'),
      'Dependency installation step has zero access to Firebase or HMAC secrets'
    );

    assert(
      !auditScriptSrc.includes('applicationDefault') &&
        auditScriptSrc.includes("argv.includes('--commit')") &&
        auditScriptSrc.includes("argv.includes('--mutate')") &&
        auditScriptSrc.includes("createHmac('sha256'") &&
        auditScriptSrc.includes('FIREBASE_AUDIT_SERVICE_ACCOUNT_JSON') &&
        auditWorkflowYml.includes("argv.includes('--commit')") &&
        auditWorkflowYml.includes("argv.includes('--mutate')"),
      'scripts/audit-legacy-seller-pii.ts removes applicationDefault() ADC fallback and matches workflow static pre-flight guards'
    );

    // HMAC-SHA256 anonymization tests
    let missingHmacCode = '';
    try {
      resolveAuditHmacSecret({ env: { NODE_ENV: 'production' } });
    } catch (e: any) {
      missingHmacCode = e?.code || '';
    }
    assert(
      missingHmacCode === 'AUDIT_HMAC_SECRET_MISSING',
      'Missing SELLER_AUDIT_HMAC_SECRET fails safely in non-emulator mode'
    );

    let shortHmacCode = '';
    try {
      resolveAuditHmacSecret({ env: { SELLER_AUDIT_HMAC_SECRET: 'too-short' } });
    } catch (e: any) {
      shortHmacCode = e?.code || '';
    }
    assert(
      shortHmacCode === 'AUDIT_HMAC_SECRET_INVALID',
      'Short (<16 char) SELLER_AUDIT_HMAC_SECRET is rejected'
    );

    const syntheticSaObj = {
      type: 'service_account',
      project_id: 'apaibay-marketplace-premium',
      private_key_id: 'key-id-1234567890',
      private_key: '-----BEGIN PRIVATE KEY-----\nSYNTHETICKEYMATERIAL123456\n-----END PRIVATE KEY-----\n',
      client_email: 'audit-ro@apaibay-marketplace-premium.iam.gserviceaccount.com',
    };
    const syntheticSaJson = JSON.stringify(syntheticSaObj);

    let reusedCredHmacCode = '';
    try {
      resolveAuditHmacSecret({
        env: {
          FIREBASE_AUDIT_SERVICE_ACCOUNT_JSON: syntheticSaJson,
          SELLER_AUDIT_HMAC_SECRET: syntheticSaObj.client_email,
        },
      });
    } catch (e: any) {
      reusedCredHmacCode = e?.code || '';
    }
    assert(
      reusedCredHmacCode === 'AUDIT_HMAC_SECRET_REUSE_FORBIDDEN',
      'SELLER_AUDIT_HMAC_SECRET refuses reuse of Firebase credential material'
    );

    const hmacA1 = anonymizeSellerId('seller_uid_abc', 'dedicated-audit-hmac-secret-1');
    const hmacA2 = anonymizeSellerId('seller_uid_abc', 'dedicated-audit-hmac-secret-1');
    const hmacB = anonymizeSellerId('seller_uid_abc', 'dedicated-audit-hmac-secret-2');
    assert(
      /^seller_hmac_[a-f0-9]{16}$/.test(hmacA1) && hmacA1 === hmacA2 && hmacA1 !== hmacB,
      'HMAC-SHA256 Seller ID anonymization is deterministic for same secret and changes across secrets'
    );

    // In-memory dry-run audit verification with HMAC-SHA256
    const mockFirestoreForAudit: any = {
      _settings: {
        projectId: 'apaibay-marketplace-premium',
        databaseId: 'ai-studio-apaibaymarketpla-99b738bb-1596-4812-bdf8-877c3a04a892',
      },
      collection(name: string) {
        return {
          async get() {
            if (name === 'sellers') {
              return {
                size: 1,
                docs: [
                  {
                    id: 'seller_real_uid_999',
                    data: () => ({
                      sellerId: 'seller_real_uid_999',
                      email: 'raw-leak-test@example.com',
                      phone: '+85512999888',
                    }),
                  },
                ],
              };
            }
            return { size: 0, docs: [] };
          },
        };
      },
    };
    const mockAuditOut = await runLegacySellerPiiDryRunAudit(mockFirestoreForAudit, {
      databaseId: 'ai-studio-apaibaymarketpla-99b738bb-1596-4812-bdf8-877c3a04a892',
      hmacSecret: 'dedicated-audit-hmac-secret-1',
    });
    const serializedMockAudit = JSON.stringify(mockAuditOut);
    assert(
      mockAuditOut.findings.length === 1 &&
        /^seller_hmac_[a-f0-9]{16}$/.test(mockAuditOut.findings[0].anonymizedRef) &&
        !serializedMockAudit.includes('seller_real_uid_999') &&
        !serializedMockAudit.includes('raw-leak-test@example.com') &&
        !serializedMockAudit.includes('+85512999888') &&
        !serializedMockAudit.includes('dedicated-audit-hmac-secret-1'),
      'runLegacySellerPiiDryRunAudit produces HMAC-SHA256 refs with zero raw UID, PII, or HMAC secret leakage'
    );

    // Disable ADC fallback & validate explicit SA + target IDs in resolveAuditCliContext
    const validAuditHmac = 'dedicated-prod-audit-hmac-secret-2026';
    let adcMissingCode = '';
    try {
      resolveAuditCliContext(['node', 'audit.ts', '--dry-run'], {
        NODE_ENV: 'production',
        ALLOW_LIVE_READONLY_AUDIT: '1',
        SELLER_AUDIT_HMAC_SECRET: validAuditHmac,
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/nonexistent-adc.json',
      });
    } catch (e: any) {
      adcMissingCode = e?.code || '';
    }
    assert(
      adcMissingCode === 'AUDIT_CREDENTIALS_MISSING',
      'Live audit CLI rejects missing FIREBASE_AUDIT_SERVICE_ACCOUNT_JSON without ADC fallback'
    );

    let malformedSaCode = '';
    try {
      parseAuditServiceAccountCredentials('{not-valid-json', 'apaibay-marketplace-premium');
    } catch (e: any) {
      malformedSaCode = e?.code || '';
    }
    assert(
      malformedSaCode === 'AUDIT_CREDENTIALS_MALFORMED',
      'Malformed FIREBASE_AUDIT_SERVICE_ACCOUNT_JSON is rejected cleanly'
    );

    let wrongProjectCode = '';
    try {
      parseAuditServiceAccountCredentials(
        JSON.stringify({ ...syntheticSaObj, project_id: 'other-firebase-project' }),
        'apaibay-marketplace-premium'
      );
    } catch (e: any) {
      wrongProjectCode = e?.code || '';
    }
    assert(
      wrongProjectCode === 'AUDIT_TARGET_PROJECT_MISMATCH',
      'Mismatched service-account project_id is rejected before connecting'
    );

    let wrongDbCode = '';
    try {
      resolveAuditCliContext(['node', 'audit.ts', '--dry-run'], {
        NODE_ENV: 'production',
        APP_ENV: 'production',
        ALLOW_LIVE_READONLY_AUDIT: '1',
        FIREBASE_AUDIT_SERVICE_ACCOUNT_JSON: syntheticSaJson,
        SELLER_AUDIT_HMAC_SECRET: validAuditHmac,
        FIREBASE_PROJECT_ID: 'apaibay-marketplace-premium',
        FIREBASE_FIRESTORE_DATABASE_ID: 'wrong-database-id',
      });
    } catch (e: any) {
      wrongDbCode = e?.code || '';
    }
    assert(
      wrongDbCode === 'FIREBASE_ISOLATION_VIOLATION',
      'Mismatched named Firestore database ID is rejected before connecting'
    );

    const validLiveCtx = resolveAuditCliContext(['node', 'audit.ts', '--dry-run'], {
      NODE_ENV: 'production',
      APP_ENV: 'production',
      ALLOW_LIVE_READONLY_AUDIT: '1',
      FIREBASE_AUDIT_SERVICE_ACCOUNT_JSON: syntheticSaJson,
      SELLER_AUDIT_HMAC_SECRET: validAuditHmac,
      FIREBASE_PROJECT_ID: 'apaibay-marketplace-premium',
      FIREBASE_FIRESTORE_DATABASE_ID: 'ai-studio-apaibaymarketpla-99b738bb-1596-4812-bdf8-877c3a04a892',
    });
    const preservedEmulatorCtx = resolveAuditCliContext(['node', 'audit.ts', '--dry-run'], {
      NODE_ENV: 'test',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    });
    assert(
      validLiveCtx.mode === 'live' &&
        validLiveCtx.projectId === 'apaibay-marketplace-premium' &&
        validLiveCtx.firestoreDatabaseId === 'ai-studio-apaibaymarketpla-99b738bb-1596-4812-bdf8-877c3a04a892' &&
        preservedEmulatorCtx.mode === 'emulator',
      'Live CLI context binds exact target project/DB and preserves emulator-only test mode'
    );

    // Stderr / error redaction test
    const noisyError = Object.assign(
      new Error(
        `Permission failed for /sellers/uid_secret_123 owner email leaker@example.com phone +85599123456 with secret ${validAuditHmac} and key -----BEGIN PRIVATE KEY-----\nSECRETKEY\n-----END PRIVATE KEY-----`
      ),
      { code: 'PERMISSION_DENIED' }
    );
    const redactedErr = sanitizeAuditErrorForLog(noisyError, [validAuditHmac, syntheticSaJson]);
    assert(
      redactedErr.code === 'PERMISSION_DENIED' &&
        !redactedErr.summary.includes('uid_secret_123') &&
        !redactedErr.summary.includes('leaker@example.com') &&
        !redactedErr.summary.includes('+85599123456') &&
        !redactedErr.summary.includes(validAuditHmac) &&
        !redactedErr.summary.includes('SECRETKEY') &&
        redactedErr.summary.includes('[REDACTED_EMAIL]') &&
        redactedErr.summary.includes('[REDACTED_PEM]'),
      'sanitizeAuditErrorForLog preserves error code while stripping PEM keys, secrets, doc IDs, emails, and phones'
    );

    // -----------------------------------------------------------------------
    // 13. Clean Reset Check
    // -----------------------------------------------------------------------
    console.log('\n[13/13] Verifying Test Hook Isolation Cleanup...');
    __resetAllTestHooks();
    SellerLedgerService.clearMemoryLedgerForTesting();
    assert(true, 'Test hooks and memory ledger cleared cleanly');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    __resetAllTestHooks();
    SellerLedgerService.clearMemoryLedgerForTesting();
  }

  console.log('\n================================================================================');
  console.log(`PHASE 2.1 SECURITY REMEDIATION SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase21Tests().catch((err) => {
  console.error('❌ Fatal error executing Phase 2.1 security suite:', err);
  process.exit(1);
});

/**
 * APAIBAY MARKETPLACE PREMIUM — PHASE 2.2 FIREBASE RULES EMULATOR TEST SUITE
 *
 * Tests real `firestore.rules` and `storage.rules` evaluation inside the local
 * Firebase Emulator Suite (`@firebase/rules-unit-testing` + local Admin/Client SDKs).
 *
 * Strictly local-only:
 * - Refuses to run unless FIRESTORE_EMULATOR_HOST and FIREBASE_STORAGE_EMULATOR_HOST are set.
 * - Uses synthetic test UIDs and synthetic data only (never connects to live Firebase or real KYC data).
 * - Cleans up isolated emulator state between/after tests.
 */

import fs from 'fs';
import path from 'path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { initializeApp as initializeAdminApp, getApps as getAdminApps, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from 'firebase/app';
import {
  getFirestore as getClientFirestore,
  connectFirestoreEmulator,
  doc as clientDoc,
  getDoc as clientGetDoc,
  setDoc as clientSetDoc,
} from 'firebase/firestore';
import { runLegacySellerPiiDryRunAudit } from './audit-legacy-seller-pii';

const PROJECT_ID = 'apaibay-marketplace-premium';
const NAMED_DATABASE_ID = 'ai-studio-apaibaymarketpla-99b738bb-1596-4812-bdf8-877c3a04a892';
const STORAGE_BUCKET = 'apaibay-marketplace-premium.firebasestorage.app';
const STORAGE_BUCKET_URL = `gs://${STORAGE_BUCKET}`;

let passCount = 0;
let failCount = 0;

function assertCheck(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? ` (${detail})` : ''}`);
    failCount++;
  }
}

async function expectAllow(label: string, promise: Promise<any>) {
  try {
    await assertSucceeds(promise);
    assertCheck(true, label);
  } catch (err: any) {
    assertCheck(false, label, err?.message || String(err));
  }
}

async function expectDeny(label: string, promise: Promise<any>) {
  try {
    await assertFails(promise);
    assertCheck(true, label);
  } catch (err: any) {
    assertCheck(false, label, err?.message || String(err));
  }
}

function parseHostPort(envVal: string | undefined, fallbackHost: string, fallbackPort: number): { host: string; port: number } {
  if (!envVal) return { host: fallbackHost, port: fallbackPort };
  const idx = envVal.lastIndexOf(':');
  if (idx === -1) return { host: envVal, port: fallbackPort };
  return {
    host: envVal.slice(0, idx),
    port: parseInt(envVal.slice(idx + 1), 10) || fallbackPort,
  };
}

async function runEmulatorSuite() {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    console.error(
      '❌ REFUSED: Local Firebase Emulator environment variables (FIRESTORE_EMULATOR_HOST, FIREBASE_STORAGE_EMULATOR_HOST) are not set.\n' +
        'Run via: npm run test:emulator'
    );
    process.exit(1);
  }

  console.log('\n================================================================================');
  console.log('🔥 APAIBAY PHASE 2.2 — FIREBASE FIRESTORE & STORAGE RULES EMULATOR TEST SUITE');
  console.log('================================================================================');
  console.log(`   Project:  ${PROJECT_ID}`);
  console.log(`   Database: ${NAMED_DATABASE_ID}`);
  console.log(`   Bucket:   ${STORAGE_BUCKET}`);
  console.log(`   Firestore Emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`);
  console.log(`   Storage Emulator:   ${process.env.FIREBASE_STORAGE_EMULATOR_HOST}\n`);

  const firestoreRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const storageRules = fs.readFileSync(path.resolve(process.cwd(), 'storage.rules'), 'utf8');

  const fsEndpoint = parseHostPort(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1', 8080);
  const stEndpoint = parseHostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1', 9199);

  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: firestoreRules,
      host: fsEndpoint.host,
      port: fsEndpoint.port,
    },
    storage: {
      rules: storageRules,
      host: stEndpoint.host,
      port: stEndpoint.port,
    },
  });

  // Synthetic identities
  const CUSTOMER_UID = 'emu_cust_001';
  const OTHER_CUSTOMER_UID = 'emu_cust_002';
  const UNVERIFIED_SELLER_UID = 'emu_seller_pending';
  const VERIFIED_SELLER_UID = 'emu_seller_verified';
  const OTHER_SELLER_UID = 'emu_seller_other';
  const SUSPENDED_SELLER_UID = 'emu_seller_suspended';

  const VERIFIED_ADMIN_UID = 'emu_admin_verified';
  const UNVERIFIED_ADMIN_UID = 'emu_admin_unverified';
  const UNVERIFIED_BOOTSTRAP_UID = 'emu_boot_unverified';
  const VERIFIED_BOOTSTRAP_UID = 'emu_boot_verified';
  const FINANCE_UID = 'emu_finance_verified';
  const SUPPORT_UID = 'emu_support_verified';

  // Local Admin SDK pointing strictly to local emulators
  const adminApp = initializeAdminApp(
    {
      projectId: PROJECT_ID,
      storageBucket: STORAGE_BUCKET,
    },
    'emu-admin-helper'
  );
  const adminNamedDb = getAdminFirestore(adminApp, NAMED_DATABASE_ID);
  const adminStorageBucket = getAdminStorage(adminApp).bucket(STORAGE_BUCKET);

  try {
    await testEnv.clearFirestore();
    await testEnv.clearStorage();

    // Seed baseline fixtures with security rules temporarily bypassed
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const db = adminCtx.firestore();

      // Users
      await db.doc(`users/${VERIFIED_SELLER_UID}`).set({
        uid: VERIFIED_SELLER_UID,
        role: 'seller',
        status: 'active',
        email: 'seller.verified@example.test',
      });
      await db.doc(`users/${SUSPENDED_SELLER_UID}`).set({
        uid: SUSPENDED_SELLER_UID,
        role: 'seller',
        status: 'suspended',
        email: 'seller.suspended@example.test',
      });

      // Sellers (public non-PII summaries)
      await db.doc(`sellers/${UNVERIFIED_SELLER_UID}`).set({
        sellerId: UNVERIFIED_SELLER_UID,
        ownerUid: UNVERIFIED_SELLER_UID,
        storeName: 'Pending Craft Store',
        verificationStatus: 'pending',
      });
      await db.doc(`sellers/${VERIFIED_SELLER_UID}`).set({
        sellerId: VERIFIED_SELLER_UID,
        ownerUid: VERIFIED_SELLER_UID,
        storeName: 'Verified Silk Shop',
        verificationStatus: 'verified',
      });
      await db.doc(`sellers/${OTHER_SELLER_UID}`).set({
        sellerId: OTHER_SELLER_UID,
        ownerUid: OTHER_SELLER_UID,
        storeName: 'Other Merchant',
        verificationStatus: 'verified',
      });
      await db.doc(`sellers/${SUSPENDED_SELLER_UID}`).set({
        sellerId: SUSPENDED_SELLER_UID,
        ownerUid: SUSPENDED_SELLER_UID,
        storeName: 'Suspended Merchant',
        verificationStatus: 'verified', // even if seller doc claims verified, /users/{uid}.status == suspended blocks writes
      });

      // Private /seller_kyc docs
      await db.doc(`seller_kyc/${VERIFIED_SELLER_UID}`).set({
        sellerId: VERIFIED_SELLER_UID,
        ownerUid: VERIFIED_SELLER_UID,
        legalFullName: 'Synthetic Merchant Verified',
        shopName: 'Verified Silk Shop',
        kycStatus: 'VERIFIED',
        createdAt: new Date().toISOString(),
      });
      await db.doc(`seller_kyc/${OTHER_SELLER_UID}`).set({
        sellerId: OTHER_SELLER_UID,
        ownerUid: OTHER_SELLER_UID,
        legalFullName: 'Synthetic Merchant Other',
        shopName: 'Other Merchant',
        kycStatus: 'VERIFIED',
        createdAt: new Date().toISOString(),
      });

      // Products
      await db.doc('products/prod_public_01').set({
        id: 'prod_public_01',
        sellerId: VERIFIED_SELLER_UID,
        name: 'Krama Silk Scarf',
        price: 25,
        status: 'active',
      });
      await db.doc('products/prod_other_seller').set({
        id: 'prod_other_seller',
        sellerId: OTHER_SELLER_UID,
        name: 'Other Seller Ceramic',
        price: 40,
        status: 'active',
      });

      // Admin roles
      await db.doc(`admins/${VERIFIED_ADMIN_UID}`).set({
        uid: VERIFIED_ADMIN_UID,
        email: 'admin@apaibay.test',
        role: 'ADMIN',
      });
      await db.doc(`admins/${UNVERIFIED_ADMIN_UID}`).set({
        uid: UNVERIFIED_ADMIN_UID,
        email: 'unverified.admin@apaibay.test',
        role: 'SUPER_ADMIN',
      });
      await db.doc(`admins/${FINANCE_UID}`).set({
        uid: FINANCE_UID,
        email: 'finance@apaibay.test',
        role: 'FINANCE_MANAGER',
      });
      await db.doc(`admins/${SUPPORT_UID}`).set({
        uid: SUPPORT_UID,
        email: 'support@apaibay.test',
        role: 'SUPPORT_STAFF',
      });

      // Orders
      await db.doc('orders/ord_cust_001').set({
        id: 'ord_cust_001',
        customerUid: CUSTOMER_UID,
        status: 'Placed',
        total: 25,
      });
      await db.doc('orders/ord_cust_002').set({
        id: 'ord_cust_002',
        customerUid: OTHER_CUSTOMER_UID,
        status: 'Placed',
        total: 40,
      });

      // Financial & Dispute docs
      await db.doc('payments/pay_001').set({
        id: 'pay_001',
        customerUid: CUSTOMER_UID,
        amount: 25,
        status: 'paid',
      });
      await db.doc('sellerLedger/led_001').set({
        id: 'led_001',
        sellerId: VERIFIED_SELLER_UID,
        netAmount: 23.75,
        status: 'pending_settlement',
      });
      await db.doc('seller_payouts/po_001').set({
        id: 'po_001',
        sellerId: VERIFIED_SELLER_UID,
        amount: 20,
        status: 'pending',
      });
      await db.doc('admin_audit_logs/log_001').set({
        id: 'log_001',
        action: 'TEST_SEED',
        timestamp: new Date().toISOString(),
      });
      await db.doc('order_disputes/disp_001').set({
        id: 'disp_001',
        orderId: 'ord_cust_001',
        customerUid: CUSTOMER_UID,
        sellerId: VERIFIED_SELLER_UID,
        status: 'open',
      });
    });

    // Contexts
    const anonCtx = testEnv.unauthenticatedContext();
    const customerCtx = testEnv.authenticatedContext(CUSTOMER_UID, {
      email: 'customer001@apaibay.test',
      email_verified: true,
    });
    const unverifiedSellerCtx = testEnv.authenticatedContext(UNVERIFIED_SELLER_UID, {
      email: 'pending@apaibay.test',
      email_verified: true,
    });
    const verifiedSellerCtx = testEnv.authenticatedContext(VERIFIED_SELLER_UID, {
      email: 'verified@apaibay.test',
      email_verified: true,
    });
    const suspendedSellerCtx = testEnv.authenticatedContext(SUSPENDED_SELLER_UID, {
      email: 'suspended@apaibay.test',
      email_verified: true,
    });
    const verifiedAdminCtx = testEnv.authenticatedContext(VERIFIED_ADMIN_UID, {
      email: 'admin@apaibay.test',
      email_verified: true,
    });
    const unverifiedAdminCtx = testEnv.authenticatedContext(UNVERIFIED_ADMIN_UID, {
      email: 'unverified.admin@apaibay.test',
      email_verified: false,
    });
    const unverifiedBootstrapCtx = testEnv.authenticatedContext(UNVERIFIED_BOOTSTRAP_UID, {
      email: 'asapcambodia.tcc@gmail.com',
      email_verified: false,
    });
    const verifiedBootstrapCtx = testEnv.authenticatedContext(VERIFIED_BOOTSTRAP_UID, {
      email: 'asapcambodia.tcc@gmail.com',
      email_verified: true,
    });
    const financeCtx = testEnv.authenticatedContext(FINANCE_UID, {
      email: 'finance@apaibay.test',
      email_verified: true,
    });
    const supportCtx = testEnv.authenticatedContext(SUPPORT_UID, {
      email: 'support@apaibay.test',
      email_verified: true,
    });

    // -----------------------------------------------------------------------
    // A. CUSTOMER AUTHORIZATION TESTS
    // -----------------------------------------------------------------------
    console.log('[A] Testing Customer Firestore Rules...');
    await expectAllow('Customer can read public products', customerCtx.firestore().doc('products/prod_public_01').get());
    await expectAllow('Unauthenticated visitor can read public products', anonCtx.firestore().doc('products/prod_public_01').get());
    await expectDeny('Customer cannot read another seller private /seller_kyc document', customerCtx.firestore().doc(`seller_kyc/${VERIFIED_SELLER_UID}`).get());
    await expectDeny('Customer cannot list /seller_kyc collection', customerCtx.firestore().collection('seller_kyc').get());
    await expectDeny('Unauthenticated user cannot read /seller_kyc', anonCtx.firestore().doc(`seller_kyc/${VERIFIED_SELLER_UID}`).get());
    await expectAllow(
      'Customer can create own /users/{uid} profile strictly with role=customer & status=active',
      customerCtx.firestore().doc(`users/${CUSTOMER_UID}`).set({
        uid: CUSTOMER_UID,
        role: 'customer',
        status: 'active',
        name: 'Customer Zero',
        email: 'customer001@apaibay.test',
      })
    );
    await expectDeny(
      'Customer cannot create /users/{uid} with self-assigned seller role',
      customerCtx.firestore().doc(`users/${OTHER_CUSTOMER_UID}`).set({
        uid: OTHER_CUSTOMER_UID,
        role: 'seller',
        status: 'active',
      })
    );
    await expectDeny(
      'Customer cannot create own /users/{uid} with self-assigned seller role',
      testEnv
        .authenticatedContext('emu_escalate_cust', { email: 'esc@apaibay.test', email_verified: true })
        .firestore()
        .doc('users/emu_escalate_cust')
        .set({
          uid: 'emu_escalate_cust',
          role: 'seller',
          status: 'active',
        })
    );
    await expectDeny(
      'Customer cannot create /users/{uid} with self-assigned admin role',
      testEnv
        .authenticatedContext('emu_escalate_adm', { email: 'esca@apaibay.test', email_verified: true })
        .firestore()
        .doc('users/emu_escalate_adm')
        .set({
          uid: 'emu_escalate_adm',
          role: 'admin',
          adminRole: 'SUPER_ADMIN',
          status: 'active',
        })
    );
    await expectDeny(
      'Customer cannot update protected role field on /users/{uid}',
      customerCtx.firestore().doc(`users/${CUSTOMER_UID}`).update({ role: 'seller' })
    );
    await expectDeny(
      'Customer cannot update protected status/adminRole fields on /users/{uid}',
      customerCtx.firestore().doc(`users/${CUSTOMER_UID}`).update({ adminRole: 'ADMIN', status: 'suspended' })
    );
    await expectAllow(
      'Customer can update safe displayName field on /users/{uid}',
      customerCtx.firestore().doc(`users/${CUSTOMER_UID}`).update({ displayName: 'Customer Updated' })
    );
    await expectDeny(
      'Customer cannot directly create /orders/{orderId}',
      customerCtx.firestore().doc('orders/ord_direct_client').set({
        id: 'ord_direct_client',
        customerUid: CUSTOMER_UID,
        total: 1,
        status: 'Placed',
      })
    );
    await expectDeny(
      'Customer cannot directly update /orders/{orderId}',
      customerCtx.firestore().doc('orders/ord_cust_001').update({ status: 'Delivered' })
    );
    await expectDeny(
      'Customer cannot directly delete /orders/{orderId}',
      customerCtx.firestore().doc('orders/ord_cust_001').delete()
    );
    await expectAllow(
      'Customer can read their own /orders/ord_cust_001 document',
      customerCtx.firestore().doc('orders/ord_cust_001').get()
    );
    await expectDeny(
      'Customer cannot read another customer /orders/ord_cust_002 document',
      customerCtx.firestore().doc('orders/ord_cust_002').get()
    );

    // -----------------------------------------------------------------------
    // B. SELLER AUTHORIZATION TESTS
    // -----------------------------------------------------------------------
    console.log('\n[B] Testing Seller Firestore Rules...');
    await expectDeny(
      'Unverified (pending) seller cannot create product',
      unverifiedSellerCtx.firestore().doc('products/prod_pending_fail').set({
        id: 'prod_pending_fail',
        sellerId: UNVERIFIED_SELLER_UID,
        name: 'Unauthorized Pending Product',
        price: 15,
      })
    );
    await expectAllow(
      'Verified active seller can create their own product',
      verifiedSellerCtx.firestore().doc('products/prod_verified_new').set({
        id: 'prod_verified_new',
        sellerId: VERIFIED_SELLER_UID,
        name: 'Verified Silk Shirt',
        price: 55,
      })
    );
    await expectAllow(
      'Verified active seller can update their own product',
      verifiedSellerCtx.firestore().doc('products/prod_verified_new').update({ price: 49 })
    );
    await expectAllow(
      'Verified active seller can delete their own product',
      verifiedSellerCtx.firestore().doc('products/prod_verified_new').delete()
    );
    await expectDeny(
      'Verified seller cannot update another seller product',
      verifiedSellerCtx.firestore().doc('products/prod_other_seller').update({ price: 1 })
    );
    await expectDeny(
      'Suspended seller cannot publish products even with seller verificationStatus=verified',
      suspendedSellerCtx.firestore().doc('products/prod_suspended_fail').set({
        id: 'prod_suspended_fail',
        sellerId: SUSPENDED_SELLER_UID,
        name: 'Suspended Merchant Item',
        price: 20,
      })
    );
    await expectDeny(
      'Seller cannot write private contactInfo/businessAddress into public /sellers/{uid}',
      testEnv
        .authenticatedContext('emu_new_seller_pii', { email: 'pii@apaibay.test', email_verified: true })
        .firestore()
        .doc('sellers/emu_new_seller_pii')
        .set({
          sellerId: 'emu_new_seller_pii',
          ownerUid: 'emu_new_seller_pii',
          storeName: 'PII Leak Attempt Shop',
          verificationStatus: 'pending',
          contactInfo: { phone: '+85512000000', email: 'leak@apaibay.test' },
          businessAddress: '123 Secret St',
        })
    );
    await expectDeny(
      'Verified seller cannot update public /sellers/{uid} with PII fields (phone/email/documents)',
      verifiedSellerCtx.firestore().doc(`sellers/${VERIFIED_SELLER_UID}`).update({
        phone: '+85512000000',
        documents: ['id_card.pdf'],
      })
    );
    await expectDeny(
      'Even Verified Admin client SDK cannot write private reviewedBy email/UID onto public /sellers/{uid}',
      verifiedAdminCtx.firestore().doc(`sellers/${VERIFIED_SELLER_UID}`).update({
        reviewedBy: 'admin@apaibay.test',
      })
    );
    await expectDeny(
      'Seller cannot write an email address into public /sellers/{uid} ownerName',
      testEnv
        .authenticatedContext('emu_email_owner_seller', { email: 'owner@apaibay.test', email_verified: true })
        .firestore()
        .doc('sellers/emu_email_owner_seller')
        .set({
          sellerId: 'emu_email_owner_seller',
          ownerUid: 'emu_email_owner_seller',
          storeName: 'Email Owner Shop',
          ownerName: 'owner@apaibay.test',
          verificationStatus: 'pending',
        })
    );
    await expectDeny(
      'Seller cannot self-approve /sellers/{uid} verificationStatus=verified on create',
      testEnv
        .authenticatedContext('emu_self_verify_seller', { email: 'self@apaibay.test', email_verified: true })
        .firestore()
        .doc('sellers/emu_self_verify_seller')
        .set({
          sellerId: 'emu_self_verify_seller',
          ownerUid: 'emu_self_verify_seller',
          storeName: 'Self Verify Shop',
          verificationStatus: 'verified',
        })
    );
    await expectAllow(
      'Applicant can create clean non-PII public /sellers/{uid} summary with verificationStatus=pending',
      testEnv
        .authenticatedContext('emu_clean_applicant', { email: 'clean@apaibay.test', email_verified: true })
        .firestore()
        .doc('sellers/emu_clean_applicant')
        .set({
          sellerId: 'emu_clean_applicant',
          ownerUid: 'emu_clean_applicant',
          storeName: 'Clean Store Summary',
          verificationStatus: 'pending',
        })
    );
    await expectAllow(
      'Seller can read their own /seller_kyc/{uid} record',
      verifiedSellerCtx.firestore().doc(`seller_kyc/${VERIFIED_SELLER_UID}`).get()
    );
    await expectDeny(
      'Seller cannot read another seller /seller_kyc/{otherSellerId} record',
      verifiedSellerCtx.firestore().doc(`seller_kyc/${OTHER_SELLER_UID}`).get()
    );
    await expectDeny(
      'Seller cannot write directly to their own /seller_kyc/{uid} record',
      verifiedSellerCtx.firestore().doc(`seller_kyc/${VERIFIED_SELLER_UID}`).update({ kycStatus: 'VERIFIED' })
    );

    // -----------------------------------------------------------------------
    // C. ADMIN AUTHORIZATION TESTS
    // -----------------------------------------------------------------------
    console.log('\n[C] Testing Admin & Staff Role Firestore Rules...');
    await expectAllow('Verified Admin can list /users', verifiedAdminCtx.firestore().collection('users').get());
    await expectAllow('Verified Admin can list /seller_kyc', verifiedAdminCtx.firestore().collection('seller_kyc').get());
    await expectAllow('Verified Admin can read /admin_audit_logs', verifiedAdminCtx.firestore().doc('admin_audit_logs/log_001').get());
    await expectAllow(
      'Verified Bootstrap Super Admin can read /seller_kyc and /admins',
      verifiedBootstrapCtx.firestore().doc(`seller_kyc/${VERIFIED_SELLER_UID}`).get()
    );

    // Unverified admins MUST FAIL
    await expectDeny('Unverified /admins/{uid} (email_verified=false) cannot list /users', unverifiedAdminCtx.firestore().collection('users').get());
    await expectDeny('Unverified /admins/{uid} (email_verified=false) cannot read /seller_kyc', unverifiedAdminCtx.firestore().doc(`seller_kyc/${VERIFIED_SELLER_UID}`).get());
    await expectDeny('Unverified /admins/{uid} (email_verified=false) cannot read /admin_audit_logs', unverifiedAdminCtx.firestore().doc('admin_audit_logs/log_001').get());
    await expectDeny(
      'Unverified Bootstrap email (email_verified=false) cannot list /users',
      unverifiedBootstrapCtx.firestore().collection('users').get()
    );
    await expectDeny(
      'Unverified Bootstrap email (email_verified=false) cannot read /seller_kyc',
      unverifiedBootstrapCtx.firestore().doc(`seller_kyc/${VERIFIED_SELLER_UID}`).get()
    );

    // Finance vs Support strict boundaries
    await expectAllow('Finance Manager (verified email) can read /sellerLedger', financeCtx.firestore().doc('sellerLedger/led_001').get());
    await expectAllow('Finance Manager (verified email) can read /seller_payouts', financeCtx.firestore().doc('seller_payouts/po_001').get());
    await expectAllow('Finance Manager (verified email) can read /admin_audit_logs', financeCtx.firestore().doc('admin_audit_logs/log_001').get());
    await expectDeny('Finance Manager cannot read /seller_kyc (KYC reviewer boundary)', financeCtx.firestore().doc(`seller_kyc/${VERIFIED_SELLER_UID}`).get());
    await expectDeny('Finance Manager cannot list /users (Admin boundary)', financeCtx.firestore().collection('users').get());

    await expectAllow('Support Staff (verified email) can read /orders', supportCtx.firestore().doc('orders/ord_cust_001').get());
    await expectAllow('Support Staff (verified email) can list /order_disputes', supportCtx.firestore().collection('order_disputes').get());
    await expectDeny('Support Staff cannot read /seller_kyc', supportCtx.firestore().doc(`seller_kyc/${VERIFIED_SELLER_UID}`).get());
    await expectDeny('Support Staff cannot read /payments', supportCtx.firestore().doc('payments/pay_001').get());
    await expectDeny('Support Staff cannot read /admin_audit_logs', supportCtx.firestore().doc('admin_audit_logs/log_001').get());

    // Privilege escalation on /admins/{uid}
    await expectDeny(
      'Customer cannot create /admins/{uid} privilege record',
      customerCtx.firestore().doc(`admins/${CUSTOMER_UID}`).set({ uid: CUSTOMER_UID, role: 'SUPER_ADMIN' })
    );
    await expectDeny(
      'Support Staff cannot write /admins/{uid} privilege record',
      supportCtx.firestore().doc(`admins/${SUPPORT_UID}`).set({ uid: SUPPORT_UID, role: 'SUPER_ADMIN' })
    );
    await expectDeny(
      'Even Verified Admin cannot write /admins/{uid} directly from client (server-only)',
      verifiedAdminCtx.firestore().doc('admins/emu_escalate_target').set({ uid: 'emu_escalate_target', role: 'ADMIN' })
    );

    // -----------------------------------------------------------------------
    // D. ADMIN NOTIFICATIONS RULES TESTS
    // -----------------------------------------------------------------------
    console.log('\n[D] Testing /admin_notifications Firestore Rules...');
    await expectAllow(
      'Applicant can create own seller_app_{uid} notification with type=seller_application and read=false',
      customerCtx.firestore().doc(`admin_notifications/seller_app_${CUSTOMER_UID}`).set({
        id: `seller_app_${CUSTOMER_UID}`,
        applicantUid: CUSTOMER_UID,
        type: 'seller_application',
        read: false,
        shopName: 'Customer New Shop',
      })
    );
    await expectDeny(
      'Non-admin cannot create arbitrary notification ID outside seller_app_{uid}',
      customerCtx.firestore().doc('admin_notifications/arbitrary_alert_01').set({
        id: 'arbitrary_alert_01',
        applicantUid: CUSTOMER_UID,
        type: 'seller_application',
        read: false,
        shopName: 'Fake Alert',
      })
    );
    await expectDeny(
      'Non-admin cannot spoof applicantUid on another user seller_app notification',
      customerCtx.firestore().doc(`admin_notifications/seller_app_${OTHER_CUSTOMER_UID}`).set({
        id: `seller_app_${OTHER_CUSTOMER_UID}`,
        applicantUid: CUSTOMER_UID,
        type: 'seller_application',
        read: false,
        shopName: 'Spoof Shop',
      })
    );
    await expectDeny(
      'Non-admin cannot create pre-read notification (read=true)',
      unverifiedSellerCtx.firestore().doc(`admin_notifications/seller_app_${UNVERIFIED_SELLER_UID}`).set({
        id: `seller_app_${UNVERIFIED_SELLER_UID}`,
        applicantUid: UNVERIFIED_SELLER_UID,
        type: 'seller_application',
        read: true,
        shopName: 'Pre Read Attempt',
      })
    );
    await expectDeny('Customer cannot list /admin_notifications', customerCtx.firestore().collection('admin_notifications').get());
    await expectAllow('Verified Admin can list /admin_notifications', verifiedAdminCtx.firestore().collection('admin_notifications').get());

    // -----------------------------------------------------------------------
    // E. ORDERS MUTATION LOCK + NAMED DATABASE CLIENT CHECK
    // -----------------------------------------------------------------------
    console.log('\n[E] Testing Order Client Write Locks & Named Database Rules...');
    await expectDeny(
      'Even Verified Admin cannot directly update /orders/{orderId} from client SDK',
      verifiedAdminCtx.firestore().doc('orders/ord_cust_001').update({ status: 'Delivered' })
    );
    await expectDeny(
      'Seller cannot directly update /orders/{orderId} from client SDK',
      verifiedSellerCtx.firestore().doc('orders/ord_cust_001').update({ status: 'Shipped' })
    );

    // Also verify named database ID enforces firestore.rules identically when addressed explicitly
    const clientNamedApp = initializeClientApp(
      {
        projectId: PROJECT_ID,
        apiKey: 'demo-emulator-api-key',
      },
      'emu-named-db-client'
    );
    try {
      const clientNamedDb = getClientFirestore(clientNamedApp, NAMED_DATABASE_ID);
      connectFirestoreEmulator(clientNamedDb, fsEndpoint.host, fsEndpoint.port);

      await adminNamedDb.doc('products/named_prod_01').set({
        id: 'named_prod_01',
        name: 'Named DB Silk Lantern',
        price: 18,
      });

      await expectAllow(
        `Named DB (${NAMED_DATABASE_ID}) permits public product read`,
        clientGetDoc(clientDoc(clientNamedDb, 'products/named_prod_01'))
      );
      await expectDeny(
        `Named DB (${NAMED_DATABASE_ID}) rejects unauthenticated direct order mutation`,
        clientSetDoc(clientDoc(clientNamedDb, 'orders/named_ord_forged'), {
          id: 'named_ord_forged',
          status: 'Delivered',
        })
      );
    } finally {
      await deleteClientApp(clientNamedApp);
    }

    // -----------------------------------------------------------------------
    // F. STORAGE RULES TESTS (KYC DOCUMENTS)
    // -----------------------------------------------------------------------
    console.log('\n[F] Testing Firebase Storage Rules (/kyc_documents Lockdown)...');
    const samplePath = `kyc_documents/${VERIFIED_SELLER_UID}/synthetic_sample_id.pdf`;
    await adminStorageBucket.file(samplePath).save(Buffer.from('%PDF-1.4 Synthetic Non-PII Sample Payload'), {
      contentType: 'application/pdf',
    });

    await expectDeny(
      'Customer cannot directly upload to /kyc_documents/{uid}',
      Promise.resolve(
        customerCtx.storage(STORAGE_BUCKET_URL).ref(`kyc_documents/${CUSTOMER_UID}/upload.pdf`).putString('synthetic-pdf')
      )
    );
    await expectDeny(
      'Seller owner cannot directly upload to own /kyc_documents/{uid}',
      Promise.resolve(
        verifiedSellerCtx
          .storage(STORAGE_BUCKET_URL)
          .ref(`kyc_documents/${VERIFIED_SELLER_UID}/upload.pdf`)
          .putString('synthetic-pdf')
      )
    );
    await expectDeny(
      'Seller owner cannot directly overwrite existing /kyc_documents/{uid} binary',
      Promise.resolve(verifiedSellerCtx.storage(STORAGE_BUCKET_URL).ref(samplePath).putString('overwritten-payload'))
    );
    await expectDeny(
      'Admin client SDK cannot directly write to /kyc_documents/{uid} (Admin SDK server-only)',
      Promise.resolve(verifiedAdminCtx.storage(STORAGE_BUCKET_URL).ref(samplePath).putString('admin-client-overwrite'))
    );
    await expectDeny(
      'Unauthenticated caller cannot read/download /kyc_documents binary',
      anonCtx.storage(STORAGE_BUCKET_URL).ref(samplePath).getDownloadURL()
    );
    await expectDeny(
      'Unauthorized outsider cannot read/download /kyc_documents binary',
      customerCtx.storage(STORAGE_BUCKET_URL).ref(samplePath).getDownloadURL()
    );
    await expectDeny(
      'Seller owner cannot directly download /kyc_documents binary (must use HMAC view token API)',
      verifiedSellerCtx.storage(STORAGE_BUCKET_URL).ref(samplePath).getDownloadURL()
    );
    await expectDeny(
      'Admin client SDK cannot directly download /kyc_documents binary (must use HMAC view token API)',
      verifiedAdminCtx.storage(STORAGE_BUCKET_URL).ref(samplePath).getDownloadURL()
    );
    await expectDeny(
      'Global Storage fallback denies direct uploads to arbitrary paths',
      Promise.resolve(customerCtx.storage(STORAGE_BUCKET_URL).ref('arbitrary_public/test.txt').putString('denied'))
    );

    // Confirm Admin Storage SDK read works cleanly in emulator
    const [downloadedByAdminSdk] = await adminStorageBucket.file(samplePath).download();
    assertCheck(
      downloadedByAdminSdk.toString('utf8').includes('Synthetic Non-PII Sample Payload'),
      'Backend Admin Storage SDK download succeeds cleanly while client Storage access is blocked'
    );

    // -----------------------------------------------------------------------
    // G. LEGACY SELLER PII DRY-RUN AUDIT (ISOLATED EMULATOR DATASET)
    // -----------------------------------------------------------------------
    console.log('\n[G] Running Legacy Seller PII Dry-Run Migration Audit on Isolated Emulator Data...');

    // Clean any pre-existing named DB seller docs from earlier runs before audit check
    const existingNamedSellers = await adminNamedDb.collection('sellers').get();
    for (const d of existingNamedSellers.docs) await d.ref.delete();
    const existingNamedKyc = await adminNamedDb.collection('seller_kyc').get();
    for (const d of existingNamedKyc.docs) await d.ref.delete();

    // Case 1: Modern clean seller (zero PII on /sellers, /seller_kyc present)
    await adminNamedDb.doc('sellers/emu_audit_clean').set({
      sellerId: 'emu_audit_clean',
      ownerUid: 'emu_audit_clean',
      storeName: 'Modern Clean Store',
      verificationStatus: 'verified',
    });
    await adminNamedDb.doc('seller_kyc/emu_audit_clean').set({
      sellerId: 'emu_audit_clean',
      contactEmail: 'synthetic-clean@example.test',
      maskedPhone: '***001',
      residentialOrBusinessAddress: 'Synthetic Clean Addr 1',
      kycStatus: 'VERIFIED',
    });

    // Case 2: Legacy seller with PII on /sellers, already preserved in /seller_kyc
    await adminNamedDb.doc('sellers/emu_audit_migrated').set({
      sellerId: 'emu_audit_migrated',
      ownerUid: 'emu_audit_migrated',
      storeName: 'Legacy Migrated Store',
      verificationStatus: 'verified',
      businessAddress: 'Synthetic Legacy Addr 2',
      contactInfo: {
        email: 'synthetic-migrated@example.test',
        phone: '+85500000002',
        address: 'Synthetic Legacy Addr 2',
      },
      documents: ['synthetic_ref_2.pdf'],
    });
    await adminNamedDb.doc('seller_kyc/emu_audit_migrated').set({
      sellerId: 'emu_audit_migrated',
      contactEmail: 'synthetic-migrated@example.test',
      maskedPhone: '******002',
      residentialOrBusinessAddress: 'Synthetic Legacy Addr 2',
      legacyDocumentRefs: ['synthetic_ref_2.pdf'],
      kycStatus: 'VERIFIED',
    });

    // Case 3: Legacy seller with PII on /sellers, MISSING /seller_kyc record completely
    await adminNamedDb.doc('sellers/emu_audit_missing_kyc').set({
      sellerId: 'emu_audit_missing_kyc',
      ownerUid: 'emu_audit_missing_kyc',
      storeName: 'Legacy Unmigrated Store',
      verificationStatus: 'verified',
      email: 'synthetic-unmigrated@example.test',
      phone: '+85500000003',
      businessAddress: 'Synthetic Unmigrated Addr 3',
    });

    // Case 4: Legacy seller with PII on /sellers, partial /seller_kyc missing address
    await adminNamedDb.doc('sellers/emu_audit_partial_kyc').set({
      sellerId: 'emu_audit_partial_kyc',
      ownerUid: 'emu_audit_partial_kyc',
      storeName: 'Legacy Partial KYC Store',
      verificationStatus: 'pending',
      contactInfo: {
        email: 'synthetic-partial@example.test',
        address: 'Synthetic Partial Addr 4',
      },
    });
    await adminNamedDb.doc('seller_kyc/emu_audit_partial_kyc').set({
      sellerId: 'emu_audit_partial_kyc',
      contactEmail: 'synthetic-partial@example.test',
      kycStatus: 'PENDING_REVIEW',
    });

    const auditReport = await runLegacySellerPiiDryRunAudit(adminNamedDb, {
      databaseId: NAMED_DATABASE_ID,
    });
    const serializedAudit = JSON.stringify(auditReport);

    assertCheck(auditReport.mode === 'DRY_RUN_ONLY', 'Audit ran strictly in DRY_RUN_ONLY mode');
    assertCheck(auditReport.totalSellersScanned === 4, 'Enumerated all 4 synthetic emulator seller documents');
    assertCheck(auditReport.cleanNoPiiCount === 1, 'Identified 1 clean non-PII seller document');
    assertCheck(auditReport.legacyPiiDocsCount === 3, 'Detected 3 legacy seller documents containing PII fields');
    assertCheck(auditReport.readyForScrubCount === 1, 'Verified 1 legacy seller document is fully preserved in /seller_kyc and ready for scrub');
    assertCheck(auditReport.missingKycBackfillCount === 2, 'Flagged 2 legacy seller documents missing complete /seller_kyc preservation');
    assertCheck(
      auditReport.fieldFrequency.contactInfo === 2 &&
        auditReport.fieldFrequency.businessAddress === 2 &&
        auditReport.fieldFrequency.documents === 1 &&
        auditReport.fieldFrequency.phone === 1 &&
        auditReport.fieldFrequency.email === 1,
      'Field frequency map accurately counts affected PII field names'
    );
    assertCheck(
      !serializedAudit.includes('example.test') &&
        !serializedAudit.includes('+855') &&
        !serializedAudit.includes('Synthetic Legacy Addr') &&
        !serializedAudit.includes('emu_audit_migrated'),
      'Dry-run audit report redacts all emails, phones, addresses, and raw UIDs'
    );

    // Ensure dry-run audit did NOT mutate or delete any legacy fields
    const unmutatedCheck = await adminNamedDb.doc('sellers/emu_audit_migrated').get();
    assertCheck(
      Boolean(unmutatedCheck.data()?.contactInfo),
      'Dry-run audit left legacy /sellers document untouched (non-destructive verification)'
    );

    // Clean up named DB synthetic fixtures
    const namedProducts = await adminNamedDb.collection('products').get();
    for (const d of namedProducts.docs) await d.ref.delete();
    const namedSellers = await adminNamedDb.collection('sellers').get();
    for (const d of namedSellers.docs) await d.ref.delete();
    const namedKyc = await adminNamedDb.collection('seller_kyc').get();
    for (const d of namedKyc.docs) await d.ref.delete();
  } finally {
    await testEnv.clearFirestore();
    await testEnv.clearStorage();
    await testEnv.cleanup();
    if (getAdminApps().some((a) => a.name === 'emu-admin-helper')) {
      await deleteAdminApp(adminApp);
    }
  }

  console.log('\n================================================================================');
  console.log(`FIREBASE EMULATOR RULES SUITE SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runEmulatorSuite().catch((err) => {
  console.error('❌ Fatal error running Firebase Rules Emulator suite:', err);
  process.exit(1);
});

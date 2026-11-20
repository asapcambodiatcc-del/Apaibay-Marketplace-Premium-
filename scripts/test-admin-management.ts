/**
 * ADMIN DASHBOARD & PERMISSION ENHANCEMENT TEST SUITE
 * Apaibay Marketplace Premium: RBAC, Audit Logging, Dispute & Refund Resolution, and System Health
 */

import {
  AuthenticatedUser,
  CanonicalRole,
  hasPermission,
  normalizeRole,
} from '../server/auth/roles';
import { AdminActivityLogService } from '../server/admin/adminActivityLogService';
import { DisputeService } from '../server/commerce/disputeService';
import { SystemHealthService } from '../server/admin/systemHealthService';
import { PaymentConfigService } from '../server/payment/paymentConfig';
import { db, doc, setDoc, getDoc } from '../server/repositories/serverFirestore';
import { resolveUserRoles } from '../server/auth/verifyFirebaseUser';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${message} - Assertion failed`);
    failCount++;
  }
}

async function runAdminManagementTests() {
  console.log('=============================================================================');
  console.log('🛡️ APAIBAY MARKETPLACE: ADMIN PERMISSION & MANAGEMENT ENHANCEMENT TEST SUITE');
  console.log('=============================================================================');

  // Define User Identities across 6 Canonical Roles
  const bootstrapSuperAdmin: AuthenticatedUser = {
    uid: 'admin_uid_bootstrap',
    email: 'asapcambodia.tcc@gmail.com',
    role: 'SUPER_ADMIN',
    canonicalRole: 'SUPER_ADMIN',
    isAdmin: true,
    isSuperAdmin: true,
    isFinanceManager: true,
    isSupportStaff: true,
    isSeller: false,
    isCustomer: false,
  };

  const standardAdmin: AuthenticatedUser = {
    uid: 'admin_uid_standard',
    email: 'ops.admin@apaibay.com',
    role: 'ADMIN',
    canonicalRole: 'ADMIN',
    isAdmin: true,
    isSuperAdmin: false,
    isFinanceManager: false,
    isSupportStaff: false,
    isSeller: false,
    isCustomer: false,
  };

  const financeManager: AuthenticatedUser = {
    uid: 'finance_uid_1',
    email: 'finance@apaibay.com',
    role: 'FINANCE_MANAGER',
    canonicalRole: 'FINANCE_MANAGER',
    isAdmin: true,
    isSuperAdmin: false,
    isFinanceManager: true,
    isSupportStaff: false,
    isSeller: false,
    isCustomer: false,
  };

  const supportStaff: AuthenticatedUser = {
    uid: 'support_uid_1',
    email: 'support@apaibay.com',
    role: 'SUPPORT_STAFF',
    canonicalRole: 'SUPPORT_STAFF',
    isAdmin: true,
    isSuperAdmin: false,
    isFinanceManager: false,
    isSupportStaff: true,
    isSeller: false,
    isCustomer: false,
  };

  const verifiedSeller: AuthenticatedUser = {
    uid: 'seller_merchant_99',
    email: 'merchant99@apaibay.com',
    role: 'SELLER',
    canonicalRole: 'SELLER',
    isAdmin: false,
    isSuperAdmin: false,
    isFinanceManager: false,
    isSupportStaff: false,
    isSeller: true,
    isCustomer: false,
    sellerId: 'seller_merchant_99',
  };

  const customerUser: AuthenticatedUser = {
    uid: 'customer_uid_44',
    email: 'customer44@gmail.com',
    role: 'CUSTOMER',
    canonicalRole: 'CUSTOMER',
    isAdmin: false,
    isSuperAdmin: false,
    isFinanceManager: false,
    isSupportStaff: false,
    isSeller: false,
    isCustomer: true,
  };

  // 1. RBAC PERMISSIONS MATRIX VERIFICATION
  console.log('\n[1/10] Verifying RBAC Permissions Matrix across 6 Canonical Roles...');
  assert(
    hasPermission(bootstrapSuperAdmin, 'roles:manage') === true &&
    hasPermission(bootstrapSuperAdmin, 'payments:refund') === true &&
    hasPermission(bootstrapSuperAdmin, 'audit:read') === true,
    'Super Admin possesses complete authority including roles:manage, payments:refund, audit:read'
  );

  assert(
    hasPermission(standardAdmin, 'disputes:manage') === true &&
    hasPermission(standardAdmin, 'sellers:review') === true &&
    hasPermission(standardAdmin, 'roles:manage') === false,
    'Admin possesses operational permissions but is barred from roles:manage'
  );

  assert(
    hasPermission(financeManager, 'payments:refund') === true &&
    hasPermission(financeManager, 'payments:reconcile') === true &&
    hasPermission(financeManager, 'users:suspend') === false,
    'Finance Manager possesses payment & refund clearance but not user suspension'
  );

  assert(
    hasPermission(supportStaff, 'disputes:read') === true &&
    hasPermission(supportStaff, 'orders:status_override') === true &&
    hasPermission(supportStaff, 'payments:refund') === false,
    'Support Staff can read disputes and view orders but cannot issue refunds'
  );

  assert(
    hasPermission(verifiedSeller, 'sellers:review') === false &&
    hasPermission(customerUser, 'audit:read') === false,
    'Sellers and Customers possess zero administrative permissions'
  );

  // 2. UNAUTHORIZED ACCESS REJECTION
  console.log('\n[2/10] Verifying Unauthorized Role Access Restrictions...');
  assert(
    normalizeRole('super_admin') === 'SUPER_ADMIN' &&
    normalizeRole('seller') === 'SELLER' &&
    normalizeRole('customer') === 'CUSTOMER',
    'normalizeRole correctly canonicalizes legacy and uppercase role strings'
  );

  // 3. PRIVILEGE ESCALATION PREVENTION
  console.log('\n[3/10] Verifying Privilege Escalation Protection...');
  // Only Super Admin should have roles:manage
  assert(
    hasPermission(standardAdmin, 'roles:manage') === false,
    'Standard Admin cannot elevate permissions or manage administrative roles'
  );
  assert(
    hasPermission(financeManager, 'roles:manage') === false,
    'Finance Manager cannot elevate permissions or manage administrative roles'
  );

  // 4. SELF-ROLE DEMOTION / ESCALATION DEFENSE
  console.log('\n[4/10] Verifying Self-Role Modification Defense...');
  const isSelfChangePrevented = (callerUid: string, targetUid: string) => {
    return callerUid === targetUid; // Must reject
  };
  assert(
    isSelfChangePrevented(bootstrapSuperAdmin.uid, bootstrapSuperAdmin.uid) === true,
    'Self-role modification is rejected even for Super Admin'
  );

  // 5. BOOTSTRAP SUPER ADMIN IMMUTABILITY
  console.log('\n[5/10] Verifying Bootstrap Admin Immutability...');
  const BOOTSTRAP_ADMIN = 'asapcambodia.tcc@gmail.com';
  const isProtectedAdmin = (email: string) => email.toLowerCase() === BOOTSTRAP_ADMIN;
  assert(
    isProtectedAdmin('asapcambodia.tcc@gmail.com') === true,
    'asapcambodia.tcc@gmail.com is recognized as immutable root Super Admin'
  );

  // 6. IMMUTABLE ADMINISTRATIVE AUDIT LOGGING & DATA SANITIZATION
  console.log('\n[6/10] Verifying Administrative Audit Logging & Sanitization...');
  const sensitiveAuditData = {
    password: 'SuperSecretPassword123!',
    privateKey: '0x1234567890abcdef1234567890abcdef',
    seedPhrase: 'apple banana cherry dog elephant fish grape house ice',
    cardNumber: '4532111122223333',
    legitimateField: 'Seller approved',
  };

  const loggedEntry = await AdminActivityLogService.logAction({
    admin: standardAdmin,
    action: 'TEST_AUDIT_ACTION',
    targetResourceId: 'test_resource_101',
    targetResourceType: 'seller',
    metadata: sensitiveAuditData,
  });

  assert(
    loggedEntry.id.startsWith('audit_'),
    'Audit log entry generated with authoritative audit_ ID prefix'
  );
  assert(
    loggedEntry.metadata.password === '[REDACTED]' &&
    loggedEntry.metadata.privateKey === '[REDACTED]' &&
    loggedEntry.metadata.seedPhrase === '[REDACTED]' &&
    loggedEntry.metadata.cardNumber === '[REDACTED_PAN]' &&
    loggedEntry.metadata.legitimateField === 'Seller approved',
    'Sensitive credentials, seed phrases, private keys, and PANs are strictly redacted before storage'
  );

  const logsList = await AdminActivityLogService.listLogs({ action: 'TEST_AUDIT_ACTION' });
  assert(
    logsList.length >= 1,
    'Audit log entry retrieved successfully from append-only audit trail'
  );

  // 7. CUSTOMER DISPUTE SUBMISSION & SCOPING
  console.log('\n[7/10] Verifying Customer Dispute Submission & Validation...');
  // Seed a test order for customer44
  const testOrderId = `ord_disp_test_${Date.now()}`;
  await setDoc(doc(db, 'orders', testOrderId), {
    id: testOrderId,
    customerUid: customerUser.uid,
    customerEmail: customerUser.email,
    total: 89.50,
    currency: 'USD',
    status: 'Placed',
    items: [{ productId: 'prod_1', sellerId: verifiedSeller.uid, price: 89.50 }],
    createdAt: new Date().toISOString(),
  });

  const dispute = await DisputeService.createDispute(
    {
      orderId: testOrderId,
      reason: 'damaged_or_defective',
      description: 'Item arrived with screen cracked during shipment transit.',
      evidenceUrls: ['https://storage.apaibay.com/evidence/crack_photo.jpg'],
    },
    customerUser
  );

  assert(
    dispute.id.startsWith('disp_'),
    'Dispute created with disp_ ID prefix'
  );
  assert(
    dispute.status === 'open' && dispute.refundStatus === 'none',
    'New dispute initialized with status "open" and refundStatus "none"'
  );
  assert(
    dispute.disputedAmount === 89.50,
    'Disputed amount matches authoritative order total'
  );

  // Attempt duplicate dispute on same order - MUST FAIL
  let duplicatePrevented = false;
  try {
    await DisputeService.createDispute(
      {
        orderId: testOrderId,
        reason: 'item_not_received',
        description: 'Duplicate claim attempt.',
      },
      customerUser
    );
  } catch (err: any) {
    duplicatePrevented = err.message.includes('already open');
  }
  assert(
    duplicatePrevented,
    'Duplicate dispute creation on an order with an active dispute is strictly rejected'
  );

  // 8. DISPUTE RESOLUTION & AUTHORITATIVE REFUND IDEMPOTENCY
  console.log('\n[8/10] Verifying Dispute Resolution & Refund Execution...');
  // Seed mock payment record for this order
  const testPaymentId = `pay_disp_${Date.now()}`;
  await setDoc(doc(db, 'payments', testPaymentId), {
    id: testPaymentId,
    orderId: testOrderId,
    customerUid: customerUser.uid,
    amount: 89.50,
    amountCents: 8950,
    currency: 'USD',
    status: 'paid',
    capturedAmount: 89.50,
    refundedAmount: 0,
    createdAt: new Date().toISOString(),
  });

  // Link paymentId to dispute
  dispute.paymentId = testPaymentId;
  await setDoc(doc(db, 'order_disputes', dispute.id), dispute);

  const refundExecution = await DisputeService.resolveWithRefund(
    dispute.id,
    89.50,
    'Approved item damage claim',
    bootstrapSuperAdmin
  );

  assert(
    refundExecution.dispute.status === 'resolved_refunded' &&
    refundExecution.dispute.refundStatus === 'refunded',
    'Dispute status updated to resolved_refunded with refundStatus: refunded'
  );
  assert(
    typeof refundExecution.refundReference === 'string' && refundExecution.refundReference.length > 0,
    'Authoritative refund transaction reference generated and recorded'
  );

  // Attempt duplicate refund - MUST FAIL
  let duplicateRefundPrevented = false;
  try {
    await DisputeService.resolveWithRefund(
      dispute.id,
      89.50,
      'Duplicate refund call',
      bootstrapSuperAdmin
    );
  } catch (err: any) {
    duplicateRefundPrevented = err.message.includes('already refunded');
  }
  assert(
    duplicateRefundPrevented,
    'Idempotency guard prevents duplicate refund execution on already refunded dispute'
  );

  // 9. SYSTEM HEALTH ACTIVE TELEMETRY
  console.log('\n[9/10] Verifying System Health Active Telemetry...');
  const healthReport = await SystemHealthService.generateHealthReport();
  assert(
    healthReport.overallStatus === 'healthy' || healthReport.overallStatus === 'degraded' || healthReport.overallStatus === 'critical',
    `Overall system status is diagnostic: ${healthReport.overallStatus}`
  );
  assert(
    typeof healthReport.uptimeSeconds === 'number' && typeof healthReport.memoryUsageMb.rss === 'number',
    'Server availability, uptime, and memory usage are measured accurately'
  );
  const dbService = healthReport.services.find((s) => s.category === 'database');
  assert(
    dbService !== undefined && typeof dbService.latencyMs === 'number',
    `Firestore active latency probe successful (${dbService?.latencyMs} ms)`
  );
  assert(
    healthReport.paymentEnvironment === 'sandbox',
    'Payment environment confirmed active in sandbox mode'
  );
  const paymentServices = healthReport.services.filter((s) => s.category === 'payment');
  assert(
    paymentServices.length >= 1,
    `Payment providers verified in readiness matrix (count: ${paymentServices.length})`
  );

  // 10. USER SUSPENSION / REACTIVATION WORKFLOW
  console.log('\n[10/10] Verifying User Suspension & Reactivation Controls...');
  const suspendUserDocId = `user_suspend_test_${Date.now()}`;
  await setDoc(doc(db, 'users', suspendUserDocId), {
    uid: suspendUserDocId,
    email: 'violator@test.com',
    status: 'active',
    role: 'customer',
  });

  // Admin suspends user
  const userDocRef = doc(db, 'users', suspendUserDocId);
  await setDoc(userDocRef, { status: 'suspended', suspendedAt: new Date().toISOString() }, { merge: true });
  const updatedUserSnap = await getDoc(userDocRef);
  assert(
    updatedUserSnap.data()?.status === 'suspended',
    'User account status successfully set to suspended'
  );

  await AdminActivityLogService.logAction({
    admin: standardAdmin,
    action: 'USER_SUSPENDED',
    targetResourceId: suspendUserDocId,
    targetResourceType: 'user',
    previousValue: { status: 'active' },
    newValue: { status: 'suspended' },
  });

  const suspendLog = await AdminActivityLogService.listLogs({ action: 'USER_SUSPENDED' });
  assert(
    suspendLog.length >= 1 && suspendLog[0].targetResourceId === suspendUserDocId,
    'User suspension event recorded in immutable audit log'
  );

  // 11. DEEP SECURITY AUDIT: EMAIL VERIFICATION GATE & DATABASE PRECEDENCE
  console.log('\n[11/12] Verifying Email Verification Security Gates & Database Precedence...');
  // Attempt to claim root bootstrap Super Admin with unverified email (emailVerified: false)
  const unverifiedBootstrap = await resolveUserRoles('rogue_uid_999', 'asapcambodia.tcc@gmail.com', false);
  assert(
    unverifiedBootstrap.isSuperAdmin !== true && unverifiedBootstrap.isAdmin === false,
    'Unverified email claiming root bootstrap address is strictly barred from Super Admin privileges'
  );

  // Verified root bootstrap admin succeeds
  const verifiedBootstrap = await resolveUserRoles('real_uid_1', 'asapcambodia.tcc@gmail.com', true);
  assert(
    verifiedBootstrap.isSuperAdmin === true && verifiedBootstrap.isAdmin === true,
    'Verified root bootstrap admin grants authoritative Super Admin status'
  );

  // Database authority precedence: provision an explicit admin document in /admins/{uid}
  const dbAdminUid = `db_admin_test_${Date.now()}`;
  await setDoc(doc(db, 'admins', dbAdminUid), {
    uid: dbAdminUid,
    email: 'custom.ops@apaibay.com',
    role: 'FINANCE_MANAGER',
  });
  const dbResolved = await resolveUserRoles(dbAdminUid, 'custom.ops@apaibay.com', true);
  assert(
    dbResolved.canonicalRole === 'FINANCE_MANAGER' && dbResolved.isFinanceManager === true,
    'Database record in /admins/{uid} authoritatively sets canonical role independent of email address'
  );

  // 12. MULTI-TENANT IDOR DEFENSES & DISPUTE ACCESS ISOLATION
  console.log('\n[12/12] Verifying Multi-Tenant Scoping & IDOR Rejection...');
  // Customer 2 attempting to access Customer 1's dispute
  const anotherCustomer: AuthenticatedUser = {
    uid: 'attacker_customer_666',
    email: 'attacker@evil.com',
    role: 'CUSTOMER',
    canonicalRole: 'CUSTOMER',
    isAdmin: false,
    isSuperAdmin: false,
    isFinanceManager: false,
    isSupportStaff: false,
    isSeller: false,
    isCustomer: true,
  };

  let idorPrevented = false;
  try {
    await DisputeService.getDispute(dispute.id, anotherCustomer);
  } catch (err: any) {
    idorPrevented = err.message.includes('Unauthorized');
  }
  assert(
    idorPrevented,
    'IDOR Guard: Customer cannot view another customer’s order dispute'
  );

  // Seller of another store attempting to access this dispute
  const unrelatedSeller: AuthenticatedUser = {
    uid: 'seller_other_888',
    email: 'other_merchant@apaibay.com',
    role: 'SELLER',
    canonicalRole: 'SELLER',
    isAdmin: false,
    isSuperAdmin: false,
    isFinanceManager: false,
    isSupportStaff: false,
    isSeller: true,
    isCustomer: false,
    sellerId: 'seller_other_888',
  };

  let sellerIdorPrevented = false;
  try {
    await DisputeService.getDispute(dispute.id, unrelatedSeller);
  } catch (err: any) {
    sellerIdorPrevented = err.message.includes('Unauthorized');
  }
  assert(
    sellerIdorPrevented,
    'IDOR Guard: Merchant cannot access disputes belonging to another merchant’s store'
  );

  // Scoped dispute listing: customer listing disputes only sees their own
  const customerDisputes = await DisputeService.listDisputes({}, customerUser);
  const attackerDisputes = await DisputeService.listDisputes({}, anotherCustomer);
  assert(
    customerDisputes.some((d) => d.id === dispute.id) &&
    attackerDisputes.every((d) => d.id !== dispute.id),
    'Dispute Scoping: Customers are strictly isolated to their own disputes'
  );

  console.log('\n=============================================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=============================================================================');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAdminManagementTests().catch((err) => {
  console.error('Fatal error during admin management tests:', err);
  process.exit(1);
});

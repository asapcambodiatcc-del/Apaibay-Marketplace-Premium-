/**
 * SELLER SETTLEMENT & PAYOUT SYSTEM — COMPREHENSIVE VERIFICATION SUITE
 * Covers all 13 end-to-end financial, security, hold-period, concurrency, and custody scenarios.
 */

import { CommissionService } from '../server/commerce/commissionService';
import {
  SellerLedgerService,
  MINIMUM_PAYOUT_AMOUNT,
  DEFAULT_SETTLEMENT_HOLD_DAYS,
  PROVIDER_LIMITATION_NOTICE,
  maskAccountNumber,
} from '../server/commerce/sellerLedgerService';
import { DisputeService } from '../server/commerce/disputeService';
import { AdminActivityLogService } from '../server/admin/adminActivityLogService';
import { PaymentConfigService } from '../server/payment/paymentConfig';
import { AuthenticatedUser, hasPermission } from '../server/auth/roles';
import { db, doc, setDoc, clearServerFirestoreTestStore } from '../server/repositories/serverFirestore';

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

async function runTests() {
  console.log('=============================================================================');
  console.log('💸 APAIBAY MARKETPLACE — SELLER SETTLEMENT & PAYOUT SYSTEM E2E TESTS');
  console.log('=============================================================================');

  // Clean state
  SellerLedgerService.clearMemoryLedgerForTesting();
  clearServerFirestoreTestStore();

  // Actors
  const customerUser: AuthenticatedUser = {
    uid: 'cust_payout_001',
    email: 'buyer001@apaibay.com',
    emailVerified: true,
    role: 'CUSTOMER',
    canonicalRole: 'CUSTOMER',
    isAdmin: false,
    isSeller: false,
    isCustomer: true,
  };

  const sellerA: AuthenticatedUser = {
    uid: 'seller_uid_alpha',
    email: 'alpha.shop@apaibay.com',
    emailVerified: true,
    role: 'SELLER',
    canonicalRole: 'SELLER',
    isAdmin: false,
    isSeller: true,
    sellerId: 'seller_uid_alpha',
  };

  const sellerB: AuthenticatedUser = {
    uid: 'seller_uid_beta',
    email: 'beta.shop@apaibay.com',
    emailVerified: true,
    role: 'SELLER',
    canonicalRole: 'SELLER',
    isAdmin: false,
    isSeller: true,
    sellerId: 'seller_uid_beta',
  };

  const supportStaff: AuthenticatedUser = {
    uid: 'staff_support_01',
    email: 'support@apaibay.com',
    emailVerified: true,
    role: 'admin', // Matches verifyFirebaseUser output where role is 'admin' while canonicalRole is 'SUPPORT_STAFF'
    canonicalRole: 'SUPPORT_STAFF',
    isAdmin: true,
    isSupportStaff: true,
    isSeller: false,
  };

  const financeManager: AuthenticatedUser = {
    uid: 'finance_mgr_01',
    email: 'finance@apaibay.com',
    emailVerified: true,
    role: 'FINANCE_MANAGER',
    canonicalRole: 'FINANCE_MANAGER',
    isAdmin: true,
    isFinanceManager: true,
    isSeller: false,
  };

  const superAdmin: AuthenticatedUser = {
    uid: 'super_admin_01',
    email: 'asapcambodia.tcc@gmail.com',
    emailVerified: true,
    role: 'SUPER_ADMIN',
    canonicalRole: 'SUPER_ADMIN',
    isAdmin: true,
    isSuperAdmin: true,
    isSeller: false,
  };

  const unverifiedBootstrap: AuthenticatedUser = {
    uid: 'unverified_boot_01',
    email: 'asapcambodia.tcc@gmail.com',
    emailVerified: false,
    role: 'CUSTOMER',
    canonicalRole: 'CUSTOMER',
    isAdmin: false,
    isSeller: false,
  };

  // Seed verified seller records in test Firestore
  await setDoc(doc(db, 'sellers', sellerA.uid), {
    sellerId: sellerA.uid,
    ownerUid: sellerA.uid,
    storeName: 'Alpha Tech Store',
    verificationStatus: 'verified',
  });
  await setDoc(doc(db, 'sellers', sellerB.uid), {
    sellerId: sellerB.uid,
    ownerUid: sellerB.uid,
    storeName: 'Beta Gadget Store',
    verificationStatus: 'verified',
  });

  // -------------------------------------------------------------------------
  // TEST 1: Commission Calculation (Default 5%, Admin Override, Discounts, Shipping Excl.)
  // -------------------------------------------------------------------------
  console.log('\n[1/13] Testing Commission Calculation & Admin Rate Configuration...');
  assert(
    (await SellerLedgerService.getEffectiveCommissionRate(sellerA.uid)) === 0.05,
    'Default marketplace commission rate is 5% (0.05)'
  );

  // Admin updates custom seller commission rate to 8% (audit logged)
  await SellerLedgerService.updateCommissionRate(0.08, financeManager, sellerB.uid);
  assert(
    (await SellerLedgerService.getEffectiveCommissionRate(sellerB.uid)) === 0.08,
    'Finance Manager can set custom seller commission rate (8%)'
  );
  assert(
    (await SellerLedgerService.getEffectiveCommissionRate(sellerA.uid)) === 0.05,
    'Custom seller B commission rate does not alter Seller A rate'
  );
  await assertThrows(
    () => SellerLedgerService.updateCommissionRate(0.10, supportStaff),
    'FORBIDDEN_COMMISSION_CONFIG',
    'Support staff cannot modify commission rate'
  );
  await assertThrows(
    () => SellerLedgerService.updateCommissionRate(0.75, financeManager),
    'between 0 and 0.50',
    'Out-of-bounds commission rate (>50%) rejected'
  );

  // Shipping excluded + discount pro-rata + server-authoritative calculation
  const calc = CommissionService.calculateOrderCommissions(
    [
      {
        productId: 'p_comm_1',
        name: 'Wireless Mic',
        sellerId: sellerA.uid,
        unitPrice: 120,
        quantity: 1,
        subtotal: 120,
      },
    ],
    20, // $20 discount -> eligible subtotal = $100 -> 5% commission = $5, net = $95
    0.05
  );
  assert(calc.totalEligibleSubtotal === 100.00, 'Discount reduces commissionable base to $100.00');
  assert(calc.totalPlatformCommission === 5.00, 'Platform commission is $5.00 (5% of $100)');
  assert(calc.totalSellerNet === 95.00, 'Seller net is $95.00');

  // Reset Seller B back to 5% for clean subsequent math
  await SellerLedgerService.updateCommissionRate(0.05, superAdmin, sellerB.uid);

  // -------------------------------------------------------------------------
  // TEST 2: Payment Confirmation -> PENDING_SETTLEMENT (Not Available Until Delivery + Window)
  // -------------------------------------------------------------------------
  console.log('\n[2/13] Testing Payment Confirmation -> PENDING_SETTLEMENT...');
  const ord1 = {
    id: 'ORD-PAYOUT-001',
    customerUid: customerUser.uid,
    customerEmail: customerUser.email,
    total: 215.00, // $200 items + $15 shipping
    currency: 'USD',
    paymentStatus: 'pending',
    status: 'Pending',
    items: [
      {
        productId: 'prod_alpha_1',
        name: 'Studio Monitor Pair',
        sellerId: sellerA.uid,
        unitPrice: 200.00,
        quantity: 1,
        subtotal: 200.00,
      },
    ],
    discount: 0,
    shippingFee: 15.00,
  };
  await setDoc(doc(db, 'orders', ord1.id), ord1);

  const entriesCalculated = await SellerLedgerService.recordOrderCommissions(ord1, false);
  assert(entriesCalculated.length === 1, 'Order creates 1 ledger entry');
  assert(entriesCalculated[0].status === 'calculated', 'Unpaid order starts in "calculated" status');
  assert(entriesCalculated[0].commissionAmount === 10.00, 'Shipping fee ($15) excluded; 5% commission on $200 = $10');
  assert(entriesCalculated[0].netAmount === 190.00, 'Net amount = $190.00');

  // Cannot release unpaid order settlement
  await assertThrows(
    () => SellerLedgerService.releaseOrderSettlement(ord1.id, financeManager),
    'SETTLEMENT_BLOCKED_UNPAID',
    'Unconfirmed payment cannot be settled/released'
  );

  // Trusted payment confirmation moves entry to pending_settlement
  await setDoc(doc(db, 'orders', ord1.id), { ...ord1, paymentStatus: 'paid', status: 'Processing' });
  const confirmedEntries = await SellerLedgerService.confirmPaymentSettlement(ord1.id);
  assert(confirmedEntries[0].status === 'pending_settlement', 'Confirmed payment moves ledger entry to "pending_settlement"');

  let ledgerA = await SellerLedgerService.getSellerLedger(sellerA.uid, sellerA);
  assert(ledgerA.summary.pendingSettlement === 190.00, 'Pending settlement shows $190.00');
  assert(ledgerA.summary.availableForPayout === 0.00, 'Available for payout remains $0.00 before delivery');

  // -------------------------------------------------------------------------
  // TEST 3: Delivery Confirmation & Dispute/Return Period (7 Days) Enforcement
  // -------------------------------------------------------------------------
  console.log('\n[3/13] Testing Delivery Confirmation & 7-Day Dispute/Return Window...');
  assert(DEFAULT_SETTLEMENT_HOLD_DAYS === 7, 'Default settlement hold window is 7 days');

  // Cannot release before delivery is confirmed
  await assertThrows(
    () => SellerLedgerService.releaseOrderSettlement(ord1.id, financeManager),
    'SETTLEMENT_BLOCKED_UNDELIVERED',
    'Cannot release settlement before delivery is confirmed'
  );

  const nowMs = Date.now();
  const day0 = new Date(nowMs - 3 * 86400000); // 3 days ago (delivered)
  const day3 = new Date(nowMs);                // Today: only 3 days elapsed (< 7-day hold)
  const day8 = new Date(nowMs + 5 * 86400000); // +5 days from today: 8 days after delivery (> 7-day hold)

  const deliveredEntries = await SellerLedgerService.confirmDeliverySettlement(ord1.id, { now: day0 });
  assert(Boolean(deliveredEntries[0].deliveredAt), 'Delivery timestamp recorded on ledger entry');
  assert(
    deliveredEntries[0].settlementEligibleAt === new Date(day0.getTime() + 7 * 86400000).toISOString(),
    'settlementEligibleAt set strictly to deliveredAt + 7 days'
  );
  assert(deliveredEntries[0].status === 'pending_settlement', 'Immediately at delivery (day 0), funds stay pending_settlement');

  // Day 3 check: still blocked!
  ledgerA = await SellerLedgerService.getSellerLedger(sellerA.uid, sellerA, { now: day3 });
  assert(ledgerA.summary.availableForPayout === 0.00, 'At Day 3, availableForPayout is still $0.00');
  assert(ledgerA.summary.pendingSettlement === 190.00, 'At Day 3, $190.00 remains in pendingSettlement');

  await assertThrows(
    () => SellerLedgerService.releaseOrderSettlement(ord1.id, financeManager, { now: day3 }),
    'SETTLEMENT_HOLD_PERIOD_ACTIVE',
    'Admin cannot force release before 7-day hold window expires (Day 3 blocked)'
  );

  // -------------------------------------------------------------------------
  // TEST 4: Active Dispute Hold Prevents Release & Withdrawal
  // -------------------------------------------------------------------------
  console.log('\n[4/13] Testing Active Dispute Hold...');
  const dispute1 = await DisputeService.createDispute(
    {
      orderId: ord1.id,
      reason: 'item_not_received',
      description: 'Customer claims accessory missing from box.',
    },
    customerUser
  );

  ledgerA = await SellerLedgerService.getSellerLedger(sellerA.uid, sellerA, { now: day8 });
  assert(ledgerA.summary.onHold === 190.00, 'Active dispute moves $190.00 into onHold');
  assert(ledgerA.summary.availableForPayout === 0.00, 'Even after Day 8, disputed funds remain $0.00 available');

  await assertThrows(
    () => SellerLedgerService.releaseOrderSettlement(ord1.id, financeManager, { now: day8 }),
    'SETTLEMENT_BLOCKED_DISPUTE_HOLD',
    'Cannot release settlement while dispute hold is active'
  );

  // -------------------------------------------------------------------------
  // TEST 5: Dispute Rejection Respects Hold Window & Refund/Cancellation Adjustments
  // -------------------------------------------------------------------------
  console.log('\n[5/13] Testing Dispute Release & Partial/Full Refund Adjustments...');
  // Reject dispute at day 3 -> must return to pending_settlement, NOT available!
  await DisputeService.updateDisputeStatus(dispute1.id, 'resolved_rejected', 'Courier proof confirmed delivery.', financeManager);
  ledgerA = await SellerLedgerService.getSellerLedger(sellerA.uid, sellerA, { now: day3 });
  assert(ledgerA.summary.onHold === 0.00, 'Dispute rejection clears onHold');
  assert(ledgerA.summary.pendingSettlement === 190.00, 'Rejected dispute before Day 7 returns funds to pendingSettlement');
  assert(ledgerA.summary.availableForPayout === 0.00, 'Funds remain unavailable before Day 7 even after dispute rejection');

  // Test partial and full refund on a second order for Seller A
  const ordPartial = {
    id: 'ORD-PARTIAL-REFUND-002',
    customerUid: customerUser.uid,
    total: 100.00,
    currency: 'USD',
    paymentStatus: 'paid',
    status: 'Processing',
    items: [
      {
        productId: 'prod_alpha_2',
        name: 'USB-C DAC',
        sellerId: sellerA.uid,
        unitPrice: 100.00,
        quantity: 1,
        subtotal: 100.00,
      },
    ],
  };
  await setDoc(doc(db, 'orders', ordPartial.id), ordPartial);
  await SellerLedgerService.recordOrderCommissions(ordPartial, true); // $95 net
  await SellerLedgerService.confirmDeliverySettlement(ordPartial.id, { now: day0 });

  // Partial refund of 40%
  await SellerLedgerService.recordOrderAdjustment(ordPartial.id, 'refund_adjustment', 'Partial defect rebate', 0.4);
  ledgerA = await SellerLedgerService.getSellerLedger(sellerA.uid, sellerA, { now: day8 });
  // ord1 = $190 available, ordPartial = $95 - 40% ($38) = $57 available => total $247.00
  assert(ledgerA.summary.availableForPayout === 247.00, 'Partial refund deducts exact 40% ($38) leaving $57 + $190 = $247.00 available');

  // Remaining full refund of ordPartial (100% total)
  await SellerLedgerService.recordOrderAdjustment(ordPartial.id, 'refund_adjustment', 'Returned item in full', 1.0);
  // Idempotent retry
  await SellerLedgerService.recordOrderAdjustment(ordPartial.id, 'refund_adjustment', 'Duplicate webhook', 1.0);
  ledgerA = await SellerLedgerService.getSellerLedger(sellerA.uid, sellerA, { now: day8 });
  assert(ledgerA.summary.availableForPayout === 190.00, 'Full refund cancels remaining ordPartial earnings without duplicate deduction ($190.00 available)');

  // -------------------------------------------------------------------------
  // TEST 6: Settlement Release After Delivery Confirmation + 7-Day Window
  // -------------------------------------------------------------------------
  console.log('\n[6/13] Testing Automated & Admin Settlement Release After Hold Window...');
  const releasedEntries = await SellerLedgerService.releaseOrderSettlement(ord1.id, financeManager, { now: day8 });
  assert(releasedEntries[0].status === 'available', 'Order settlement transitions to "available" after delivery + 7 days');
  assert(ledgerA.summary.availableForPayout === 190.00, 'Seller A has $190.00 available for payout');
  assert(ledgerA.summary.pendingSettlement === 0.00, 'Seller A pendingSettlement drops to $0.00');

  // -------------------------------------------------------------------------
  // TEST 7: Seller Ownership & IDOR Protection + Bank Account Masking
  // -------------------------------------------------------------------------
  console.log('\n[7/13] Testing Multi-Tenant IDOR Protection & Destination Masking...');
  await assertThrows(
    () => SellerLedgerService.getSellerLedger(sellerA.uid, sellerB),
    'FORBIDDEN_LEDGER_ACCESS',
    'Seller B is blocked from reading Seller A ledger'
  );
  await assertThrows(
    () =>
      SellerLedgerService.createPayoutRequest(
        sellerA.uid,
        50,
        {
          method: 'aba_bank',
          accountName: 'Attacker Name',
          accountNumber: '000999888',
          verifiedConfirmed: true,
        },
        sellerB
      ),
    'FORBIDDEN_PAYOUT_REQUEST',
    'Seller B is blocked from requesting payout from Seller A balance'
  );
  await assertThrows(
    () => SellerLedgerService.listPayoutRequests({ sellerId: sellerA.uid }, sellerB),
    'FORBIDDEN_PAYOUT_ACCESS',
    'Seller B is blocked from listing Seller A payouts'
  );

  assert(maskAccountNumber('00123456789', 'aba_bank') === '*******6789', 'Bank account number masked safely');
  assert(maskAccountNumber('T9xYzAbCdEfGhIjKlMnOpQrStUvWxYz12', 'crypto_usdt') === 'T9xYzA...Yz12', 'Crypto wallet masked safely');

  // -------------------------------------------------------------------------
  // TEST 8: Payout Validation, Partial Withdrawal & Duplicate Request Prevention
  // -------------------------------------------------------------------------
  console.log('\n[8/13] Testing Payout Validation, Minimum Threshold & Duplicate Blocking...');
  await assertThrows(
    () =>
      SellerLedgerService.createPayoutRequest(
        sellerA.uid,
        10.00,
        { method: 'aba_bank', accountName: 'Alpha Tech', accountNumber: '001234567', verifiedConfirmed: true },
        sellerA
      ),
    'Minimum withdrawal amount is $20.00',
    `Payout below minimum ($${MINIMUM_PAYOUT_AMOUNT}) is rejected`
  );

  await assertThrows(
    () =>
      SellerLedgerService.createPayoutRequest(
        sellerA.uid,
        50.00,
        { method: 'aba_bank', accountName: 'Alpha Tech', accountNumber: '001234567', verifiedConfirmed: true },
        sellerA,
        { currency: 'KHR' }
      ),
    'UNSUPPORTED_PAYOUT_CURRENCY',
    'Unsupported payout currency rejected'
  );

  await assertThrows(
    () =>
      SellerLedgerService.createPayoutRequest(
        sellerA.uid,
        500.00,
        { method: 'aba_bank', accountName: 'Alpha Tech', accountNumber: '001234567', verifiedConfirmed: true },
        sellerA
      ),
    'INSUFFICIENT_AVAILABLE_BALANCE',
    'Payout exceeding available balance rejected'
  );

  // Valid partial withdrawal of $100.00 out of $190.00
  const payout1 = await SellerLedgerService.createPayoutRequest(
    sellerA.uid,
    100.00,
    {
      method: 'aba_bank',
      accountName: 'Alpha Tech Co., Ltd.',
      accountNumber: '00123456789',
      bankName: 'ABA Bank',
      verifiedConfirmed: true,
    },
    sellerA,
    { now: day8 }
  );
  assert(payout1.status === 'pending', 'New payout request defaults strictly to "pending"');
  assert(payout1.amount === 100.00, 'Payout request records exact $100.00');
  assert(payout1.destination.accountNumber === '*******6789', 'Raw bank account digits never stored on payout record');

  ledgerA = await SellerLedgerService.getSellerLedger(sellerA.uid, sellerA, { now: day8 });
  assert(ledgerA.summary.availableForPayout === 90.00, 'Partial $100 withdrawal leaves $90.00 available');
  assert(ledgerA.summary.reservedForPayout === 100.00, '$100.00 moved to reservedForPayout');

  // Duplicate second request while first is active
  await assertThrows(
    () =>
      SellerLedgerService.createPayoutRequest(
        sellerA.uid,
        50.00,
        { method: 'aba_bank', accountName: 'Alpha Tech', accountNumber: '00123456789', verifiedConfirmed: true },
        sellerA,
        { now: day8 }
      ),
    'CONCURRENT_PAYOUT_REQUEST_BLOCKED',
    'Duplicate active payout request for same seller is blocked'
  );

  // Seller B blocked from viewing Seller A payout record
  await assertThrows(
    () => SellerLedgerService.getPayoutRequest(payout1.id, sellerB),
    'FORBIDDEN_PAYOUT_ACCESS',
    'Seller B blocked from reading Seller A single payout request'
  );

  // -------------------------------------------------------------------------
  // TEST 9: Concurrent Withdrawal Race Condition Protection
  // -------------------------------------------------------------------------
  console.log('\n[9/13] Testing Concurrent Withdrawal Race Prevention...');
  const ordB = {
    id: 'ORD-CONCURRENT-B',
    total: 100.00,
    currency: 'USD',
    paymentStatus: 'paid',
    status: 'Delivered',
    items: [
      { productId: 'prod_beta_1', name: 'Mechanical Keyboard', sellerId: sellerB.uid, unitPrice: 100, quantity: 1, subtotal: 100 },
    ],
  };
  await setDoc(doc(db, 'orders', ordB.id), ordB);
  await SellerLedgerService.recordOrderCommissions(ordB, true);
  await SellerLedgerService.confirmDeliverySettlement(ordB.id, { now: day0 });

  const raceResults = await Promise.allSettled([
    SellerLedgerService.createPayoutRequest(
      sellerB.uid,
      95.00,
      { method: 'wing_bank', accountName: 'Beta Shop', accountNumber: '099887766', verifiedConfirmed: true },
      sellerB,
      { now: day8 }
    ),
    SellerLedgerService.createPayoutRequest(
      sellerB.uid,
      95.00,
      { method: 'wing_bank', accountName: 'Beta Shop', accountNumber: '099887766', verifiedConfirmed: true },
      sellerB,
      { now: day8 }
    ),
  ]);
  const fulfilled = raceResults.filter((r) => r.status === 'fulfilled');
  const rejected = raceResults.filter((r) => r.status === 'rejected');
  assert(fulfilled.length === 1 && rejected.length === 1, 'Concurrent withdrawal race allows strictly 1 request and blocks duplicate');

  // -------------------------------------------------------------------------
  // TEST 10: Unauthorized Payout Review & Mandatory Rejection Reason + Balance Restore
  // -------------------------------------------------------------------------
  console.log('\n[10/13] Testing Role Checks, Unverified Admin Block & Rejection Restoration...');
  assert(!hasPermission(unverifiedBootstrap, 'manage_payouts'), 'Unverified email does NOT receive bootstrap super-admin payout permission');
  assert(!hasPermission(supportStaff, 'manage_payouts'), 'SUPPORT_STAFF does NOT have manage_payouts permission');
  assert(!hasPermission(supportStaff, 'view_financials'), 'SUPPORT_STAFF does NOT have view_financials permission');
  assert(hasPermission(financeManager, 'manage_payouts'), 'FINANCE_MANAGER holds manage_payouts permission');

  await assertThrows(
    () => SellerLedgerService.getSellerLedger(sellerA.uid, supportStaff),
    'FORBIDDEN_LEDGER_ACCESS',
    'Support staff cannot read seller financial ledger'
  );
  await assertThrows(
    () => SellerLedgerService.listPayoutRequests({ sellerId: sellerA.uid }, supportStaff),
    'FORBIDDEN_PAYOUT_ACCESS',
    'Support staff cannot list seller payout requests'
  );
  await assertThrows(
    () => SellerLedgerService.getPayoutRequest(payout1.id, supportStaff),
    'FORBIDDEN_PAYOUT_ACCESS',
    'Support staff cannot inspect single seller payout request'
  );
  await assertThrows(
    () => SellerLedgerService.reviewPayoutRequest(payout1.id, 'approve', undefined, sellerA),
    'FORBIDDEN_PAYOUT_ACTION',
    'Seller cannot approve their own payout request'
  );
  await assertThrows(
    () => SellerLedgerService.reviewPayoutRequest(payout1.id, 'approve', undefined, supportStaff),
    'FORBIDDEN_PAYOUT_ACTION',
    'Support staff cannot approve payout requests'
  );
  await assertThrows(
    () => SellerLedgerService.reviewPayoutRequest(payout1.id, 'approve', undefined, unverifiedBootstrap),
    'FORBIDDEN_PAYOUT_ACTION',
    'Unverified bootstrap email cannot approve payout requests'
  );

  // Reject without reason fails
  await assertThrows(
    () => SellerLedgerService.reviewPayoutRequest(payout1.id, 'reject', 'no', financeManager),
    'mandatory rejection reason',
    'Rejecting payout without >=5 char reason is blocked'
  );

  // Reject payout1 with valid reason restores full $190.00 available
  const rejectedPayout = await SellerLedgerService.reviewPayoutRequest(
    payout1.id,
    'reject',
    'Bank branch name needs verification.',
    financeManager
  );
  assert(rejectedPayout.status === 'rejected', 'Payout transitions to rejected');
  ledgerA = await SellerLedgerService.getSellerLedger(sellerA.uid, sellerA, { now: day8 });
  assert(ledgerA.summary.availableForPayout === 190.00, 'Rejected payout cleanly restores $100 back to availableForPayout ($190.00)');
  assert(ledgerA.summary.reservedForPayout === 0.00, 'reservedForPayout drops to $0.00 after rejection');

  // -------------------------------------------------------------------------
  // TEST 11: Two-Step Governance & Failed Provider Execution Restoration
  // -------------------------------------------------------------------------
  console.log('\n[11/13] Testing Two-Step Approval + Failed Provider Execution Handling...');
  const payout2 = await SellerLedgerService.createPayoutRequest(
    sellerA.uid,
    120.00,
    {
      method: 'bakong_khqr',
      accountName: 'Alpha Tech Co., Ltd.',
      accountNumber: 'alpha@aba',
      verifiedConfirmed: true,
    },
    sellerA,
    { now: day8 }
  );

  // Step 1: Approve -> must be 'approved' (NOT 'completed')
  const approvedPayout2 = await SellerLedgerService.reviewPayoutRequest(
    payout2.id,
    'approve',
    'Approved for ABA Bakong batch #402',
    financeManager
  );
  assert(approvedPayout2.status === 'approved', 'Step 1 approval sets status to "approved" (queued, not falsely completed)');

  // Cannot skip directly from pending to provider confirm
  const betaPayoutId = (fulfilled[0] as PromiseFulfilledResult<any>).value.id;
  await assertThrows(
    () => SellerLedgerService.confirmPayoutProviderResult(betaPayoutId, { success: true, providerReference: 'TX-999' }, financeManager),
    'INVALID_PAYOUT_CONFIRMATION_STATE',
    'Cannot confirm provider execution on an unapproved (pending) payout'
  );

  // Step 2a: Provider failure restores balance
  const failedPayout2 = await SellerLedgerService.confirmPayoutProviderResult(
    payout2.id,
    { success: false, failureReason: 'Receiving Bakong wallet limit exceeded' },
    financeManager
  );
  assert(failedPayout2.status === 'failed', 'Failed provider execution marks payout "failed"');
  ledgerA = await SellerLedgerService.getSellerLedger(sellerA.uid, sellerA, { now: day8 });
  assert(ledgerA.summary.availableForPayout === 190.00, 'Failed payout cleanly restores $120 back to $190.00 available');
  assert(ledgerA.summary.totalPaidOut === 0.00, 'Failed payout adds $0.00 to totalPaidOut');

  // -------------------------------------------------------------------------
  // TEST 12: Authoritative Provider Completion + Audit Trail + Post-Payout Refund Safety
  // -------------------------------------------------------------------------
  console.log('\n[12/13] Testing Authoritative Provider Completion, Audit Trail & Clawback Safety...');
  const payout3 = await SellerLedgerService.createPayoutRequest(
    sellerA.uid,
    120.00,
    {
      method: 'aba_bank',
      accountName: 'Alpha Tech Co., Ltd.',
      accountNumber: '00123456789',
      bankName: 'ABA Bank',
      verifiedConfirmed: true,
    },
    sellerA,
    { now: day8 }
  );

  await SellerLedgerService.reviewPayoutRequest(payout3.id, 'approve', 'Batch #403', financeManager);

  // Completing without provider reference must fail
  await assertThrows(
    () => SellerLedgerService.confirmPayoutProviderResult(payout3.id, { success: true, providerReference: '' }, financeManager),
    'authoritative payment-provider or batch transfer reference',
    'Completing payout without provider reference is strictly rejected'
  );

  // Unauthorized user cannot confirm provider result
  await assertThrows(
    () => SellerLedgerService.confirmPayoutProviderResult(payout3.id, { success: true, providerReference: 'ABA-BATCH-8812' }, supportStaff),
    'FORBIDDEN_PAYOUT_ACTION',
    'Support staff cannot record provider completion'
  );

  const completedPayout3 = await SellerLedgerService.confirmPayoutProviderResult(
    payout3.id,
    { success: true, providerReference: 'ABA-BATCH-8812' },
    superAdmin
  );
  assert(completedPayout3.status === 'completed', 'Provider confirmation transitions payout to "completed"');
  assert(completedPayout3.disbursementReference === 'ABA-BATCH-8812', 'Provider reference permanently recorded');

  // Cannot re-modify terminal completed payout
  await assertThrows(
    () => SellerLedgerService.reviewPayoutRequest(payout3.id, 'reject', 'Late change', superAdmin),
    'Cannot modify a terminal payout request',
    'Completed payout cannot be re-modified or reversed via review'
  );

  ledgerA = await SellerLedgerService.getSellerLedger(sellerA.uid, sellerA, { now: day8 });
  assert(ledgerA.summary.availableForPayout === 70.00, 'After $120 completed payout, $70.00 remains available');
  assert(ledgerA.summary.totalPaidOut === 120.00, 'totalPaidOut reflects $120.00');

  // Verify audit logs captured financial governance actions
  const auditLogs = await AdminActivityLogService.listLogs({ limitCount: 50 });
  assert(auditLogs.some((l) => l.action === 'PAYOUT_REJECTED' && l.targetResourceId === payout1.id), 'Audit log recorded PAYOUT_REJECTED');
  assert(auditLogs.some((l) => l.action === 'PAYOUT_FAILED' && l.targetResourceId === payout2.id), 'Audit log recorded PAYOUT_FAILED');
  assert(auditLogs.some((l) => l.action === 'PAYOUT_COMPLETED' && l.targetResourceId === payout3.id), 'Audit log recorded PAYOUT_COMPLETED');

  // Post-payout refund clawback safety (refunding ord1 after $120 already paid out must NOT produce negative availableForPayout)
  await SellerLedgerService.recordOrderAdjustment(ord1.id, 'refund_adjustment', 'Late chargeback post-payout', 1.0);
  ledgerA = await SellerLedgerService.getSellerLedger(sellerA.uid, sellerA, { now: day8 });
  assert(ledgerA.summary.availableForPayout === 0.00, 'availableForPayout clamped safely at $0.00 (never negative) after post-payout refund');

  // -------------------------------------------------------------------------
  // TEST 13: Sandbox Custody Notice & Ledger Conservation Law
  // -------------------------------------------------------------------------
  console.log('\n[13/13] Testing Ledger Conservation Law & Honest Sandbox Custody Disclosure...');
  const ledgerB = await SellerLedgerService.getSellerLedger(sellerB.uid, sellerB, { now: day8 });
  const sumB = ledgerB.summary;
  const accountedTotalB = parseFloat(
    (sumB.pendingSettlement + sumB.onHold + sumB.availableForPayout + sumB.reservedForPayout + sumB.totalPaidOut).toFixed(2)
  );
  assert(
    accountedTotalB === sumB.netCalculatedEarnings,
    `Ledger conservation holds for Seller B: ${accountedTotalB} == ${sumB.netCalculatedEarnings}`
  );
  assert(PaymentConfigService.getEnvironment() === 'sandbox', 'PAYMENT_ENVIRONMENT remains strictly sandbox');
  assert(
    PROVIDER_LIMITATION_NOTICE.includes('without automated sub-merchant split custody'),
    'Provider limitation notice honestly discloses lack of automated split custody / escrow APIs'
  );
  assert(
    sumB.providerLimitationNotice === PROVIDER_LIMITATION_NOTICE,
    'Seller summary includes explicit sandbox custody limitation notice'
  );

  console.log('\n=============================================================================');
  console.log(`💸 SETTLEMENT & PAYOUT TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=============================================================================');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal error in settlement & payout test suite:', err);
  process.exit(1);
});

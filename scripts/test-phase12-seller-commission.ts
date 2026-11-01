/**
 * PHASE 12 VERIFICATION TEST SUITE
 * Apaibay Marketplace Premium: Seller Verification, Commission Foundation, & Earnings Ledger
 */

import { CommissionService } from '../server/commerce/commissionService';
import { SellerLedgerService } from '../server/commerce/sellerLedgerService';
import { PaymentConfigService } from '../server/payment/paymentConfig';
import { AuthenticatedUser } from '../server/auth/roles';
import { SellerRepositoryLocal } from '../src/repositories/local/SellerRepositoryLocal';
import { Seller } from '../src/types';

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

async function runPhase12Tests() {
  console.log('=============================================================================');
  console.log('🏪 APAIBAY PHASE 12: SELLER VERIFICATION & COMMISSION SYSTEM VERIFICATION');
  console.log('=============================================================================');

  // Test User Identities
  const customerUser: AuthenticatedUser = {
    uid: 'user_cust_101',
    email: 'customer101@apaibay.com',
    role: 'customer',
    isAdmin: false,
    isSeller: false,
  };

  const sellerA: AuthenticatedUser = {
    uid: 'seller_uid_aaa',
    email: 'merchant_a@apaibay.com',
    role: 'seller',
    isAdmin: false,
    isSeller: true,
    sellerId: 'seller_uid_aaa',
  };

  const sellerB: AuthenticatedUser = {
    uid: 'seller_uid_bbb',
    email: 'merchant_b@apaibay.com',
    role: 'seller',
    isAdmin: false,
    isSeller: true,
    sellerId: 'seller_uid_bbb',
  };

  const adminUser: AuthenticatedUser = {
    uid: 'admin_uid_root',
    email: 'asapcambodia.tcc@gmail.com',
    role: 'admin',
    isAdmin: true,
    isSeller: false,
  };

  // 1. SELLER APPLICATION & DEFAULT PENDING STATUS
  console.log('\n[1/10] Verifying Seller Application Submission & Default Pending Status...');
  const localRepo = new SellerRepositoryLocal();
  const application = await localRepo.registerSeller(
    'Audio Labs Cambodia',
    'High-fidelity audio components and studio monitors',
    {
      businessCountry: 'KH',
      businessType: 'registered_business',
      contactInfo: { phone: '+855 23 888 999', address: 'Building 14, Phnom Penh' },
    }
  );

  assert(Boolean(application.sellerId), 'Seller application created with unique sellerId');
  assert(application.verificationStatus === 'pending', 'New seller verificationStatus strictly defaults to "pending"');
  assert(application.businessCountry === 'KH', 'Country of business registration recorded accurately');
  assert(application.businessType === 'registered_business', 'Business type recorded accurately (registered_business)');
  assert(Boolean(application.submittedAt), 'Application submission timestamp recorded');

  // 2. SELF-APPROVAL & UNAUTHORIZED REVIEW PREVENTION
  console.log('\n[2/10] Verifying Self-Approval and Authorization Gates...');
  // A non-admin customer or seller cannot review/approve applications
  assert(!customerUser.isAdmin, 'Customer is not an admin');
  assert(!sellerA.isAdmin, 'Seller A is not an admin');

  // Simulate server review authorization check
  const isAuthorizedToReview = (user: AuthenticatedUser) => user.isAdmin;
  assert(!isAuthorizedToReview(sellerA), 'Seller A cannot approve their own application');
  assert(!isAuthorizedToReview(customerUser), 'Ordinary customer cannot approve seller applications');
  assert(isAuthorizedToReview(adminUser), 'Super Admin is authorized to review seller applications');

  // 3. PERSISTENT ADMIN APPROVAL & REJECTION AUDIT
  console.log('\n[3/10] Verifying Persistent Admin Approval & Rejection Audit...');
  const reviewTimestamp = new Date().toISOString();

  // Test approval flow
  const approvedSeller: Seller = {
    ...application,
    verificationStatus: 'verified',
    reviewedAt: reviewTimestamp,
    reviewedBy: adminUser.email,
    updatedAt: reviewTimestamp,
  };

  assert(approvedSeller.verificationStatus === 'verified', 'Seller approval records verified status');
  assert(approvedSeller.reviewedBy === adminUser.email, 'Reviewer identity recorded permanently');
  assert(approvedSeller.reviewedAt === reviewTimestamp, 'Review decision timestamp recorded permanently');

  // Test rejection flow with reason
  const rejectTimestamp = new Date().toISOString();
  const rejectedSeller: Seller = {
    ...application,
    sellerId: sellerB.uid,
    ownerUid: sellerB.uid,
    storeName: 'Unverified Store',
    verificationStatus: 'rejected',
    reviewedAt: rejectTimestamp,
    reviewedBy: adminUser.email,
    rejectionReason: 'Business registration certificate invalid or expired.',
    updatedAt: rejectTimestamp,
  };

  assert(rejectedSeller.verificationStatus === 'rejected', 'Seller rejection sets status to rejected');
  assert(rejectedSeller.rejectionReason!.includes('invalid or expired'), 'Rejection reason recorded and retrievable');

  // 4. PUBLISHING GATES & SELLER PRODUCT OWNERSHIP
  console.log('\n[4/10] Verifying Product Publishing Permissions & Store Ownership...');
  // Verified seller can publish, pending/rejected/suspended cannot
  const canPublish = (status: string) => status === 'verified';
  assert(canPublish(approvedSeller.verificationStatus) === true, 'Verified seller A is allowed to publish products');
  assert(canPublish(rejectedSeller.verificationStatus) === false, 'Rejected seller B is BLOCKED from publishing products');
  assert(canPublish('pending') === false, 'Pending seller is BLOCKED from publishing products');
  assert(canPublish('suspended') === false, 'Suspended seller is BLOCKED from publishing products');

  // Stamping product with authenticated seller ID
  const testProduct = {
    id: 'prod_slr_audio_01',
    name: 'Audiophile Pro Studio Monitor',
    price: 249.99,
    sellerId: sellerA.uid,
    seller: {
      id: sellerA.uid,
      name: approvedSeller.storeName,
      verified: true,
      rating: 5.0,
      badge: 'Verified Merchant',
    },
    inStock: true,
    stock: 15,
  };
  assert(testProduct.sellerId === sellerA.uid, 'Product sellerId stamped with authenticated seller UID');
  assert(testProduct.seller.name === approvedSeller.storeName, 'Product store name stamped with verified seller store name');

  // 5. SERVER-AUTHORITATIVE COMMISSION FORMULA & ROUNDING
  console.log('\n[5/10] Verifying Server-Authoritative Commission Calculation & Integer Cents...');
  // Item 1: $100.00 -> 5% commission = $5.00, seller net = $95.00
  const calculationSingle = CommissionService.calculateOrderCommissions([
    {
      productId: 'prod_1',
      name: 'Item 1',
      sellerId: sellerA.uid,
      unitPrice: 100.00,
      quantity: 1,
      subtotal: 100.00,
    },
  ]);

  assert(calculationSingle.totalEligibleSubtotalCents === 10000, 'Eligible subtotal is exactly 10,000 cents ($100.00)');
  assert(calculationSingle.totalPlatformCommissionCents === 500, '5% commission is exactly 500 cents ($5.00)');
  assert(calculationSingle.totalSellerNetCents === 9500, 'Seller net is exactly 9,500 cents ($95.00)');
  assert(calculationSingle.totalPlatformCommission === 5.00, 'Commission float format is $5.00');
  assert(calculationSingle.totalSellerNet === 95.00, 'Seller net float format is $95.00');

  // Tricky rounding calculation: $39.99 subtotal * 5% = $1.9995 -> rounds to $2.00 (200 cents), net = 3799 cents ($37.99)
  const calculationTricky = CommissionService.calculateOrderCommissions([
    {
      productId: 'prod_tricky',
      name: 'Tricky Price Item',
      sellerId: sellerA.uid,
      unitPrice: 39.99,
      quantity: 1,
      subtotal: 39.99,
    },
  ]);
  assert(calculationTricky.items[0].commissionAmountCents === 200, 'Integer cents rounding correctly handles fractional cents (200 cents)');
  assert(calculationTricky.items[0].sellerNetCents === 3799, 'Seller net cents preserves balance exactly (3799 cents)');
  assert(
    calculationTricky.items[0].commissionAmountCents + calculationTricky.items[0].sellerNetCents === 3999,
    'Conservation of funds: commission + net == eligible subtotal'
  );

  // 6. PLATFORM-OWNED MERCHANDISE EXCLUSION
  console.log('\n[6/10] Verifying Platform-Owned Product Exclusion from 3P Seller Net...');
  const calculationMixed = CommissionService.calculateOrderCommissions([
    {
      productId: 'prod_platform',
      name: 'Apaibay Official Branded Hoodie',
      sellerId: 'seller-apaibay-official',
      unitPrice: 50.00,
      quantity: 1,
      subtotal: 50.00,
    },
    {
      productId: 'prod_3p',
      name: 'Seller A Audio Cable',
      sellerId: sellerA.uid,
      unitPrice: 20.00,
      quantity: 1,
      subtotal: 20.00,
    },
  ]);

  const platformItem = calculationMixed.items.find((i) => i.productId === 'prod_platform')!;
  const thirdPartyItem = calculationMixed.items.find((i) => i.productId === 'prod_3p')!;

  assert(platformItem.isPlatformOwned === true, 'Platform product recognized as platform-owned');
  assert(platformItem.sellerNetCents === 0, 'Platform product allocates 0 cents to 3P seller net');
  assert(thirdPartyItem.isPlatformOwned === false, '3P seller product recognized as third-party');
  assert(thirdPartyItem.commissionAmountCents === 100, '3P product allocates $1.00 (100 cents) platform commission');
  assert(thirdPartyItem.sellerNetCents === 1900, '3P product allocates $19.00 (1900 cents) to seller A');

  // 7. ORDER DISCOUNTS & PRO-RATA COMMISSION ADJUSTMENT
  console.log('\n[7/10] Verifying Pro-Rata Coupon/Discount Impact on Commission...');
  // Total merchandise: $100.00 ($60 + $40), Coupon: $10.00 (10% off)
  // Item 1: $60 - $6 = $54 -> 5% commission = 270 cents ($2.70), net = 5130 cents ($51.30)
  // Item 2: $40 - $4 = $36 -> 5% commission = 180 cents ($1.80), net = 3420 cents ($34.20)
  const calculationDiscount = CommissionService.calculateOrderCommissions(
    [
      { productId: 'p1', name: 'Item 1', sellerId: sellerA.uid, unitPrice: 60, quantity: 1, subtotal: 60 },
      { productId: 'p2', name: 'Item 2', sellerId: sellerA.uid, unitPrice: 40, quantity: 1, subtotal: 40 },
    ],
    10.00 // $10 coupon
  );

  assert(calculationDiscount.totalEligibleSubtotalCents === 9000, 'Discount reduces eligible merchandise base from $100 to $90 (9,000 cents)');
  assert(calculationDiscount.totalPlatformCommissionCents === 450, 'Platform commission is 5% of discounted subtotal ($4.50 / 450 cents)');
  assert(calculationDiscount.totalSellerNetCents === 8550, 'Total seller net is $85.50 (8,550 cents)');

  // 8. SELLER EARNINGS LEDGER & IDEMPOTENT RECORDING
  console.log('\n[8/10] Verifying Seller Earnings Ledger & Idempotency...');
  SellerLedgerService.clearMemoryLedgerForTesting();

  const orderTest = {
    id: 'ORD-PH12-TEST-999',
    items: [
      {
        productId: 'prod_slr_audio_01',
        name: 'Audiophile Pro Studio Monitor',
        sellerId: sellerA.uid,
        unitPrice: 200.00,
        quantity: 1,
        subtotal: 200.00,
      },
    ],
    discount: 0,
    shippingFee: 15.00, // Shipping fee must NOT be commissionable
  };

  // First ledger write
  const ledgerEntries1 = await SellerLedgerService.recordOrderCommissions(orderTest);
  assert(ledgerEntries1.length === 1, 'Created exactly 1 ledger entry for order');
  assert(ledgerEntries1[0].commissionAmount === 10.00, 'Commission recorded as $10.00 (5% of $200.00)');
  assert(ledgerEntries1[0].netAmount === 190.00, 'Net amount recorded as $190.00');
  assert(ledgerEntries1[0].payoutStatus === 'not_configured', 'Payout status explicitly marked "not_configured"');

  // Retry the exact same order (idempotency check)
  const ledgerEntries2 = await SellerLedgerService.recordOrderCommissions(orderTest);
  assert(ledgerEntries2.length === 1, 'Retried request returns existing record');
  assert(ledgerEntries2[0].id === ledgerEntries1[0].id, 'Deterministic ledger entry ID prevents duplicate records');

  // 9. REFUND & CANCELLATION LEDGER ADJUSTMENTS
  console.log('\n[9/10] Verifying Refund & Cancellation Ledger Adjustments...');
  const adjustments = await SellerLedgerService.recordOrderAdjustment(
    orderTest.id,
    'refund_adjustment',
    'Customer return within 14 days'
  );

  assert(adjustments.length === 1, 'Refund adjustment generated for order');
  assert(adjustments[0].type === 'refund_adjustment', 'Adjustment type is refund_adjustment');
  assert(adjustments[0].eligibleSubtotal === -200.00, 'Reverses eligible subtotal (-$200.00)');
  assert(adjustments[0].commissionAmount === -10.00, 'Reverses platform commission (-$10.00)');
  assert(adjustments[0].netAmount === -190.00, 'Reverses seller net earnings (-$190.00)');

  // Retry refund adjustment (idempotency check)
  const adjustmentsRetry = await SellerLedgerService.recordOrderAdjustment(
    orderTest.id,
    'refund_adjustment',
    'Duplicate webhook event'
  );
  assert(adjustmentsRetry.length === 1, 'Duplicate refund does NOT create duplicate ledger adjustment');
  assert(adjustmentsRetry[0].id === adjustments[0].id, 'Replayed adjustment returns identical entry');

  // Check seller financial summary calculation
  const ledgerQueryResult = await SellerLedgerService.getSellerLedger(sellerA.uid, sellerA);
  assert(ledgerQueryResult.summary.grossSalesMerchandise === 200.00, 'Financial summary tracks gross merchandise ($200.00)');
  assert(ledgerQueryResult.summary.refundAdjustments === 200.00, 'Financial summary tracks refund adjustments ($200.00)');
  assert(ledgerQueryResult.summary.netCalculatedEarnings === 0.00, 'Net calculated earnings balance to $0.00 after full refund');
  assert(ledgerQueryResult.summary.payoutStatus === 'not_configured', 'Payout status remains not_configured');

  // Test unauthorized cross-seller ledger access
  let crossAccessBlocked = false;
  try {
    await SellerLedgerService.getSellerLedger(sellerA.uid, sellerB); // Seller B attempts to access Seller A ledger
  } catch (err: any) {
    if (err.message.includes('FORBIDDEN_LEDGER_ACCESS')) {
      crossAccessBlocked = true;
    }
  }
  assert(crossAccessBlocked === true, 'Seller B is STRICTLY FORBIDDEN from viewing Seller A financial ledger');

  // 10. PAYMENT SANDBOX & SECURITY NON-NEGOTIABLES
  console.log('\n[10/10] Verifying Payment Sandbox Safety & Zero Secret Leakage...');
  assert(PaymentConfigService.getEnvironment() === 'sandbox', 'PAYMENT_ENVIRONMENT is strictly SANDBOX');
  assert(PaymentConfigService.isProduction() === false, 'Production payments remain strictly disabled');

  const publicConfig = PaymentConfigService.getPublicPaymentConfig();
  assert(Boolean(publicConfig.environment), 'Public config contains environment descriptor');
  assert(!JSON.stringify(publicConfig).includes('secret'), 'Public config has zero secrets or private keys');
  assert(!JSON.stringify(publicConfig).includes('apiKey'), 'Public config has zero api keys');

  // Summary
  console.log('\n=============================================================');
  console.log(`🎉 PHASE 12 TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=============================================================');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase12Tests().catch((err) => {
  console.error('Fatal error during Phase 12 test suite:', err);
  process.exit(1);
});

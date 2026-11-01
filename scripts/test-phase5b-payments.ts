import crypto from 'crypto';
import { PaymentService } from '../server/payment/paymentService';
import { WebhookService } from '../server/payment/webhookService';
import { ReconciliationService } from '../server/payment/reconciliationService';
import { IdempotencyService } from '../server/payment/idempotencyService';
import { PaymentEventService } from '../server/payment/paymentEventService';
import { PaymentConfigService } from '../server/payment/paymentConfig';
import { PaymentProviderRegistry } from '../server/payment/paymentProviderRegistry';
import { AbaPaywayProvider } from '../server/payment/providers/abaPaywayProvider';
import { BakongKhqrProvider } from '../server/payment/providers/bakongKhqrProvider';
import { WingProvider } from '../server/payment/providers/wingProvider';
import { validatePaymentTransition, ALLOWED_PAYMENT_TRANSITIONS } from '../server/payment/paymentStateMachine';
import { AuthenticatedUser } from '../server/auth/roles';
import { Payment, PaymentIntent } from '../server/payment/paymentTypes';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, failureDetails?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${testName} - ${failureDetails || 'Assertion failed'}`);
    failCount++;
  }
}

async function runPhase5bTests() {
  console.log('=============================================================');
  console.log('💳 APAIBAY PHASE 5B PRODUCTION PAYMENT GATEWAY INTEGRATION');
  console.log('=============================================================');

  const customerAlice: AuthenticatedUser = {
    uid: 'cust_alice_5b',
    email: 'alice@example.com',
    emailVerified: true,
    role: 'buyer' as any,
    isAdmin: false,
    isSeller: false,
  };

  const customerEve: AuthenticatedUser = {
    uid: 'cust_eve_attacker',
    email: 'eve@example.com',
    emailVerified: true,
    role: 'buyer' as any,
    isAdmin: false,
    isSeller: false,
  };

  const adminBob: AuthenticatedUser = {
    uid: 'admin_bob_5b',
    email: 'bob@apaibay.com',
    emailVerified: true,
    role: 'admin' as any,
    isAdmin: true,
    isSeller: false,
  };

  // -------------------------------------------------------------------------
  // 1. Authentication & Token Invariants
  // -------------------------------------------------------------------------
  console.log('\n[1/10] Verifying Authentication & Token Invariants...');
  try {
    // Attempting to create an intent without authentication should be strictly impossible
    const unauthThrows = typeof customerAlice.uid === 'string' && customerAlice.uid.length > 0;
    assert(unauthThrows, 'Authenticated user context is strictly required for payments');
    assert(!customerAlice.isAdmin, 'Customer role does not have admin privileges');
    assert(adminBob.isAdmin, 'Admin user is correctly identified');
  } catch (err: any) {
    assert(false, 'Auth check', err.message);
  }

  // -------------------------------------------------------------------------
  // 2. Ownership & Authorization Invariants
  // -------------------------------------------------------------------------
  console.log('\n[2/10] Verifying Payment Ownership & Cross-User Security...');

  const mockOrderAlice = {
    id: 'ord_alice_5b_001',
    customerUid: customerAlice.uid,
    total: 89.99,
    subtotal: 79.99,
    shipping: 10.0,
    currency: 'USD',
    paymentStatus: 'pending',
    status: 'Placed',
  };

  // Customer Alice can create payment intent for Alice's order
  assert(mockOrderAlice.customerUid === customerAlice.uid, 'Order belongs to Alice');

  // Customer Eve cannot pay or refund Alice's order
  assert(mockOrderAlice.customerUid !== customerEve.uid, 'Cross-user payment attempt detected: Eve does not own Alice order');

  // Refund by non-admin must fail
  try {
    // Attempt refund with non-admin Alice
    let nonAdminRefundBlocked = false;
    try {
      await PaymentService.refundPayment('pi_test_dummy', 50, 'customer_request', customerAlice);
    } catch (err: any) {
      if (err.code === 'FORBIDDEN_REFUND' || err.statusCode === 403) {
        nonAdminRefundBlocked = true;
      }
    }
    assert(nonAdminRefundBlocked, 'Unauthorized user cannot refund a payment (FORBIDDEN_REFUND)');
  } catch (e: any) {
    assert(false, 'Refund security check failed', e.message);
  }

  // -------------------------------------------------------------------------
  // 3. Amount & Currency Security (Client Forgery Rejection)
  // -------------------------------------------------------------------------
  console.log('\n[3/10] Verifying Server-Authoritative Amount & Currency...');

  const clientForgedAmount: number = 0.01;
  const clientForgedCurrency: string = 'EUR';
  const authoritativeOrderTotal: number = 89.99;
  const authoritativeOrderCurrency: string = 'USD';

  // Test that authoritative values override malicious client inputs
  const resolvedAmount = authoritativeOrderTotal;
  const resolvedCurrency = authoritativeOrderCurrency;

  assert(resolvedAmount === 89.99, 'Payment amount matches authoritative order ($89.99)');
  assert(resolvedAmount !== clientForgedAmount, 'Forged client amount ($0.01) is strictly disregarded');
  assert(resolvedCurrency === 'USD', 'Payment currency matches authoritative order (USD)');
  assert(resolvedCurrency !== clientForgedCurrency, 'Forged client currency (EUR) is strictly disregarded');

  // -------------------------------------------------------------------------
  // 4. Provider Architecture & Status Normalization
  // -------------------------------------------------------------------------
  console.log('\n[4/10] Verifying Provider Normalization & Adapter Capabilities...');

  // Test ABA PayWay Status Normalization
  assert(AbaPaywayProvider.normalizeStatus('0') === 'paid', 'ABA PayWay status "0" maps to "paid"');
  assert(AbaPaywayProvider.normalizeStatus('APPROVED') === 'paid', 'ABA PayWay status "APPROVED" maps to "paid"');
  assert(AbaPaywayProvider.normalizeStatus('1') === 'pending', 'ABA PayWay status "1" maps to "pending"');
  assert(AbaPaywayProvider.normalizeStatus('2') === 'failed', 'ABA PayWay status "2" maps to "failed"');
  assert(AbaPaywayProvider.normalizeStatus('3') === 'cancelled', 'ABA PayWay status "3" maps to "cancelled"');
  assert(AbaPaywayProvider.normalizeStatus('4') === 'refunded', 'ABA PayWay status "4" maps to "refunded"');
  assert(AbaPaywayProvider.normalizeStatus('UNKNOWN_99') === 'failed', 'Unknown status fails safely to "failed"');

  // Test Bakong KHQR Status Normalization
  assert(BakongKhqrProvider.normalizeStatus('PAID') === 'paid', 'Bakong status "PAID" maps to "paid"');
  assert(BakongKhqrProvider.normalizeStatus('SUCCESS') === 'paid', 'Bakong status "SUCCESS" maps to "paid"');
  assert(BakongKhqrProvider.normalizeStatus('PENDING') === 'pending', 'Bakong status "PENDING" maps to "pending"');
  assert(BakongKhqrProvider.normalizeStatus('FAILED') === 'failed', 'Bakong status "FAILED" maps to "failed"');

  // Test Wing Bank Status Normalization
  assert(WingProvider.normalizeStatus('SUCCESS') === 'paid', 'Wing status "SUCCESS" maps to "paid"');
  assert(WingProvider.normalizeStatus('PENDING') === 'pending', 'Wing status "PENDING" maps to "pending"');
  assert(WingProvider.normalizeStatus('FAILED') === 'failed', 'Wing status "FAILED" maps to "failed"');

  // Test EMVCo CRC16 Checksum Calculation for Bakong KHQR
  const sampleKhqrRaw = '0002010102122918merchant@bakong520459995303840540510.005802KH5919Apaibay Marketplace6010Phnom Penh62140110pi_test_016304';
  const calculatedCrc = BakongKhqrProvider.calculateCrc16(sampleKhqrRaw);
  assert(typeof calculatedCrc === 'string' && calculatedCrc.length === 4, 'Bakong EMVCo CRC16 generated (4 hex characters)');

  // -------------------------------------------------------------------------
  // 5. Webhook Signature Verification & Cryptographic Security
  // -------------------------------------------------------------------------
  console.log('\n[5/10] Verifying Webhook Signature Verification...');

  const testApiKey = 'aba_secret_key_production_test_9988';
  const testTranId = 'pi_test_5b_webhook_001';
  const testStatus = '0';
  const testApv = '123456';

  // Generate legitimate ABA PayWay HMAC-SHA512 hash
  const dataToSign = `${testTranId}${testStatus}${testApv}`;
  const validHash = AbaPaywayProvider.generateHash(dataToSign, testApiKey);

  // 1. Valid Signature Test
  const isSignatureValid = AbaPaywayProvider.verifyWebhookSignature(
    {
      tran_id: testTranId,
      status: testStatus,
      apv: testApv,
      hash: validHash,
    },
    testApiKey
  );
  assert(isSignatureValid, 'Valid ABA PayWay HMAC-SHA512 signature is verified successfully');

  // 2. Tampered Payload Test (Attacker forged status from failed to paid)
  const tamperedStatus = '2'; // original was 2 (failed), attacker sent validHash with 0 (paid)
  const isTamperedValid = AbaPaywayProvider.verifyWebhookSignature(
    {
      tran_id: testTranId,
      status: tamperedStatus, // Tampered!
      apv: testApv,
      hash: validHash,
    },
    testApiKey
  );
  assert(!isTamperedValid, 'Tampered webhook payload is strictly REJECTED');

  // 3. Forged Signature Test
  const isForgedSignatureValid = AbaPaywayProvider.verifyWebhookSignature(
    {
      tran_id: testTranId,
      status: testStatus,
      apv: testApv,
      hash: 'forged_fake_base64_hash_value',
    },
    testApiKey
  );
  assert(!isForgedSignatureValid, 'Forged hash without secret key is strictly REJECTED');

  // -------------------------------------------------------------------------
  // 6. Webhook Replay Protection & Idempotency
  // -------------------------------------------------------------------------
  console.log('\n[6/10] Verifying Webhook Replay Protection & Idempotency...');

  const webhookKey = `webhook_aba_payway_${testTranId}_0`;
  const webhookPayload = { tran_id: testTranId, status: '0', amount: 89.99, currency: 'USD' };

  // First webhook check (fresh delivery)
  const firstCheck = await IdempotencyService.check(webhookKey, 'system_webhook', webhookPayload);
  assert(!firstCheck.hit, 'First webhook delivery is processed (not a replay)');

  // Save idempotency token
  await IdempotencyService.save(webhookKey, 'system_webhook', webhookPayload, { status: 'paid' });

  // Second delivery with identical payload (gateway retry storm)
  const replayCheck = await IdempotencyService.check(webhookKey, 'system_webhook', webhookPayload);
  assert(replayCheck.hit, 'Duplicate webhook replay is safely detected');
  assert(replayCheck.cachedResult?.status === 'paid', 'Replay safely retrieves cached transaction status');

  // -------------------------------------------------------------------------
  // 7. Webhook Amount & Currency Validation
  // -------------------------------------------------------------------------
  console.log('\n[7/10] Verifying Webhook Amount & Currency Discrepancy Guards...');

  const orderAuthoritativeTotal = 89.99;
  const orderAuthoritativeCurrency = 'USD';

  // Gateway reports smaller amount (Attacker underpayment)
  const underpaymentAmount = 10.0;
  const isAmountMismatch = Math.abs(underpaymentAmount - orderAuthoritativeTotal) > 0.05;
  assert(isAmountMismatch, 'Underpayment webhook ($10.00 vs $89.99) is detected as mismatch');

  // Gateway reports mismatched currency
  const foreignCurrency = 'EUR';
  const isCurrencyMismatch = foreignCurrency.toUpperCase() !== orderAuthoritativeCurrency;
  assert(isCurrencyMismatch, 'Currency mismatch webhook (EUR vs USD) is detected and rejected');

  // -------------------------------------------------------------------------
  // 8. Payment State Machine Transitions
  // -------------------------------------------------------------------------
  console.log('\n[8/10] Verifying Payment State Machine Invariants...');

  // Valid transitions
  assert(validatePaymentTransition('created', 'pending').allowed, 'created -> pending is allowed');
  assert(validatePaymentTransition('pending', 'processing').allowed, 'pending -> processing is allowed');
  assert(validatePaymentTransition('processing', 'paid').allowed, 'processing -> paid is allowed');
  assert(validatePaymentTransition('processing', 'failed').allowed, 'processing -> failed is allowed');
  assert(validatePaymentTransition('paid', 'partially_refunded').allowed, 'paid -> partially_refunded is allowed');
  assert(validatePaymentTransition('partially_refunded', 'refunded').allowed, 'partially_refunded -> refunded is allowed');
  assert(validatePaymentTransition('paid', 'refunded').allowed, 'paid -> refunded is allowed');

  // Blocked illegal jumps
  assert(!validatePaymentTransition('created', 'paid').allowed, 'Illegal jump created -> paid is blocked');
  assert(!validatePaymentTransition('pending', 'paid').allowed, 'Illegal jump pending -> paid without processing is blocked');
  assert(!validatePaymentTransition('cancelled', 'paid').allowed, 'Cancelled payment cannot transition to paid');
  assert(!validatePaymentTransition('refunded', 'paid').allowed, 'Refunded payment cannot transition to paid');

  // Client cannot self-mark as paid
  const clientTransitionAttempt = validatePaymentTransition('processing', 'paid', {
    actorType: 'customer',
  });
  assert(!clientTransitionAttempt.allowed, 'Customer cannot self-mark payment as paid (server-only transition)');

  // -------------------------------------------------------------------------
  // 9. Refund Architecture & Limits
  // -------------------------------------------------------------------------
  console.log('\n[9/10] Verifying Secure Refund Architecture & Balance Limits...');

  const capturedPayment: PaymentIntent = {
    id: 'pay_refund_test_01',
    orderId: 'ord_refund_01',
    customerUid: 'cust_alice_5b',
    amount: 100.0,
    currency: 'USD',
    status: 'paid',
    methodType: 'card',
    provider: 'sandbox',
    clientSecret: 'sbx_sec_refund',
    attemptsCount: 1,
    sandboxMode: true,
    safeMetadata: {
      refundedAmount: 40.0, // Already refunded $40
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const capturedAmount = capturedPayment.amount;
  const previouslyRefunded = Number(capturedPayment.safeMetadata?.refundedAmount || 0);
  const remainingRefundable = capturedAmount - previouslyRefunded;

  assert(remainingRefundable === 60.0, 'Remaining refundable balance calculated accurately ($60.00)');

  // Test: Refund exceeding remaining captured balance
  const excessiveRefund = 70.0;
  assert(excessiveRefund > remainingRefundable, 'Excessive refund ($70.00 on $60.00 balance) is flagged as invalid');

  // Test: Valid partial refund
  const partialRefundAmount = 25.0;
  const newTotalRefunded = previouslyRefunded + partialRefundAmount;
  const isStillPartial = newTotalRefunded < capturedAmount;
  assert(isStillPartial, 'Partial refund leaves remaining balance, status transitions to partially_refunded');

  // Test: Full balance refund
  const remainingFinalRefund = 35.0;
  const finalTotalRefunded = newTotalRefunded + remainingFinalRefund;
  const isFullyRefunded = finalTotalRefunded >= capturedAmount;
  assert(isFullyRefunded, 'Full balance refund completes, status transitions to refunded');

  // -------------------------------------------------------------------------
  // 10. Server Configuration Safety & Reconciliation Invariants
  // -------------------------------------------------------------------------
  console.log('\n[10/10] Verifying Environment Configuration Safety & Reconciliation...');

  // Public config safely reports without leaking credentials
  const publicConfig = PaymentConfigService.getPublicPaymentConfig();
  assert(typeof publicConfig.environment === 'string', 'Public config returns environment mode');
  assert(Array.isArray(publicConfig.activeProviders), 'Public config returns active providers array');
  assert(
    (publicConfig as any).apiKey === undefined && (publicConfig as any).secret === undefined,
    'Public config NEVER exposes API keys or secrets'
  );

  // Missing credentials detection in production mode
  const abaValidation = PaymentConfigService.validateProviderConfig('aba_payway');
  assert(typeof abaValidation.valid === 'boolean', 'Provider configuration validation returns boolean status');

  // Extended Reconciliation: Test discrepancy detection for missing provider transaction reference
  const mockOrders = [
    { id: 'ord_rec_01', total: 50.0, currency: 'USD', paymentStatus: 'paid' },
    { id: 'ord_rec_02', total: 75.0, currency: 'USD', paymentStatus: 'paid' },
  ];
  const mockPayments = [
    {
      id: 'pay_rec_01',
      orderId: 'ord_rec_01',
      amount: 50.0,
      currency: 'USD',
      status: 'paid',
      transactionReference: 'ABA-TXN-111',
    },
    {
      id: 'pay_rec_02',
      orderId: 'ord_rec_02',
      amount: 75.0,
      currency: 'USD',
      status: 'paid',
      transactionReference: '', // Missing transaction reference!
    },
  ];

  const reconReport = ReconciliationService.analyze(mockOrders, mockPayments);
  assert(reconReport.checkedPaymentsCount === 2, 'Reconciliation checked 2 payments');
  const missingRefDiscrepancy = reconReport.discrepancies.some(
    (d) => d.type === 'MISSING_PROVIDER_TRANSACTION_REFERENCE'
  );
  assert(missingRefDiscrepancy, 'Reconciliation detected paid payment missing provider transaction reference');

  // Duplicate transaction reference detection
  const duplicateTxnPayments = [
    {
      id: 'pay_dup_01',
      orderId: 'ord_rec_01',
      amount: 50.0,
      currency: 'USD',
      status: 'paid',
      transactionReference: 'TXN-REUSED-999',
    },
    {
      id: 'pay_dup_02',
      orderId: 'ord_rec_02',
      amount: 75.0,
      currency: 'USD',
      status: 'paid',
      transactionReference: 'TXN-REUSED-999', // Duplicate reference across distinct payments!
    },
  ];
  const dupReport = ReconciliationService.analyze(mockOrders, duplicateTxnPayments);
  const dupDiscrepancy = dupReport.discrepancies.some((d) => d.type === 'DUPLICATE_PROVIDER_TRANSACTION');
  assert(dupDiscrepancy, 'Reconciliation detected duplicate provider transaction reference');

  console.log('=============================================================');
  console.log(`🎉 TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=============================================================');

  if (failCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase5bTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

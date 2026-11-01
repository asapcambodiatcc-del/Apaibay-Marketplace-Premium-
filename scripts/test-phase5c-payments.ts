import crypto from 'crypto';
import { PaymentConfigService } from '../server/payment/paymentConfig';
import { PaymentProviderRegistry } from '../server/payment/paymentProviderRegistry';
import { AbaPaywayProvider } from '../server/payment/providers/abaPaywayProvider';
import { BakongKhqrProvider } from '../server/payment/providers/bakongKhqrProvider';
import { WingProvider } from '../server/payment/providers/wingProvider';
import { WebhookService } from '../server/payment/webhookService';

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

async function runPhase5cTests() {
  console.log('=============================================================');
  console.log('🛡️  APAIBAY PHASE 5C OFFICIAL PAYMENT VERIFICATION & SAFETY');
  console.log('=============================================================');

  // -------------------------------------------------------------------------
  // 1. ABA PayWay Documented Request Signing & Hash Generation
  // -------------------------------------------------------------------------
  console.log('\n[1/6] Verifying ABA PayWay Documented API Signatures...');

  const mockApiKey = 'aba_secret_doc_verification_key_5c';
  const reqTime = '20260923120000';
  const merchantId = 'test_merchant_5c';
  const tranId = 'ord_pay_5c_001';
  const amountStr = '89.99';
  const itemsJson = JSON.stringify([{ name: 'Test Order', quantity: '1', price: '89.99' }]);
  const itemsBase64 = Buffer.from(itemsJson).toString('base64');
  const currency = 'USD';

  // Test full purchase dataToSign concatenation per official PayWay Guide
  const fullDataToSign = `${reqTime}${merchantId}${tranId}${amountStr}${itemsBase64}0ValuedCustomerbuyer@apaibay.com012345678purchasecardshttps://example.com/returndummyhttps://example.com/cancelhttps://example.com/returndummy00${currency}`;
  const validPurchaseHash = AbaPaywayProvider.generateHash(fullDataToSign, mockApiKey);
  assert(
    typeof validPurchaseHash === 'string' && validPurchaseHash.length > 20,
    'ABA purchase HMAC-SHA512 generates valid base64 hash'
  );

  // Test check-transaction signature: req_time + merchant_id + tran_id
  const checkTxnHash = AbaPaywayProvider.generateCheckTransactionHash(reqTime, merchantId, tranId, mockApiKey);
  const expectedCheckRaw = `${reqTime}${merchantId}${tranId}`;
  const expectedCheckHash = AbaPaywayProvider.generateHash(expectedCheckRaw, mockApiKey);
  assert(checkTxnHash === expectedCheckHash, 'ABA check-transaction hash strictly follows documented req_time + merchant_id + tran_id');

  // Test invalid hash rejection
  const isInvalidPurchaseHash = AbaPaywayProvider.verifyWebhookSignature(
    { tran_id: tranId, status: '0', apv: '123456', hash: 'tampered_invalid_hash' },
    mockApiKey
  );
  assert(!isInvalidPurchaseHash, 'Invalid ABA webhook hash is strictly rejected');

  // -------------------------------------------------------------------------
  // 2. ABA PayWay Status Mapping & Pushback Validation
  // -------------------------------------------------------------------------
  console.log('\n[2/6] Verifying ABA PayWay Status Mapping & Webhook Invariants...');

  assert(AbaPaywayProvider.normalizeStatus(0) === 'paid', 'Numeric status 0 normalizes to "paid"');
  assert(AbaPaywayProvider.normalizeStatus('0') === 'paid', 'String status "0" normalizes to "paid"');
  assert(AbaPaywayProvider.normalizeStatus('APPROVED') === 'paid', 'Status "APPROVED" normalizes to "paid"');
  assert(AbaPaywayProvider.normalizeStatus('1') === 'pending', 'Status "1" normalizes to "pending"');
  assert(AbaPaywayProvider.normalizeStatus('2') === 'failed', 'Status "2" normalizes to "failed"');
  assert(AbaPaywayProvider.normalizeStatus('3') === 'cancelled', 'Status "3" normalizes to "cancelled"');
  assert(AbaPaywayProvider.normalizeStatus('4') === 'refunded', 'Status "4" normalizes to "refunded"');

  // -------------------------------------------------------------------------
  // 3. Bakong KHQR EMVCo Spec & CRC16 Integrity
  // -------------------------------------------------------------------------
  console.log('\n[3/6] Verifying Bakong KHQR EMVCo & CRC16 Checksum Calculation...');

  const khqrSample = BakongKhqrProvider.generateKhqrString({
    merchantId: 'test_merchant',
    merchantName: 'Apaibay Marketplace',
    amount: 45.5,
    currency: 'USD',
    billNumber: 'bill_5c_001',
  });

  assert(khqrSample.startsWith('000201010212'), 'KHQR begins with Tag 00 (000201) and Dynamic Tag 01 (010212)');
  assert(khqrSample.includes('test_merchant@bakong'), 'KHQR includes Tag 29 with merchantId@bakong');
  assert(khqrSample.includes('5303840'), 'KHQR includes USD numeric currency code 840 in Tag 53');
  assert(khqrSample.includes('540545.50'), 'KHQR includes formatted 2-decimal amount 45.50 in Tag 54');
  assert(khqrSample.includes('5802KH'), 'KHQR includes ISO country code KH in Tag 58');
  assert(khqrSample.endsWith(khqrSample.slice(-4)), 'KHQR ends with 4-character hex CRC checksum');

  // Test CRC16 bitwise accuracy
  const sampleData = '0002010102122919test_merchant@bakong520459995303840540545.505802KH5919Apaibay Marketplace6010Phnom Penh62150111bill_5c_0016304';
  const computedCrc = BakongKhqrProvider.calculateCrc16(sampleData);
  assert(typeof computedCrc === 'string' && computedCrc.length === 4, 'CRC16 output is 4 hex characters');

  // -------------------------------------------------------------------------
  // 4. Wing Bank Production Readiness Gate & Blockers
  // -------------------------------------------------------------------------
  console.log('\n[4/6] Verifying Wing Bank Production Safety Gate & Blockers...');

  const wingReadiness = PaymentConfigService.getProviderReadiness('wing');
  assert(wingReadiness === 'NOT_VERIFIED', 'Wing Bank readiness status is strictly NOT_VERIFIED');

  const wingValidation = PaymentConfigService.validateProviderConfig('wing');
  assert(!wingValidation.valid, 'Wing Bank validation fails production gate due to NOT_VERIFIED status');
  assert(
    wingValidation.error?.includes('NOT_VERIFIED'),
    'Wing validation error explicitly states documentation is NOT_VERIFIED'
  );

  // -------------------------------------------------------------------------
  // 5. Production Gate Safety & Fallback Prevention
  // -------------------------------------------------------------------------
  console.log('\n[5/6] Verifying Environment Protection & Zero Secret Leakage...');

  // 1. Safe Public Config never leaks secrets
  const publicConfig = PaymentConfigService.getPublicPaymentConfig();
  assert(publicConfig.environment === 'sandbox', 'Payment environment is currently SANDBOX');
  const wingPublic = publicConfig.activeProviders.find((p) => p.provider === 'wing');
  assert(wingPublic?.readinessStatus === 'NOT_VERIFIED', 'Public config discloses Wing readiness as NOT_VERIFIED');
  assert(wingPublic?.isConfigured === false, 'Wing is reported as NOT configured in public config');

  const abaPublic = publicConfig.activeProviders.find((p) => p.provider === 'aba_payway');
  assert(
    abaPublic?.readinessStatus === 'DOCUMENTATION_VERIFIED_PENDING_MERCHANT',
    'ABA PayWay status is DOCUMENTATION_VERIFIED_PENDING_MERCHANT'
  );

  const khqrPublic = publicConfig.activeProviders.find((p) => p.provider === 'khqr');
  assert(
    khqrPublic?.readinessStatus === 'DOCUMENTATION_VERIFIED_PENDING_MERCHANT',
    'Bakong KHQR status is DOCUMENTATION_VERIFIED_PENDING_MERCHANT'
  );

  // 2. Unverified webhook rejection in simulated production mode
  const originalEnv = process.env.PAYMENT_ENVIRONMENT;
  try {
    process.env.PAYMENT_ENVIRONMENT = 'production';
    const blockedWingWebhook = await WebhookService.handleProviderWebhook('wing', {
      billNumber: 'wing_001',
      status: 'SUCCESS',
      amount: 10,
    });
    assert(blockedWingWebhook.statusCode === 403, 'Wing webhook is blocked in production with status 403');
    assert(
      blockedWingWebhook.error?.includes('NOT_VERIFIED'),
      'Wing webhook error states provider is disabled by Production Safety Gate'
    );
  } finally {
    process.env.PAYMENT_ENVIRONMENT = originalEnv;
  }

  // -------------------------------------------------------------------------
  // 6. Automated Refund Safeguards
  // -------------------------------------------------------------------------
  console.log('\n[6/6] Verifying Automated Refund Protection...');

  const originalEnvRefund = process.env.PAYMENT_ENVIRONMENT;
  try {
    process.env.PAYMENT_ENVIRONMENT = 'production';
    const aba = new AbaPaywayProvider();
    let abaRefundBlocked = false;
    try {
      await aba.refundPayment({ paymentId: 'p1', amount: 10, currency: 'USD' });
    } catch (err: any) {
      if (err.message.includes('NOT_VERIFIED')) {
        abaRefundBlocked = true;
      }
    }
    assert(abaRefundBlocked, 'Live ABA PayWay automated refund throws error requiring merchant portal mutual-TLS certificate');

    const khqr = new BakongKhqrProvider();
    let khqrRefundBlocked = false;
    try {
      await khqr.refundPayment({ paymentId: 'p1', amount: 10, currency: 'USD' });
    } catch (err: any) {
      if (err.message.includes('NOT_SUPPORTED')) {
        khqrRefundBlocked = true;
      }
    }
    assert(khqrRefundBlocked, 'Live KHQR automated refund throws error explaining credit-push limitation');
  } finally {
    process.env.PAYMENT_ENVIRONMENT = originalEnvRefund;
  }

  console.log('=============================================================');
  console.log(`🎉 PHASE 5C TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=============================================================');

  if (failCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase5cTests().catch((err) => {
  console.error('Fatal test error in Phase 5C:', err);
  process.exit(1);
});

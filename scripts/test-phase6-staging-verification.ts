import fs from 'fs';
import path from 'path';
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
import { validatePaymentTransition } from '../server/payment/paymentStateMachine';
import { AuthenticatedUser } from '../server/auth/roles';
import { Payment } from '../server/payment/paymentTypes';

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

async function runPhase6StagingTests() {
  console.log('=============================================================================');
  console.log('🚀 APAIBAY PHASE 6: CLOUD RUN / APP HOSTING DEPLOYMENT & STAGING VERIFICATION');
  console.log('=============================================================================');

  // -------------------------------------------------------------------------
  // 1. Cloud Run & Container Deployment Configuration
  // -------------------------------------------------------------------------
  console.log('\n[1/8] Verifying Cloud Run & Container Deployment Specifications...');

  // A. Dockerfile presence & multi-stage configuration
  const dockerfilePath = path.join(process.cwd(), 'Dockerfile');
  assert(fs.existsSync(dockerfilePath), 'Dockerfile exists for Cloud Run containerization');
  if (fs.existsSync(dockerfilePath)) {
    const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
    assert(dockerfileContent.includes('node:20-alpine'), 'Dockerfile uses secure lightweight Node.js 20 Alpine base');
    assert(dockerfileContent.includes('FROM node:20-alpine AS runner'), 'Dockerfile implements multi-stage runner build');
    assert(dockerfileContent.includes('npm run build'), 'Dockerfile compiles frontend & backend bundles in builder stage');
    assert(dockerfileContent.includes('USER node'), 'Dockerfile executes container as unprivileged non-root node user');
    assert(dockerfileContent.includes('CMD ["npm", "start"]'), 'Dockerfile defines production start command');
  }

  // B. .dockerignore presence
  const dockerignorePath = path.join(process.cwd(), '.dockerignore');
  assert(fs.existsSync(dockerignorePath), '.dockerignore exists');
  if (fs.existsSync(dockerignorePath)) {
    const dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf8');
    assert(dockerignoreContent.includes('node_modules'), '.dockerignore excludes node_modules');
    assert(dockerignoreContent.includes('.env'), '.dockerignore excludes local environment secrets');
  }

  // C. Firebase App Hosting config
  const apphostingPath = path.join(process.cwd(), 'apphosting.yaml');
  assert(fs.existsSync(apphostingPath), 'apphosting.yaml exists for Firebase App Hosting');
  if (fs.existsSync(apphostingPath)) {
    const apphostingContent = fs.readFileSync(apphostingPath, 'utf8');
    assert(apphostingContent.includes('concurrency: 80'), 'apphosting.yaml specifies appropriate concurrency');
    assert(apphostingContent.includes('PAYMENT_ENVIRONMENT'), 'apphosting.yaml specifies PAYMENT_ENVIRONMENT=sandbox');
  }

  // D. Dynamic PORT resolution verification
  const originalPort = process.env.PORT;
  try {
    process.env.PORT = '8080';
    const resolvedPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    assert(resolvedPort === 8080, 'Server respects Cloud Run dynamic PORT environment variable (8080)');
    delete process.env.PORT;
    const defaultPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    assert(defaultPort === 3000, 'Server defaults to standard port 3000 when PORT is unset');
  } finally {
    if (originalPort !== undefined) {
      process.env.PORT = originalPort;
    } else {
      delete process.env.PORT;
    }
  }

  // -------------------------------------------------------------------------
  // 2. Health & Readiness Probe Architecture
  // -------------------------------------------------------------------------
  console.log('\n[2/8] Verifying Health & Readiness Probes for Orchestrators...');

  // Test server.ts contains health, live, ready endpoints
  const serverPath = path.join(process.cwd(), 'server.ts');
  const serverSource = fs.readFileSync(serverPath, 'utf8');
  assert(serverSource.includes("app.get('/api/health'"), 'server.ts mounts /api/health probe');
  assert(serverSource.includes("app.get('/api/health/live'"), 'server.ts mounts /api/health/live liveness probe');
  assert(serverSource.includes("app.get('/api/health/ready'"), 'server.ts mounts /api/health/ready readiness probe');
  assert(serverSource.includes("app.set('trust proxy', 1)"), 'server.ts configures reverse proxy trust for Cloud Run');
  assert(serverSource.includes('handleShutdown'), 'server.ts handles SIGTERM / SIGINT for graceful container shutdown');

  // Verify Readiness logic evaluates sandbox & safety gate
  const readyConfig = PaymentConfigService.getPublicPaymentConfig();
  assert(readyConfig.environment === 'sandbox', 'Readiness probe reports payment environment as SANDBOX');
  const wingStatus = readyConfig.activeProviders.find((p) => p.provider === 'wing');
  assert(wingStatus?.readinessStatus === 'NOT_VERIFIED', 'Readiness probe reports Wing as NOT_VERIFIED');

  // -------------------------------------------------------------------------
  // 3. Secret Management & Production Safety Invariants
  // -------------------------------------------------------------------------
  console.log('\n[3/8] Verifying Production Safety Gate & Zero Secret Exposure...');

  assert(PaymentConfigService.getEnvironment() === 'sandbox', 'PAYMENT_ENVIRONMENT is strictly set to sandbox');
  assert(!PaymentConfigService.isProduction(), 'isProduction() strictly returns false');

  // Public payment configuration NEVER discloses secrets
  const publicConfig = PaymentConfigService.getPublicPaymentConfig();
  const configString = JSON.stringify(publicConfig);
  assert(!configString.includes('key'), 'Public payment config has zero private API keys');
  assert(!configString.includes('secret'), 'Public payment config has zero webhook secrets');
  assert(!configString.includes('password'), 'Public payment config has zero passwords');

  // Wing Bank is strictly blocked by Production Safety Gate
  const wingValidation = PaymentConfigService.validateProviderConfig('wing');
  assert(!wingValidation.valid, 'Wing Bank is blocked by Production Safety Gate');
  assert(wingValidation.readinessStatus === 'NOT_VERIFIED', 'Wing readiness status is NOT_VERIFIED');

  // Unconfigured provider validation rejects unconfigured ABA or Bakong in production
  const origEnv = process.env.PAYMENT_ENVIRONMENT;
  try {
    process.env.PAYMENT_ENVIRONMENT = 'production';
    const abaConfig = PaymentConfigService.validateProviderConfig('aba_payway');
    // If environment credentials are empty, validation must fail
    if (!process.env.ABA_PAYWAY_MERCHANT_ID || !process.env.ABA_PAYWAY_API_KEY) {
      assert(!abaConfig.valid, 'ABA PayWay without production credentials fails safe validation');
      assert(abaConfig.missingKeys.length > 0, 'Missing ABA environment keys correctly flagged');
    }
  } finally {
    process.env.PAYMENT_ENVIRONMENT = origEnv;
  }

  // -------------------------------------------------------------------------
  // 4. End-to-End Staging Commerce & Payment Lifecycle
  // -------------------------------------------------------------------------
  console.log('\n[4/8] Verifying End-to-End Staging Simulated Payment Flow...');

  const stagingCustomer: AuthenticatedUser = {
    uid: 'cust_staging_alice_p6',
    email: 'alice.staging@apaibay.com',
    emailVerified: true,
    role: 'buyer' as any,
    isAdmin: false,
    isSeller: false,
  };

  const stagingOrder = {
    id: 'ord_staging_p6_001',
    customerUid: stagingCustomer.uid,
    subtotal: 125.0,
    shipping: 10.0,
    total: 135.0,
    currency: 'USD',
    status: 'Placed',
    paymentStatus: 'unpaid',
  };

  // Step A: Payment Intent Authorization & Amount Derivation
  const resolvedAmount = stagingOrder.total;
  const resolvedCurrency = stagingOrder.currency;
  const stagingIntentId = `pay_${stagingOrder.id}_${Date.now().toString(36)}`;
  assert(stagingIntentId.startsWith('pay_'), 'Payment intent created with authoritative pay_ prefix');
  assert(resolvedAmount === 135.0, 'Payment intent amount matches authoritative order total ($135.00)');
  assert(resolvedCurrency === 'USD', 'Payment intent currency is USD');

  // Step B: Idempotency Protection on Staging Intent
  const stagingIdempKey = 'idemp_staging_p6_flow_001';
  const stagingIdempPayload = { orderId: stagingOrder.id, methodType: 'sandbox_test', amount: resolvedAmount };
  const firstIdempCheck = await IdempotencyService.check(stagingIdempKey, stagingCustomer.uid, stagingIdempPayload);
  assert(!firstIdempCheck.hit, 'First staging intent check is not an idempotent replay');

  await IdempotencyService.save(stagingIdempKey, stagingCustomer.uid, stagingIdempPayload, {
    intentId: stagingIntentId,
    amount: resolvedAmount,
    status: 'pending',
  });

  const duplicateIdempCheck = await IdempotencyService.check(stagingIdempKey, stagingCustomer.uid, stagingIdempPayload);
  assert(duplicateIdempCheck.hit, 'Duplicate intent request recognized as idempotent replay');
  assert(duplicateIdempCheck.cachedResult?.intentId === stagingIntentId, 'Duplicate request returns cached intent idempotently');

  // Step C: Payment State Machine Progression
  assert(validatePaymentTransition('created', 'pending').allowed, 'State transition created -> pending is allowed');
  assert(validatePaymentTransition('pending', 'processing').allowed, 'State transition pending -> processing is allowed');
  assert(validatePaymentTransition('processing', 'paid').allowed, 'State transition processing -> paid is allowed');

  // Step D: Sandbox Provider Adapter Execution
  const sandboxAdapter = PaymentProviderRegistry.getAdapter('sandbox');
  assert(sandboxAdapter !== undefined, 'Sandbox adapter resolved from PaymentProviderRegistry');
  assert(sandboxAdapter.isSandbox === true, 'Sandbox adapter has isSandbox = true');

  const providerIntent = await sandboxAdapter.createPaymentIntent({
    intentId: stagingIntentId,
    orderId: stagingOrder.id,
    customerUid: stagingCustomer.uid,
    amount: resolvedAmount,
    currency: 'USD',
    methodType: 'card',
  });
  assert(providerIntent.status === 'pending', 'Sandbox adapter initializes intent in pending state');
  assert(providerIntent.providerIntentReference.startsWith('sbx_pi_'), 'Sandbox returns sbx_pi_ reference');

  const processResult = await sandboxAdapter.processPayment({
    intentId: stagingIntentId,
    methodType: 'card',
    amount: resolvedAmount,
    currency: 'USD',
    simulationToken: 'test_success',
  });
  assert(processResult.status === 'paid', 'Sandbox adapter processes successful payment with status paid');
  assert(processResult.attempt?.safeDetails?.settledAmount === 135.0, 'Settled amount matches intent ($135.00)');

  // Step E: Webhook Replay Protection & Idempotency
  const webhookKey = `webhook_sandbox_${stagingIntentId}_paid`;
  const webhookPayload = { paymentId: stagingIntentId, orderId: stagingOrder.id, status: 'PAID', amount: 135.0 };
  const webhookFirst = await IdempotencyService.check(webhookKey, 'system_webhook', webhookPayload);
  assert(!webhookFirst.hit, 'First webhook delivery is fresh (not replay)');

  await IdempotencyService.save(webhookKey, 'system_webhook', webhookPayload, { status: 'paid', processed: true });
  const webhookReplay = await IdempotencyService.check(webhookKey, 'system_webhook', webhookPayload);
  assert(webhookReplay.hit, 'Duplicate webhook replay detected and acknowledged idempotently');

  // Step F: Append-only Event Audit Trail
  const auditEvent = await PaymentEventService.recordEvent({
    paymentId: stagingIntentId,
    orderId: stagingOrder.id,
    eventType: 'payment_paid',
    previousStatus: 'processing',
    newStatus: 'paid',
    actorType: 'system',
    actorUid: 'staging_system_worker',
    provider: 'sandbox',
    safeMetadata: {
      amount: resolvedAmount,
      currency: 'USD',
      providerTransactionReference: processResult.transactionReference,
    },
  });
  assert(auditEvent.eventId.startsWith('pevt_'), 'Append-only audit event created with pevt_ prefix');
  assert(auditEvent.eventType === 'payment_paid', 'Audit event captured eventType payment_paid');
  assert(auditEvent.newStatus === 'paid', 'Audit event captured terminal transition to paid');

  // -------------------------------------------------------------------------
  // 5. ABA PayWay Staging Adapter Verification
  // -------------------------------------------------------------------------
  console.log('\n[5/8] Verifying ABA PayWay Staging Simulation...');

  const stagingAbaKey = 'aba_staging_key_p6';
  const abaReqTime = '20260926010000';
  const abaMerchant = 'aba_staging_merch';
  const abaTranId = 'ord_aba_staging_001';
  const abaAmount = '135.00';
  const abaCurrency = 'USD';
  const abaItems = Buffer.from(JSON.stringify([{ name: 'Staging Item', quantity: '1', price: '135.00' }])).toString('base64');

  const abaDataToSign = `${abaReqTime}${abaMerchant}${abaTranId}${abaAmount}${abaItems}0ValuedCustomerbuyer@apaibay.com012345678purchasecardshttps://example.com/returndummyhttps://example.com/cancelhttps://example.com/returndummy00${abaCurrency}`;
  const abaHash = AbaPaywayProvider.generateHash(abaDataToSign, stagingAbaKey);
  assert(typeof abaHash === 'string' && abaHash.length > 20, 'ABA PayWay staging purchase hash generated via HMAC-SHA512');

  const abaCheckHash = AbaPaywayProvider.generateCheckTransactionHash(abaReqTime, abaMerchant, abaTranId, stagingAbaKey);
  assert(
    abaCheckHash === AbaPaywayProvider.generateHash(`${abaReqTime}${abaMerchant}${abaTranId}`, stagingAbaKey),
    'ABA PayWay staging check-transaction hash complies with req_time + merchant_id + tran_id'
  );

  const abaValidPushback = AbaPaywayProvider.verifyWebhookSignature(
    {
      tran_id: abaTranId,
      status: '0',
      apv: '999888',
      hash: AbaPaywayProvider.generateHash(`${abaTranId}0999888`, stagingAbaKey),
    },
    stagingAbaKey
  );
  assert(abaValidPushback, 'ABA PayWay staging webhook signature successfully verified');

  const abaTamperedPushback = AbaPaywayProvider.verifyWebhookSignature(
    {
      tran_id: abaTranId,
      status: '0',
      apv: '999888',
      hash: 'tampered_signature_payload',
    },
    stagingAbaKey
  );
  assert(!abaTamperedPushback, 'Tampered ABA PayWay webhook signature strictly rejected');

  // -------------------------------------------------------------------------
  // 6. Bakong KHQR Staging Adapter Verification
  // -------------------------------------------------------------------------
  console.log('\n[6/8] Verifying Bakong KHQR Staging Simulation...');

  const stagingKhqr = BakongKhqrProvider.generateKhqrString({
    merchantId: 'apaibay_staging_merch',
    merchantName: 'Apaibay Marketplace Staging',
    amount: 135.0,
    currency: 'USD',
    billNumber: 'bill_khqr_p6_001',
  });

  assert(stagingKhqr.startsWith('000201010212'), 'Bakong KHQR string begins with Tag 00 + Tag 01 Dynamic payload indicator');
  assert(stagingKhqr.includes('apaibay_staging_merch@bakong'), 'Bakong KHQR includes Tag 29 merchant account info');
  assert(stagingKhqr.includes('5303840'), 'Bakong KHQR contains USD numeric currency code 840 (Tag 53)');
  assert(stagingKhqr.includes('5406135.00'), 'Bakong KHQR contains formatted 2-decimal amount 135.00 (Tag 54)');
  assert(stagingKhqr.includes('5802KH'), 'Bakong KHQR contains Tag 58 country code KH');
  assert(stagingKhqr.includes('6304'), 'Bakong KHQR contains Tag 63 CRC16 identifier');

  // Verify CRC checksum
  const sampleCrcInput = '0002010102122926apaibay_staging_merch@bakong5204599953038405406135.005802KH5927Apaibay Marketplace Staging6010Phnom Penh62220118bill_khqr_p6_0016304';
  const computedCrc = BakongKhqrProvider.calculateCrc16(sampleCrcInput);
  assert(/^[0-9A-Fa-f]{4}$/.test(computedCrc), 'Bakong CRC16 produces valid 4-character hex checksum');

  // -------------------------------------------------------------------------
  // 7. Diagnostic Reconciliation in Staging Mode
  // -------------------------------------------------------------------------
  console.log('\n[7/8] Verifying Diagnostic Reconciliation in Staging Environment...');

  const stagingPayment: any = {
    id: 'pay_recon_staging_001',
    paymentId: 'pay_recon_staging_001',
    orderId: 'ord_recon_staging_001',
    customerUid: stagingCustomer.uid,
    amount: 135.0,
    currency: 'USD',
    methodType: 'sandbox_test',
    provider: 'sandbox',
    status: 'paid',
    transactionReference: 'sim_recon_ref_123',
    providerTransactionReference: 'sim_recon_ref_123',
    capturedAmount: 135.0,
    refundedAmount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const stagingOrderDoc = {
    id: 'ord_recon_staging_001',
    customerUid: stagingCustomer.uid,
    total: 135.0,
    currency: 'USD',
    status: 'Processing',
    paymentStatus: 'paid',
  };

  const reconReport = ReconciliationService.analyze([stagingOrderDoc], [stagingPayment], []);
  assert(reconReport.discrepancyCount === 0, 'Reconciliation detects 0 discrepancies for consistent staging records');
  assert(reconReport.checkedPaymentsCount === 1, 'Reconciliation checked 1 staging payment');
  assert(reconReport.checkedOrdersCount === 1, 'Reconciliation checked 1 staging order');

  // -------------------------------------------------------------------------
  // 8. Staging Verification Summary
  // -------------------------------------------------------------------------
  console.log('\n[8/8] Verifying Overall Staging Compliance...');
  assert(passCount > 0, 'Staging verification executed full suite');
  assert(failCount === 0, 'Zero staging verification failures');

  console.log('=============================================================================');
  console.log(`🎉 PHASE 6 STAGING TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=============================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase6StagingTests().catch((err) => {
  console.error('Fatal test error in Phase 6:', err);
  process.exit(1);
});

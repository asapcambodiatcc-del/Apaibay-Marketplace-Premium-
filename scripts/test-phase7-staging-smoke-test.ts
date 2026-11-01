import fs from 'fs';
import path from 'path';
import http from 'http';
import { PaymentConfigService } from '../server/payment/paymentConfig';
import { PaymentProviderRegistry } from '../server/payment/paymentProviderRegistry';
import { AbaPaywayProvider } from '../server/payment/providers/abaPaywayProvider';
import { BakongKhqrProvider } from '../server/payment/providers/bakongKhqrProvider';
import { WingProvider } from '../server/payment/providers/wingProvider';
import { WebhookService } from '../server/payment/webhookService';
import { IdempotencyService } from '../server/payment/idempotencyService';
import { ReconciliationService } from '../server/payment/reconciliationService';
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

function makeHttpRequest(options: http.RequestOptions, postData?: string): Promise<{ statusCode: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          body: data,
          headers: res.headers,
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runPhase7SmokeTests() {
  console.log('=============================================================================');
  console.log('🚀 APAIBAY PHASE 7: STAGING DEPLOYMENT READINESS & SMOKE TEST SUITE');
  console.log('=============================================================================');

  // -------------------------------------------------------------------------
  // 1. Project Configuration & Cloud Identity Verification
  // -------------------------------------------------------------------------
  console.log('\n[1/7] Verifying Firebase Project & Database Identity...');
  const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
  assert(fs.existsSync(firebaseConfigPath), 'firebase-applet-config.json is present');
  const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));

  assert(firebaseConfig.projectId === 'apaibay-marketplace-premium', 'Deployment target is strictly apaibay-marketplace-premium');
  assert(
    firebaseConfig.firestoreDatabaseId === 'ai-studio-apaibaymarketpla-99b738bb-1596-4812-bdf8-877c3a04a892',
    'Firestore Database ID matches designated production instance'
  );
  assert(
    firebaseConfig.authDomain === 'apaibay-marketplace-premium.firebaseapp.com',
    'Auth domain targets apaibay-marketplace-premium.firebaseapp.com'
  );

  // -------------------------------------------------------------------------
  // 2. Production Build Artifact Integrity
  // -------------------------------------------------------------------------
  console.log('\n[2/7] Verifying Production Build Artifacts...');
  const distHtmlPath = path.join(process.cwd(), 'dist', 'index.html');
  const distServerPath = path.join(process.cwd(), 'dist', 'server.cjs');

  assert(fs.existsSync(distHtmlPath), 'dist/index.html frontend SPA build exists');
  assert(fs.existsSync(distServerPath), 'dist/server.cjs bundled server exists');

  const serverStat = fs.statSync(distServerPath);
  assert(serverStat.size > 50000, `dist/server.cjs is non-empty and bundled (${serverStat.size} bytes)`);

  // Verify non-root and safety in Dockerfile
  const dockerfilePath = path.join(process.cwd(), 'Dockerfile');
  assert(fs.existsSync(dockerfilePath), 'Dockerfile exists');
  const dockerContent = fs.readFileSync(dockerfilePath, 'utf8');
  assert(dockerContent.includes('USER node'), 'Dockerfile runs as non-root node user');
  assert(dockerContent.includes('EXPOSE 3000'), 'Dockerfile exposes port 3000');
  assert(!dockerContent.includes('.env'), 'Dockerfile does not copy secret .env files');

  // -------------------------------------------------------------------------
  // 3. Secret Management & Production Safety Gate Audit
  // -------------------------------------------------------------------------
  console.log('\n[3/7] Verifying Secret Safety & Safety Gate Enforcement...');
  const publicConfig = PaymentConfigService.getPublicPaymentConfig();

  assert(publicConfig.environment === 'sandbox', 'PAYMENT_ENVIRONMENT is set to sandbox');
  assert(PaymentConfigService.isProduction() === false, 'PaymentConfigService.isProduction() is strictly FALSE');
  assert(PaymentConfigService.getProviderReadiness('wing') === 'NOT_VERIFIED', 'Wing readiness status is NOT_VERIFIED');

  // Verify production activation fails closed without credentials
  const originalEnv = process.env.PAYMENT_ENVIRONMENT;
  try {
    process.env.PAYMENT_ENVIRONMENT = 'production';
    delete process.env.ABA_PAYWAY_API_KEY;
    delete process.env.ABA_PAYWAY_MERCHANT_ID;
    assert(PaymentConfigService.isProduction() === true, 'PAYMENT_ENVIRONMENT reflects production flag when set');
    assert(
      PaymentConfigService.isProviderConfigured('aba_payway') === false,
      'ABA PayWay is NOT configured when merchant credentials absent in production'
    );
    assert(
      PaymentConfigService.isProviderConfigured('khqr') === false,
      'Bakong KHQR is NOT configured when API key absent in production'
    );
    assert(
      PaymentConfigService.isProviderConfigured('wing') === false,
      'Wing Bank is permanently blocked in production'
    );
  } finally {
    if (originalEnv !== undefined) {
      process.env.PAYMENT_ENVIRONMENT = originalEnv;
    } else {
      process.env.PAYMENT_ENVIRONMENT = 'sandbox';
    }
  }

  // -------------------------------------------------------------------------
  // 4. Live Local HTTP / REST API Smoke Tests against running server
  // -------------------------------------------------------------------------
  console.log('\n[4/7] Performing Live Local Server Health & Probe Smoke Tests...');

  try {
    // A. GET /api/health
    const healthRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/health',
      method: 'GET',
    });
    assert(healthRes.statusCode === 200, 'GET /api/health returns HTTP 200 OK');
    const healthJson = JSON.parse(healthRes.body);
    assert(healthJson.status === 'ok', 'GET /api/health returns status "ok"');
    assert(healthJson.service === 'apaibay-commerce-backend', 'GET /api/health identifies service apaibay-commerce-backend');

    // B. GET /api/health/live
    const liveRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/health/live',
      method: 'GET',
    });
    assert(liveRes.statusCode === 200, 'GET /api/health/live returns HTTP 200 OK');
    const liveJson = JSON.parse(liveRes.body);
    assert(liveJson.status === 'alive', 'GET /api/health/live returns status "alive"');

    // C. GET /api/health/ready
    const readyRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/health/ready',
      method: 'GET',
    });
    assert(readyRes.statusCode === 200, 'GET /api/health/ready returns HTTP 200 OK');
    const readyJson = JSON.parse(readyRes.body);
    assert(readyJson.status === 'ready', 'GET /api/health/ready returns status "ready"');
    assert(readyJson.payment.environment === 'sandbox', 'Ready probe confirms sandbox isolation');
    assert(readyJson.payment.safetyGateActive === true, 'Ready probe confirms safety gate is active');
    assert(readyJson.payment.isProduction === false, 'Ready probe confirms isProduction=false');
  } catch (err: any) {
    assert(false, 'Live HTTP smoke test connection failed', err.message);
  }

  // -------------------------------------------------------------------------
  // 5. Provider Status & Wing Block Verification
  // -------------------------------------------------------------------------
  console.log('\n[5/7] Verifying Gateway Provider Registry & Wing Blockade...');
  const wingAdapter = PaymentProviderRegistry.getAdapter('wing');
  assert(wingAdapter !== null, 'Wing provider adapter registered in registry');
  assert(
    PaymentConfigService.getProviderReadiness('wing') === 'NOT_VERIFIED',
    'Wing readiness status is strictly NOT_VERIFIED'
  );
  assert(
    PaymentConfigService.isProviderConfigured('wing') === false,
    'Wing isProviderConfigured() is false'
  );

  const abaAdapter = PaymentProviderRegistry.getAdapter('aba_payway');
  assert(abaAdapter !== null, 'ABA provider adapter registered in registry');
  assert(
    PaymentConfigService.getProviderReadiness('aba_payway') === 'DOCUMENTATION_VERIFIED_PENDING_MERCHANT',
    'ABA status is DOCUMENTATION_VERIFIED_PENDING_MERCHANT'
  );

  const khqrAdapter = PaymentProviderRegistry.getAdapter('khqr');
  assert(khqrAdapter !== null, 'Bakong KHQR provider adapter registered in registry');
  assert(
    PaymentConfigService.getProviderReadiness('khqr') === 'DOCUMENTATION_VERIFIED_PENDING_MERCHANT',
    'KHQR status is DOCUMENTATION_VERIFIED_PENDING_MERCHANT'
  );

  const sandboxAdapter = PaymentProviderRegistry.getAdapter('sandbox');
  assert(sandboxAdapter !== null, 'Sandbox provider adapter registered in registry');
  assert(
    PaymentConfigService.getProviderReadiness('sandbox') === 'PRODUCTION_READY',
    'Sandbox provider is PRODUCTION_READY for sandbox validation'
  );

  // -------------------------------------------------------------------------
  // 6. Security & Webhook Guard Smoke Tests
  // -------------------------------------------------------------------------
  console.log('\n[6/7] Performing Webhook Guard & Replay Protection Smoke Tests...');

  // A. Unauthenticated /api/payments/intents rejects unauthorized caller
  try {
    const unauthIntentRes = await makeHttpRequest(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/payments/intents',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      JSON.stringify({ orderId: 'ord_unauth_001', methodType: 'sandbox_checkout' })
    );
    assert(
      unauthIntentRes.statusCode === 401 || unauthIntentRes.statusCode === 403,
      `Unauthenticated /api/payments/intents blocked with status ${unauthIntentRes.statusCode}`
    );
  } catch (err: any) {
    assert(false, 'Unauthenticated intent test failed', err.message);
  }

  // B. Webhook signature rejection with invalid signature
  try {
    const invalidWebhookRes = await makeHttpRequest(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/payments/webhooks/aba_payway',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payway-Signature': 'invalid_forged_signature_000000',
        },
      },
      JSON.stringify({ tran_id: 'TXN-FORGED-001', status: '0', apv: '123456' })
    );
    assert(
      invalidWebhookRes.statusCode === 400 || invalidWebhookRes.statusCode === 401,
      `Forged webhook rejected with status ${invalidWebhookRes.statusCode}`
    );
  } catch (err: any) {
    assert(false, 'Forged webhook test failed', err.message);
  }

  // C. Idempotency replay check
  const testIdempotencyKey = 'phase7_staging_smoke_key_' + Date.now();
  const testIdempUser = 'usr_smoke_001';
  const testIdempPayload = { paymentId: 'pay_smoke_001', amount: 50.0 };
  const firstIdempCheck = await IdempotencyService.check(testIdempotencyKey, testIdempUser, testIdempPayload);
  assert(firstIdempCheck.hit === false, 'First attempt with idempotency key is fresh');
  await IdempotencyService.save(testIdempotencyKey, testIdempUser, testIdempPayload, {
    status: 'processed',
    result: { paymentId: 'pay_smoke_001' },
  });
  const secondIdempCheck = await IdempotencyService.check(testIdempotencyKey, testIdempUser, testIdempPayload);
  assert(secondIdempCheck.hit === true, 'Replayed idempotency key is correctly identified as cached');
  assert(secondIdempCheck.cachedResult?.result.paymentId === 'pay_smoke_001', 'Cached payload preserved');

  // -------------------------------------------------------------------------
  // 7. Staging Financial Reconciliation Smoke Test
  // -------------------------------------------------------------------------
  console.log('\n[7/7] Performing Staging Financial Reconciliation Smoke Test...');
  const stagingReconPayments = [
    {
      id: 'pay_p7_smoke_001',
      orderId: 'ord_p7_smoke_001',
      buyerUid: 'usr_buyer_smoke',
      amount: 45.0,
      currency: 'USD',
      methodType: 'sandbox_checkout',
      status: 'paid',
      idempotencyKey: 'idemp_p7_001',
      transactionReference: 'TXN-P7-001',
      providerTransactionReference: 'TXN-P7-001',
      createdAt: '2026-09-26T00:00:00Z',
      updatedAt: '2026-09-26T00:01:00Z',
    },
  ];
  const stagingReconOrders = [
    {
      id: 'ord_p7_smoke_001',
      total: 45.0,
      totalAmount: 45.0,
      currency: 'USD',
      paymentStatus: 'paid' as const,
      orderStatus: 'Processing' as const,
    },
  ];
  const reconResult = ReconciliationService.analyze(stagingReconOrders, stagingReconPayments);
  assert(reconResult.discrepancyCount === 0, 'Reconciliation detects 0 discrepancies on matched staging payment/order');
  assert(reconResult.checkedOrdersCount === 1, 'Reconciliation checked 1 order');
  assert(reconResult.checkedPaymentsCount === 1, 'Reconciliation checked 1 payment');

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('=============================================================================');
  console.log(`Phase 7 Smoke Tests Finished: ${passCount} Passed, ${failCount} Failed`);
  console.log('=============================================================================');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase7SmokeTests().catch((err) => {
  console.error('Fatal error during Phase 7 smoke test suite:', err);
  process.exit(1);
});

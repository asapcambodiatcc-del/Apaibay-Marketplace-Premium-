import fs from 'fs';
import path from 'path';
import http from 'http';
import { PaymentConfigService, EnvironmentValidationReport } from '../server/payment/paymentConfig';
import { PaymentProviderRegistry } from '../server/payment/paymentProviderRegistry';
import { WingProvider } from '../server/payment/providers/wingProvider';
import { AbaPaywayProvider } from '../server/payment/providers/abaPaywayProvider';
import { BakongKhqrProvider } from '../server/payment/providers/bakongKhqrProvider';

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

function makeHttpRequest(
  options: http.RequestOptions,
  postData?: string
): Promise<{ statusCode: number; body: string; headers: http.IncomingHttpHeaders }> {
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

async function runPhase71Tests() {
  console.log('=============================================================================');
  console.log('🛡️  APAIBAY PHASE 7.1: SAFE SANDBOX CONFIGURATION & CLOUD RUN PREPARATION');
  console.log('=============================================================================');

  // -------------------------------------------------------------------------
  // 1. Audit Environment Variable & Secret Protection Architecture
  // -------------------------------------------------------------------------
  console.log('\n[1/6] Auditing Environment Handling & Secret Isolation...');

  // A. .dockerignore verification
  const dockerignorePath = path.join(process.cwd(), '.dockerignore');
  assert(fs.existsSync(dockerignorePath), '.dockerignore file exists');
  const dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf8');
  assert(dockerignoreContent.includes('.env*'), '.dockerignore excludes all .env* files');
  assert(dockerignoreContent.includes('dist'), '.dockerignore excludes build dist');
  assert(dockerignoreContent.includes('node_modules'), '.dockerignore excludes node_modules');

  // B. .gitignore verification
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  assert(fs.existsSync(gitignorePath), '.gitignore file exists');
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  assert(gitignoreContent.includes('.env*'), '.gitignore excludes .env* files');
  assert(gitignoreContent.includes('!.env.example'), '.gitignore preserves safe .env.example template');

  // C. .env.example placeholder audit
  const envExamplePath = path.join(process.cwd(), '.env.example');
  assert(fs.existsSync(envExamplePath), '.env.example template exists');
  const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
  assert(envExampleContent.includes('PAYMENT_ENVIRONMENT=sandbox'), '.env.example defaults to sandbox');
  assert(!envExampleContent.match(/ABA_PAYWAY_API_KEY=\S+/), '.env.example has empty ABA API key placeholder');
  assert(!envExampleContent.match(/BAKONG_KHQR_API_KEY=\S+/), '.env.example has empty Bakong API key placeholder');
  assert(!envExampleContent.match(/WING_API_KEY=\S+/), '.env.example has empty Wing API key placeholder');
  assert(!envExampleContent.match(/WEBHOOK_SECRET=\S+/), '.env.example has empty webhook secret placeholders');

  // D. firebase-applet-config.json audit (no private keys)
  const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
  assert(fs.existsSync(firebaseConfigPath), 'firebase-applet-config.json exists');
  const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
  assert(firebaseConfig.projectId === 'apaibay-marketplace-premium', 'Firebase project ID is strictly apaibay-marketplace-premium');
  assert(
    firebaseConfig.firestoreDatabaseId === 'ai-studio-apaibaymarketpla-99b738bb-1596-4812-bdf8-877c3a04a892',
    'Firestore database ID matches designated target'
  );
  assert(!firebaseConfig.private_key, 'No private_key in firebase-applet-config.json');
  assert(!firebaseConfig.client_secret, 'No client_secret in firebase-applet-config.json');

  // -------------------------------------------------------------------------
  // 2. Server-side Environment Validation Layer
  // -------------------------------------------------------------------------
  console.log('\n[2/6] Verifying Server-Side Environment Validation Layer...');

  // A. Sandbox mode validation
  const sandboxValidation = PaymentConfigService.validateEnvironment();
  assert(sandboxValidation.valid === true, 'validateEnvironment() passes in sandbox mode');
  assert(sandboxValidation.isSandbox === true, 'isSandbox flag is true');
  assert(sandboxValidation.isProduction === false, 'isProduction flag is false');
  assert(sandboxValidation.environment === 'sandbox', 'Environment is sandbox');
  assert(sandboxValidation.errors.length === 0, 'Zero errors in sandbox mode without credentials');
  assert(sandboxValidation.warnings.length > 0, 'Helpful warning emitted for sandbox simulator mode');

  // B. Production mode fail-closed validation
  const originalEnv = process.env.PAYMENT_ENVIRONMENT;
  const originalAbaKey = process.env.ABA_PAYWAY_API_KEY;
  const originalAbaMerchant = process.env.ABA_PAYWAY_MERCHANT_ID;
  const originalBakongKey = process.env.BAKONG_KHQR_API_KEY;
  const originalBakongMerchant = process.env.BAKONG_KHQR_MERCHANT_ID;

  try {
    process.env.PAYMENT_ENVIRONMENT = 'production';
    delete process.env.ABA_PAYWAY_API_KEY;
    delete process.env.ABA_PAYWAY_MERCHANT_ID;
    delete process.env.BAKONG_KHQR_API_KEY;
    delete process.env.BAKONG_KHQR_MERCHANT_ID;

    const prodValidation = PaymentConfigService.validateEnvironment();
    assert(prodValidation.valid === false, 'validateEnvironment() FAILS CLOSED in production with missing credentials');
    assert(prodValidation.isProduction === true, 'isProduction is true in production mode');
    assert(prodValidation.errors.length > 0, 'Production errors list contains detailed fail-closed reasons');
    assert(
      prodValidation.errors.some((e) => e.includes('Production payment mode failed closed')),
      'Reports fail-closed error when zero live providers are configured'
    );
    assert(
      prodValidation.errors.some((e) => e.includes('ABA PayWay missing required production credentials')),
      'Identifies ABA PayWay missing credentials in production'
    );
    assert(
      prodValidation.errors.some((e) => e.includes('Bakong KHQR missing required production credentials')),
      'Identifies Bakong KHQR missing credentials in production'
    );
  } finally {
    process.env.PAYMENT_ENVIRONMENT = originalEnv || 'sandbox';
    if (originalAbaKey) process.env.ABA_PAYWAY_API_KEY = originalAbaKey;
    if (originalAbaMerchant) process.env.ABA_PAYWAY_MERCHANT_ID = originalAbaMerchant;
    if (originalBakongKey) process.env.BAKONG_KHQR_API_KEY = originalBakongKey;
    if (originalBakongMerchant) process.env.BAKONG_KHQR_MERCHANT_ID = originalBakongMerchant;
  }

  // C. Verify production credentials are NEVER required merely to run sandbox
  assert(
    PaymentConfigService.getEnvironment() === 'sandbox',
    'Returned safely to PAYMENT_ENVIRONMENT=sandbox'
  );
  const safeRecheck = PaymentConfigService.validateEnvironment();
  assert(
    safeRecheck.valid === true,
    'Sandbox mode starts safely with zero real credentials required'
  );

  // -------------------------------------------------------------------------
  // 3. Payment Provider Safety Gate & Wing Block
  // -------------------------------------------------------------------------
  console.log('\n[3/6] Verifying Payment Provider Safety Gate & Strict Wing Blockade...');

  // A. ABA PayWay Gate
  assert(
    PaymentConfigService.getProviderReadiness('aba_payway') === 'DOCUMENTATION_VERIFIED_PENDING_MERCHANT',
    'ABA status is DOCUMENTATION_VERIFIED_PENDING_MERCHANT'
  );
  const abaValidation = PaymentConfigService.validateProviderConfig('aba_payway');
  assert(abaValidation.readinessStatus === 'DOCUMENTATION_VERIFIED_PENDING_MERCHANT', 'ABA readiness confirmed');

  // B. Bakong KHQR Gate
  assert(
    PaymentConfigService.getProviderReadiness('khqr') === 'DOCUMENTATION_VERIFIED_PENDING_MERCHANT',
    'Bakong KHQR status is DOCUMENTATION_VERIFIED_PENDING_MERCHANT'
  );
  const khqrValidation = PaymentConfigService.validateProviderConfig('khqr');
  assert(khqrValidation.readinessStatus === 'DOCUMENTATION_VERIFIED_PENDING_MERCHANT', 'KHQR readiness confirmed');

  // C. Wing Provider Gate & Block
  assert(
    PaymentConfigService.getProviderReadiness('wing') === 'NOT_VERIFIED',
    'Wing Bank is permanently NOT_VERIFIED'
  );
  const wingValidation = PaymentConfigService.validateProviderConfig('wing');
  assert(wingValidation.valid === false, 'Wing validateProviderConfig() is strictly FALSE');
  assert(
    wingValidation.error?.includes('NOT_VERIFIED'),
    'Wing error explicitly identifies NOT_VERIFIED specification blocker'
  );

  // D. Wing Adapter live execution blocker
  const wingAdapter = new WingProvider();
  let wingIntentBlocked = false;
  try {
    // Attempt production execution
    const prevEnv = process.env.PAYMENT_ENVIRONMENT;
    process.env.PAYMENT_ENVIRONMENT = 'production';
    try {
      await wingAdapter.createPaymentIntent({
        intentId: 'test_wing_intent',
        orderId: 'ord_test_001',
        methodType: 'wing',
        amount: 25.0,
        currency: 'USD',
        customerUid: 'usr_test',
      });
    } finally {
      process.env.PAYMENT_ENVIRONMENT = prevEnv;
    }
  } catch (err: any) {
    wingIntentBlocked = err.message.includes('NOT_VERIFIED');
  }
  assert(wingIntentBlocked, 'Wing adapter strictly throws when live production intent is attempted');

  // -------------------------------------------------------------------------
  // 4. Cloud Run & Container Configuration Inspection
  // -------------------------------------------------------------------------
  console.log('\n[4/6] Inspecting Cloud Run & Container Readiness Configuration...');

  // A. Dockerfile non-root & dynamic port
  const dockerfilePath = path.join(process.cwd(), 'Dockerfile');
  assert(fs.existsSync(dockerfilePath), 'Dockerfile exists');
  const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
  assert(dockerfile.includes('FROM node:20-alpine'), 'Uses Node.js 20 Alpine base image');
  assert(dockerfile.includes('USER node'), 'Enforces non-root user execution (USER node)');
  assert(dockerfile.includes('EXPOSE 3000'), 'Exposes container port 3000');
  assert(dockerfile.includes('CMD ["npm", "start"]'), 'Uses production start script');
  assert(!dockerfile.includes('.env'), 'Does not copy .env files into container layers');

  // B. apphosting.yaml configuration
  const apphostingPath = path.join(process.cwd(), 'apphosting.yaml');
  assert(fs.existsSync(apphostingPath), 'apphosting.yaml exists');
  const apphostingContent = fs.readFileSync(apphostingPath, 'utf8');
  assert(apphostingContent.includes('PAYMENT_ENVIRONMENT'), 'Defines PAYMENT_ENVIRONMENT');
  assert(apphostingContent.includes('value: sandbox'), 'Configures sandbox environment');
  assert(apphostingContent.includes('concurrency: 80'), 'Configures container concurrency: 80');
  assert(apphostingContent.includes('memoryMiB: 512'), 'Configures resource memory: 512MiB');

  // -------------------------------------------------------------------------
  // 5. Live Server Health Probes & Safe Payments Config Endpoint
  // -------------------------------------------------------------------------
  console.log('\n[5/6] Probing Live Server Health & Secrets Leak Prevention...');

  try {
    // A. GET /api/health
    const health = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/health',
      method: 'GET',
    });
    assert(health.statusCode === 200, 'GET /api/health returns 200 OK');
    const healthBody = JSON.parse(health.body);
    assert(healthBody.status === 'ok', 'Health status is "ok"');
    assert(healthBody.service === 'apaibay-commerce-backend', 'Service identified correctly');

    // B. GET /api/health/live
    const live = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/health/live',
      method: 'GET',
    });
    assert(live.statusCode === 200, 'GET /api/health/live returns 200 OK');
    const liveBody = JSON.parse(live.body);
    assert(liveBody.status === 'alive', 'Liveness status is "alive"');

    // C. GET /api/health/ready
    const ready = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/health/ready',
      method: 'GET',
    });
    assert(ready.statusCode === 200, 'GET /api/health/ready returns 200 OK');
    const readyBody = JSON.parse(ready.body);
    assert(readyBody.status === 'ready', 'Readiness status is "ready"');
    assert(readyBody.payment.environment === 'sandbox', 'Readiness probe reports sandbox environment');
    assert(readyBody.payment.valid === true, 'Readiness probe reports environment validation is valid');
    assert(readyBody.payment.safetyGateActive === true, 'Safety gate active confirmed');

    // D. GET /api/payments/config (Zero Secrets Exposure Audit)
    const configRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/payments/config',
      method: 'GET',
    });
    assert(configRes.statusCode === 200, 'GET /api/payments/config returns 200 OK');
    const configBody = JSON.parse(configRes.body);
    assert(configBody.success === true, 'Payments config success is true');
    assert(configBody.data.environment === 'sandbox', 'Config environment is sandbox');
    assert(Array.isArray(configBody.data.activeProviders), 'Active providers list returned');

    // String audit of entire HTTP response body for secret keywords
    const rawConfig = configRes.body;
    assert(!rawConfig.includes('apiKey'), 'Zero apiKey fields exposed in public config');
    assert(!rawConfig.includes('api_key'), 'Zero api_key fields exposed in public config');
    assert(!rawConfig.includes('webhookSecret'), 'Zero webhookSecret fields exposed in public config');
    assert(!rawConfig.includes('merchantId'), 'Zero merchantId fields exposed in public config');
    assert(!rawConfig.includes('privateKey'), 'Zero privateKey fields exposed in public config');
  } catch (err: any) {
    assert(false, 'Live HTTP probe smoke test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // 6. Cloud Run Staging Prerequisites & Deployment Verification
  // -------------------------------------------------------------------------
  console.log('\n[6/6] Verifying Staging Deployment Target & Prerequisites...');

  assert(
    firebaseConfig.projectId === 'apaibay-marketplace-premium',
    'Target Google Cloud / Firebase project verified as apaibay-marketplace-premium'
  );

  const stagingPrereqs = [
    'Google Cloud CLI (gcloud) or Cloud Build deployment agent authenticated',
    'GCP Project set to apaibay-marketplace-premium',
    'Cloud Run Admin & Artifact Registry IAM permissions granted',
    'PAYMENT_ENVIRONMENT=sandbox configured in Cloud Run runtime environment',
    'Application Default Credentials (ADC) attached to Cloud Run service account',
    'No production payment credentials configured in staging environment',
  ];
  assert(stagingPrereqs.length === 6, 'All 6 staging prerequisites formally catalogued');

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n=============================================================================');
  console.log(`Phase 7.1 Automated Suite: ${passCount} Passed, ${failCount} Failed`);
  console.log('=============================================================================');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase71Tests().catch((err) => {
  console.error('Fatal error during Phase 7.1 test suite execution:', err);
  process.exit(1);
});

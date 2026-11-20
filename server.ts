import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import commerceRoutes from './server/routes/commerceRoutes';
import { paymentRoutes } from './server/routes/paymentRoutes';
import adminRoutes from './server/routes/adminRoutes';
import { PaymentConfigService } from './server/payment/paymentConfig';
import { validateKycSecretConfiguration } from './server/commerce/kycService';
import {
  isAdminCredentialsConfigured,
  getAdminDiagnostics,
  getActiveFirebaseEnvironmentReport,
  checkFirebaseReadiness,
} from './server/repositories/serverFirestore';

export function resolveAllowedCorsOrigins(): Set<string> {
  const allowed = new Set<string>();
  const addOrigin = (raw?: string) => {
    if (!raw) return;
    try {
      const parsed = new URL(raw.trim());
      allowed.add(parsed.origin);
    } catch {
      // Ignore invalid origin strings
    }
  };

  addOrigin(process.env.APP_URL);
  const extraOrigins = (process.env.ALLOWED_ORIGINS || '').split(',');
  for (const item of extraOrigins) {
    if (item.trim()) addOrigin(item);
  }
  return allowed;
}

export function isCorsOriginAllowed(origin: string | undefined, isProductionEnv: boolean): boolean {
  if (!origin) return false;
  const allowed = resolveAllowedCorsOrigins();
  if (allowed.has(origin)) {
    return true;
  }
  if (!isProductionEnv) {
    // Allow local dev & sandbox preview origins only outside production
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      return true;
    }
    return true;
  }
  return false;
}

export function buildServerLogSummary(adminDiag: ReturnType<typeof getAdminDiagnostics>) {
  return `AppEnv=${adminDiag.appEnv} Isolated=${adminDiag.isolated} Project=${adminDiag.projectId || '(unconfigured)'} Database=${adminDiag.databaseId || '(unconfigured)'} CredentialsSource=${adminDiag.credentialSource} CredentialState=${adminDiag.credentialState}`;
}

function parseCliServerOptions(argv: string[]): { port?: number; host?: string } {
  let port: number | undefined;
  let host: string | undefined;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      if (Number.isInteger(parsed) && parsed > 0) port = parsed;
    } else if (arg.startsWith('--port=')) {
      const parsed = Number(arg.slice('--port='.length));
      if (Number.isInteger(parsed) && parsed > 0) port = parsed;
    } else if (arg === '--host' && argv[i + 1]) {
      host = argv[++i];
    } else if (arg.startsWith('--host=')) {
      host = arg.slice('--host='.length);
    }
  }
  return { port, host };
}

async function startServer() {
  const app = express();
  const cliOpts = parseCliServerOptions(process.argv);
  const PORT = cliOpts.port ?? (Number(process.env.PORT) || 3000);
  const HOST = cliOpts.host || '0.0.0.0';

  // Cloud Run / Reverse Proxy Configuration
  app.set('trust proxy', 1);

  // Firebase Environment Isolation Gate (Staging cannot connect or fall back to Production)
  const isolationReport = getActiveFirebaseEnvironmentReport();
  if (isolationReport.appEnv === 'staging' && PaymentConfigService.isProduction()) {
    throw new Error('[CRITICAL SAFETY GATE] PAYMENT_ENVIRONMENT=production is strictly forbidden in APP_ENV=staging.');
  }
  if (!isolationReport.valid) {
    const isoMsg = `[CRITICAL ISOLATION GATE] ${isolationReport.violations.join(' | ')}`;
    console.error(isoMsg);
    if (isolationReport.appEnv === 'staging' || process.env.NODE_ENV === 'production') {
      if (process.env.NODE_ENV !== 'test') {
        throw new Error(isoMsg);
      }
    }
  }

  // Server-side Environment Validation
  const envValidation = PaymentConfigService.validateEnvironment();
  if (envValidation.isProduction && !envValidation.valid) {
    const errorMsg = `[CRITICAL SAFETY GATE] Production payment environment startup halted: ${envValidation.errors.join('; ')}`;
    console.error(errorMsg);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(errorMsg);
    }
  } else {
    console.log(`[PaymentConfig] Environment initialized: ${envValidation.environment.toUpperCase()} mode (valid: ${envValidation.valid})`);
  }

  // KYC Document Token Secret Startup Gate
  const kycSecretValidation = validateKycSecretConfiguration();
  if (!kycSecretValidation.valid) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`[CRITICAL SECURITY GATE] ${kycSecretValidation.error}`);
    } else if (process.env.NODE_ENV !== 'test') {
      console.warn(`[SecurityConfig] WARNING: ${kycSecretValidation.error}`);
    }
  }

  const adminDiag = getAdminDiagnostics();
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[FirebaseAdmin] ${buildServerLogSummary(adminDiag)}`);
  }

  // Middleware: 8mb limit scoped strictly to private KYC document uploads, 1mb everywhere else
  app.use('/api/commerce/kyc/documents', express.json({ limit: '8mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Baseline Security Headers (never block AI Studio dev iframe on HTML)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.path.startsWith('/api/')) {
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  // CORS Policy (allowlist-enforced in production/staging; permissive only for local dev/test)
  app.use((req, res, next) => {
    const isProd = process.env.NODE_ENV === 'production';
    const requestOrigin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;

    if (!isProd) {
      res.header('Access-Control-Allow-Origin', requestOrigin || '*');
      res.header('Vary', 'Origin');
    } else if (requestOrigin && isCorsOriginAllowed(requestOrigin, true)) {
      res.header('Access-Control-Allow-Origin', requestOrigin);
      res.header('Vary', 'Origin');
    }

    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,Idempotency-Key');
    if (req.method === 'OPTIONS') {
      if (isProd && requestOrigin && !isCorsOriginAllowed(requestOrigin, true)) {
        res.sendStatus(403);
        return;
      }
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Health and Readiness Endpoints for Cloud Run & Container Orchestrators
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'apaibay-commerce-backend',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/health/live', (req, res) => {
    res.status(200).json({ status: 'alive' });
  });

  app.get('/api/health/ready', async (req, res) => {
    const currentValidation = PaymentConfigService.validateEnvironment();
    const publicConfig = PaymentConfigService.getPublicPaymentConfig();
    const kycCheck = validateKycSecretConfiguration();
    const firebaseAdminDiag = getAdminDiagnostics();
    const adminCredsReady = isAdminCredentialsConfigured();
    const isProd = process.env.NODE_ENV === 'production';
    const strictProbe = isProd || firebaseAdminDiag.appEnv === 'staging' || req.query.strict === 'true';

    const firebaseReadiness = await checkFirebaseReadiness({ timeoutMs: 3000 });

    let overallState: string = firebaseReadiness.state;
    if (firebaseReadiness.ready && !kycCheck.valid) {
      overallState = 'security_config_invalid';
    } else if (firebaseReadiness.ready && !currentValidation.valid) {
      overallState = 'payment_config_invalid';
    }

    const strictReady =
      currentValidation.valid &&
      kycCheck.valid &&
      firebaseReadiness.isolated &&
      firebaseReadiness.ready;

    // In production, staging, or strict mode (?strict=true), fail closed (503) unless isolation + credentials + live probes + KYC secret all succeed.
    // In local development sandbox mode (without ?strict=true), preserve 200 sandbox smoke status while reporting live readiness truthfully.
    const isHttpReady = strictProbe ? strictReady : (currentValidation.valid && firebaseReadiness.isolated);

    res.status(isHttpReady ? 200 : 503).json({
      status: isHttpReady ? 'ready' : 'unhealthy',
      service: 'apaibay-commerce-backend',
      uptimeSeconds: Math.floor(process.uptime()),
      readiness: {
        state: overallState,
        ready: strictReady,
        strictMode: strictProbe,
        checks: {
          isolation: firebaseReadiness.checks.isolation,
          credentials: firebaseReadiness.checks.credentials,
          firebaseConnection: firebaseReadiness.checks.firebaseConnection,
          firestore: firebaseReadiness.checks.firestore,
          storage: firebaseReadiness.checks.storage,
          kycSecret: kycCheck.valid ? (kycCheck.configured ? 'configured' : 'test_fallback') : (kycCheck.configured ? 'invalid' : 'missing'),
          payment: currentValidation.valid ? 'valid' : 'invalid',
        },
        ...(firebaseReadiness.error ? { detail: firebaseReadiness.error } : {}),
      },
      firebaseAdmin: {
        initialized: firebaseAdminDiag.initialized,
        appEnv: firebaseAdminDiag.appEnv,
        isolated: firebaseAdminDiag.isolated,
        projectId: firebaseAdminDiag.projectId,
        databaseId: firebaseAdminDiag.databaseId,
        storageBucket: firebaseAdminDiag.storageBucket,
        credentialSource: firebaseAdminDiag.credentialSource,
        credentialState: firebaseAdminDiag.credentialState,
        credentialsConfigured: adminCredsReady,
        liveVerified: firebaseReadiness.liveVerified,
      },
      security: {
        kycViewTokenSecretConfigured: kycCheck.configured,
        kycViewTokenSecretValid: kycCheck.valid,
      },
      payment: {
        environment: currentValidation.environment,
        isProduction: currentValidation.isProduction,
        safetyGateActive: true,
        valid: currentValidation.valid,
        message: currentValidation.message,
        providers: publicConfig.activeProviders.map((p) => ({
          provider: p.provider,
          readinessStatus: p.readinessStatus,
          isConfigured: p.isConfigured,
        })),
      },
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/commerce', commerceRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/admin', adminRoutes);

  // Vite middleware for development vs static files for production
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    const vitePromise = createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
      },
      appType: 'spa',
    });
    vitePromise.catch((err) => {
      console.error('[ViteDevServer] Failed to initialize Vite middleware:', err);
    });
    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Safe global error handler middleware (prevents leaking internal stack traces in production)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[ServerError] Unhandled error:', err?.message || err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'production' ? 'Internal server error.' : String(err?.message || err),
    });
  });

  // Only start listening if not running in a test harness
  if (process.env.NODE_ENV !== 'test') {
    const server = app.listen(PORT, HOST, () => {
      console.log(`Apaibay Trusted Commerce Server listening on http://${HOST}:${PORT}`);
    });

    // Graceful shutdown handling for Cloud Run / Container SIGTERM & SIGINT
    const handleShutdown = (signal: string) => {
      console.log(`[Server] Received ${signal}. Initiating graceful shutdown...`);
      server.close((err) => {
        if (err) {
          console.error('[Server] Error during graceful shutdown:', err);
          process.exit(1);
        }
        console.log('[Server] Graceful shutdown completed cleanly.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));

    return server;
  }

  return app;
}

export const appPromise = startServer();
export default appPromise;

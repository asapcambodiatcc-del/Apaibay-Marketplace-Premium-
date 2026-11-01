import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import commerceRoutes from './server/routes/commerceRoutes';
import { paymentRoutes } from './server/routes/paymentRoutes';
import { PaymentConfigService } from './server/payment/paymentConfig';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Cloud Run / Reverse Proxy Configuration
  app.set('trust proxy', 1);

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

  // Middleware
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // CORS Headers
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,Idempotency-Key');
    if (req.method === 'OPTIONS') {
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

  app.get('/api/health/ready', (req, res) => {
    const currentValidation = PaymentConfigService.validateEnvironment();
    const publicConfig = PaymentConfigService.getPublicPaymentConfig();
    const isReady = currentValidation.valid;
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'unhealthy',
      service: 'apaibay-commerce-backend',
      uptimeSeconds: Math.floor(process.uptime()),
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

  // Vite middleware for development vs static files for production
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
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
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Apaibay Trusted Commerce Server listening on http://0.0.0.0:${PORT}`);
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

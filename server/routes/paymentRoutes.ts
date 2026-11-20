import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { verifyFirebaseUser } from '../auth/verifyFirebaseUser';
import { PaymentService } from '../payment/paymentService';
import { ReconciliationService } from '../payment/reconciliationService';
import { PaymentEventService } from '../payment/paymentEventService';
import { WebhookService } from '../payment/webhookService';
import { PaymentConfigService } from '../payment/paymentConfig';
import { CryptoPaymentProvider } from '../payment/providers/cryptoProvider';
import { db, doc, getDoc, updateDoc } from '../repositories/serverFirestore';

export const paymentRoutes = Router();

/**
 * GET /api/payments/config
 * Public configuration summary (which providers are active/sandbox).
 * NEVER exposes secrets, API keys, or private merchant credentials.
 */
paymentRoutes.get('/config', (req: Request, res: Response): void => {
  res.json({
    success: true,
    data: PaymentConfigService.getPublicPaymentConfig(),
  });
});

/**
 * POST /api/payments/webhooks/:provider
 * Handles asynchronous server-to-server payment notifications (ABA PayWay, Bakong KHQR, Wing).
 * Cryptographically verifies signatures, enforces idempotency, validates amounts, and advances state machine.
 */
paymentRoutes.post('/webhooks/:provider', async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider } = req.params;
    const result = await WebhookService.handleProviderWebhook(provider, req.body, req.headers);
    res.status(result.statusCode).json(result);
  } catch (err: any) {
    console.error('[WebhookRoute] Internal error processing webhook:', err?.message || 'Unknown error');
    res.status(500).json({
      success: false,
      error: 'Internal server error processing webhook.',
    });
  }
});

/**
 * POST /api/payments/intents
 * Authoritative Payment Intent creation.
 * Resolves amount server-side from order total.
 */
paymentRoutes.post('/intents', verifyFirebaseUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { orderId, methodType, idempotencyKey, safeMetadata } = req.body;
    if (String(methodType || '').toLowerCase() === 'crypto') {
      const rlKey = `intent:${user.uid || req.ip || 'anon'}`;
      if (!checkCryptoRateLimit(rlKey)) {
        res.status(429).json({
          success: false,
          error: { code: 'TOO_MANY_REQUESTS', message: 'Too many crypto payment requests. Please retry in a minute.' },
        });
        return;
      }
    }

    const result = await PaymentService.createPaymentIntent(
      {
        orderId,
        methodType,
        idempotencyKey,
        safeMetadata,
      },
      user
    );

    res.status(201).json({
      success: true,
      data: result.paymentIntent,
      _idempotentReplay: result._idempotentReplay,
    });
  } catch (err: any) {
    const status = err.statusCode || (err.name === 'CommerceError' ? 400 : 500);
    res.status(status).json({
      success: false,
      error: {
        code: err.code || 'PAYMENT_INTENT_CREATION_FAILED',
        message: err.message || 'Failed to create payment intent.',
        details: err.details,
      },
    });
  }
});

/**
 * GET /api/payments/intents/:intentId
 * Fetch payment intent by ID with customer ownership validation.
 */
paymentRoutes.get('/intents/:intentId', verifyFirebaseUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { intentId } = req.params;

    const payment = await PaymentService.getPaymentIntent(intentId, user);
    res.json({
      success: true,
      data: payment,
    });
  } catch (err: any) {
    const status = err.statusCode || 404;
    res.status(status).json({
      success: false,
      error: {
        code: err.code || 'PAYMENT_NOT_FOUND',
        message: err.message || 'Payment intent not found.',
      },
    });
  }
});

/**
 * POST /api/payments/intents/:intentId/confirm
 * Processes payment simulation via Sandbox Provider.
 */
paymentRoutes.post('/intents/:intentId/confirm', verifyFirebaseUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { intentId } = req.params;
    const { simulationToken, safePaymentData } = req.body;

    const result = await PaymentService.confirmPayment(
      intentId,
      { simulationToken, safePaymentData },
      user
    );

    res.json({
      success: result.paymentStatus === 'paid',
      status: result.paymentStatus,
      data: result.payment,
      orderStatus: result.orderStatus,
    });
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({
      success: false,
      error: {
        code: err.code || 'PAYMENT_CONFIRMATION_FAILED',
        message: err.message || 'Failed to confirm payment.',
        details: err.details,
      },
    });
  }
});

/**
 * POST /api/payments/intents/:intentId/action
 * Completes a 3DS / OTP verification challenge simulation.
 */
paymentRoutes.post('/intents/:intentId/action', verifyFirebaseUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { intentId } = req.params;
    const { challengeId, simulationOutcome } = req.body;

    const result = await PaymentService.completeAction(
      intentId,
      { challengeId, simulationOutcome },
      user
    );

    res.json({
      success: result.paymentStatus === 'paid',
      status: result.paymentStatus,
      data: result.payment,
    });
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({
      success: false,
      error: {
        code: err.code || 'ACTION_CONFIRMATION_FAILED',
        message: err.message || 'Failed to complete challenge.',
      },
    });
  }
});

/**
 * POST /api/payments/intents/:intentId/cancel
 * Cancels a pending payment intent.
 */
paymentRoutes.post('/intents/:intentId/cancel', verifyFirebaseUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { intentId } = req.params;

    const result = await PaymentService.cancelPayment(intentId, user);
    res.json({
      success: true,
      data: result.payment,
      status: result.status,
    });
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({
      success: false,
      error: {
        code: err.code || 'PAYMENT_CANCELLATION_FAILED',
        message: err.message || 'Failed to cancel payment.',
      },
    });
  }
});

/**
 * POST /api/payments/:paymentId/refund
 * Issues a refund for a paid transaction (Admin only).
 */
paymentRoutes.post('/:paymentId/refund', verifyFirebaseUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { paymentId } = req.params;
    const { amount, reason } = req.body;

    const result = await PaymentService.refundPayment(paymentId, amount, reason, user);
    res.json({
      success: true,
      data: result.payment,
      status: result.status,
    });
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({
      success: false,
      error: {
        code: err.code || 'REFUND_FAILED',
        message: err.message || 'Failed to issue refund.',
      },
    });
  }
});

/**
 * GET /api/payments/reconcile/report
 * Runs payment reconciliation scan and returns discrepancy report (Admin only).
 */
paymentRoutes.get('/reconcile/report', verifyFirebaseUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    if (!user.isAdmin) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Reconciliation reports are restricted to administrators.' },
      });
      return;
    }

    const report = await ReconciliationService.reconcile();
    res.json({
      success: true,
      data: report,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'RECONCILIATION_FAILED',
        message: err.message || 'Failed to run reconciliation scan.',
      },
    });
  }
});

/**
 * GET /api/payments/events/:paymentId
 * Retrieves append-only audit trail for a specific payment (Owner or Admin).
 */
paymentRoutes.get('/events/:paymentId', verifyFirebaseUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { paymentId } = req.params;

    // Verify ownership
    const payment = await PaymentService.getPaymentIntent(paymentId, user);
    if (payment.customerUid !== user.uid && !user.isAdmin) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied.' },
      });
      return;
    }

    const events = await PaymentEventService.getEventsForPayment(paymentId);
    res.json({
      success: true,
      data: events,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: {
        code: err.code || 'FETCH_EVENTS_FAILED',
        message: err.message || 'Failed to fetch payment events.',
      },
    });
  }
});

// In-memory rate limiter for crypto payment status/estimate/simulation (15 requests/min per UID/IP)
const cryptoRateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkCryptoRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = cryptoRateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    cryptoRateLimitMap.set(key, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 15) return false;
  entry.count++;
  return true;
}

export function resetCryptoRateLimitForTesting(): void {
  if (process.env.NODE_ENV === 'test') {
    cryptoRateLimitMap.clear();
  }
}

/**
 * GET /api/payments/crypto/options
 * Returns supported cryptocurrency options (USDT BEP-20, USDT TRC-20, USDC Solana, BNB BSC).
 */
paymentRoutes.get('/crypto/options', (_req: Request, res: Response): void => {
  res.json({
    success: true,
    data: CryptoPaymentProvider.getSupportedOptions(),
  });
});

/**
 * POST /api/payments/crypto/estimate
 * Authoritative rate calculation for order total in USD.
 */
paymentRoutes.post('/crypto/estimate', verifyFirebaseUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const rateKey = `estimate:${req.user!.uid || req.ip || 'anon'}`;
    if (!checkCryptoRateLimit(rateKey)) {
      res.status(429).json({
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded for crypto estimate.' },
      });
      return;
    }

    const { orderId, cryptoKey, amount } = req.body;
    let targetAmount = 0;

    if (orderId) {
      const orderRef = doc(db, 'orders', orderId);
      const snap = await getDoc(orderRef);
      if (!snap.exists()) {
        res.status(404).json({ success: false, error: 'Order not found' });
        return;
      }
      targetAmount = (snap.data() as any).total;
    } else if (typeof amount === 'number' && amount > 0) {
      targetAmount = amount;
    } else {
      res.status(400).json({ success: false, error: 'orderId or positive amount is required' });
      return;
    }

    const calculation = CryptoPaymentProvider.calculateCryptoAmount(targetAmount, 'USD', cryptoKey);
    res.json({
      success: true,
      data: {
        payAmount: calculation.payAmount,
        rate: calculation.rate,
        currency: calculation.config.currency,
        network: calculation.config.network,
        tokenStandard: calculation.config.tokenStandard,
        ticker: calculation.config.ticker,
        fiatAmount: targetAmount,
        depositAddress: calculation.config.depositAddress,
        networkWarning: calculation.config.networkWarning,
      },
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message || 'Failed to calculate crypto estimate.',
    });
  }
});

/**
 * GET /api/payments/crypto/:paymentId/status
 * Fetches verified crypto payment and order status with live remaining time.
 * Strictly requires authentication and owner or admin authorization.
 */
paymentRoutes.get('/crypto/:paymentId/status', verifyFirebaseUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const rateKey = `status:${user.uid || req.ip || 'anon'}`;
    if (!checkCryptoRateLimit(rateKey)) {
      res.status(429).json({
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message: 'Too many payment status checks. Please retry shortly.' },
      });
      return;
    }

    const { paymentId } = req.params;
    const paymentRef = doc(db, 'payments', paymentId);
    const paySnap = await getDoc(paymentRef);

    if (!paySnap.exists()) {
      res.status(404).json({ success: false, error: 'Payment not found' });
      return;
    }

    const payment = paySnap.data() as any;

    // Strict owner or admin authorization check
    if (!user.isAdmin && (!payment.customerUid || user.uid !== payment.customerUid)) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN_PAYMENT_ACCESS', message: 'You are not authorized to view this payment.' },
      });
      return;
    }

    const orderRef = doc(db, 'orders', payment.orderId);
    const orderSnap = await getDoc(orderRef);
    const order = orderSnap.exists() ? (orderSnap.data() as any) : null;

    const cryptoDetails = payment.safeMetadata?.cryptoDetails || {};
    const expiresAt = cryptoDetails.expiresAt || new Date(Date.now() + 20 * 60 * 1000).toISOString();
    const now = Date.now();
    const timeRemainingSeconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));

    let displayStatus = payment.status;
    if (displayStatus === 'pending') {
      if (timeRemainingSeconds <= 0) {
        displayStatus = 'expired';
      } else {
        displayStatus = 'waiting';
      }
    }

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        orderId: payment.orderId,
        status: displayStatus,
        paymentStatus: payment.status,
        orderStatus: order?.status || 'Processing',
        cryptoCurrency: cryptoDetails.currency || 'USDT',
        cryptoNetwork: cryptoDetails.network || 'BNB Smart Chain',
        tokenStandard: cryptoDetails.tokenStandard || 'BEP-20',
        ticker: cryptoDetails.ticker || 'usdtbsc',
        payAmount: cryptoDetails.payAmount || payment.amount,
        fiatAmount: payment.amount,
        payAddress: cryptoDetails.payAddress || payment.transactionReference,
        qrCodeData: cryptoDetails.qrCodeData,
        expiresAt,
        timeRemainingSeconds,
        txHash: payment.transactionReference || order?.transactionReference,
        actuallyPaid: order?.confirmedAmount,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch crypto payment status.',
    });
  }
});

/**
 * POST /api/payments/crypto/:paymentId/simulate
 * Deterministic test simulation trigger in Sandbox mode.
 * Strictly forbidden in production, requires authentication, owner/admin authorization, and rate limiting.
 */
paymentRoutes.post('/crypto/:paymentId/simulate', verifyFirebaseUser, async (req: Request, res: Response): Promise<void> => {
  try {
    if (PaymentConfigService.isProduction()) {
      res.status(403).json({ success: false, error: 'Simulation disabled in production mode.' });
      return;
    }

    const user = req.user!;
    const rateKey = `simulate:${user.uid || req.ip || 'anon'}`;
    if (!checkCryptoRateLimit(rateKey)) {
      res.status(429).json({
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message: 'Too many simulation requests. Please retry shortly.' },
      });
      return;
    }

    const { paymentId } = req.params;
    const { outcome = 'paid' } = req.body; // 'paid' | 'confirming' | 'partially_paid' | 'expired' | 'failed'

    const paymentRef = doc(db, 'payments', paymentId);
    const paySnap = await getDoc(paymentRef);
    if (!paySnap.exists()) {
      res.status(404).json({ success: false, error: 'Payment not found' });
      return;
    }

    const payment = paySnap.data() as any;

    // Production & Sandbox Mode Guard
    if (payment.sandboxMode === false) {
      res.status(403).json({ success: false, error: 'Simulation disabled for non-sandbox transactions.' });
      return;
    }

    // Strict owner or admin authorization check
    if (!user.isAdmin && (!payment.customerUid || user.uid !== payment.customerUid)) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN_PAYMENT_ACCESS', message: 'You are not authorized to simulate this payment.' },
      });
      return;
    }

    const orderRef = doc(db, 'orders', payment.orderId);
    const timestamp = new Date().toISOString();

    const txHash = `0x${crypto.randomBytes(32).toString('hex')}`;
    const cryptoDetails = payment.safeMetadata?.cryptoDetails || {};

    if (outcome === 'paid') {
      await updateDoc(paymentRef, {
        status: 'paid',
        paidAt: timestamp,
        transactionReference: txHash,
        updatedAt: timestamp,
      });

      await updateDoc(orderRef, {
        paymentStatus: 'paid',
        status: 'Processing',
        paymentMethod: 'crypto',
        cryptoCurrency: cryptoDetails.currency || 'USDT',
        cryptoNetwork: cryptoDetails.network || 'BNB Smart Chain',
        cryptoAmount: cryptoDetails.payAmount,
        confirmedAmount: cryptoDetails.payAmount,
        transactionReference: txHash,
        confirmedAt: timestamp,
        updatedAt: timestamp,
      });

      await PaymentEventService.recordEvent({
        paymentId,
        orderId: payment.orderId,
        eventType: 'payment_paid',
        previousStatus: payment.status,
        newStatus: 'paid',
        actorType: 'system',
        provider: 'nowpayments',
        safeMetadata: { simulation: true, txHash, outcome },
      });
    } else if (outcome === 'confirming') {
      await updateDoc(paymentRef, {
        status: 'processing',
        updatedAt: timestamp,
      });
      await updateDoc(orderRef, {
        paymentStatus: 'pending',
        updatedAt: timestamp,
      });
    } else if (outcome === 'partially_paid') {
      const halfAmount = (cryptoDetails.payAmount || payment.amount) / 2;
      await updateDoc(orderRef, {
        paymentStatus: 'partially_paid',
        confirmedAmount: halfAmount,
        updatedAt: timestamp,
      });
    } else if (outcome === 'expired') {
      await updateDoc(paymentRef, {
        status: 'cancelled',
        updatedAt: timestamp,
      });
      await updateDoc(orderRef, {
        paymentStatus: 'expired',
        status: 'Cancelled',
        updatedAt: timestamp,
      });
    }

    res.json({
      success: true,
      data: {
        paymentId,
        orderId: payment.orderId,
        simulatedOutcome: outcome,
        txHash,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Simulation execution failed.',
    });
  }
});


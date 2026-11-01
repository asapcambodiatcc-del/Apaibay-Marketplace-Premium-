import { Router, Request, Response } from 'express';
import { verifyFirebaseUser } from '../auth/verifyFirebaseUser';
import { PaymentService } from '../payment/paymentService';
import { ReconciliationService } from '../payment/reconciliationService';
import { PaymentEventService } from '../payment/paymentEventService';
import { WebhookService } from '../payment/webhookService';
import { PaymentConfigService } from '../payment/paymentConfig';

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
    console.error('[WebhookRoute] Internal error processing webhook:', err);
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

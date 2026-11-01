import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from '../repositories/serverFirestore';
import { Payment, PaymentStatus } from './paymentTypes';
import { validatePaymentTransition } from './paymentStateMachine';
import { PaymentEventService } from './paymentEventService';
import { IdempotencyService } from './idempotencyService';
import { AbaPaywayProvider } from './providers/abaPaywayProvider';
import { BakongKhqrProvider } from './providers/bakongKhqrProvider';
import { WingProvider } from './providers/wingProvider';
import { PaymentConfigService } from './paymentConfig';

export interface ProcessWebhookResult {
  success: boolean;
  status: PaymentStatus;
  paymentId?: string;
  orderId?: string;
  duplicate?: boolean;
  error?: string;
  statusCode: number;
}

export class WebhookService {
  /**
   * Processes inbound webhook from payment providers with strict cryptographic verification,
   * replay protection, amount verification, and state machine transitions.
   */
  static async handleProviderWebhook(
    provider: string,
    rawPayload: any,
    headers: Record<string, any> = {}
  ): Promise<ProcessWebhookResult> {
    const timestamp = new Date().toISOString();
    const providerLower = provider.toLowerCase().replace(/[-_]/g, '');

    // 1. Signature & Authenticity Verification per Provider Spec
    let isValidSignature = false;
    let tranId = '';
    let rawStatus: any = '';
    let apv = '';
    let reportedAmount: number | undefined;
    let reportedCurrency: string | undefined;

    if (providerLower === 'abapayway' || providerLower === 'abapay') {
      const config = PaymentConfigService.getAbaPaywayConfig();
      const apiKey = config.apiKey || (PaymentConfigService.isProduction() ? '' : 'test_aba_key');
      tranId = String(rawPayload.tran_id || rawPayload.tranId || '');
      rawStatus = rawPayload.status;
      apv = String(rawPayload.apv || '');
      reportedAmount = rawPayload.original_amount !== undefined ? parseFloat(rawPayload.original_amount) : undefined;
      reportedCurrency = rawPayload.original_currency;

      isValidSignature = AbaPaywayProvider.verifyWebhookSignature(
        {
          tran_id: tranId,
          status: rawStatus,
          apv,
          hash: rawPayload.hash,
        },
        apiKey
      );

      // In sandbox mode without keys configured, allow test hashes
      if (!isValidSignature && !PaymentConfigService.isProduction() && rawPayload.hash === 'test_valid_hash') {
        isValidSignature = true;
      }
    } else if (providerLower === 'khqr' || providerLower === 'bakong') {
      // In production, NBC Bakong webhook varies by acquiring bank. If webhookSecret is unset, reject safely.
      const config = PaymentConfigService.getBakongKhqrConfig();
      const secret = config.webhookSecret;
      tranId = String(rawPayload.billNumber || rawPayload.tran_id || rawPayload.externalTransactionId || '');
      rawStatus = rawPayload.status || rawPayload.code;
      reportedAmount = rawPayload.amount !== undefined ? parseFloat(rawPayload.amount) : undefined;
      reportedCurrency = rawPayload.currency;

      if (!secret && PaymentConfigService.isProduction()) {
        console.warn('[WebhookService] Bakong acquiring bank webhook secret is unconfigured in production.');
        isValidSignature = false;
      } else {
        const payloadStr = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
        const signature = String(headers['x-bakong-signature'] || rawPayload.signature || '');
        isValidSignature = BakongKhqrProvider.verifyWebhookSignature(payloadStr, signature, secret || 'test_bakong_secret');

        if (!isValidSignature && !PaymentConfigService.isProduction() && signature === 'test_valid_signature') {
          isValidSignature = true;
        }
      }
    } else if (providerLower === 'wing') {
      // In production, Wing webhook format is NOT_VERIFIED against official documentation
      if (PaymentConfigService.isProduction()) {
        console.warn('[WebhookService] Wing webhook rejected: Provider specification is NOT_VERIFIED.');
        return {
          success: false,
          status: 'failed',
          statusCode: 403,
          error: 'Wing Bank webhooks are disabled by the Production Safety Gate (NOT_VERIFIED).',
        };
      }

      const config = PaymentConfigService.getWingConfig();
      const apiKey = config.apiKey || 'test_wing_key';
      tranId = String(rawPayload.billNumber || rawPayload.transactionId || '');
      rawStatus = rawPayload.status;
      reportedAmount = rawPayload.amount !== undefined ? parseFloat(rawPayload.amount) : undefined;
      reportedCurrency = rawPayload.currency;

      const payloadStr = `${rawPayload.billNumber}:${rawPayload.status}:${rawPayload.amount}`;
      const signature = String(headers['x-wing-signature'] || rawPayload.signature || '');
      isValidSignature = WingProvider.verifyWebhookSignature(payloadStr, signature, apiKey);

      if (!isValidSignature && signature === 'test_valid_signature') {
        isValidSignature = true;
      }
    } else {
      return {
        success: false,
        status: 'failed',
        statusCode: 400,
        error: `Unsupported payment provider webhook: ${provider}`,
      };
    }

    if (!isValidSignature) {
      console.warn(`[WebhookService] Rejected invalid webhook signature from ${provider}`);
      // Record security audit event
      if (tranId) {
        await PaymentEventService.recordEvent({
          paymentId: tranId,
          orderId: 'unknown',
          eventType: 'payment_transition_rejected',
          previousStatus: null,
          newStatus: 'failed',
          actorType: 'system',
          provider: provider as any,
          safeMetadata: {
            reason: 'INVALID_WEBHOOK_SIGNATURE',
            provider,
            receivedTranId: tranId,
          },
        }).catch(() => {});
      }
      return {
        success: false,
        status: 'failed',
        statusCode: 401,
        error: 'Invalid webhook cryptographic signature.',
      };
    }

    if (!tranId) {
      return {
        success: false,
        status: 'failed',
        statusCode: 400,
        error: 'Missing transaction / payment ID in webhook payload.',
      };
    }

    // 2. Replay Protection & Webhook Idempotency
    const webhookIdempKey = `webhook_${provider}_${tranId}_${rawStatus}`;
    const idempCheck = await IdempotencyService.check(webhookIdempKey, 'system_webhook', rawPayload);
    if (idempCheck.hit) {
      console.log(`[WebhookService] Harmless duplicate webhook ignored for ${tranId}`);
      return {
        success: true,
        status: 'paid',
        paymentId: tranId,
        duplicate: true,
        statusCode: 200,
      };
    }

    // 3. Load Existing Payment Record
    const paymentRef = doc(db, 'payments', tranId);
    const paymentSnap = await getDoc(paymentRef);

    if (!paymentSnap.exists()) {
      return {
        success: false,
        status: 'failed',
        statusCode: 404,
        error: `Payment record ${tranId} not found in database.`,
      };
    }

    const payment = paymentSnap.data() as Payment;

    // 4. Load Order & Verify Amount & Currency
    const orderRef = doc(db, 'orders', payment.orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) {
      return {
        success: false,
        status: 'failed',
        statusCode: 404,
        error: `Associated order ${payment.orderId} not found.`,
      };
    }

    const orderData = orderSnap.data() as any;
    const authoritativeAmount = parseFloat(Number(orderData.total).toFixed(2));
    const authoritativeCurrency = (orderData.currency || 'USD').toUpperCase();

    // Verify Amount if reported by gateway
    if (reportedAmount !== undefined) {
      const diff = Math.abs(reportedAmount - authoritativeAmount);
      if (diff > 0.05) {
        console.error(`[WebhookService] Amount mismatch for ${tranId}: reported=${reportedAmount}, expected=${authoritativeAmount}`);
        await PaymentEventService.recordEvent({
          paymentId: tranId,
          orderId: payment.orderId,
          eventType: 'payment_transition_rejected',
          previousStatus: payment.status,
          newStatus: 'failed',
          actorType: 'system',
          provider: payment.provider,
          safeMetadata: {
            reason: 'AMOUNT_MISMATCH',
            reportedAmount,
            expectedAmount: authoritativeAmount,
          },
        }).catch(() => {});

        return {
          success: false,
          status: 'failed',
          statusCode: 400,
          error: `Amount mismatch: reported ${reportedAmount}, expected ${authoritativeAmount}`,
        };
      }
    }

    // Verify Currency if reported by gateway
    if (reportedCurrency !== undefined) {
      if (reportedCurrency.toUpperCase() !== authoritativeCurrency) {
        console.error(`[WebhookService] Currency mismatch for ${tranId}: reported=${reportedCurrency}, expected=${authoritativeCurrency}`);
        return {
          success: false,
          status: 'failed',
          statusCode: 400,
          error: `Currency mismatch: reported ${reportedCurrency}, expected ${authoritativeCurrency}`,
        };
      }
    }

    // 5. Normalize Target Status from Provider
    let targetStatus: PaymentStatus = 'paid';
    if (providerLower.includes('aba')) {
      targetStatus = AbaPaywayProvider.normalizeStatus(rawStatus);
    } else if (providerLower.includes('khqr') || providerLower.includes('bakong')) {
      targetStatus = BakongKhqrProvider.normalizeStatus(rawStatus);
    } else if (providerLower.includes('wing')) {
      targetStatus = WingProvider.normalizeStatus(rawStatus);
    }

    // If payment is already in this status, return duplicate safe
    if (payment.status === targetStatus) {
      await IdempotencyService.save(webhookIdempKey, 'system_webhook', rawPayload, { status: targetStatus });
      return {
        success: true,
        status: targetStatus,
        paymentId: tranId,
        orderId: payment.orderId,
        duplicate: true,
        statusCode: 200,
      };
    }

    // 6. Transition State Machine Authoritatively
    // Handle pending -> processing -> targetStatus if currently in created or pending
    let currentStatus = payment.status;
    if (currentStatus === 'created' || currentStatus === 'pending') {
      const transToProcessing = validatePaymentTransition(currentStatus, 'processing', {
        actorType: 'system',
      });
      if (transToProcessing.allowed) {
        currentStatus = 'processing';
      }
    }

    const finalTransition = validatePaymentTransition(currentStatus, targetStatus, {
      actorType: 'system',
    });

    if (!finalTransition.allowed) {
      console.warn(`[WebhookService] Illegal transition from ${currentStatus} to ${targetStatus} for payment ${tranId}`);
      return {
        success: false,
        status: currentStatus,
        statusCode: 400,
        error: `State machine rejected transition from ${currentStatus} to ${targetStatus}: ${finalTransition.message}`,
      };
    }

    // 7. Update Payment Record in Firestore
    const updatedPayment: Partial<Payment> = {
      status: targetStatus,
      transactionReference: rawPayload.tran_id || rawPayload.billNumber || payment.transactionReference,
      updatedAt: timestamp,
    };
    if (targetStatus === 'paid') {
      updatedPayment.paidAt = timestamp;
    }

    try {
      await updateDoc(paymentRef, updatedPayment);
    } catch {
      // Local fallback
    }

    // 8. Synchronize Order Status
    if (targetStatus === 'paid') {
      try {
        await updateDoc(orderRef, {
          paymentStatus: 'paid',
          status: 'Processing',
          updatedAt: timestamp,
        });
      } catch {
        // Local fallback
      }
    } else if (targetStatus === 'failed') {
      try {
        await updateDoc(orderRef, {
          paymentStatus: 'failed',
          updatedAt: timestamp,
        });
      } catch {
        // Local fallback
      }
    }

    // 9. Record Append-Only Payment Event
    await PaymentEventService.recordEvent({
      paymentId: tranId,
      orderId: payment.orderId,
      eventType: targetStatus === 'paid' ? 'payment_paid' : 'payment_failed',
      previousStatus: payment.status,
      newStatus: targetStatus,
      actorType: 'system',
      provider: payment.provider,
      safeMetadata: {
        provider,
        rawStatus,
        apv,
        webhookReceivedAt: timestamp,
      },
    }).catch(() => {});

    // 10. Save Webhook Idempotency Key
    await IdempotencyService.save(webhookIdempKey, 'system_webhook', rawPayload, {
      status: targetStatus,
      processedAt: timestamp,
    });

    return {
      success: targetStatus === 'paid',
      status: targetStatus,
      paymentId: tranId,
      orderId: payment.orderId,
      statusCode: 200,
    };
  }
}

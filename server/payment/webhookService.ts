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
import { CryptoPaymentProvider } from './providers/cryptoProvider';
import { PaymentConfigService } from './paymentConfig';
import { SellerLedgerService } from '../commerce/sellerLedgerService';

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
    } else if (providerLower === 'nowpayments' || providerLower === 'crypto') {
      const config = PaymentConfigService.getNowpaymentsConfig();
      const secret = config.ipnSecret || 'test_nowpayments_ipn_secret';
      tranId = String(rawPayload.payment_id || rawPayload.paymentId || rawPayload.order_id || '');
      rawStatus = rawPayload.payment_status || rawPayload.status;
      reportedAmount = rawPayload.price_amount !== undefined ? parseFloat(rawPayload.price_amount) : (rawPayload.pay_amount !== undefined ? parseFloat(rawPayload.pay_amount) : undefined);
      reportedCurrency = rawPayload.price_currency || rawPayload.pay_currency;

      const signature = String(headers['x-nowpayments-sig'] || headers['x-nowpayments-signature'] || rawPayload.signature || '');
      isValidSignature = CryptoPaymentProvider.verifyIpnSignature(rawPayload, signature, secret);

      if (!isValidSignature && !PaymentConfigService.isProduction() && (signature === 'test_valid_signature' || signature === 'test_valid_crypto_sig')) {
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
    const isCrypto = providerLower.includes('nowpayments') || providerLower.includes('crypto');
    const cryptoDetails = payment.safeMetadata?.cryptoDetails;

    // Check unsupported cryptocurrency in crypto webhook payload
    if (isCrypto) {
      const cryptoToken = String(rawPayload.pay_currency || rawPayload.currency || '').toLowerCase();
      if (cryptoToken) {
        const resolved = CryptoPaymentProvider.resolveConfig(cryptoToken);
        if (!resolved && !['usd'].includes(cryptoToken)) {
          console.warn(`[WebhookService] Unsupported cryptocurrency in webhook: ${cryptoToken}`);
          return {
            success: false,
            status: 'failed',
            statusCode: 400,
            error: `Unsupported cryptocurrency reported: ${cryptoToken}`,
          };
        }
      }
    }

    // Verify Amount if reported by gateway
    if (reportedAmount !== undefined) {
      let expectedAmount = authoritativeAmount;
      if (isCrypto && rawPayload.price_amount === undefined && cryptoDetails?.payAmount) {
        expectedAmount = cryptoDetails.payAmount;
      }

      const diff = Math.abs(reportedAmount - expectedAmount);
      const maxAllowedDiff = isCrypto ? Math.max(0.01, expectedAmount * 0.01) : 0.05;
      if (diff > maxAllowedDiff && reportedAmount < expectedAmount * 0.99) {
        console.error(`[WebhookService] Amount mismatch for ${tranId}: reported=${reportedAmount}, expected=${expectedAmount}`);
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
            expectedAmount,
          },
        }).catch(() => {});

        return {
          success: false,
          status: 'failed',
          statusCode: 400,
          error: `Amount mismatch: reported ${reportedAmount}, expected ${expectedAmount}`,
        };
      }
    }

    // Verify Currency if reported by gateway
    if (reportedCurrency !== undefined) {
      if (isCrypto) {
        const repCurr = reportedCurrency.toUpperCase();
        const validCryptoTickers = ['USD', 'USDT', 'USDC', 'BNB', 'USDTBSC', 'USDTTRC20', 'USDCSOL', 'BNBBSC'];
        if (!validCryptoTickers.includes(repCurr)) {
          return {
            success: false,
            status: 'failed',
            statusCode: 400,
            error: `Currency mismatch: unsupported crypto currency reported: ${reportedCurrency}`,
          };
        }
      } else if (reportedCurrency.toUpperCase() !== authoritativeCurrency) {
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
    } else if (providerLower.includes('nowpayments') || providerLower.includes('crypto')) {
      targetStatus = CryptoPaymentProvider.normalizeStatus(rawStatus);
    }

    // Underpayment & Overpayment detection for crypto
    const actualPaid = rawPayload.actually_paid !== undefined ? parseFloat(rawPayload.actually_paid) : reportedAmount;
    const expectedCryptoTotal = cryptoDetails?.payAmount || authoritativeAmount;
    let isUnderpaid = String(rawStatus).toLowerCase() === 'partially_paid';
    let isOverpaid = false;
    let overpaidAmount = 0;

    if (isCrypto && actualPaid !== undefined && actualPaid > 0) {
      if (actualPaid < expectedCryptoTotal * 0.999) {
        isUnderpaid = true;
        targetStatus = 'requires_action';
      } else if (actualPaid > expectedCryptoTotal * 1.001) {
        isOverpaid = true;
        overpaidAmount = parseFloat((actualPaid - expectedCryptoTotal).toFixed(6));
      }
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
      await PaymentEventService.recordEvent({
        paymentId: tranId,
        orderId: payment.orderId,
        eventType: 'payment_transition_rejected',
        previousStatus: currentStatus,
        newStatus: targetStatus,
        actorType: 'system',
        provider: payment.provider,
        safeMetadata: {
          reason: currentStatus === 'cancelled' ? 'EXPIRED_INVOICE_LATE_PAYMENT' : 'STATE_TRANSITION_REJECTED',
          from: currentStatus,
          to: targetStatus,
          rawStatus,
        },
      }).catch(() => {});

      return {
        success: false,
        status: currentStatus,
        statusCode: 400,
        error: `State machine rejected transition from ${currentStatus} to ${targetStatus}: ${finalTransition.message}`,
      };
    }

    // 7. Update Payment Record in Firestore
    const cryptoTxRef = rawPayload.payin_extra_id || rawPayload.purchase_id || rawPayload.payment_id || `CRYPTO-${Date.now()}`;
    const updatedPayment: Partial<Payment> = {
      status: targetStatus,
      transactionReference: rawPayload.tran_id || rawPayload.billNumber || (isCrypto ? cryptoTxRef : payment.transactionReference),
      updatedAt: timestamp,
    };
    if (targetStatus === 'paid') {
      updatedPayment.paidAt = timestamp;
    }
    if (isOverpaid) {
      updatedPayment.safeMetadata = {
        ...payment.safeMetadata,
        overpaidAmount,
      };
    }

    await updateDoc(paymentRef, updatedPayment);

    // 8. Synchronize Order Status
    const isExpired = String(rawStatus).toLowerCase() === 'expired';

    const orderUpdate: Record<string, any> = {
      updatedAt: timestamp,
    };

    if (isCrypto) {
      orderUpdate.paymentMethod = 'crypto';
      if (rawPayload.pay_currency) orderUpdate.cryptoCurrency = String(rawPayload.pay_currency).toUpperCase();
      if (rawPayload.pay_amount !== undefined) orderUpdate.cryptoAmount = parseFloat(rawPayload.pay_amount);
      if (rawPayload.actually_paid !== undefined) orderUpdate.confirmedAmount = parseFloat(rawPayload.actually_paid);
      if (rawPayload.payment_id) orderUpdate.providerInvoiceId = String(rawPayload.payment_id);
      if (rawPayload.pay_address) orderUpdate.payAddress = String(rawPayload.pay_address);
      if (isOverpaid) orderUpdate.overpaidAmount = overpaidAmount;
      orderUpdate.transactionReference = cryptoTxRef;
    }

    if (targetStatus === 'paid') {
      orderUpdate.paymentStatus = 'paid';
      orderUpdate.status = 'Processing';
      orderUpdate.confirmedAt = timestamp;
    } else if (isUnderpaid) {
      orderUpdate.paymentStatus = 'partially_paid';
    } else if (isExpired) {
      orderUpdate.paymentStatus = 'expired';
      orderUpdate.status = 'Cancelled';
    } else if (targetStatus === 'failed') {
      orderUpdate.paymentStatus = 'failed';
    }

    await updateDoc(orderRef, orderUpdate);

    if (targetStatus === 'paid') {
      await SellerLedgerService.confirmPaymentSettlement(payment.orderId);
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

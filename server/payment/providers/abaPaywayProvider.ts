import crypto from 'crypto';
import {
  PaymentProviderAdapter,
  CreateProviderIntentParams,
  ProviderIntentResult,
  ProcessProviderPaymentParams,
  ProviderPaymentResult,
  ConfirmProviderActionParams,
  RefundProviderParams,
  ProviderRefundResult,
} from '../paymentProviderAdapter';
import { PaymentProvider, PaymentStatus, PaymentAttempt, PaymentFailure } from '../paymentTypes';
import { PaymentConfigService, AbaPaywayConfig } from '../paymentConfig';

export class AbaPaywayProvider implements PaymentProviderAdapter {
  providerName: PaymentProvider = 'aba_payway';

  get isSandbox(): boolean {
    return !PaymentConfigService.isProduction();
  }

  private getConfig(): AbaPaywayConfig {
    return PaymentConfigService.getAbaPaywayConfig();
  }

  /**
   * Generates ABA PayWay HMAC-SHA512 hash in Base64 format as per official API documentation.
   */
  static generateHash(dataToSign: string, apiKey: string): string {
    return crypto
      .createHmac('sha512', apiKey)
      .update(dataToSign, 'utf8')
      .digest('base64');
  }

  /**
   * Verifies an incoming webhook / pushback HMAC signature from ABA PayWay.
   */
  static verifyWebhookSignature(
    payload: {
      tran_id: string;
      status: string | number;
      apv?: string;
      original_amount?: string | number;
      original_currency?: string;
      hash?: string;
    },
    apiKey: string
  ): boolean {
    if (!payload.hash || !apiKey) return false;

    // ABA PayWay standard pushback signature concatenation: tran_id + status + (apv || '')
    const dataToSign = `${payload.tran_id}${payload.status}${payload.apv || ''}`;
    const calculatedHash = this.generateHash(dataToSign, apiKey);

    // Constant-time comparison to prevent timing attacks
    try {
      const bufA = Buffer.from(payload.hash, 'base64');
      const bufB = Buffer.from(calculatedHash, 'base64');
      if (bufA.length !== bufB.length) return false;
      return crypto.timingSafeEqual(bufA, bufB);
    } catch {
      return payload.hash === calculatedHash;
    }
  }

  /**
   * Maps ABA PayWay transaction status codes to Apaibay PaymentStatus.
   */
  static normalizeStatus(statusCode: string | number): PaymentStatus {
    const code = String(statusCode).trim();
    switch (code) {
      case '0':
      case 'APPROVED':
      case 'SUCCESS':
        return 'paid';
      case '1':
      case 'PENDING':
        return 'pending';
      case '2':
      case 'DECLINED':
      case 'FAILED':
        return 'failed';
      case '3':
      case 'CANCELLED':
        return 'cancelled';
      case '4':
      case 'REFUNDED':
        return 'refunded';
      default:
        console.warn(`[AbaPaywayProvider] Unknown status code received: ${code}`);
        return 'failed';
    }
  }

  /**
   * Creates a payment intent with ABA PayWay payload and signature.
   */
  async createPaymentIntent(params: CreateProviderIntentParams): Promise<ProviderIntentResult> {
    const config = this.getConfig();
    const isConfigured = Boolean(config.merchantId && config.apiKey);

    if (!isConfigured && !this.isSandbox) {
      throw new Error(
        'ABA PayWay is not configured. Missing ABA_PAYWAY_MERCHANT_ID or ABA_PAYWAY_API_KEY.'
      );
    }

    const reqTime = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14); // YYYYMMDDHHmmss
    const tranId = params.intentId;
    const amountStr = params.amount.toFixed(2);
    const currency = (params.currency || 'USD').toUpperCase();
    const type = 'purchase';
    const paymentOption = params.methodType === 'khqr' ? 'abapay_khqr' : 'cards';

    const itemsJson = JSON.stringify([
      { name: `Order ${params.orderId}`, quantity: '1', price: amountStr },
    ]);
    const itemsBase64 = Buffer.from(itemsJson).toString('base64');

    // Data to sign as specified in official ABA PayWay Merchant Integration Guide
    const dataToSign = `${reqTime}${config.merchantId || 'sandbox_merchant'}${tranId}${amountStr}${itemsBase64}0${params.safeMetadata?.firstname || 'Valued'}${params.safeMetadata?.lastname || 'Customer'}${params.safeMetadata?.email || 'customer@example.com'}${params.safeMetadata?.phone || '012345678'}${type}${paymentOption}${config.returnUrl || ''}${config.cancelUrl || ''}${config.returnUrl || ''}00${currency}`;

    const hash = config.apiKey
      ? AbaPaywayProvider.generateHash(dataToSign, config.apiKey)
      : 'sbx_hash_' + crypto.createHash('sha256').update(dataToSign).digest('hex').slice(0, 32);

    const clientSecret = `aba_sec_${tranId}_${hash.slice(0, 16)}`;

    return {
      providerIntentReference: tranId,
      clientSecret,
      status: 'pending',
      safeDetails: {
        provider: 'aba_payway',
        isSandbox: this.isSandbox,
        tranId,
        paymentOption,
        reqTime,
        checkoutUrl: `${config.apiUrl}?tran_id=${tranId}`,
        deeplink: `abamobile://payway?tran_id=${tranId}`,
      },
    };
  }

  /**
   * Generates the documented hash for ABA PayWay check-transaction API.
   * Concatenation rule: req_time + merchant_id + tran_id
   */
  static generateCheckTransactionHash(reqTime: string, merchantId: string, tranId: string, apiKey: string): string {
    const raw = `${reqTime}${merchantId}${tranId}`;
    return this.generateHash(raw, apiKey);
  }

  /**
   * Processes or simulates payment verification.
   */
  async processPayment(params: ProcessProviderPaymentParams): Promise<ProviderPaymentResult> {
    const intentId = params.intentId || params.intent?.id || `aba_pay_${Date.now()}`;
    const timestamp = new Date().toISOString();
    const config = this.getConfig();

    // If sandbox / test simulation token provided
    if (this.isSandbox || params.simulationToken) {
      const token = (params.simulationToken || 'test_success').toLowerCase();
      const attemptId = `att_aba_${Date.now()}`;

      if (token === 'test_card_declined' || token === 'failed') {
        const failure: PaymentFailure = {
          code: 'ABA_DECLINED',
          message: 'The transaction was declined by ABA PayWay issuer.',
          declineCode: 'declined',
          retryable: true,
          timestamp,
        };
        const attempt: PaymentAttempt = {
          attemptId,
          paymentId: intentId,
          provider: 'aba_payway',
          method: params.methodType || 'aba_payway',
          status: 'failed',
          failureCode: failure.code,
          failureMessage: failure.message,
          createdAt: timestamp,
        };
        return {
          success: false,
          status: 'failed',
          targetStatus: 'failed',
          failure,
          attempt,
        };
      }

      const txnRef = `ABA-TXN-${Date.now().toString().slice(-8)}`;
      const attempt: PaymentAttempt = {
        attemptId,
        paymentId: intentId,
        provider: 'aba_payway',
        method: params.methodType || 'aba_payway',
        status: 'paid',
        createdAt: timestamp,
        completedAt: timestamp,
        safeDetails: {
          apv: '000000',
          tranId: intentId,
          merchantId: config.merchantId || 'sandbox_merchant',
        },
      };

      return {
        success: true,
        status: 'paid',
        targetStatus: 'paid',
        transactionReference: txnRef,
        providerTransactionId: txnRef,
        attempt,
      };
    }

    throw new Error('Direct synchronous client payment processing is not supported by ABA PayWay. Use checkout redirect / QR flow or webhook callback.');
  }

  async confirmAction(params: ConfirmProviderActionParams): Promise<ProviderPaymentResult> {
    const timestamp = new Date().toISOString();
    const success = params.simulationOutcome !== 'reject';
    const status: PaymentStatus = success ? 'paid' : 'failed';

    return {
      success,
      status,
      targetStatus: status,
      transactionReference: `ABA-ACT-${Date.now().toString().slice(-6)}`,
      attempt: {
        attemptId: `att_act_${Date.now()}`,
        paymentId: params.intentId,
        provider: 'aba_payway',
        method: 'aba_payway',
        status,
        createdAt: timestamp,
        completedAt: timestamp,
      },
    };
  }

  async refundPayment(params: RefundProviderParams): Promise<ProviderRefundResult> {
    const config = this.getConfig();
    // Live ABA PayWay refund requires separate merchant portal mutual-TLS certificate
    // which cannot be assumed or fabricated without merchant bank contract.
    if (!this.isSandbox) {
      throw new Error(
        'ABA PayWay live automated refund API is NOT_VERIFIED: Requires ABA digital merchant certificate and merchant bank approval.'
      );
    }

    const refundReference = `ABA-REF-${Date.now().toString().slice(-8)}`;
    return {
      success: true,
      refundReference,
      status: 'refunded',
      refundedAmount: params.amount,
    };
  }

  /**
   * Queries ABA Check Transaction API or returns pending in sandbox.
   * Documented POST endpoint requires req_time, merchant_id, tran_id, hash.
   */
  async verifyPayment(paymentId: string): Promise<{ status: PaymentStatus; verified: boolean; statusCode?: string }> {
    const config = this.getConfig();
    if (!config.apiKey || !config.merchantId) {
      return { status: 'pending', verified: false };
    }

    if (this.isSandbox) {
      return { status: 'pending', verified: false };
    }

    // In production, prepare documented payload
    const reqTime = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const hash = AbaPaywayProvider.generateCheckTransactionHash(reqTime, config.merchantId, paymentId, config.apiKey);

    try {
      const response = await fetch(config.checkTransactionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          req_time: reqTime,
          merchant_id: config.merchantId,
          tran_id: paymentId,
          hash,
        }),
      });

      if (!response.ok) {
        return { status: 'pending', verified: false };
      }

      const resBody: any = await response.json();
      const rawStatus = resBody?.status;
      const status = AbaPaywayProvider.normalizeStatus(rawStatus);
      return {
        status,
        verified: status === 'paid',
        statusCode: String(rawStatus),
      };
    } catch {
      return { status: 'pending', verified: false };
    }
  }
}

export const defaultAbaPaywayProvider = new AbaPaywayProvider();

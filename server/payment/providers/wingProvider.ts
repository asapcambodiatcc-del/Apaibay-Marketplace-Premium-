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
import { PaymentProvider, PaymentStatus, PaymentAttempt } from '../paymentTypes';
import { PaymentConfigService, WingConfig } from '../paymentConfig';

export class WingProvider implements PaymentProviderAdapter {
  providerName: PaymentProvider = 'wing';

  get isSandbox(): boolean {
    return !PaymentConfigService.isProduction();
  }

  private getConfig(): WingConfig {
    return PaymentConfigService.getWingConfig();
  }

  /**
   * Generates Wing signature using HMAC-SHA256.
   */
  static generateSignature(payloadString: string, apiKey: string): string {
    return crypto.createHmac('sha256', apiKey).update(payloadString).digest('hex');
  }

  /**
   * Verifies Wing Webhook / Callback signature.
   */
  static verifyWebhookSignature(
    payloadString: string,
    signature: string,
    apiKey: string
  ): boolean {
    if (!signature || !apiKey) return false;
    const computed = this.generateSignature(payloadString, apiKey);
    try {
      const bufA = Buffer.from(signature, 'hex');
      const bufB = Buffer.from(computed, 'hex');
      if (bufA.length !== bufB.length) return false;
      return crypto.timingSafeEqual(bufA, bufB);
    } catch {
      return signature === computed;
    }
  }

  /**
   * Maps Wing payment statuses to Apaibay PaymentStatus.
   */
  static normalizeStatus(status: string | number): PaymentStatus {
    const s = String(status).toUpperCase().trim();
    if (s === 'SUCCESS' || s === 'PAID' || s === '200' || s === '0') {
      return 'paid';
    }
    if (s === 'PENDING') {
      return 'pending';
    }
    if (s === 'FAILED' || s === 'EXPIRED' || s === 'CANCELLED') {
      return 'failed';
    }
    return 'failed';
  }

  async createPaymentIntent(params: CreateProviderIntentParams): Promise<ProviderIntentResult> {
    const config = this.getConfig();

    // Production Safety Gate: Wing Bank official specification is NOT_VERIFIED
    if (!this.isSandbox) {
      throw new Error(
        'PRODUCTION_ACTIVATION_BLOCKED: Wing Bank merchant integration specification is NOT_VERIFIED. Live activation is barred until official Wing merchant documentation is reviewed.'
      );
    }

    const billNumber = params.intentId;
    const amountStr = params.amount.toFixed(2);
    const signPayload = `${config.merchantId || 'sbx_wing'}:${billNumber}:${amountStr}:${params.currency}`;
    const signature = config.apiKey
      ? WingProvider.generateSignature(signPayload, config.apiKey)
      : 'sbx_wing_sig';

    return {
      providerIntentReference: billNumber,
      clientSecret: `wing_sec_${billNumber}_${signature.slice(0, 12)}`,
      status: 'pending',
      safeDetails: {
        provider: 'wing',
        isSandbox: this.isSandbox,
        billNumber,
        wingCheckoutUrl: `${config.apiUrl}?billNumber=${billNumber}`,
      },
    };
  }

  async processPayment(params: ProcessProviderPaymentParams): Promise<ProviderPaymentResult> {
    if (!this.isSandbox) {
      throw new Error('Wing Bank live payment execution is blocked: Provider is NOT_VERIFIED.');
    }

    const intentId = params.intentId || params.intent?.id || `wing_${Date.now()}`;
    const timestamp = new Date().toISOString();
    const txnRef = `WING-TXN-${Date.now().toString().slice(-8)}`;

    const attempt: PaymentAttempt = {
      attemptId: `att_wing_${Date.now()}`,
      paymentId: intentId,
      provider: 'wing',
      method: 'wing',
      status: 'paid',
      createdAt: timestamp,
      completedAt: timestamp,
      safeDetails: {
        wingTxnId: txnRef,
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

  async confirmAction(params: ConfirmProviderActionParams): Promise<ProviderPaymentResult> {
    if (!this.isSandbox) {
      throw new Error('Wing Bank live action confirmation is blocked: Provider is NOT_VERIFIED.');
    }

    return {
      success: true,
      status: 'paid',
      targetStatus: 'paid',
      attempt: {
        attemptId: `att_wing_act_${Date.now()}`,
        paymentId: params.intentId,
        provider: 'wing',
        method: 'wing',
        status: 'paid',
        createdAt: new Date().toISOString(),
      },
    };
  }

  async refundPayment(params: RefundProviderParams): Promise<ProviderRefundResult> {
    if (!this.isSandbox) {
      throw new Error('Wing Bank live refund API is NOT_VERIFIED.');
    }

    const refundRef = `WING-REF-${Date.now()}`;
    return {
      success: true,
      refundReference: refundRef,
      status: 'refunded',
      refundedAmount: params.amount,
    };
  }

  async verifyPayment(paymentId: string): Promise<{ status: PaymentStatus; verified: boolean }> {
    if (!this.isSandbox) {
      return { status: 'pending', verified: false };
    }
    return { status: 'pending', verified: false };
  }
}

export const defaultWingProvider = new WingProvider();

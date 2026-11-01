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
import { PaymentConfigService, BakongKhqrConfig } from '../paymentConfig';

export class BakongKhqrProvider implements PaymentProviderAdapter {
  providerName: PaymentProvider = 'khqr';

  get isSandbox(): boolean {
    return !PaymentConfigService.isProduction();
  }

  private getConfig(): BakongKhqrConfig {
    return PaymentConfigService.getBakongKhqrConfig();
  }

  /**
   * Calculates CRC16-CCITT checksum for EMVCo / KHQR QR strings per NBC specification.
   */
  static calculateCrc16(payload: string): string {
    let crc = 0xffff;
    for (let i = 0; i < payload.length; i++) {
      const c = payload.charCodeAt(i);
      crc ^= (c & 0xff) << 8;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ 0x1021) & 0xffff;
        } else {
          crc = (crc << 1) & 0xffff;
        }
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  /**
   * Generates standard NBC KHQR EMVCo string payload.
   */
  static generateKhqrString(params: {
    merchantId: string;
    merchantName: string;
    amount: number;
    currency: string;
    billNumber: string;
  }): string {
    const isUsd = (params.currency || 'USD').toUpperCase() === 'USD';
    const currencyCode = isUsd ? '840' : '116'; // 840 = USD, 116 = KHR
    const amountStr = params.amount.toFixed(2);

    // EMVCo Tags
    const tag00 = '000201'; // Format Indicator
    const tag01 = '010212'; // Point of Initiation (12 = Dynamic QR)

    // Tag 29: Merchant Account Info (Bakong)
    const bakongAcc = `${params.merchantId}@bakong`;
    const tag29 = `29${bakongAcc.length.toString().padStart(2, '0')}${bakongAcc}`;

    const tag52 = '52045999'; // MCC (General Merchandise)
    const tag53 = `5303${currencyCode}`;
    const tag54 = `54${amountStr.length.toString().padStart(2, '0')}${amountStr}`;
    const tag58 = '5802KH'; // Country Code

    const cleanName = params.merchantName.slice(0, 25);
    const tag59 = `59${cleanName.length.toString().padStart(2, '0')}${cleanName}`;
    const tag60 = '6010Phnom Penh';

    // Tag 62: Additional Data (Bill Number)
    const subTag01 = `01${params.billNumber.length.toString().padStart(2, '0')}${params.billNumber}`;
    const tag62 = `62${subTag01.length.toString().padStart(2, '0')}${subTag01}`;

    const rawWithoutCrc = `${tag00}${tag01}${tag29}${tag52}${tag53}${tag54}${tag58}${tag59}${tag60}${tag62}6304`;
    const crc = this.calculateCrc16(rawWithoutCrc);

    return `${rawWithoutCrc}${crc}`;
  }

  /**
   * Verifies Bakong webhook HMAC-SHA256 signature.
   */
  static verifyWebhookSignature(
    payloadString: string,
    signature: string,
    secret: string
  ): boolean {
    if (!signature || !secret) return false;
    const computed = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');

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
   * Maps Bakong transaction status codes to Apaibay PaymentStatus.
   */
  static normalizeStatus(status: string | number): PaymentStatus {
    const s = String(status).toUpperCase().trim();
    if (s === 'SUCCESS' || s === 'PAID' || s === '200' || s === '0') {
      return 'paid';
    }
    if (s === 'PENDING' || s === '1') {
      return 'pending';
    }
    if (s === 'FAILED' || s === 'EXPIRED' || s === 'DECLINED') {
      return 'failed';
    }
    return 'failed';
  }

  async createPaymentIntent(params: CreateProviderIntentParams): Promise<ProviderIntentResult> {
    const config = this.getConfig();
    const isConfigured = Boolean(config.merchantId && config.apiKey);

    if (!isConfigured && !this.isSandbox) {
      throw new Error(
        'Bakong KHQR is not configured. Missing BAKONG_KHQR_MERCHANT_ID or BAKONG_KHQR_API_KEY.'
      );
    }

    const merchantId = config.merchantId || 'apaibay_khqr_sandbox';
    const merchantName = config.merchantName || 'Apaibay Marketplace';
    const khqrString = BakongKhqrProvider.generateKhqrString({
      merchantId,
      merchantName,
      amount: params.amount,
      currency: params.currency,
      billNumber: params.intentId,
    });

    const qrMd5 = crypto.createHash('md5').update(khqrString).digest('hex');

    return {
      providerIntentReference: params.intentId,
      clientSecret: `khqr_sec_${qrMd5.slice(0, 16)}`,
      status: 'pending',
      safeDetails: {
        provider: 'khqr',
        isSandbox: this.isSandbox,
        khqrString,
        qrMd5,
        currency: params.currency,
        amount: params.amount,
        billNumber: params.intentId,
      },
    };
  }

  async processPayment(params: ProcessProviderPaymentParams): Promise<ProviderPaymentResult> {
    const intentId = params.intentId || params.intent?.id || `khqr_${Date.now()}`;
    const timestamp = new Date().toISOString();

    const txnRef = `KHQR-TXN-${Date.now().toString().slice(-8)}`;
    const attempt: PaymentAttempt = {
      attemptId: `att_khqr_${Date.now()}`,
      paymentId: intentId,
      provider: 'khqr',
      method: 'khqr',
      status: 'paid',
      createdAt: timestamp,
      completedAt: timestamp,
      safeDetails: {
        bakongRef: txnRef,
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
    return {
      success: true,
      status: 'paid',
      targetStatus: 'paid',
      transactionReference: `KHQR-CONF-${Date.now()}`,
      attempt: {
        attemptId: `att_khqr_act_${Date.now()}`,
        paymentId: params.intentId,
        provider: 'khqr',
        method: 'khqr',
        status: 'paid',
        createdAt: new Date().toISOString(),
      },
    };
  }

  async refundPayment(params: RefundProviderParams): Promise<ProviderRefundResult> {
    if (!this.isSandbox) {
      throw new Error(
        'Bakong KHQR automated API refund is NOT_SUPPORTED by the National Bank of Cambodia standard credit-push protocol. Refunds must be processed through the merchant bank portal.'
      );
    }

    const refundRef = `KHQR-REF-${Date.now()}`;
    return {
      success: true,
      refundReference: refundRef,
      status: 'refunded',
      refundedAmount: params.amount,
    };
  }

  /**
   * Queries Bakong Open API v1 endpoint: POST /v1/check_transaction_by_md5
   * Per NBC Open API documentation (May 2021), checks if transaction MD5 hash is settled.
   */
  async verifyPayment(paymentId: string, qrMd5?: string): Promise<{ status: PaymentStatus; verified: boolean; externalStatus?: string }> {
    const config = this.getConfig();
    if (!config.apiKey) {
      return { status: 'pending', verified: false, externalStatus: 'NO_OPEN_API_TOKEN' };
    }

    if (this.isSandbox || !qrMd5) {
      return { status: 'pending', verified: false };
    }

    try {
      const response = await fetch(`${config.openApiUrl}/v1/check_transaction_by_md5`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({ md5: qrMd5 }),
      });

      if (!response.ok) {
        return { status: 'pending', verified: false };
      }

      const resBody: any = await response.json();
      const code = resBody?.responseCode;
      const status = BakongKhqrProvider.normalizeStatus(code === 0 ? 'SUCCESS' : 'FAILED');

      return {
        status,
        verified: status === 'paid',
        externalStatus: String(code),
      };
    } catch {
      return { status: 'pending', verified: false };
    }
  }
}

export const defaultBakongKhqrProvider = new BakongKhqrProvider();

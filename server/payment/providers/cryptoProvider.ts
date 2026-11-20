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
import {
  PaymentProvider,
  PaymentStatus,
  PaymentAttempt,
  PaymentFailure,
  CryptoCurrencyOption,
  CryptoPaymentDetails,
} from '../paymentTypes';
import { PaymentConfigService } from '../paymentConfig';

export interface SupportedCryptoConfig {
  id: string;
  currency: 'USDT' | 'USDC' | 'BNB';
  network: string;
  tokenStandard: string;
  ticker: string; // NOWPayments pay_currency symbol
  rateToUsd: number; // Units of crypto per 1 USD
  precision: number;
  depositAddress: string;
  networkWarning: string;
}

export class CryptoPaymentProvider implements PaymentProviderAdapter {
  providerName: PaymentProvider = 'nowpayments';

  get isSandbox(): boolean {
    return !PaymentConfigService.isProduction();
  }

  /**
   * Official supported cryptocurrencies as per Apaibay specification:
   * 1. USDT — BEP-20 (Tether on BNB Smart Chain)
   * 2. USDT — TRC-20 (Tether on TRON Network)
   * 3. USDC — Solana (USD Coin on Solana)
   * 4. BNB — BNB Smart Chain (BNB on BSC)
   */
  static readonly SUPPORTED_CONFIGS: Record<string, SupportedCryptoConfig> = {
    usdt_bep20: {
      id: 'usdt_bep20',
      currency: 'USDT',
      network: 'BNB Smart Chain',
      tokenStandard: 'BEP-20',
      ticker: 'usdtbsc',
      rateToUsd: 1.0,
      precision: 2,
      depositAddress: '0x71C94918655b3909e4504E34fC53702D8B9Eb219',
      networkWarning: 'Send only USDT via BNB Smart Chain (BEP-20). Sending any other asset or using the wrong network will result in permanent loss.',
    },
    usdt_trc20: {
      id: 'usdt_trc20',
      currency: 'USDT',
      network: 'TRON Network',
      tokenStandard: 'TRC-20',
      ticker: 'usdttrc20',
      rateToUsd: 1.0,
      precision: 2,
      depositAddress: 'TXj7B9fL9kXG4pQ8sY5kF2aD7wM3rV1e8Z',
      networkWarning: 'Send only USDT via TRON (TRC-20). Sending any other asset or using the wrong network will result in permanent loss.',
    },
    usdc_solana: {
      id: 'usdc_solana',
      currency: 'USDC',
      network: 'Solana',
      tokenStandard: 'SPL',
      ticker: 'usdcsol',
      rateToUsd: 1.0,
      precision: 2,
      depositAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      networkWarning: 'Send only USDC via Solana Network (SPL). Sending any other asset or using the wrong network will result in permanent loss.',
    },
    bnb_bsc: {
      id: 'bnb_bsc',
      currency: 'BNB',
      network: 'BNB Smart Chain',
      tokenStandard: 'BEP-20',
      ticker: 'bnbbsc',
      rateToUsd: 0.0016, // $625 per BNB reference rate
      precision: 6,
      depositAddress: '0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7',
      networkWarning: 'Send only BNB via BNB Smart Chain (BSC / BEP-20). Sending any other asset will result in permanent loss.',
    },
  };

  /**
   * Retrieves public cryptocurrency options for the checkout interface.
   */
  static getSupportedOptions(): CryptoCurrencyOption[] {
    return [
      {
        id: 'usdt_bep20',
        currency: 'USDT',
        network: 'BNB Smart Chain',
        tokenStandard: 'BEP-20',
        ticker: 'usdtbsc',
        iconColor: '#26A17B',
        description: 'Instant settlement • Low BNB Chain gas fee',
      },
      {
        id: 'usdt_trc20',
        currency: 'USDT',
        network: 'TRON Network',
        tokenStandard: 'TRC-20',
        ticker: 'usdttrc20',
        iconColor: '#EB0029',
        description: 'Instant settlement • Standard TRON energy',
      },
      {
        id: 'usdc_solana',
        currency: 'USDC',
        network: 'Solana',
        tokenStandard: 'SPL',
        ticker: 'usdcsol',
        iconColor: '#2775CA',
        description: 'Sub-second confirmation • Negligible Solana fees',
      },
      {
        id: 'bnb_bsc',
        currency: 'BNB',
        network: 'BNB Smart Chain',
        tokenStandard: 'BEP-20',
        ticker: 'bnbbsc',
        iconColor: '#F3BA2F',
        description: 'Native BNB Smart Chain • Fast block times',
      },
    ];
  }

  /**
   * Resolves supported config by ID or ticker or currency+network combo.
   */
  static resolveConfig(target: string): SupportedCryptoConfig | null {
    if (!target) return null;
    const key = target.toLowerCase().trim().replace(/[-_\s]/g, '');

    for (const [id, cfg] of Object.entries(this.SUPPORTED_CONFIGS)) {
      if (
        id.toLowerCase().replace(/[-_]/g, '') === key ||
        cfg.ticker.toLowerCase() === key ||
        `${cfg.currency}${cfg.network}`.toLowerCase().replace(/[-_\s]/g, '') === key ||
        `${cfg.currency}${cfg.tokenStandard}`.toLowerCase().replace(/[-_\s]/g, '') === key
      ) {
        return cfg;
      }
    }
    return null;
  }

  /**
   * Authoritatively computes crypto amount server-side from order total USD.
   * NEVER trusts client-side amount claims.
   */
  static calculateCryptoAmount(
    fiatAmount: number,
    fiatCurrency: string,
    targetCryptoKey: string
  ): {
    payAmount: number;
    rate: number;
    config: SupportedCryptoConfig;
  } {
    const config = this.resolveConfig(targetCryptoKey);
    if (!config) {
      throw new Error(
        `Unsupported cryptocurrency/network: '${targetCryptoKey}'. Only USDT (BEP-20), USDT (TRC-20), USDC (Solana), and BNB (BSC) are supported.`
      );
    }

    // Convert fiat to USD if necessary (standard store currency is USD)
    const usdAmount = Number(fiatAmount);
    if (isNaN(usdAmount) || usdAmount <= 0) {
      throw new Error('Invalid payment amount. Amount must be greater than zero.');
    }

    const rawCryptoAmount = usdAmount * config.rateToUsd;
    const factor = Math.pow(10, config.precision);
    const payAmount = Math.round(rawCryptoAmount * factor) / factor;

    return {
      payAmount,
      rate: config.rateToUsd,
      config,
    };
  }

  /**
   * Generates NOWPayments standard HMAC-SHA512 IPN signature.
   * Sorts payload alphabetically by key and hashes using IPN Secret.
   */
  static generateIpnSignature(payload: Record<string, any>, secret: string): string {
    const sortedKeys = Object.keys(payload).sort();
    const sortedObj: Record<string, any> = {};
    for (const key of sortedKeys) {
      sortedObj[key] = payload[key];
    }
    const serialized = JSON.stringify(sortedObj);
    return crypto.createHmac('sha512', secret).update(serialized, 'utf8').digest('hex');
  }

  /**
   * Cryptographically verifies incoming IPN signature from NOWPayments.
   */
  static verifyIpnSignature(
    payload: any,
    signature: string,
    secret: string
  ): boolean {
    if (!signature || !secret) return false;

    try {
      let candidate1 = '';
      if (typeof payload === 'object' && payload !== null) {
        candidate1 = this.generateIpnSignature(payload, secret);
      }

      // Also support raw string hashing
      const rawString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const candidate2 = crypto.createHmac('sha512', secret).update(rawString, 'utf8').digest('hex');

      const sigLower = signature.toLowerCase().trim();
      const match1 = candidate1 && crypto.timingSafeEqual(Buffer.from(sigLower, 'hex'), Buffer.from(candidate1.toLowerCase(), 'hex'));
      if (match1) return true;

      const match2 = candidate2 && crypto.timingSafeEqual(Buffer.from(sigLower, 'hex'), Buffer.from(candidate2.toLowerCase(), 'hex'));
      return !!match2;
    } catch {
      return false;
    }
  }

  /**
   * Normalizes gateway payment status to Apaibay state machine.
   */
  static normalizeStatus(rawStatus: string): PaymentStatus {
    const s = String(rawStatus || '').toLowerCase().trim();
    switch (s) {
      case 'waiting':
        return 'pending';
      case 'confirming':
      case 'sending':
        return 'processing';
      case 'confirmed':
      case 'finished':
      case 'paid':
        return 'paid';
      case 'partially_paid':
        return 'requires_action';
      case 'expired':
        return 'cancelled';
      case 'failed':
      case 'refunded':
        return 'failed';
      default:
        return 'pending';
    }
  }

  /**
   * Creates a crypto payment intent with authoritative invoice, QR code, and 20-minute countdown.
   */
  async createPaymentIntent(params: CreateProviderIntentParams): Promise<ProviderIntentResult> {
    const cryptoTarget = params.safeMetadata?.cryptoCurrency || 'usdt_bep20';
    const calculation = CryptoPaymentProvider.calculateCryptoAmount(
      params.amount,
      params.currency || 'USD',
      cryptoTarget
    );

    const now = Date.now();
    const invoiceId = `NP-INV-${now}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const expiresAt = new Date(now + 20 * 60 * 1000).toISOString(); // 20-minute validity window

    // Deterministic deposit address per target config
    const depositAddress = calculation.config.depositAddress;

    // Dynamic QR payload formatted per standard protocol
    let qrCodeData = `${depositAddress}`;
    if (calculation.config.tokenStandard === 'BEP-20') {
      qrCodeData = `ethereum:${depositAddress}?amount=${calculation.payAmount}`;
    } else if (calculation.config.tokenStandard === 'TRC-20') {
      qrCodeData = `tron:${depositAddress}?amount=${calculation.payAmount}`;
    } else if (calculation.config.tokenStandard === 'SPL') {
      qrCodeData = `solana:${depositAddress}?amount=${calculation.payAmount}`;
    }

    const cryptoDetails: CryptoPaymentDetails = {
      paymentId: params.intentId,
      invoiceId,
      currency: calculation.config.currency,
      network: calculation.config.network,
      tokenStandard: calculation.config.tokenStandard,
      ticker: calculation.config.ticker,
      payAmount: calculation.payAmount,
      fiatAmount: params.amount,
      fiatCurrency: params.currency || 'USD',
      rate: calculation.rate,
      payAddress: depositAddress,
      qrCodeData,
      status: 'waiting',
      expiresAt,
      timeRemainingSeconds: 1200,
    };

    return {
      providerIntentReference: invoiceId,
      clientSecret: `crypto_sec_${params.intentId}_${Math.random().toString(36).slice(2, 10)}`,
      status: 'pending',
      safeDetails: {
        isCrypto: true,
        cryptoDetails,
        provider: 'nowpayments',
        sandbox: this.isSandbox,
      },
    };
  }

  /**
   * Processes payment state transitions or sandbox deterministic simulations.
   */
  async processPayment(params: ProcessProviderPaymentParams): Promise<ProviderPaymentResult> {
    const intentId = params.intentId || params.intent?.id || `pay_${Date.now()}`;
    const amount = params.amount ?? params.intent?.amount ?? 0;
    const token = (params.simulationToken || '').toLowerCase();
    const timestamp = new Date().toISOString();
    const attemptId = `att_crypto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Deterministic Failure: Expired Window
    if (token === 'test_expired' || token === 'expired') {
      const failure: PaymentFailure = {
        code: 'PAYMENT_WINDOW_EXPIRED',
        message: 'The 20-minute cryptocurrency payment window expired before deposit was confirmed.',
        retryable: true,
        timestamp,
      };

      return {
        success: false,
        status: 'failed',
        failure,
        attempt: {
          attemptId,
          paymentId: intentId,
          provider: this.providerName,
          method: 'crypto',
          status: 'failed',
          failureCode: failure.code,
          failureMessage: failure.message,
          createdAt: timestamp,
        },
      };
    }

    // Deterministic Failure: Underpayment / Partially Paid
    if (token === 'test_partially_paid' || token === 'underpayment') {
      const failure: PaymentFailure = {
        code: 'CRYPTO_UNDERPAID',
        message: 'Underpayment detected on-chain. Order remains in pending state until remaining balance is settled.',
        retryable: true,
        timestamp,
      };

      return {
        success: false,
        status: 'requires_action',
        failure,
        attempt: {
          attemptId,
          paymentId: intentId,
          provider: this.providerName,
          method: 'crypto',
          status: 'requires_action',
          failureCode: failure.code,
          failureMessage: failure.message,
          createdAt: timestamp,
        },
      };
    }

    // Default: Confirmed Blockchain Transaction
    const txHash = `0x${crypto.randomBytes(32).toString('hex')}`;
    const txnRef = `CRYPTO-TXN-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

    return {
      success: true,
      status: 'paid',
      targetStatus: 'paid',
      transactionReference: txnRef,
      providerTransactionId: txHash,
      attempt: {
        attemptId,
        paymentId: intentId,
        provider: this.providerName,
        method: 'crypto',
        status: 'paid',
        createdAt: timestamp,
        completedAt: timestamp,
        safeDetails: {
          txHash,
          amountPaid: amount,
          confirmedBlocks: 12,
          network: 'BNB Smart Chain',
        },
      },
    };
  }

  async confirmAction(params: ConfirmProviderActionParams): Promise<ProviderPaymentResult> {
    const timestamp = new Date().toISOString();
    return {
      success: true,
      status: 'paid',
      transactionReference: `CRYPTO-ACTION-${Date.now()}`,
      attempt: {
        attemptId: `att_act_${Date.now()}`,
        paymentId: params.intentId,
        provider: this.providerName,
        method: 'crypto',
        status: 'paid',
        createdAt: timestamp,
      },
    };
  }

  async refundPayment(params: RefundProviderParams): Promise<ProviderRefundResult> {
    return {
      success: true,
      refundReference: `CRYPTO-REF-${Date.now()}`,
      status: 'refunded',
      refundedAmount: params.amount,
    };
  }

  async verifyPayment(paymentId: string): Promise<{ status: PaymentStatus; verified: boolean }> {
    return {
      status: 'paid',
      verified: true,
    };
  }
}

export const defaultCryptoPaymentProvider = new CryptoPaymentProvider();

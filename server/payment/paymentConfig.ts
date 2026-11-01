import { PaymentProvider } from './paymentTypes';

export type PaymentEnvironment = 'sandbox' | 'production';

export type ProviderReadinessStatus = 'PRODUCTION_READY' | 'DOCUMENTATION_VERIFIED_PENDING_MERCHANT' | 'NOT_VERIFIED' | 'NOT_READY';

export interface AbaPaywayConfig {
  merchantId: string;
  apiKey: string;
  apiUrl: string;
  checkTransactionUrl: string;
  webhookSecret?: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface BakongKhqrConfig {
  merchantId: string;
  merchantName: string;
  apiKey: string;
  apiUrl: string;
  openApiUrl: string;
  webhookSecret?: string;
}

export interface WingConfig {
  merchantId: string;
  apiKey: string;
  apiUrl: string;
  webhookSecret?: string;
}

export interface EnvironmentValidationReport {
  valid: boolean;
  environment: PaymentEnvironment;
  isSandbox: boolean;
  isProduction: boolean;
  message: string;
  errors: string[];
  warnings: string[];
  providers: {
    provider: PaymentProvider;
    name: string;
    readinessStatus: ProviderReadinessStatus;
    isConfigured: boolean;
    missingKeys: string[];
    allowedInEnvironment: boolean;
    error?: string;
  }[];
}

export interface PublicPaymentConfig {
  environment: PaymentEnvironment;
  activeProviders: {
    provider: PaymentProvider;
    name: string;
    isSandbox: boolean;
    isConfigured: boolean;
    readinessStatus: ProviderReadinessStatus;
  }[];
}

export class PaymentConfigService {
  /**
   * Resolves the current payment environment mode ('sandbox' | 'production').
   * Defaults to 'sandbox' for safety unless explicitly set to 'production'.
   */
  static getEnvironment(): PaymentEnvironment {
    const env = (process.env.PAYMENT_ENVIRONMENT || 'sandbox').trim().toLowerCase();
    return env === 'production' ? 'production' : 'sandbox';
  }

  /**
   * Returns true if production payment mode is explicitly active.
   */
  static isProduction(): boolean {
    return this.getEnvironment() === 'production';
  }

  /**
   * Evaluates the strict production readiness gate for a provider.
   * A provider is only eligible for production if:
   * 1. Official documentation is verified.
   * 2. Authentication & request signing is verified against official specification.
   * 3. Webhook / inquiry flow is verified.
   * 4. Sandbox tests pass and zero undocumented assumptions remain.
   */
  static getProviderReadiness(provider: PaymentProvider): ProviderReadinessStatus {
    switch (provider) {
      case 'sandbox':
        return 'PRODUCTION_READY'; // Sandbox is fully verified for testing

      case 'aba_payway':
        // ABA PayWay v1 purchase and pushback are verified against official documentation.
        // Requires merchant credentials from ABA Bank portal.
        return 'DOCUMENTATION_VERIFIED_PENDING_MERCHANT';

      case 'khqr':
        // Bakong EMVCo KHQR generation is verified against NBC specification.
        // Direct automated inquiry requires partner bank open API or acquiring contract.
        return 'DOCUMENTATION_VERIFIED_PENDING_MERCHANT';

      case 'wing':
        // Official Wing Bank merchant integration specification is proprietary and unverified.
        // Strictly blocked from production activation.
        return 'NOT_VERIFIED';

      default:
        return 'NOT_READY';
    }
  }

  /**
   * Resolves ABA PayWay configuration from server environment.
   */
  static getAbaPaywayConfig(): AbaPaywayConfig {
    const isProd = this.isProduction();
    const defaultUrl = isProd
      ? 'https://checkout.payway.com.kh/api/payment-gateway/v1/payments/purchase'
      : 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase';

    const defaultCheckTxnUrl = isProd
      ? 'https://checkout.payway.com.kh/api/payment-gateway/v1/payments/check-transaction'
      : 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/check-transaction';

    return {
      merchantId: (process.env.ABA_PAYWAY_MERCHANT_ID || '').trim(),
      apiKey: (process.env.ABA_PAYWAY_API_KEY || '').trim(),
      apiUrl: (process.env.ABA_PAYWAY_API_URL || defaultUrl).trim(),
      checkTransactionUrl: (process.env.ABA_PAYWAY_CHECK_TXN_URL || defaultCheckTxnUrl).trim(),
      webhookSecret: (process.env.ABA_PAYWAY_WEBHOOK_SECRET || process.env.ABA_PAYWAY_API_KEY || '').trim(),
      returnUrl: process.env.APP_URL ? `${process.env.APP_URL}/checkout/success` : undefined,
      cancelUrl: process.env.APP_URL ? `${process.env.APP_URL}/checkout/cancelled` : undefined,
    };
  }

  /**
   * Resolves Bakong KHQR configuration from server environment.
   */
  static getBakongKhqrConfig(): BakongKhqrConfig {
    const isProd = this.isProduction();
    const defaultUrl = isProd
      ? 'https://api-bakong.nbc.gov.kh'
      : 'https://api-bakong-sandbox.nbc.gov.kh';

    return {
      merchantId: (process.env.BAKONG_KHQR_MERCHANT_ID || '').trim(),
      merchantName: (process.env.BAKONG_KHQR_MERCHANT_NAME || 'Apaibay Marketplace').trim(),
      apiKey: (process.env.BAKONG_KHQR_API_KEY || '').trim(),
      apiUrl: (process.env.BAKONG_KHQR_API_URL || defaultUrl).trim(),
      openApiUrl: defaultUrl,
      webhookSecret: (process.env.BAKONG_KHQR_WEBHOOK_SECRET || '').trim(),
    };
  }

  /**
   * Resolves Wing Bank configuration from server environment.
   */
  static getWingConfig(): WingConfig {
    const defaultUrl = this.isProduction()
      ? 'https://wingmoney.com/api/v1/payment'
      : 'https://sandbox.wingmoney.com/api/v1/payment';

    return {
      merchantId: (process.env.WING_MERCHANT_ID || '').trim(),
      apiKey: (process.env.WING_API_KEY || '').trim(),
      apiUrl: (process.env.WING_API_URL || defaultUrl).trim(),
      webhookSecret: (process.env.WING_WEBHOOK_SECRET || '').trim(),
    };
  }

  /**
   * Validates whether a specific provider has passed both the documentation
   * readiness gate and has non-empty credentials.
   */
  static validateProviderConfig(provider: PaymentProvider): {
    valid: boolean;
    missingKeys: string[];
    isSandbox: boolean;
    readinessStatus: ProviderReadinessStatus;
    error?: string;
  } {
    const readiness = this.getProviderReadiness(provider);

    if (provider === 'sandbox') {
      return { valid: true, missingKeys: [], isSandbox: true, readinessStatus: 'PRODUCTION_READY' };
    }

    // Strict Gate: Providers whose documentation cannot be verified are barred from production
    if (readiness === 'NOT_VERIFIED' || readiness === 'NOT_READY') {
      return {
        valid: false,
        missingKeys: [],
        isSandbox: !this.isProduction(),
        readinessStatus: readiness,
        error: `Provider ${provider} is blocked by the Production Safety Gate: Official API documentation is NOT_VERIFIED.`,
      };
    }

    const missingKeys: string[] = [];

    if (provider === 'aba_payway') {
      const config = this.getAbaPaywayConfig();
      if (!config.merchantId) missingKeys.push('ABA_PAYWAY_MERCHANT_ID');
      if (!config.apiKey) missingKeys.push('ABA_PAYWAY_API_KEY');
    } else if (provider === 'khqr') {
      const config = this.getBakongKhqrConfig();
      if (!config.merchantId) missingKeys.push('BAKONG_KHQR_MERCHANT_ID');
      if (!config.apiKey) missingKeys.push('BAKONG_KHQR_API_KEY');
    } else if (provider === 'wing') {
      const config = this.getWingConfig();
      if (!config.merchantId) missingKeys.push('WING_MERCHANT_ID');
      if (!config.apiKey) missingKeys.push('WING_API_KEY');
    }

    const isSandbox = !this.isProduction();
    const valid = missingKeys.length === 0;

    return {
      valid,
      missingKeys,
      isSandbox,
      readinessStatus: readiness,
      error: valid
        ? undefined
        : `Provider ${provider} is missing required environment credentials: ${missingKeys.join(', ')}`,
    };
  }

  /**
   * Returns true if the specified provider is configured with non-empty credentials.
   */
  static isProviderConfigured(provider: PaymentProvider): boolean {
    return this.validateProviderConfig(provider).valid;
  }

  /**
   * Comprehensive Server-Side Environment Validation.
   *
   * SANDBOX MODE:
   * - Safe startup guaranteed even with zero payment credentials configured.
   * - Live payment gateways are never called.
   * - Production credentials must NEVER be required merely to run sandbox mode.
   * - Wing provider remains NOT_VERIFIED and strictly blocked.
   *
   * PRODUCTION MODE:
   * - Must fail closed if required production credentials are missing.
   * - At least one verified production provider (e.g. aba_payway or khqr) must have all required credentials.
   * - Wing provider is permanently barred (NOT_VERIFIED) from live production execution.
   */
  static validateEnvironment(): EnvironmentValidationReport {
    const env = this.getEnvironment();
    const isProd = env === 'production';
    const errors: string[] = [];
    const warnings: string[] = [];

    const providerKeys: PaymentProvider[] = ['sandbox', 'aba_payway', 'khqr', 'wing'];
    const providersReport = providerKeys.map((p) => {
      const readiness = this.getProviderReadiness(p);
      const validation = this.validateProviderConfig(p);
      const isConfigured = validation.valid;
      const allowedInEnvironment = isProd ? (p !== 'wing' && p !== 'sandbox' && isConfigured) : true;

      return {
        provider: p,
        name: p === 'sandbox' ? 'Apaibay Test Sandbox Simulator' :
              p === 'aba_payway' ? 'ABA PayWay (Cards / ABA PAY / KHQR)' :
              p === 'khqr' ? 'Bakong KHQR (NBC Standard)' : 'Wing Bank (WingPay / Wing QR)',
        readinessStatus: readiness,
        isConfigured,
        missingKeys: validation.missingKeys,
        allowedInEnvironment,
        error: validation.error,
      };
    });

    if (!isProd) {
      // Sandbox mode is always valid to start, even when all merchant credentials are blank
      warnings.push(
        'PAYMENT_ENVIRONMENT is set to sandbox. Real payment gateway credentials are not required; simulator mode active.'
      );
      return {
        valid: true,
        environment: 'sandbox',
        isSandbox: true,
        isProduction: false,
        message: 'Sandbox environment validation passed: Safe test mode active with zero live payment risk.',
        errors: [],
        warnings,
        providers: providersReport,
      };
    } else {
      // Production mode requires fail-closed behavior if required production credentials are absent
      const configuredLiveProviders = providersReport.filter(
        (p) => p.provider !== 'sandbox' && p.provider !== 'wing' && p.isConfigured
      );

      // Check if Wing is attempted in production
      const wingStatus = providersReport.find((p) => p.provider === 'wing');
      if (wingStatus && wingStatus.isConfigured) {
        errors.push('Wing Bank cannot be activated in production: Provider integration is NOT_VERIFIED.');
      }

      if (configuredLiveProviders.length === 0) {
        errors.push(
          'Production payment mode failed closed: No verified payment provider has required production credentials configured.'
        );
      }

      // Check each attempted provider
      const abaReport = providersReport.find((p) => p.provider === 'aba_payway');
      if (abaReport && !abaReport.isConfigured && abaReport.missingKeys.length > 0) {
        errors.push(`ABA PayWay missing required production credentials: ${abaReport.missingKeys.join(', ')}`);
      }

      const khqrReport = providersReport.find((p) => p.provider === 'khqr');
      if (khqrReport && !khqrReport.isConfigured && khqrReport.missingKeys.length > 0) {
        errors.push(`Bakong KHQR missing required production credentials: ${khqrReport.missingKeys.join(', ')}`);
      }

      const valid = errors.length === 0;
      return {
        valid,
        environment: 'production',
        isSandbox: false,
        isProduction: true,
        message: valid
          ? 'Production payment environment verified with active credentials.'
          : `Production payment environment failed closed: ${errors.join('; ')}`,
        errors,
        warnings,
        providers: providersReport,
      };
    }
  }

  /**
   * Safe public configuration summary.
   * NEVER exposes API keys, secrets, or internal merchant credentials.
   */
  static getPublicPaymentConfig(): PublicPaymentConfig {
    const isProd = this.isProduction();

    return {
      environment: this.getEnvironment(),
      activeProviders: [
        {
          provider: 'sandbox',
          name: 'Apaibay Test Sandbox Simulator',
          isSandbox: true,
          isConfigured: true,
          readinessStatus: this.getProviderReadiness('sandbox'),
        },
        {
          provider: 'aba_payway',
          name: 'ABA PayWay (Cards / ABA PAY / KHQR)',
          isSandbox: !isProd,
          isConfigured: this.isProviderConfigured('aba_payway'),
          readinessStatus: this.getProviderReadiness('aba_payway'),
        },
        {
          provider: 'khqr',
          name: 'Bakong KHQR (NBC Standard)',
          isSandbox: !isProd,
          isConfigured: this.isProviderConfigured('khqr'),
          readinessStatus: this.getProviderReadiness('khqr'),
        },
        {
          provider: 'wing',
          name: 'Wing Bank (WingPay / Wing QR)',
          isSandbox: !isProd,
          isConfigured: false,
          readinessStatus: this.getProviderReadiness('wing'),
        },
      ],
    };
  }
}

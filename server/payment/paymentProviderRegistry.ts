import { PaymentProvider, PaymentMethodType } from './paymentTypes';
import { PaymentProviderAdapter } from './paymentProviderAdapter';
import { defaultSandboxProvider } from './providers/sandboxProvider';
import { defaultAbaPaywayProvider, AbaPaywayProvider } from './providers/abaPaywayProvider';
import { defaultBakongKhqrProvider, BakongKhqrProvider } from './providers/bakongKhqrProvider';
import { defaultWingProvider, WingProvider } from './providers/wingProvider';
import { PaymentConfigService } from './paymentConfig';

export class PaymentProviderRegistry {
  private static providers: Map<PaymentProvider, PaymentProviderAdapter> = new Map<PaymentProvider, PaymentProviderAdapter>([
    ['sandbox', defaultSandboxProvider],
    ['aba_payway', defaultAbaPaywayProvider],
    ['khqr', defaultBakongKhqrProvider],
    ['wing', defaultWingProvider],
    ['card', defaultAbaPaywayProvider], // Standard card gateway in Cambodia routes through ABA PayWay
  ]);

  /**
   * Resolves the PaymentProvider from the chosen PaymentMethodType.
   */
  static resolveProviderForMethod(methodType: PaymentMethodType): PaymentProvider {
    switch (methodType) {
      case 'aba_payway':
        return 'aba_payway';
      case 'khqr':
        return 'khqr';
      case 'wing':
        return 'wing';
      case 'card':
        return PaymentConfigService.isProduction() ? 'aba_payway' : 'sandbox';
      case 'cod':
        return 'manual';
      case 'stripe':
      case 'paypal':
        return PaymentConfigService.isProduction() ? 'aba_payway' : 'sandbox';
      default:
        return 'sandbox';
    }
  }

  /**
   * Retrieves the adapter instance for a given provider name.
   */
  static getAdapter(providerName: PaymentProvider): PaymentProviderAdapter {
    const isProd = PaymentConfigService.isProduction();

    // If requesting a live provider, check configuration safety
    if (isProd && providerName !== 'sandbox' && providerName !== 'manual') {
      const validation = PaymentConfigService.validateProviderConfig(providerName);
      if (!validation.valid) {
        throw new Error(
          `Production payment activation is NOT enabled for ${providerName}: ${validation.error}. Configure server environment variables.`
        );
      }
    }

    const adapter = this.providers.get(providerName);
    if (!adapter) {
      console.warn(`[PaymentProviderRegistry] Unsupported provider: ${providerName}. Falling back to sandbox.`);
      return defaultSandboxProvider;
    }

    return adapter;
  }
}

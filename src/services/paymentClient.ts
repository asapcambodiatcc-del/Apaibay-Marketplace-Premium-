import { auth } from './firebase/config';
import { PaymentIntent, PaymentStatus, PaymentMethodType } from '../types/payment';

export interface CreateIntentParams {
  orderId: string;
  methodType?: PaymentMethodType;
  idempotencyKey?: string;
  safeMetadata?: Record<string, any>;
}

export interface ConfirmPaymentParams {
  intentId: string;
  simulationToken?: string;
  safePaymentData?: {
    last4?: string;
    brand?: string;
  };
}

export interface ConfirmActionParams {
  intentId: string;
  challengeId: string;
  simulationOutcome?: 'approve' | 'reject';
}

export class PaymentClient {
  private static async getAuthHeaders(): Promise<Record<string, string>> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Authentication required for payment transactions.');
    }
    const token = await user.getIdToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  }

  /**
   * POST /api/payments/intents
   * Creates an authoritative payment intent on the backend.
   */
  static async createIntent(params: CreateIntentParams): Promise<PaymentIntent> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/payments/intents', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error?.message || 'Failed to initialize secure payment intent.');
    }
    return body.data;
  }

  /**
   * POST /api/payments/intents/:intentId/confirm
   * Confirms/processes the payment in sandbox mode.
   */
  static async confirmPayment(params: ConfirmPaymentParams): Promise<{
    payment: PaymentIntent;
    status: PaymentStatus;
    orderStatus: string;
    success: boolean;
  }> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/payments/intents/${params.intentId}/confirm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        simulationToken: params.simulationToken,
        safePaymentData: params.safePaymentData,
      }),
    });

    const body = await res.json();
    if (!res.ok && !body.data) {
      throw new Error(body?.error?.message || 'Payment confirmation error.');
    }
    return {
      payment: body.data,
      status: body.status,
      orderStatus: body.orderStatus,
      success: body.success,
    };
  }

  /**
   * POST /api/payments/intents/:intentId/action
   * Completes a simulated 3DS / OTP verification challenge.
   */
  static async completeAction(params: ConfirmActionParams): Promise<{
    payment: PaymentIntent;
    status: PaymentStatus;
    success: boolean;
  }> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/payments/intents/${params.intentId}/action`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        challengeId: params.challengeId,
        simulationOutcome: params.simulationOutcome,
      }),
    });

    const body = await res.json();
    if (!res.ok && !body.data) {
      throw new Error(body?.error?.message || 'Failed to complete 3DS simulation challenge.');
    }
    return {
      payment: body.data,
      status: body.status,
      success: body.success,
    };
  }

  /**
   * GET /api/payments/config
   * Fetches safe public payment configuration (active providers and environment status).
   */
  static async getPublicConfig(): Promise<{
    environment: 'sandbox' | 'production';
    activeProviders: Array<{
      provider: string;
      name: string;
      isSandbox: boolean;
      isConfigured: boolean;
      readinessStatus?: string;
    }>;
  }> {
    const res = await fetch('/api/payments/config');
    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error || 'Failed to fetch payment configuration.');
    }
    return body.data;
  }

  /**
   * POST /api/payments/intents/:intentId/cancel
   * Cancels a pending payment.
   */
  static async cancelPayment(intentId: string): Promise<PaymentIntent> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/payments/intents/${intentId}/cancel`, {
      method: 'POST',
      headers,
    });

    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error?.message || 'Failed to cancel payment.');
    }
    return body.data;
  }

  /**
   * GET /api/payments/intents/:intentId
   * Retrieves single payment intent.
   */
  static async getIntent(intentId: string): Promise<PaymentIntent> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/payments/intents/${intentId}`, {
      method: 'GET',
      headers,
    });

    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error?.message || 'Failed to fetch payment details.');
    }
    return body.data;
  }

  /**
   * GET /api/payments/crypto/options
   * Returns supported cryptocurrency payment options.
   */
  static async getCryptoOptions(): Promise<any[]> {
    const res = await fetch('/api/payments/crypto/options');
    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error || 'Failed to fetch cryptocurrency options.');
    }
    return body.data;
  }

  /**
   * POST /api/payments/crypto/estimate
   * Estimates crypto pay amount and rate for order total USD.
   */
  static async estimateCrypto(orderId: string, cryptoKey: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/payments/crypto/estimate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId, cryptoKey }),
    });
    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error || 'Failed to calculate crypto estimate.');
    }
    return body.data;
  }

  /**
   * GET /api/payments/crypto/:paymentId/status
   * Polls live crypto payment status, remaining time, and confirmations.
   */
  static async getCryptoStatus(paymentId: string): Promise<any> {
    let headers: Record<string, string> = {};
    try {
      headers = await this.getAuthHeaders();
    } catch {
      // Continue unauthenticated if user is guest
    }

    const res = await fetch(`/api/payments/crypto/${paymentId}/status`, { headers });
    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error?.message || body?.error || 'Failed to check cryptocurrency payment status.');
    }
    return body.data;
  }

  /**
   * POST /api/payments/crypto/:paymentId/simulate
   * Sandbox simulation trigger for instant test verification.
   */
  static async simulateCrypto(paymentId: string, outcome: string = 'paid'): Promise<any> {
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const authHeaders = await this.getAuthHeaders();
      headers = { ...headers, ...authHeaders };
    } catch {
      // Continue
    }

    const res = await fetch(`/api/payments/crypto/${paymentId}/simulate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ outcome }),
    });
    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error?.message || body?.error || 'Crypto simulation failed.');
    }
    return body.data;
  }
}

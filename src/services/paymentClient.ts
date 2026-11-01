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
}

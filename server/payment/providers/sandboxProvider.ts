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
import { PaymentAttempt, PaymentFailure, PaymentStatus } from '../paymentTypes';

export class SandboxPaymentProvider implements PaymentProviderAdapter {
  public readonly providerName = 'sandbox' as const;
  public readonly isSandbox = true;

  /**
   * Creates a sandbox payment intent.
   * Never contacts external networks.
   */
  async createPaymentIntent(params: CreateProviderIntentParams): Promise<ProviderIntentResult> {
    const providerIntentReference = `sbx_pi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const clientSecret = `sbx_sec_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;

    return {
      providerIntentReference,
      clientSecret,
      status: 'pending',
      safeDetails: {
        sandbox: true,
        mode: 'TEST_ONLY_NO_REAL_MONEY',
        simulatedMethod: params.methodType,
      },
    };
  }

  /**
   * Processes payment deterministically based on simulation token or default standard payment.
   * Never contacts live gateways.
   */
  async processPayment(params: ProcessProviderPaymentParams): Promise<ProviderPaymentResult> {
    const intentId = params.intentId || params.intent?.id || `pay_${Date.now()}`;
    const methodType = params.methodType || params.intent?.methodType || 'card';
    const amount = params.amount ?? params.intent?.amount ?? 0;
    const currency = params.currency || params.intent?.currency || 'USD';

    const attemptId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const timestamp = new Date().toISOString();
    const token = (params.simulationToken || '').toLowerCase();

    // 1. Deterministic Failure: Card Declined
    if (token === 'test_card_declined' || token === 'decline' || token === 'test_fail_declined') {
      const failure: PaymentFailure = {
        code: 'CARD_DECLINED',
        message: 'The simulated card was declined by the test issuer.',
        declineCode: 'do_not_honor',
        retryable: true,
        timestamp,
      };

      const attempt: PaymentAttempt = {
        attemptId,
        paymentId: intentId,
        provider: this.providerName,
        method: methodType,
        status: 'failed',
        failureCode: failure.code,
        failureMessage: failure.message,
        createdAt: timestamp,
        completedAt: timestamp,
        safeDetails: {
          sandbox: true,
          mode: 'TEST_DECLINE_SIMULATION',
          brand: params.safePaymentData?.brand || 'Visa Sandbox',
          last4: params.safePaymentData?.last4 || '0002',
        },
      };

      return {
        success: false,
        status: 'failed',
        targetStatus: 'failed',
        failure,
        attempt,
      };
    }

    // 2. Deterministic Failure: Insufficient Funds
    if (token === 'test_insufficient_funds' || token === 'test_fail_insufficient_funds') {
      const failure: PaymentFailure = {
        code: 'INSUFFICIENT_FUNDS',
        message: 'The test account has insufficient funds to complete this transaction.',
        declineCode: 'insufficient_funds',
        retryable: false,
        timestamp,
      };

      const attempt: PaymentAttempt = {
        attemptId,
        paymentId: intentId,
        provider: this.providerName,
        method: methodType,
        status: 'failed',
        failureCode: failure.code,
        failureMessage: failure.message,
        createdAt: timestamp,
        completedAt: timestamp,
        safeDetails: {
          sandbox: true,
          mode: 'TEST_INSUFFICIENT_FUNDS_SIMULATION',
        },
      };

      return {
        success: false,
        status: 'failed',
        targetStatus: 'failed',
        failure,
        attempt,
      };
    }

    // 3. Deterministic Failure: Fraud Risk
    if (token === 'test_fraud_risk' || token === 'test_fail_fraud') {
      const failure: PaymentFailure = {
        code: 'HIGH_RISK_FRAUD',
        message: 'The simulated transaction was flagged and blocked by sandbox risk evaluation.',
        retryable: false,
        timestamp,
      };

      const attempt: PaymentAttempt = {
        attemptId,
        paymentId: params.intentId,
        provider: this.providerName,
        method: params.methodType,
        status: 'failed',
        failureCode: failure.code,
        failureMessage: failure.message,
        createdAt: timestamp,
        completedAt: timestamp,
      };

      return {
        success: false,
        status: 'failed',
        failure,
        attempt,
      };
    }

    // 4. Deterministic Failure: Gateway Timeout
    if (token === 'test_timeout' || token === 'test_fail_timeout') {
      const failure: PaymentFailure = {
        code: 'GATEWAY_TIMEOUT',
        message: 'Simulated connection to test payment network timed out.',
        retryable: true,
        timestamp,
      };

      const attempt: PaymentAttempt = {
        attemptId,
        paymentId: params.intentId,
        provider: this.providerName,
        method: params.methodType,
        status: 'failed',
        failureCode: failure.code,
        failureMessage: failure.message,
        createdAt: timestamp,
        completedAt: timestamp,
      };

      return {
        success: false,
        status: 'failed',
        failure,
        attempt,
      };
    }

    // 5. Deterministic Challenge: 3D Secure / OTP Action Required
    if (token === 'test_action_required' || token === 'challenge' || token === 'test_3ds') {
      const challengeId = `sbx_chal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const attempt: PaymentAttempt = {
        attemptId,
        paymentId: intentId,
        provider: this.providerName,
        method: methodType,
        status: 'requires_action',
        createdAt: timestamp,
        safeDetails: {
          sandbox: true,
          challengeType: '3ds_simulation',
        },
      };

      return {
        success: false,
        status: 'requires_action',
        targetStatus: 'requires_action',
        actionRequired: {
          type: 'otp_verification',
          prompt: 'Sandbox 3D Secure / OTP Authentication Simulator: Verify test transaction',
          challengeId,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
        attempt,
      };
    }

    // 6. Default: Deterministic Sandbox Success
    const txnRef = `SBX-TXN-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const attempt: PaymentAttempt = {
      attemptId,
      paymentId: intentId,
      provider: this.providerName,
      method: methodType,
      status: 'paid',
      createdAt: timestamp,
      completedAt: timestamp,
      safeDetails: {
        sandbox: true,
        mode: 'TEST_TRANSACTION_APPROVED',
        brand: params.safePaymentData?.brand || 'Visa Sandbox',
        last4: params.safePaymentData?.last4 || '4242',
        settledAmount: amount,
        settledCurrency: currency,
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

  /**
   * Alias for confirmAction with flexible argument structure.
   */
  async completeAction(params: {
    intent?: any;
    intentId?: string;
    challengeId: string;
    simulationOutcome?: 'approve' | 'reject';
  }): Promise<ProviderPaymentResult> {
    const intentId = params.intentId || params.intent?.id || 'unknown';
    const res = await this.confirmAction({
      intentId,
      challengeId: params.challengeId,
      simulationOutcome: params.simulationOutcome,
    });
    return {
      ...res,
      targetStatus: res.status,
    };
  }

  /**
   * Completes a simulated 3D Secure or OTP verification challenge.
   */
  async confirmAction(params: ConfirmProviderActionParams): Promise<ProviderPaymentResult> {
    const attemptId = `att_act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const timestamp = new Date().toISOString();

    if (params.simulationOutcome === 'reject') {
      const failure: PaymentFailure = {
        code: 'ACTION_VERIFICATION_FAILED',
        message: 'Sandbox 3DS / OTP verification was rejected by user simulation.',
        retryable: true,
        timestamp,
      };

      return {
        success: false,
        status: 'failed',
        failure,
        attempt: {
          attemptId,
          paymentId: params.intentId,
          provider: this.providerName,
          method: 'card',
          status: 'failed',
          failureCode: failure.code,
          failureMessage: failure.message,
          createdAt: timestamp,
          completedAt: timestamp,
        },
      };
    }

    const txnRef = `SBX-TXN-3DS-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
    return {
      success: true,
      status: 'paid',
      transactionReference: txnRef,
      attempt: {
        attemptId,
        paymentId: params.intentId,
        provider: this.providerName,
        method: 'card',
        status: 'paid',
        createdAt: timestamp,
        completedAt: timestamp,
        safeDetails: {
          sandbox: true,
          mode: 'TEST_3DS_CHALLENGE_APPROVED',
          challengeId: params.challengeId,
        },
      },
    };
  }

  /**
   * Simulates sandbox refund.
   */
  async refundPayment(params: RefundProviderParams): Promise<ProviderRefundResult> {
    const refundRef = `SBX-REF-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
    return {
      success: true,
      refundReference: refundRef,
      status: 'refunded',
      refundedAmount: params.amount,
    };
  }

  /**
   * Verifies payment status in sandbox registry.
   */
  async verifyPayment(paymentId: string): Promise<{ status: PaymentStatus; verified: boolean }> {
    return {
      status: 'paid',
      verified: true,
    };
  }
}

export const defaultSandboxProvider = new SandboxPaymentProvider();

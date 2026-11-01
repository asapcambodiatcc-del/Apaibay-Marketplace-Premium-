import {
  PaymentMethodType,
  PaymentProvider,
  PaymentStatus,
  PaymentFailure,
  PaymentAttempt,
  PaymentActionRequired,
} from './paymentTypes';

export interface CreateProviderIntentParams {
  intentId: string;
  orderId: string;
  amount: number;
  currency: string;
  methodType: PaymentMethodType;
  customerUid: string;
  safeMetadata?: Record<string, any>;
}

export interface ProviderIntentResult {
  providerIntentReference: string;
  clientSecret: string;
  status: PaymentStatus;
  safeDetails?: Record<string, any>;
}

export interface ProcessProviderPaymentParams {
  intentId?: string;
  orderId?: string;
  amount?: number;
  currency?: string;
  methodType?: PaymentMethodType;
  customerUid?: string;
  simulationToken?: string; // e.g. 'test_success', 'test_action_required', 'test_card_declined'
  intent?: any;
  safePaymentData?: {
    last4?: string;
    brand?: string;
  };
}

export interface ProviderPaymentResult {
  success: boolean;
  status: PaymentStatus; // 'paid' | 'requires_action' | 'failed'
  targetStatus?: PaymentStatus;
  transactionReference?: string;
  providerTransactionId?: string;
  actionRequired?: PaymentActionRequired;
  failure?: PaymentFailure;
  attempt: PaymentAttempt;
}

export interface ConfirmProviderActionParams {
  intentId: string;
  challengeId: string;
  simulationOutcome?: 'approve' | 'reject';
}

export interface RefundProviderParams {
  paymentId: string;
  amount: number;
  currency: string;
  reason?: string;
}

export interface ProviderRefundResult {
  success: boolean;
  refundReference: string;
  status: 'refunded' | 'partially_refunded';
  refundedAmount: number;
}

export interface PaymentProviderAdapter {
  providerName: PaymentProvider;
  isSandbox: boolean;
  createPaymentIntent(params: CreateProviderIntentParams): Promise<ProviderIntentResult>;
  processPayment(params: ProcessProviderPaymentParams): Promise<ProviderPaymentResult>;
  confirmAction(params: ConfirmProviderActionParams): Promise<ProviderPaymentResult>;
  refundPayment(params: RefundProviderParams): Promise<ProviderRefundResult>;
  verifyPayment(paymentId: string): Promise<{ status: PaymentStatus; verified: boolean }>;
}

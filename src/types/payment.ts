export type PaymentStatus =
  | 'created'
  | 'pending'
  | 'processing'
  | 'requires_action'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

export type PaymentMethodType =
  | 'cod'
  | 'khqr'
  | 'aba_payway'
  | 'wing'
  | 'card'
  | 'paypal'
  | 'stripe';

export type PaymentProvider =
  | 'sandbox'
  | 'aba_payway'
  | 'khqr'
  | 'wing'
  | 'card'
  | 'paypal'
  | 'stripe'
  | 'manual';

export interface PaymentFailure {
  code: string;
  message: string;
  declineCode?: string;
  retryable: boolean;
  timestamp: string;
}

export interface PaymentAttempt {
  attemptId: string;
  paymentId: string;
  provider: PaymentProvider;
  method: PaymentMethodType;
  status: PaymentStatus;
  failureCode?: string;
  failureMessage?: string;
  createdAt: string;
  completedAt?: string;
  safeDetails?: Record<string, any>;
}

export interface PaymentActionRequired {
  type: '3ds_challenge' | 'otp_verification' | 'deep_link';
  prompt: string;
  challengeId: string;
  expiresAt?: string;
}

export interface PaymentIntent {
  id: string;
  orderId: string;
  customerUid: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  methodType: PaymentMethodType;
  provider: PaymentProvider;
  clientSecret: string;
  idempotencyKey?: string;
  attemptsCount: number;
  lastAttempt?: PaymentAttempt;
  failure?: PaymentFailure;
  actionRequired?: PaymentActionRequired;
  sandboxMode: boolean;
  safeMetadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  paymentIntentId: string;
  orderId: string;
  customerUid: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethodType;
  provider: PaymentProvider;
  transactionReference?: string;
  paidAt?: string;
  refundedAmount?: number;
  sandboxMode: boolean;
  safeMetadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export type PaymentEventType =
  | 'payment_intent_created'
  | 'payment_pending'
  | 'payment_processing'
  | 'payment_requires_action'
  | 'payment_action_succeeded'
  | 'payment_paid'
  | 'payment_failed'
  | 'payment_cancelled'
  | 'payment_refunded'
  | 'payment_partially_refunded'
  | 'payment_reconciled'
  | 'payment_transition_rejected';

export interface PaymentEvent {
  eventId: string;
  paymentId: string;
  orderId: string;
  eventType: PaymentEventType;
  previousStatus: PaymentStatus | null;
  newStatus: PaymentStatus;
  actorType: 'customer' | 'seller' | 'admin' | 'system';
  actorUid?: string;
  provider: PaymentProvider;
  timestamp: string;
  idempotencyKey?: string;
  safeMetadata?: Record<string, any>;
}

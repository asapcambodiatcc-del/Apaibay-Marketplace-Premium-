import { PaymentStatus } from './paymentTypes';
import { AuthenticatedUser } from '../auth/roles';

export interface StateTransitionResult {
  allowed: boolean;
  code?: string;
  message?: string;
}

/**
 * Strict Payment State Transition Matrix
 *
 * Allowed graph edges:
 *  created -> pending
 *  pending -> processing, cancelled
 *  processing -> requires_action, paid, failed, cancelled
 *  requires_action -> processing, failed
 *  paid -> refunded, partially_refunded
 *  partially_refunded -> refunded
 */
export const ALLOWED_PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  created: ['pending', 'cancelled'],
  pending: ['processing', 'cancelled'],
  processing: ['requires_action', 'paid', 'failed', 'cancelled'],
  requires_action: ['processing', 'failed'],
  paid: ['refunded', 'partially_refunded'],
  failed: [], // Terminal for that payment attempt
  cancelled: [], // Terminal
  refunded: [], // Terminal
  partially_refunded: ['refunded'],
};

/**
 * Checks whether a transition between two payment states is mathematically valid in the state graph.
 */
export function isValidStateTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) return true;
  const allowedNext = ALLOWED_PAYMENT_TRANSITIONS[from];
  return Array.isArray(allowedNext) && allowedNext.includes(to);
}

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return isValidStateTransition(from, to);
}

export function isTerminalState(status: PaymentStatus): boolean {
  return status === 'cancelled' || status === 'refunded';
}

export function isCancellable(status: PaymentStatus): boolean {
  return status === 'created' || status === 'pending';
}

export function isRefundable(status: PaymentStatus): boolean {
  return status === 'paid' || status === 'partially_refunded';
}

export function assertValidTransition(
  from: PaymentStatus,
  to: PaymentStatus,
  paymentId: string
): void {
  if (!isValidStateTransition(from, to)) {
    throw new Error(
      `Illegal payment transition from '${from}' to '${to}' for payment '${paymentId}'.`
    );
  }
}

/**
 * Validates a payment state transition against both the lifecycle state machine
 * and actor authorization rules.
 *
 * Privileged states:
 * - 'paid', 'processing', 'refunded', 'partially_refunded'
 * These can NEVER be directly authored or requested by an unprivileged client!
 */
export function validatePaymentTransition(
  from: PaymentStatus,
  to: PaymentStatus,
  actor: {
    user?: AuthenticatedUser;
    actorType: 'customer' | 'seller' | 'admin' | 'system';
    isOwner?: boolean;
  } = { actorType: 'system' }
): StateTransitionResult {
  // 1. Graph validation
  if (!isValidStateTransition(from, to)) {
    return {
      allowed: false,
      code: 'INVALID_PAYMENT_STATE_TRANSITION',
      message: `Illegal payment transition from '${from}' to '${to}'.`,
    };
  }

  // 2. Terminal states check
  if (from === 'refunded' || from === 'cancelled') {
    return {
      allowed: false,
      code: 'PAYMENT_STATE_TERMINAL',
      message: `Payment is in a terminal state ('${from}') and cannot be transitioned.`,
    };
  }

  // 3. System transitions (Trusted backend payment engine / Webhook / Gateway adapter)
  if (actor.actorType === 'system') {
    return { allowed: true };
  }

  // 4. Admin transitions
  if (actor.actorType === 'admin' || actor.user?.isAdmin) {
    return { allowed: true };
  }

  // 5. Customer / Client permissions
  if (actor.actorType === 'customer') {
    // Customers can NEVER directly author privileged states
    if (to === 'paid' || to === 'processing' || to === 'refunded' || to === 'partially_refunded') {
      return {
        allowed: false,
        code: 'FORBIDDEN_PRIVILEGED_PAYMENT_STATE',
        message: `Client cannot directly transition payment to privileged state '${to}'.`,
      };
    }

    // Customer can only cancel their own payment if it's pending
    if (to === 'cancelled') {
      if (from !== 'pending') {
        return {
          allowed: false,
          code: 'FORBIDDEN_CANCELLATION',
          message: `Only pending payments can be cancelled by customers. Current status: '${from}'.`,
        };
      }
      if (!actor.isOwner) {
        return {
          allowed: false,
          code: 'FORBIDDEN_PAYMENT_OWNERSHIP',
          message: 'Cannot cancel a payment belonging to another customer.',
        };
      }
      return { allowed: true };
    }

    // Initial transition created -> pending is allowed for owner
    if (from === 'created' && to === 'pending' && actor.isOwner) {
      return { allowed: true };
    }
  }

  // 6. Seller permissions (cannot directly manipulate payments except view/request refunds via admin)
  if (actor.actorType === 'seller') {
    return {
      allowed: false,
      code: 'FORBIDDEN_SELLER_PAYMENT_MUTATION',
      message: 'Sellers are not authorized to directly transition payment records.',
    };
  }

  return {
    allowed: false,
    code: 'FORBIDDEN_PAYMENT_TRANSITION',
    message: `Actor of type '${actor.actorType}' is not authorized to transition payment from '${from}' to '${to}'.`,
  };
}

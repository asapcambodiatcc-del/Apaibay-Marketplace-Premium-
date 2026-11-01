import { AuthenticatedUser } from '../auth/roles';

export type CanonicalOrderStatus = 'Placed' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';

export const ALLOWED_STATUS_TRANSITIONS: Record<CanonicalOrderStatus, CanonicalOrderStatus[]> = {
  Placed: ['Processing', 'Cancelled'],
  Processing: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered'],
  Delivered: [], // Terminal
  Cancelled: [], // Terminal
};

export interface StatusValidationResult {
  allowed: boolean;
  code?: string;
  message?: string;
}

/**
 * Normalizes legacy status names to canonical statuses.
 */
export function normalizeStatus(status: string): CanonicalOrderStatus {
  if (!status) return 'Placed';
  const clean = status.trim();
  if (clean === 'Order Placed' || clean === 'Placed') return 'Placed';
  if (clean === 'Processing') return 'Processing';
  if (clean === 'Shipped') return 'Shipped';
  if (clean === 'Out for Delivery' || clean === 'Delivered') return 'Delivered';
  if (clean === 'Cancelled' || clean === 'Canceled') return 'Cancelled';
  return 'Placed';
}

/**
 * Validates whether a requested order status transition is allowed by the lifecycle state machine
 * and whether the requesting user is authorized to perform it.
 */
export function validateStatusTransition(
  currentRawStatus: string,
  newRawStatus: string,
  order: { customerUid?: string; items: Array<{ sellerId?: string }> },
  user: AuthenticatedUser
): StatusValidationResult {
  const current = normalizeStatus(currentRawStatus);
  const next = normalizeStatus(newRawStatus);

  if (current === next) {
    return {
      allowed: false,
      code: 'NOOP_TRANSITION',
      message: `Order is already in '${current}' status.`,
    };
  }

  // 1. Check state machine lifecycle transition
  const validNextStates = ALLOWED_STATUS_TRANSITIONS[current] || [];
  if (!validNextStates.includes(next)) {
    return {
      allowed: false,
      code: 'INVALID_STATUS_TRANSITION',
      message: `Invalid status transition from '${current}' to '${next}'. Allowed next states: [${validNextStates.join(', ')}].`,
    };
  }

  // 2. Authorization check: Admin has full authority over valid transitions
  if (user.isAdmin) {
    return { allowed: true };
  }

  // 3. Authorization check: Customer
  if (!user.isSeller && !user.isAdmin) {
    // Customers can only cancel their own orders while in 'Placed' status
    if (order.customerUid !== user.uid) {
      return {
        allowed: false,
        code: 'FORBIDDEN',
        message: 'You are not authorized to modify this order.',
      };
    }

    if (current === 'Placed' && next === 'Cancelled') {
      return { allowed: true };
    }

    return {
      allowed: false,
      code: 'CUSTOMER_UNAUTHORIZED_STATUS_CHANGE',
      message: `Customers are only permitted to cancel unfulfilled orders in 'Placed' status. Cannot change to '${next}'.`,
    };
  }

  // 4. Authorization check: Seller
  if (user.isSeller) {
    // Seller must own at least one product in this order
    const sellerOwnsItem = order.items.some((item) => item.sellerId === user.sellerId || item.sellerId === user.uid);
    if (!sellerOwnsItem) {
      return {
        allowed: false,
        code: 'FORBIDDEN_SELLER',
        message: 'You can only update status for orders containing products from your store.',
      };
    }

    // Sellers can transition Placed -> Processing -> Shipped, or Cancel
    if (current === 'Placed' && (next === 'Processing' || next === 'Cancelled')) {
      return { allowed: true };
    }
    if (current === 'Processing' && (next === 'Shipped' || next === 'Cancelled')) {
      return { allowed: true };
    }

    return {
      allowed: false,
      code: 'SELLER_UNAUTHORIZED_STATUS_CHANGE',
      message: `Sellers cannot transition order directly from '${current}' to '${next}'.`,
    };
  }

  return {
    allowed: false,
    code: 'UNAUTHORIZED',
    message: 'Unauthorized status transition.',
  };
}

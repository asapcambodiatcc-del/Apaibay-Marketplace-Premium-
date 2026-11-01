export interface OrderItemInput {
  productId: string;
  variantId?: string;
  selectedColor?: string;
  selectedSize?: string;
  quantity: number;
}

export interface ShippingAddressInput {
  name: string;
  street: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  phone: string;
}

export interface CreateOrderRequest {
  items: OrderItemInput[];
  shippingOption?: 'standard' | 'express';
  couponCode?: string;
  shippingAddress: ShippingAddressInput;
  paymentMethod?: 'card' | 'paypal' | 'cod';
  idempotencyKey?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCreateOrderInput(body: any): ValidationResult {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object'] };
  }

  // 1. Items array validation
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push('Order must contain at least one item');
  } else if (body.items.length > 50) {
    errors.push('Order cannot exceed 50 distinct items per order');
  } else {
    body.items.forEach((item: any, idx: number) => {
      if (!item || typeof item !== 'object') {
        errors.push(`Item at index ${idx} is invalid`);
        return;
      }
      if (!item.productId || typeof item.productId !== 'string') {
        errors.push(`Item at index ${idx} is missing a valid productId`);
      }
      if (
        typeof item.quantity !== 'number' ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1
      ) {
        errors.push(`Item '${item.productId || idx}' must have a positive integer quantity (minimum 1)`);
      } else if (item.quantity > 99) {
        errors.push(`Item '${item.productId || idx}' exceeds maximum purchase limit of 99 units`);
      }
    });
  }

  // 2. Shipping Address validation
  const addr = body.shippingAddress;
  if (!addr || typeof addr !== 'object') {
    errors.push('shippingAddress is required');
  } else {
    if (!addr.name || typeof addr.name !== 'string' || !addr.name.trim()) {
      errors.push('shippingAddress.name is required');
    }
    if (!addr.street || typeof addr.street !== 'string' || !addr.street.trim()) {
      errors.push('shippingAddress.street is required');
    }
    if (!addr.city || typeof addr.city !== 'string' || !addr.city.trim()) {
      errors.push('shippingAddress.city is required');
    }
    if (!addr.postalCode || typeof addr.postalCode !== 'string' || !addr.postalCode.trim()) {
      errors.push('shippingAddress.postalCode is required');
    }
  }

  // 3. Idempotency Key validation
  if (body.idempotencyKey) {
    if (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.length > 128) {
      errors.push('idempotencyKey must be a string up to 128 characters');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

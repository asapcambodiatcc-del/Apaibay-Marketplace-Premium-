import { db, doc, getDoc } from '../repositories/serverFirestore';

export interface CouponData {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  expiresAt?: string;
  active: boolean;
}

export const CANONICAL_COUPONS: Record<string, CouponData> = {
  APAI10: {
    id: 'coupon_apai10',
    code: 'APAI10',
    discountType: 'percentage',
    discountValue: 10,
    minOrderAmount: 30,
    active: true,
  },
  APAIBAY10: {
    id: 'coupon_apaibay10',
    code: 'APAIBAY10',
    discountType: 'percentage',
    discountValue: 10,
    minOrderAmount: 30,
    active: true,
  },
  WELCOME10: {
    id: 'coupon_welcome10',
    code: 'WELCOME10',
    discountType: 'percentage',
    discountValue: 10,
    minOrderAmount: 20,
    active: true,
  },
  VIP20: {
    id: 'coupon_vip20',
    code: 'VIP20',
    discountType: 'percentage',
    discountValue: 20,
    minOrderAmount: 100,
    active: true,
  },
  VIP25: {
    id: 'coupon_vip25',
    code: 'VIP25',
    discountType: 'fixed',
    discountValue: 25,
    minOrderAmount: 100,
    active: true,
  },
  SAVE5: {
    id: 'coupon_save5',
    code: 'SAVE5',
    discountType: 'fixed',
    discountValue: 5,
    minOrderAmount: 20,
    active: true,
  },
  EXPIRED50: {
    id: 'coupon_expired',
    code: 'EXPIRED50',
    discountType: 'percentage',
    discountValue: 50,
    minOrderAmount: 10,
    expiresAt: '2020-01-01T00:00:00.000Z',
    active: true,
  },
};

export interface CouponValidationResult {
  valid: boolean;
  couponCode?: string;
  discount: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  message?: string;
}

/**
 * Validates a coupon server-side against canonical database and rules.
 */
export async function validateAuthoritativeCoupon(
  code: string | undefined | null,
  subtotal: number
): Promise<CouponValidationResult> {
  if (!code || typeof code !== 'string' || !code.trim()) {
    return { valid: false, discount: 0 };
  }

  const cleanCode = code.trim().toUpperCase();

  // Try fetching from Firestore coupons collection first
  let coupon: CouponData | null = null;
  try {
    const snap = await getDoc(doc(db, 'coupons', cleanCode));
    if (snap.exists()) {
      coupon = snap.data() as CouponData;
    }
  } catch {
    // Non-blocking fallback
  }

  // Fallback to canonical hardcoded coupons
  if (!coupon) {
    coupon = CANONICAL_COUPONS[cleanCode] || null;
  }

  if (!coupon) {
    return {
      valid: false,
      discount: 0,
      message: `Coupon code '${cleanCode}' is invalid or does not exist.`,
    };
  }

  if (!coupon.active) {
    return {
      valid: false,
      discount: 0,
      message: `Coupon code '${cleanCode}' is no longer active.`,
    };
  }

  // Check expiration
  if (coupon.expiresAt) {
    const expiryTime = new Date(coupon.expiresAt).getTime();
    if (Date.now() > expiryTime) {
      return {
        valid: false,
        discount: 0,
        message: `Coupon code '${cleanCode}' expired on ${new Date(coupon.expiresAt).toLocaleDateString()}.`,
      };
    }
  }

  // Check minimum order value
  if (coupon.minOrderAmount && subtotal < coupon.minOrderAmount) {
    return {
      valid: false,
      discount: 0,
      message: `Order subtotal must be at least $${coupon.minOrderAmount.toFixed(2)} to apply coupon '${cleanCode}'.`,
    };
  }

  // Calculate authoritative discount
  let calculatedDiscount = 0;
  if (coupon.discountType === 'percentage') {
    calculatedDiscount = (subtotal * coupon.discountValue) / 100;
    if (coupon.maxDiscount && coupon.maxDiscount > 0) {
      calculatedDiscount = Math.min(calculatedDiscount, coupon.maxDiscount);
    }
  } else {
    calculatedDiscount = coupon.discountValue;
  }

  // Ensure discount does not exceed subtotal
  calculatedDiscount = Math.min(calculatedDiscount, subtotal);
  calculatedDiscount = parseFloat(calculatedDiscount.toFixed(2));

  return {
    valid: true,
    couponCode: cleanCode,
    discount: calculatedDiscount,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    message: `Coupon '${cleanCode}' applied successfully.`,
  };
}

import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { Coupon } from '../../types';
import { CouponRepository } from '../CouponRepository';

const COUPONS_COLLECTION = 'coupons';

const INITIAL_COUPONS: Coupon[] = [
  {
    id: 'coupon_apaibay10',
    code: 'APAIBAY10',
    discountType: 'percentage',
    discountValue: 10,
    minOrderAmount: 30,
    active: true,
  },
  {
    id: 'coupon_vip25',
    code: 'VIP25',
    discountType: 'fixed',
    discountValue: 25,
    minOrderAmount: 100,
    active: true,
  },
  {
    id: 'coupon_save5',
    code: 'SAVE5',
    discountType: 'fixed',
    discountValue: 5,
    minOrderAmount: 20,
    active: true,
  },
];

export class FirebaseCouponRepository implements CouponRepository {
  async getByCode(code: string): Promise<Coupon | null> {
    const cleanCode = code.toUpperCase().trim();
    try {
      const docRef = doc(db, COUPONS_COLLECTION, cleanCode);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as Coupon;
      }
    } catch {
      // Fallback to baseline in-memory coupons
    }
    return INITIAL_COUPONS.find((c) => c.code === cleanCode) || null;
  }

  async validateCoupon(
    code: string,
    orderTotal: number
  ): Promise<{ valid: boolean; discount: number; message?: string }> {
    const coupon = await this.getByCode(code);
    if (!coupon || !coupon.active) {
      return { valid: false, discount: 0, message: 'Invalid or expired coupon code' };
    }

    if (coupon.minOrderAmount && orderTotal < coupon.minOrderAmount) {
      return {
        valid: false,
        discount: 0,
        message: `Order must be at least $${coupon.minOrderAmount} to apply this coupon`,
      };
    }

    let discount = 0;
    if (coupon.discountType === 'percentage') {
      discount = (orderTotal * coupon.discountValue) / 100;
      if (coupon.maxDiscount) {
        discount = Math.min(discount, coupon.maxDiscount);
      }
    } else {
      discount = coupon.discountValue;
    }

    return {
      valid: true,
      discount: parseFloat(discount.toFixed(2)),
      message: `Coupon ${coupon.code} applied!`,
    };
  }
}

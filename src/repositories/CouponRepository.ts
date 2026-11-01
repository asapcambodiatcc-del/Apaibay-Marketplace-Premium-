import { Coupon } from '../types';

export interface CouponRepository {
  getByCode(code: string): Promise<Coupon | null>;
  validateCoupon(code: string, orderTotal: number): Promise<{ valid: boolean; discount: number; message?: string }>;
}

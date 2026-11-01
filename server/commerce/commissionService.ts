/**
 * Commission Configuration & Calculation Engine for Apaibay Marketplace.
 * Server-authoritative computation using integer minor currency units (cents).
 */

export const DEFAULT_MARKETPLACE_COMMISSION_RATE = 0.05; // 5% sandbox default

export interface CommissionCalculationItem {
  productId: string;
  name: string;
  sellerId: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface CalculatedItemCommission {
  productId: string;
  name: string;
  sellerId: string;
  quantity: number;
  eligibleSubtotalCents: number;
  eligibleSubtotal: number;
  commissionRate: number;
  commissionAmountCents: number;
  commissionAmount: number;
  sellerNetCents: number;
  sellerNet: number;
  isPlatformOwned: boolean;
}

export interface OrderCommissionSummary {
  items: CalculatedItemCommission[];
  totalEligibleSubtotalCents: number;
  totalEligibleSubtotal: number;
  totalPlatformCommissionCents: number;
  totalPlatformCommission: number;
  totalSellerNetCents: number;
  totalSellerNet: number;
}

export class CommissionService {
  /**
   * Identifies whether a product or sellerId belongs to Apaibay platform-owned merchandise.
   */
  static isPlatformOwned(sellerId?: string, sellerName?: string): boolean {
    if (!sellerId || sellerId === 'seller-apaibay-official' || sellerId.startsWith('platform')) {
      return true;
    }
    if (sellerName && sellerName.toLowerCase().includes('apaibay official')) {
      return true;
    }
    return false;
  }

  /**
   * Calculates precise, server-authoritative commissions per line item in integer cents.
   *
   * Policy rules:
   * 1. Shipping fees are non-commissionable (excluded from merchandise subtotal).
   * 2. Discounts reduce the commissionable merchandise subtotal proportionately.
   * 3. Platform-owned products have 0% seller payout (100% platform retained).
   * 4. Third-party items apply the configured commission rate snapshot.
   */
  static calculateOrderCommissions(
    items: CommissionCalculationItem[],
    totalDiscount: number = 0,
    commissionRateOverride?: number
  ): OrderCommissionSummary {
    const rawSubtotalCents = items.reduce((sum, it) => sum + Math.round(it.subtotal * 100), 0);
    const discountCents = Math.round(Math.max(0, totalDiscount) * 100);

    const effectiveRate = typeof commissionRateOverride === 'number' && commissionRateOverride >= 0 && commissionRateOverride <= 1
      ? commissionRateOverride
      : DEFAULT_MARKETPLACE_COMMISSION_RATE;

    const calculatedItems: CalculatedItemCommission[] = [];
    let allocatedDiscountCents = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const isPlatform = this.isPlatformOwned(item.sellerId);
      const itemSubtotalCents = Math.round(item.subtotal * 100);

      // Pro-rata discount allocation
      let itemDiscountCents = 0;
      if (rawSubtotalCents > 0 && discountCents > 0) {
        if (i === items.length - 1) {
          // Last item absorbs any rounding remainder
          itemDiscountCents = Math.max(0, discountCents - allocatedDiscountCents);
        } else {
          itemDiscountCents = Math.round((itemSubtotalCents / rawSubtotalCents) * discountCents);
          allocatedDiscountCents += itemDiscountCents;
        }
      }

      // Net eligible merchandise subtotal after discount
      const eligibleSubtotalCents = Math.max(0, itemSubtotalCents - itemDiscountCents);
      const eligibleSubtotal = parseFloat((eligibleSubtotalCents / 100).toFixed(2));

      if (isPlatform) {
        // Platform merchandise: no 3rd-party commission or seller net
        calculatedItems.push({
          productId: item.productId,
          name: item.name,
          sellerId: item.sellerId || 'seller-apaibay-official',
          quantity: item.quantity,
          eligibleSubtotalCents,
          eligibleSubtotal,
          commissionRate: 0,
          commissionAmountCents: 0,
          commissionAmount: 0,
          sellerNetCents: 0,
          sellerNet: 0,
          isPlatformOwned: true,
        });
      } else {
        // 3rd-Party Seller merchandise:
        // Platform Commission = Math.round(eligibleSubtotalCents * commissionRate)
        const commissionAmountCents = Math.round(eligibleSubtotalCents * effectiveRate);
        const sellerNetCents = Math.max(0, eligibleSubtotalCents - commissionAmountCents);

        calculatedItems.push({
          productId: item.productId,
          name: item.name,
          sellerId: item.sellerId,
          quantity: item.quantity,
          eligibleSubtotalCents,
          eligibleSubtotal,
          commissionRate: effectiveRate,
          commissionAmountCents,
          commissionAmount: parseFloat((commissionAmountCents / 100).toFixed(2)),
          sellerNetCents,
          sellerNet: parseFloat((sellerNetCents / 100).toFixed(2)),
          isPlatformOwned: false,
        });
      }
    }

    const totalEligibleSubtotalCents = calculatedItems.reduce((s, it) => s + it.eligibleSubtotalCents, 0);
    const totalPlatformCommissionCents = calculatedItems.reduce((s, it) => s + it.commissionAmountCents, 0);
    const totalSellerNetCents = calculatedItems.reduce((s, it) => s + it.sellerNetCents, 0);

    return {
      items: calculatedItems,
      totalEligibleSubtotalCents,
      totalEligibleSubtotal: parseFloat((totalEligibleSubtotalCents / 100).toFixed(2)),
      totalPlatformCommissionCents,
      totalPlatformCommission: parseFloat((totalPlatformCommissionCents / 100).toFixed(2)),
      totalSellerNetCents,
      totalSellerNet: parseFloat((totalSellerNetCents / 100).toFixed(2)),
    };
  }
}

import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  collection,
  query,
  where,
  runTransaction,
  isTestInMemoryMode,
  clearServerFirestoreTestStore,
} from '../repositories/serverFirestore';
import { CommissionService, CommissionCalculationItem, DEFAULT_MARKETPLACE_COMMISSION_RATE } from './commissionService';
import { AuthenticatedUser, hasPermission } from '../auth/roles';
import {
  SellerLedgerEntry,
  SellerLedgerStatus,
  SellerFinancialSummary,
  SellerPayoutRequest,
  PayoutStatus,
  PayoutDestination,
  Seller,
} from '../../src/types';
import { AdminActivityLogService } from '../admin/adminActivityLogService';
import { DisputeService } from './disputeService';
import { KycService } from './kycService';

export const SELLER_LEDGER_COLLECTION = 'sellerLedger';
export const SELLER_PAYOUTS_COLLECTION = 'seller_payouts';
export const MINIMUM_PAYOUT_AMOUNT = 20.00; // $20.00 USD minimum withdrawal threshold
export const SUPPORTED_PAYOUT_CURRENCY = 'USD';
export const DEFAULT_SETTLEMENT_HOLD_DAYS = 7;

export const PROVIDER_LIMITATION_NOTICE =
  'Sandbox Accounting Mode: Standard Cambodian acquiring APIs (ABA PayWay, Bakong KHQR, Wing Bank) and NOWPayments sandbox operate as one-way payment acceptance gateways without automated sub-merchant split custody or outbound escrow disbursement. Internal ledger balances represent server-verified accounting allocations awaiting manual/corporate batch payout confirmation.';

/**
 * Masks sensitive destination account numbers / wallet addresses before storage or API responses.
 */
export function maskAccountNumber(rawAccount: string, method?: string): string {
  const clean = (rawAccount || '').trim();
  if (!clean) return '****';
  if (method === 'crypto_usdt' && clean.length > 10) {
    return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
  }
  if (clean.length <= 4) {
    return `****${clean}`;
  }
  const visible = clean.slice(-4);
  return `${'*'.repeat(Math.min(8, Math.max(4, clean.length - 4)))}${visible}`;
}

export class SellerLedgerService {
  // In-memory cache & fallback for test isolation and Firestore unavailability resilience
  private static memoryLedger: Map<string, SellerLedgerEntry> = new Map();
  private static memoryPayouts: Map<string, SellerPayoutRequest> = new Map();

  // Per-seller concurrency mutex to strictly serialize withdrawal creation
  private static payoutMutexes: Map<string, Promise<void>> = new Map();

  // Admin-configurable commission rates & settlement hold window
  private static platformCommissionRateOverride: number | undefined = undefined;
  private static sellerCommissionOverrides: Map<string, number> = new Map();
  private static settlementHoldDaysOverride: number | undefined = undefined;

  /**
   * Acquires an async mutex per sellerId so concurrent withdrawal requests execute serially.
   */
  private static async withSellerPayoutLock<T>(sellerId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.payoutMutexes.get(sellerId) || Promise.resolve();
    let releaseCurrent!: () => void;
    const currentLock = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const chained = previous.then(() => currentLock);
    this.payoutMutexes.set(sellerId, chained);

    await previous;
    try {
      return await task();
    } finally {
      releaseCurrent();
      if (this.payoutMutexes.get(sellerId) === chained) {
        this.payoutMutexes.delete(sellerId);
      }
    }
  }

  /**
   * Returns active settlement hold period (in days after delivery confirmation).
   */
  static getSettlementHoldDays(): number {
    if (typeof this.settlementHoldDaysOverride === 'number' && this.settlementHoldDaysOverride >= 0) {
      return this.settlementHoldDaysOverride;
    }
    const envVal = process.env.SELLER_SETTLEMENT_HOLD_DAYS;
    if (envVal !== undefined && envVal.trim() !== '') {
      const parsed = Number(envVal);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }
    return DEFAULT_SETTLEMENT_HOLD_DAYS;
  }

  /**
   * Admin configuration for settlement hold window (in days).
   */
  static async setSettlementHoldDays(days: number, user: AuthenticatedUser): Promise<number> {
    if (!hasPermission(user, 'manage_payouts') && !user.isSuperAdmin && !user.isFinanceManager) {
      throw new Error('FORBIDDEN_SETTLEMENT_CONFIG: Only authorized administrators or Finance Managers can update settlement hold settings.');
    }
    if (typeof days !== 'number' || isNaN(days) || days < 0 || days > 90) {
      throw new Error('Settlement hold period must be between 0 and 90 days.');
    }
    const previous = this.getSettlementHoldDays();
    this.settlementHoldDaysOverride = days;

    await AdminActivityLogService.logAction({
      admin: user,
      action: 'SETTING_UPDATE',
      targetResourceId: 'settlement_hold_days',
      targetResourceType: 'setting',
      previousValue: { settlementHoldDays: previous },
      newValue: { settlementHoldDays: days },
    }).catch(() => {});

    return days;
  }

  /**
   * Resolves effective commission rate for a seller (seller override > platform override > 5% default).
   */
  static async getEffectiveCommissionRate(sellerId?: string): Promise<number> {
    if (sellerId && this.sellerCommissionOverrides.has(sellerId)) {
      return this.sellerCommissionOverrides.get(sellerId)!;
    }
    if (sellerId && !CommissionService.isPlatformOwned(sellerId)) {
      const sellerRef = doc(db, 'sellers', sellerId);
      const snap = await getDoc(sellerRef);
      if (snap.exists()) {
        const data = snap.data() as Seller;
        if (typeof data.commissionRate === 'number' && data.commissionRate >= 0 && data.commissionRate <= 0.5) {
          this.sellerCommissionOverrides.set(sellerId, data.commissionRate);
          return data.commissionRate;
        }
      }
    }
    if (typeof this.platformCommissionRateOverride === 'number') {
      return this.platformCommissionRateOverride;
    }
    return DEFAULT_MARKETPLACE_COMMISSION_RATE;
  }

  /**
   * Admin-only update of default marketplace commission rate or seller-specific rate.
   */
  static async updateCommissionRate(
    rate: number,
    user: AuthenticatedUser,
    sellerId?: string
  ): Promise<{ sellerId?: string; commissionRate: number }> {
    if (!hasPermission(user, 'manage_payouts') && !user.isSuperAdmin && !user.isFinanceManager) {
      throw new Error('FORBIDDEN_COMMISSION_CONFIG: Only authorized administrators or Finance Managers can update commission rates.');
    }
    if (typeof rate !== 'number' || isNaN(rate) || rate < 0 || rate > 0.5) {
      throw new Error('Commission rate must be a decimal between 0 and 0.50 (e.g., 0.05 for 5%).');
    }

    const previousRate = await this.getEffectiveCommissionRate(sellerId);
    const now = new Date().toISOString();

    if (sellerId) {
      this.sellerCommissionOverrides.set(sellerId, rate);
      await setDoc(
        doc(db, 'sellers', sellerId),
        {
          commissionRate: rate,
          updatedAt: now,
        },
        { merge: true }
      );
    } else {
      this.platformCommissionRateOverride = rate;
      await setDoc(
        doc(db, 'settings', 'commission'),
        {
          defaultCommissionRate: rate,
          updatedBy: user.email || user.uid,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    await AdminActivityLogService.logAction({
      admin: user,
      action: 'COMMISSION_RATE_UPDATED',
      targetResourceId: sellerId || 'platform_default',
      targetResourceType: 'setting',
      previousValue: { commissionRate: previousRate },
      newValue: { commissionRate: rate },
      metadata: { sellerId: sellerId || 'all' },
    }).catch(() => {});

    return { sellerId, commissionRate: rate };
  }

  /**
   * Generates a deterministic ledger entry ID for guaranteed idempotency.
   */
  static getLedgerEntryId(
    orderId: string,
    sellerId: string,
    productId: string,
    type: 'sale' | 'refund_adjustment' | 'cancellation_adjustment'
  ): string {
    const cleanOrder = orderId.replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanSeller = sellerId.replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanProduct = productId.replace(/[^a-zA-Z0-9_-]/g, '');
    return `ledg_${cleanOrder}_${cleanSeller}_${cleanProduct}_${type}`;
  }

  /**
   * Records ledger entries for an order atomically and idempotently.
   * Commission is calculated strictly server-side using integer cents.
   */
  static async recordOrderCommissions(
    order: {
      id: string;
      items: Array<{
        productId: string;
        name: string;
        sellerId?: string;
        unitPrice: number;
        quantity: number;
        subtotal: number;
      }>;
      discount?: number;
      shippingFee?: number;
      paymentStatus?: string;
      orderStatus?: string;
      status?: string;
    },
    isPaid: boolean = false,
    commissionRateOverride?: number
  ): Promise<SellerLedgerEntry[]> {
    if (!order.items || order.items.length === 0) {
      return [];
    }

    // Resolve authoritative commission rate (supports seller-specific rate or admin platform rate)
    let resolvedRate = commissionRateOverride;
    if (resolvedRate === undefined) {
      const firstThirdParty = order.items.find((it) => !CommissionService.isPlatformOwned(it.sellerId));
      resolvedRate = await this.getEffectiveCommissionRate(firstThirdParty?.sellerId);
    }

    const calcItems: CommissionCalculationItem[] = order.items.map((it) => ({
      productId: it.productId,
      name: it.name,
      sellerId: it.sellerId || 'seller-apaibay-official',
      unitPrice: it.unitPrice,
      quantity: it.quantity,
      subtotal: it.subtotal,
    }));

    const summary = CommissionService.calculateOrderCommissions(calcItems, order.discount || 0, resolvedRate);
    const createdEntries: SellerLedgerEntry[] = [];
    const now = new Date().toISOString();

    const orderPaid = isPaid || order.paymentStatus === 'paid';
    const orderCancelled = order.orderStatus === 'Cancelled' || order.status === 'Cancelled';
    const orderDelivered = order.orderStatus === 'Delivered' || order.status === 'Delivered';
    const holdDays = this.getSettlementHoldDays();

    let initialStatus: SellerLedgerStatus = 'calculated';
    let initialPayoutStatus: SellerLedgerEntry['payoutStatus'] = 'not_configured';
    let deliveredAt: string | undefined;
    let settlementEligibleAt: string | undefined;

    if (orderCancelled) {
      initialStatus = 'cancelled';
      initialPayoutStatus = 'unavailable';
    } else if (orderPaid && orderDelivered && holdDays === 0) {
      initialStatus = 'available';
      initialPayoutStatus = 'available';
      deliveredAt = now;
      settlementEligibleAt = now;
    } else if (orderPaid) {
      initialStatus = 'pending_settlement';
      initialPayoutStatus = 'pending';
      if (orderDelivered) {
        deliveredAt = now;
        settlementEligibleAt = new Date(Date.now() + holdDays * 86400000).toISOString();
      }
    }

    for (const item of summary.items) {
      // Support distinct commission rate per seller if multi-vendor cart
      let effectiveItem = item;
      if (!item.isPlatformOwned && commissionRateOverride === undefined) {
        const sellerRate = await this.getEffectiveCommissionRate(item.sellerId);
        if (sellerRate !== resolvedRate) {
          const recalc = CommissionService.calculateOrderCommissions(
            [{
              productId: item.productId,
              name: item.name,
              sellerId: item.sellerId,
              unitPrice: item.eligibleSubtotal / Math.max(1, item.quantity),
              quantity: item.quantity,
              subtotal: item.eligibleSubtotal,
            }],
            0,
            sellerRate
          );
          if (recalc.items[0]) {
            effectiveItem = recalc.items[0];
          }
        }
      }

      const entryId = this.getLedgerEntryId(order.id, effectiveItem.sellerId, effectiveItem.productId, 'sale');

      if (isTestInMemoryMode() && this.memoryLedger.has(entryId)) {
        createdEntries.push(this.memoryLedger.get(entryId)!);
        continue;
      }

      const entryRef = doc(db, SELLER_LEDGER_COLLECTION, entryId);
      const existingSnap = await getDoc(entryRef);
      if (existingSnap.exists()) {
        const loaded = existingSnap.data() as SellerLedgerEntry;
        if (isTestInMemoryMode()) {
          this.memoryLedger.set(entryId, loaded);
        }
        createdEntries.push(loaded);
        continue;
      }

      const entry: SellerLedgerEntry = {
        id: entryId,
        orderId: order.id,
        sellerId: effectiveItem.sellerId,
        productId: effectiveItem.productId,
        productName: effectiveItem.name,
        quantity: effectiveItem.quantity,
        currency: 'USD',
        eligibleSubtotal: effectiveItem.eligibleSubtotal,
        eligibleSubtotalCents: effectiveItem.eligibleSubtotalCents,
        commissionRate: effectiveItem.commissionRate,
        commissionAmount: effectiveItem.commissionAmount,
        commissionAmountCents: effectiveItem.commissionAmountCents,
        netAmount: effectiveItem.sellerNet,
        netAmountCents: effectiveItem.sellerNetCents,
        refundedCents: 0,
        type: 'sale',
        status: initialStatus,
        payoutStatus: initialPayoutStatus,
        isPlatformOwned: effectiveItem.isPlatformOwned,
        deliveredAt,
        settlementEligibleAt,
        createdAt: now,
      };

      if (isTestInMemoryMode()) {
        this.memoryLedger.set(entryId, entry);
      }

      await setDoc(entryRef, entry);
      createdEntries.push(entry);
    }

    return createdEntries;
  }

  /**
   * Confirms payment for an order and moves ledger entries from 'calculated' to 'pending_settlement'.
   */
  static async confirmPaymentSettlement(orderId: string): Promise<SellerLedgerEntry[]> {
    const updatedEntries: SellerLedgerEntry[] = [];
    const entries = await this.getOrderLedgerEntries(orderId);

    for (const entry of entries) {
      if (entry.type === 'sale' && (entry.status === 'calculated' || !entry.status)) {
        const updated: SellerLedgerEntry = {
          ...entry,
          status: 'pending_settlement',
          payoutStatus: 'pending',
        };
        if (isTestInMemoryMode()) {
          this.memoryLedger.set(updated.id, updated);
        }
        const entryRef = doc(db, SELLER_LEDGER_COLLECTION, updated.id);
        await updateDoc(entryRef, {
          status: 'pending_settlement',
          payoutStatus: 'pending',
        });
        updatedEntries.push(updated);
      } else {
        updatedEntries.push(entry);
      }
    }

    return updatedEntries;
  }

  /**
   * Confirms delivery for an order and calculates the dispute/return hold end timestamp.
   * Funds remain strictly 'pending_settlement' until BOTH:
   * 1. Order payment is confirmed & order is not cancelled/refunded/disputed.
   * 2. The configured dispute/return hold window (default 7 days) has elapsed.
   */
  static async confirmDeliverySettlement(
    orderId: string,
    options?: { holdDays?: number; deliveredAt?: string; now?: Date }
  ): Promise<SellerLedgerEntry[]> {
    const entries = await this.getOrderLedgerEntries(orderId);
    const nowDate = options?.now || new Date();
    const deliveredAt = options?.deliveredAt || nowDate.toISOString();
    const holdDays = options?.holdDays !== undefined ? options.holdDays : this.getSettlementHoldDays();
    const eligibleMs = new Date(deliveredAt).getTime() + Math.max(0, holdDays) * 86400000;
    const settlementEligibleAt = new Date(eligibleMs).toISOString();

    // Check order state & active disputes if available
    let orderPaymentUnconfirmed = false;
    let orderCancelledOrRefunded = false;
    const orderSnap = await getDoc(doc(db, 'orders', orderId));
    if (orderSnap.exists()) {
      const ord = orderSnap.data() as any;
      if (ord.status === 'Cancelled' || ord.orderStatus === 'Cancelled' || ord.paymentStatus === 'refunded' || ord.paymentStatus === 'failed' || ord.paymentStatus === 'expired') {
        orderCancelledOrRefunded = true;
      }
      if (ord.paymentStatus && ord.paymentStatus !== 'paid') {
        orderPaymentUnconfirmed = true;
      }
    }

    let hasActiveDispute = false;
    const disputes = await DisputeService.listDisputesForOrder(orderId);
    hasActiveDispute = disputes.some(
      (d) => d.status === 'open' || d.status === 'under_review'
    );
    if (disputes.some((d) => d.status === 'resolved_refunded')) {
      orderCancelledOrRefunded = true;
    }

    const updatedEntries: SellerLedgerEntry[] = [];

    for (const entry of entries) {
      if (entry.type !== 'sale') {
        updatedEntries.push(entry);
        continue;
      }

      if (entry.status === 'held' || entry.status === 'settled' || entry.status === 'payout_requested' || entry.status === 'cancelled') {
        updatedEntries.push(entry);
        continue;
      }

      if (orderCancelledOrRefunded) {
        const cancelled: SellerLedgerEntry = { ...entry, status: 'cancelled', payoutStatus: 'unavailable' };
        if (isTestInMemoryMode()) {
          this.memoryLedger.set(cancelled.id, cancelled);
        }
        await updateDoc(doc(db, SELLER_LEDGER_COLLECTION, cancelled.id), {
          status: 'cancelled',
          payoutStatus: 'unavailable',
        });
        updatedEntries.push(cancelled);
        continue;
      }

      if (hasActiveDispute) {
        const held: SellerLedgerEntry = { ...entry, status: 'held', payoutStatus: 'held', deliveredAt, settlementEligibleAt };
        if (isTestInMemoryMode()) {
          this.memoryLedger.set(held.id, held);
        }
        await updateDoc(doc(db, SELLER_LEDGER_COLLECTION, held.id), {
          status: 'held',
          payoutStatus: 'held',
          deliveredAt,
          settlementEligibleAt,
        });
        updatedEntries.push(held);
        continue;
      }

      // Never release funds for unconfirmed payments ('calculated' without paid order)
      if (entry.status === 'calculated' && orderPaymentUnconfirmed) {
        updatedEntries.push(entry);
        continue;
      }

      const windowElapsed = nowDate.getTime() >= eligibleMs;
      const paymentConfirmed = entry.status === 'pending_settlement' || entry.status === 'available' || !orderPaymentUnconfirmed;

      // Only release immediately if hold window has ended AND payment is confirmed
      const nextStatus: SellerLedgerStatus = paymentConfirmed && windowElapsed ? 'available' : 'pending_settlement';
      const nextPayoutStatus: SellerLedgerEntry['payoutStatus'] = nextStatus === 'available' ? 'available' : 'pending';

      const updated: SellerLedgerEntry = {
        ...entry,
        status: nextStatus,
        payoutStatus: nextPayoutStatus,
        deliveredAt,
        settlementEligibleAt,
      };

      if (isTestInMemoryMode()) {
        this.memoryLedger.set(updated.id, updated);
      }
      await updateDoc(doc(db, SELLER_LEDGER_COLLECTION, updated.id), {
        status: nextStatus,
        payoutStatus: nextPayoutStatus,
        deliveredAt,
        settlementEligibleAt,
      });

      updatedEntries.push(updated);
    }

    return updatedEntries;
  }

  /**
   * Releases all matured pending settlements whose delivery was confirmed and hold window ended.
   */
  static async releaseMaturedSettlements(options?: {
    orderId?: string;
    sellerId?: string;
    now?: Date;
  }): Promise<SellerLedgerEntry[]> {
    const nowMs = (options?.now || new Date()).getTime();
    const candidates = new Map<string, SellerLedgerEntry>();

    if (isTestInMemoryMode()) {
      for (const entry of this.memoryLedger.values()) {
        if (
          entry.type === 'sale' &&
          entry.status === 'pending_settlement' &&
          (!options?.orderId || entry.orderId === options.orderId) &&
          (!options?.sellerId || entry.sellerId === options.sellerId)
        ) {
          candidates.set(entry.id, entry);
        }
      }
    }

    if (options?.orderId || options?.sellerId || !isTestInMemoryMode()) {
      const ledgerCol = collection(db, SELLER_LEDGER_COLLECTION);
      const q = options?.orderId
        ? query(ledgerCol, where('orderId', '==', options.orderId))
        : options?.sellerId
        ? query(ledgerCol, where('sellerId', '==', options.sellerId))
        : ledgerCol;
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        const data = d.data() as SellerLedgerEntry;
        if (isTestInMemoryMode()) {
          this.memoryLedger.set(data.id, data);
        }
        if (data.type === 'sale' && data.status === 'pending_settlement') {
          candidates.set(data.id, data);
        }
      });
    }

    const released: SellerLedgerEntry[] = [];
    const orderDisputeCache = new Map<string, boolean>();
    const orderStateBlockedCache = new Map<string, boolean>();

    for (const entry of candidates.values()) {
      if (!entry.deliveredAt || !entry.settlementEligibleAt) {
        continue;
      }

      const eligibleMs = new Date(entry.settlementEligibleAt).getTime();
      if (isNaN(eligibleMs) || nowMs < eligibleMs) {
        continue;
      }

      if (!orderDisputeCache.has(entry.orderId)) {
        const disputes = await DisputeService.listDisputesForOrder(entry.orderId);
        const blocked = disputes.some(
          (d) => d.status === 'open' || d.status === 'under_review' || d.status === 'resolved_refunded'
        );
        orderDisputeCache.set(entry.orderId, blocked);
      }
      if (orderDisputeCache.get(entry.orderId)) {
        continue;
      }

      if (!orderStateBlockedCache.has(entry.orderId)) {
        let stateBlocked = false;
        const ordSnap = await getDoc(doc(db, 'orders', entry.orderId));
        if (ordSnap.exists()) {
          const ord = ordSnap.data() as any;
          if (
            ord.status === 'Cancelled' ||
            ord.orderStatus === 'Cancelled' ||
            ord.paymentStatus === 'refunded' ||
            ord.paymentStatus === 'failed' ||
            ord.paymentStatus === 'expired' ||
            (ord.paymentStatus && ord.paymentStatus !== 'paid')
          ) {
            stateBlocked = true;
          }
        }
        orderStateBlockedCache.set(entry.orderId, stateBlocked);
      }
      if (orderStateBlockedCache.get(entry.orderId)) {
        continue;
      }

      const updated: SellerLedgerEntry = {
        ...entry,
        status: 'available',
        payoutStatus: 'available',
      };
      if (isTestInMemoryMode()) {
        this.memoryLedger.set(updated.id, updated);
      }
      await updateDoc(doc(db, SELLER_LEDGER_COLLECTION, updated.id), {
        status: 'available',
        payoutStatus: 'available',
      });
      released.push(updated);
    }

    return released;
  }

  /**
   * Authoritative manual/admin settlement release check for a single order.
   * Rejects if payment unconfirmed, cancelled/refunded, disputed, not delivered, or hold window active.
   */
  static async releaseOrderSettlement(
    orderId: string,
    user: AuthenticatedUser,
    options?: { now?: Date }
  ): Promise<SellerLedgerEntry[]> {
    if (!hasPermission(user, 'manage_payouts') && !user.isSuperAdmin && !user.isFinanceManager) {
      throw new Error('FORBIDDEN_SETTLEMENT_RELEASE: Only authorized administrators or Finance Managers can trigger settlement release.');
    }

    const entries = await this.getOrderLedgerEntries(orderId);
    const sales = entries.filter((e) => e.type === 'sale');
    if (sales.length === 0) {
      throw new Error(`ORDER_LEDGER_NOT_FOUND: No ledger entries found for Order #${orderId}.`);
    }

    const now = options?.now || new Date();

    for (const sale of sales) {
      if (sale.status === 'cancelled') {
        throw new Error(`SETTLEMENT_BLOCKED_CANCELLED: Order #${orderId} was cancelled or refunded and cannot be released.`);
      }
      if (sale.status === 'held') {
        throw new Error(`SETTLEMENT_BLOCKED_DISPUTE_HOLD: Order #${orderId} is currently held due to a dispute or compliance check.`);
      }
      if (sale.status === 'calculated') {
        throw new Error(`SETTLEMENT_BLOCKED_UNPAID: Payment for Order #${orderId} is not yet confirmed.`);
      }
      if (!sale.deliveredAt) {
        throw new Error(`SETTLEMENT_BLOCKED_UNDELIVERED: Delivery for Order #${orderId} has not been confirmed yet.`);
      }
      if (sale.settlementEligibleAt && now.getTime() < new Date(sale.settlementEligibleAt).getTime()) {
        throw new Error(
          `SETTLEMENT_HOLD_PERIOD_ACTIVE: Funds for Order #${orderId} cannot be released before the dispute/return period ends on ${sale.settlementEligibleAt}.`
        );
      }
    }

    const released = await this.releaseMaturedSettlements({ orderId, now });
    if (released.length > 0) {
      await AdminActivityLogService.logAction({
        admin: user,
        action: 'SETTLEMENT_RELEASED',
        targetResourceId: orderId,
        targetResourceType: 'payment',
        newValue: { releasedCount: released.length },
      }).catch(() => {});
    }

    return await this.getOrderLedgerEntries(orderId);
  }

  /**
   * Places an order's settlement on hold due to dispute, return, or inquiry.
   */
  static async holdOrderSettlement(
    orderId: string,
    disputeId: string,
    reason?: string
  ): Promise<SellerLedgerEntry[]> {
    const updatedEntries: SellerLedgerEntry[] = [];
    const entries = await this.getOrderLedgerEntries(orderId);

    for (const entry of entries) {
      if (entry.type === 'sale' && entry.status !== 'settled' && entry.status !== 'cancelled') {
        const updated: SellerLedgerEntry = {
          ...entry,
          status: 'held',
          payoutStatus: 'held',
          disputeHoldId: disputeId,
        };

        if (isTestInMemoryMode()) {
          this.memoryLedger.set(updated.id, updated);
        }
        const entryRef = doc(db, SELLER_LEDGER_COLLECTION, updated.id);
        await updateDoc(entryRef, {
          status: 'held',
          payoutStatus: 'held',
          disputeHoldId: disputeId,
        });

        updatedEntries.push(updated);
      } else {
        updatedEntries.push(entry);
      }
    }

    return updatedEntries;
  }

  /**
   * Releases an order's hold (e.g. dispute rejected or resolved in seller favor).
   * Respects the dispute/return hold window: moves to 'available' ONLY if delivered AND window elapsed.
   */
  static async releaseOrderHold(
    orderId: string,
    isDeliveredOrOpts: boolean | { isDelivered?: boolean; now?: Date } = true
  ): Promise<SellerLedgerEntry[]> {
    const updatedEntries: SellerLedgerEntry[] = [];
    const entries = await this.getOrderLedgerEntries(orderId);
    const nowDate = typeof isDeliveredOrOpts === 'object' && isDeliveredOrOpts.now ? isDeliveredOrOpts.now : new Date();
    const isDeliveredFlag = typeof isDeliveredOrOpts === 'boolean' ? isDeliveredOrOpts : (isDeliveredOrOpts.isDelivered ?? true);

    for (const entry of entries) {
      if (entry.type === 'sale' && entry.status === 'held') {
        const hasDelivery = Boolean(entry.deliveredAt) || isDeliveredFlag;
        const holdWindowElapsed = entry.settlementEligibleAt
          ? nowDate.getTime() >= new Date(entry.settlementEligibleAt).getTime()
          : (hasDelivery && this.getSettlementHoldDays() === 0) || (!entry.settlementEligibleAt && isDeliveredFlag);

        const targetStatus: SellerLedgerStatus = hasDelivery && holdWindowElapsed ? 'available' : 'pending_settlement';
        const targetPayoutStatus: SellerLedgerEntry['payoutStatus'] = targetStatus === 'available' ? 'available' : 'pending';

        const updated: SellerLedgerEntry = {
          ...entry,
          status: targetStatus,
          payoutStatus: targetPayoutStatus,
          disputeHoldId: undefined,
        };

        if (isTestInMemoryMode()) {
          this.memoryLedger.set(updated.id, updated);
        }
        const entryRef = doc(db, SELLER_LEDGER_COLLECTION, updated.id);
        await updateDoc(entryRef, {
          status: targetStatus,
          payoutStatus: targetPayoutStatus,
          disputeHoldId: null,
        });

        updatedEntries.push(updated);
      } else {
        updatedEntries.push(entry);
      }
    }

    return updatedEntries;
  }

  /**
   * Helper to retrieve all ledger entries for a specific order.
   */
  static async getOrderLedgerEntries(orderId: string): Promise<SellerLedgerEntry[]> {
    const entriesMap = new Map<string, SellerLedgerEntry>();

    if (isTestInMemoryMode()) {
      for (const entry of this.memoryLedger.values()) {
        if (entry.orderId === orderId) {
          entriesMap.set(entry.id, entry);
        }
      }
    }

    const ledgerCol = collection(db, SELLER_LEDGER_COLLECTION);
    const q = query(ledgerCol, where('orderId', '==', orderId));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const data = d.data() as SellerLedgerEntry;
      entriesMap.set(data.id, data);
      if (isTestInMemoryMode()) {
        this.memoryLedger.set(data.id, data);
      }
    });

    return Array.from(entriesMap.values());
  }

  /**
   * Records refund or cancellation adjustments idempotently for an order.
   * Supports full adjustments (refundRatio = 1) as well as partial refunds (0 < refundRatio < 1).
   */
  static async recordOrderAdjustment(
    orderId: string,
    adjustmentType: 'refund_adjustment' | 'cancellation_adjustment',
    reason?: string,
    refundRatio: number = 1
  ): Promise<SellerLedgerEntry[]> {
    const ratio = Math.max(0, Math.min(1, Number(refundRatio) || 1));
    const entries = await this.getOrderLedgerEntries(orderId);

    const existingSales = entries.filter((e) => e.type === 'sale');
    const existingAdjustments = entries.filter((e) => e.type === adjustmentType);

    // If full adjustment already exists, return idempotently
    if (ratio >= 0.999 && existingAdjustments.length > 0 && existingSales.every((s) => s.status === 'cancelled')) {
      return existingAdjustments;
    }

    const createdAdjustments: SellerLedgerEntry[] = [];
    const now = new Date().toISOString();

    for (const sale of existingSales) {
      const isFullRefund = ratio >= 0.999;
      const targetSubtotalRefundedCents = Math.round(sale.eligibleSubtotalCents * ratio);
      const targetCommissionRefundedCents = Math.round(sale.commissionAmountCents * ratio);
      const targetNetRefundedCents = Math.round(sale.netAmountCents * ratio);

      // Compute prior refunded cents for this sale so multiple partial refunds scale accurately
      const priorAdjustmentsForSale = entries.filter(
        (e) => e.type !== 'sale' && e.relatedLedgerId === sale.id
      );
      const priorNetRefundedCents = priorAdjustmentsForSale.reduce(
        (sum, e) => sum + Math.abs(e.netAmountCents),
        0
      );

      if (priorNetRefundedCents >= sale.netAmountCents && sale.netAmountCents > 0) {
        if (priorAdjustmentsForSale.length > 0) {
          createdAdjustments.push(priorAdjustmentsForSale[0]);
        }
        continue;
      }

      const deltaNetCents = Math.max(0, targetNetRefundedCents - priorNetRefundedCents);
      if (deltaNetCents === 0 && !isFullRefund) {
        continue;
      }

      const adjId = isFullRefund && priorAdjustmentsForSale.length === 0
        ? this.getLedgerEntryId(orderId, sale.sellerId, sale.productId, adjustmentType)
        : `${this.getLedgerEntryId(orderId, sale.sellerId, sale.productId, adjustmentType)}_p${priorAdjustmentsForSale.length + 1}`;

      if (isTestInMemoryMode() && this.memoryLedger.has(adjId)) {
        createdAdjustments.push(this.memoryLedger.get(adjId)!);
        continue;
      }

      const priorSubtotalCents = priorAdjustmentsForSale.reduce((sum, e) => sum + Math.abs(e.eligibleSubtotalCents), 0);
      const priorCommCents = priorAdjustmentsForSale.reduce((sum, e) => sum + Math.abs(e.commissionAmountCents), 0);

      const deltaSubtotalCents = Math.max(0, targetSubtotalRefundedCents - priorSubtotalCents);
      const deltaCommissionCents = Math.max(0, targetCommissionRefundedCents - priorCommCents);

      const adjEntry: SellerLedgerEntry = {
        id: adjId,
        orderId,
        sellerId: sale.sellerId,
        productId: sale.productId,
        productName: sale.productName,
        quantity: sale.quantity,
        currency: sale.currency || 'USD',
        eligibleSubtotal: parseFloat((-deltaSubtotalCents / 100).toFixed(2)),
        eligibleSubtotalCents: -deltaSubtotalCents,
        commissionRate: sale.commissionRate,
        commissionAmount: parseFloat((-deltaCommissionCents / 100).toFixed(2)),
        commissionAmountCents: -deltaCommissionCents,
        netAmount: parseFloat((-deltaNetCents / 100).toFixed(2)),
        netAmountCents: -deltaNetCents,
        type: adjustmentType,
        status: 'settled',
        payoutStatus: 'not_configured',
        isPlatformOwned: sale.isPlatformOwned,
        relatedLedgerId: sale.id,
        createdAt: now,
      };

      if (isTestInMemoryMode()) {
        this.memoryLedger.set(adjId, adjEntry);
      }
      await setDoc(doc(db, SELLER_LEDGER_COLLECTION, adjId), adjEntry);

      const updatedRefundedCents = priorNetRefundedCents + deltaNetCents;
      const fullyCancelled = isFullRefund || updatedRefundedCents >= sale.netAmountCents;

      const updatedSale: SellerLedgerEntry = {
        ...sale,
        refundedCents: updatedRefundedCents,
        status: fullyCancelled ? 'cancelled' : sale.status,
        payoutStatus: fullyCancelled ? 'unavailable' : sale.payoutStatus,
      };
      if (isTestInMemoryMode()) {
        this.memoryLedger.set(sale.id, updatedSale);
      }
      await updateDoc(doc(db, SELLER_LEDGER_COLLECTION, sale.id), {
        refundedCents: updatedRefundedCents,
        status: updatedSale.status,
        payoutStatus: updatedSale.payoutStatus,
      });

      createdAdjustments.push(adjEntry);
    }

    return createdAdjustments;
  }

  /**
   * Retrieves ledger entries, payout requests, and authoritative financial summary.
   * Automatically releases any matured delivery settlements whose hold period has ended.
   */
  static async getSellerLedger(
    sellerId: string,
    user: AuthenticatedUser,
    options?: { now?: Date }
  ): Promise<{
    entries: SellerLedgerEntry[];
    summary: SellerFinancialSummary;
    payouts?: SellerPayoutRequest[];
  }> {
    // Authorization: User can only read their own seller ledger unless authorized Admin/Finance Manager
    const isOwner = user.uid === sellerId || user.sellerId === sellerId;
    const isFinancialAdmin =
      user.isSuperAdmin ||
      user.isFinanceManager ||
      hasPermission(user, 'view_financials');

    if (!isOwner && !isFinancialAdmin) {
      throw new Error('FORBIDDEN_LEDGER_ACCESS: You are not authorized to view another seller’s financial ledger.');
    }

    // Automatically promote any matured delivery settlements before computing summary
    await this.releaseMaturedSettlements({ sellerId, now: options?.now });

    const entriesMap = new Map<string, SellerLedgerEntry>();
    if (isTestInMemoryMode()) {
      for (const entry of this.memoryLedger.values()) {
        if (entry.sellerId === sellerId) {
          entriesMap.set(entry.id, entry);
        }
      }
    }

    const ledgerCol = collection(db, SELLER_LEDGER_COLLECTION);
    const q = query(ledgerCol, where('sellerId', '==', sellerId));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const data = d.data() as SellerLedgerEntry;
      entriesMap.set(data.id, data);
      if (isTestInMemoryMode()) {
        this.memoryLedger.set(data.id, data);
      }
    });

    const entries = Array.from(entriesMap.values());
    entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const payouts = await this.listPayoutsInternal(sellerId);

    let grossSalesCents = 0;
    let commissionCents = 0;
    let refundAdjustmentCents = 0;
    let netEarningsCents = 0;

    let pendingSettlementCents = 0;
    let releasedNetCents = 0;
    let onHoldCents = 0;

    for (const entry of entries) {
      if (entry.type === 'sale') {
        grossSalesCents += entry.eligibleSubtotalCents;
        commissionCents += entry.commissionAmountCents;
        netEarningsCents += entry.netAmountCents;

        const remainingNetCents = Math.max(0, entry.netAmountCents - (entry.refundedCents || 0));

        if (!entry.isPlatformOwned && entry.status !== 'cancelled') {
          if (entry.status === 'available' || entry.status === 'payout_requested' || entry.status === 'settled') {
            releasedNetCents += remainingNetCents;
          } else if (entry.status === 'held') {
            onHoldCents += remainingNetCents;
          } else if (entry.status === 'pending_settlement' || entry.status === 'calculated') {
            pendingSettlementCents += remainingNetCents;
          }
        }
      } else {
        refundAdjustmentCents += Math.abs(entry.eligibleSubtotalCents);
        commissionCents += entry.commissionAmountCents; // negative
        netEarningsCents += entry.netAmountCents; // negative
      }
    }

    // Dynamic payout math in cents (fixes partial withdrawal & failed payout restoration)
    let committedPayoutCents = 0;
    let completedPayoutCents = 0;
    for (const p of payouts) {
      if (p.status === 'pending' || p.status === 'under_review' || p.status === 'held' || p.status === 'approved') {
        committedPayoutCents += p.amountCents;
      } else if (p.status === 'completed') {
        completedPayoutCents += p.amountCents;
      }
    }

    const availableForPayoutCents = Math.max(0, releasedNetCents - committedPayoutCents - completedPayoutCents);

    const netEarnings = parseFloat((netEarningsCents / 100).toFixed(2));
    const available = parseFloat((availableForPayoutCents / 100).toFixed(2));
    const reserved = parseFloat((committedPayoutCents / 100).toFixed(2));
    const pending = parseFloat((Math.max(0, pendingSettlementCents) / 100).toFixed(2));
    const held = parseFloat((Math.max(0, onHoldCents) / 100).toFixed(2));
    const paidOut = parseFloat((completedPayoutCents / 100).toFixed(2));

    let derivedPayoutStatus: SellerFinancialSummary['payoutStatus'] = 'not_configured';
    if (netEarnings <= 0 && paidOut === 0 && reserved === 0) {
      derivedPayoutStatus = 'not_configured';
    } else if (available >= MINIMUM_PAYOUT_AMOUNT) {
      derivedPayoutStatus = 'available';
    } else if (held > 0 && available === 0) {
      derivedPayoutStatus = 'on_hold';
    } else if (pending > 0 || available > 0 || reserved > 0 || paidOut > 0) {
      derivedPayoutStatus = available > 0 ? 'available' : 'pending_settlement';
    }

    const activePayouts = payouts.filter(
      (p) => p.status === 'pending' || p.status === 'under_review' || p.status === 'held' || p.status === 'approved'
    );
    const activeCommissionRate = await this.getEffectiveCommissionRate(sellerId);

    const summary: SellerFinancialSummary = {
      sellerId,
      grossSalesMerchandise: parseFloat((grossSalesCents / 100).toFixed(2)),
      platformCommissionDeducted: parseFloat((commissionCents / 100).toFixed(2)),
      refundAdjustments: parseFloat((refundAdjustmentCents / 100).toFixed(2)),
      netCalculatedEarnings: netEarnings,
      totalSales: parseFloat((grossSalesCents / 100).toFixed(2)),
      totalCommission: parseFloat((commissionCents / 100).toFixed(2)),
      pendingSettlement: pending,
      availableForPayout: available,
      reservedForPayout: reserved,
      onHold: held,
      totalPaidOut: paidOut,
      settlementHoldDays: this.getSettlementHoldDays(),
      commissionRate: activeCommissionRate,
      minimumPayoutAmount: MINIMUM_PAYOUT_AMOUNT,
      currency: SUPPORTED_PAYOUT_CURRENCY,
      activePayoutRequestCount: activePayouts.length,
      providerLimitationNotice: PROVIDER_LIMITATION_NOTICE,
      payoutStatus: derivedPayoutStatus,
      payoutStatusMessage:
        derivedPayoutStatus === 'not_configured'
          ? 'Payouts are currently not configured (Sandbox Accounting Only). Calculated earnings are not actual disbursed funds.'
          : derivedPayoutStatus === 'available'
          ? `Available for payout ($${available.toFixed(2)} USD). Minimum threshold: $${MINIMUM_PAYOUT_AMOUNT.toFixed(2)}.`
          : derivedPayoutStatus === 'on_hold'
          ? `Funds currently on hold due to active dispute or compliance review ($${held.toFixed(2)} USD).`
          : `Settlement pending delivery confirmation & ${this.getSettlementHoldDays()}-day dispute window ($${pending.toFixed(2)} USD).`,
      totalTransactions: entries.length,
    };

    return { entries, summary, payouts };
  }

  /**
   * Creates a payout withdrawal request for an authorized seller from available balances.
   * Uses a per-seller async mutex to prevent concurrent/duplicate withdrawal race conditions.
   */
  static async createPayoutRequest(
    sellerId: string,
    amount: number,
    destination: PayoutDestination,
    user: AuthenticatedUser,
    options?: { currency?: string; now?: Date }
  ): Promise<SellerPayoutRequest> {
    // Strictly only the owning seller may request payouts for their shop
    const isOwner = user.uid === sellerId || user.sellerId === sellerId;
    if (!isOwner) {
      throw new Error('FORBIDDEN_PAYOUT_REQUEST: Only the shop owner can request payouts for their own seller account.');
    }

    if (options?.currency && options.currency.toUpperCase() !== SUPPORTED_PAYOUT_CURRENCY) {
      throw new Error(`UNSUPPORTED_PAYOUT_CURRENCY: Payouts only support ${SUPPORTED_PAYOUT_CURRENCY}.`);
    }

    if (!amount || typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      throw new Error('A valid positive withdrawal amount is required.');
    }

    const cleanAmount = parseFloat(amount.toFixed(2));
    if (cleanAmount < MINIMUM_PAYOUT_AMOUNT) {
      throw new Error(`Minimum withdrawal amount is $${MINIMUM_PAYOUT_AMOUNT.toFixed(2)} ${SUPPORTED_PAYOUT_CURRENCY}.`);
    }

    if (!destination || typeof destination !== 'object') {
      throw new Error('Payout destination details are required.');
    }
    const validMethods = ['aba_bank', 'wing_bank', 'bakong_khqr', 'crypto_usdt', 'bank_transfer'];
    if (!validMethods.includes(destination.method)) {
      throw new Error(`Unsupported payout method: ${destination.method}. Supported methods: ${validMethods.join(', ')}.`);
    }
    if (!destination.accountName || destination.accountName.trim().length < 2) {
      throw new Error('Destination account holder name is required (min 2 characters).');
    }
    if (!destination.accountNumber || destination.accountNumber.trim().length < 3) {
      throw new Error('Destination account number or address is required (min 3 characters).');
    }
    if (destination.verifiedConfirmed === false) {
      throw new Error('Please verify and confirm your payout destination details before submitting.');
    }

    return this.withSellerPayoutLock(sellerId, async () => {
      // Authoritative KYC & seller verification gate (rechecked dynamically for expiry/suspension)
      const kycCheck = await KycService.assertSellerEligibleForPayout(sellerId, { now: options?.now });
      const storeName = kycCheck.storeName || 'Verified Merchant Store';

      // Promote matured settlements before transactional reservation
      await this.releaseMaturedSettlements({ sellerId, now: options?.now });

      const payoutId = `payout_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const requestedCents = Math.round(cleanAmount * 100);
      const maskedNumber = maskAccountNumber(destination.accountNumber, destination.method);

      // Cross-instance distributed atomic reservation via Firestore transaction on seller sentinel + payout/ledger queries
      const createdPayout = await runTransaction(db, async (tx) => {
        const sellerRef = doc(db, 'sellers', sellerId);
        await tx.get(sellerRef); // Reads /sellers/{sellerId} to enforce cross-instance optimistic concurrency lock

        const payoutsQuery = query(collection(db, SELLER_PAYOUTS_COLLECTION), where('sellerId', '==', sellerId));
        const payoutsSnap = await tx.get(payoutsQuery);

        const ledgerQuery = query(collection(db, SELLER_LEDGER_COLLECTION), where('sellerId', '==', sellerId));
        const ledgerSnap = await tx.get(ledgerQuery);

        const payoutsMap = new Map<string, SellerPayoutRequest>();
        if (isTestInMemoryMode()) {
          for (const p of this.memoryPayouts.values()) {
            if (p.sellerId === sellerId) payoutsMap.set(p.id, p);
          }
        }
        payoutsSnap.docs.forEach((d: any) => {
          const p = d.data() as SellerPayoutRequest;
          payoutsMap.set(p.id, p);
        });

        const existingPayouts = Array.from(payoutsMap.values());
        const hasActivePayout = existingPayouts.some(
          (p) =>
            p.status === 'pending' ||
            p.status === 'under_review' ||
            p.status === 'held' ||
            p.status === 'approved'
        );
        if (hasActivePayout) {
          throw new Error(
            'CONCURRENT_PAYOUT_REQUEST_BLOCKED: You already have an active payout request in progress. Wait for completion or rejection before submitting another.'
          );
        }

        const ledgerMap = new Map<string, SellerLedgerEntry>();
        if (isTestInMemoryMode()) {
          for (const entry of this.memoryLedger.values()) {
            if (entry.sellerId === sellerId) ledgerMap.set(entry.id, entry);
          }
        }
        ledgerSnap.docs.forEach((d: any) => {
          const entry = d.data() as SellerLedgerEntry;
          ledgerMap.set(entry.id, entry);
        });

        let releasedNetCents = 0;
        for (const entry of ledgerMap.values()) {
          if (entry.type === 'sale' && !entry.isPlatformOwned && entry.status !== 'cancelled') {
            if (entry.status === 'available' || entry.status === 'payout_requested' || entry.status === 'settled') {
              releasedNetCents += Math.max(0, entry.netAmountCents - (entry.refundedCents || 0));
            }
          }
        }

        let committedPayoutCents = 0;
        let completedPayoutCents = 0;
        for (const p of existingPayouts) {
          if (p.status === 'pending' || p.status === 'under_review' || p.status === 'held' || p.status === 'approved') {
            committedPayoutCents += p.amountCents;
          } else if (p.status === 'completed') {
            completedPayoutCents += p.amountCents;
          }
        }

        const availableForPayoutCents = Math.max(0, releasedNetCents - committedPayoutCents - completedPayoutCents);
        if (requestedCents > availableForPayoutCents) {
          const availableBalance = parseFloat((availableForPayoutCents / 100).toFixed(2));
          throw new Error(
            `INSUFFICIENT_AVAILABLE_BALANCE: Requested amount ($${cleanAmount.toFixed(2)}) exceeds available balance ($${availableBalance.toFixed(2)}).`
          );
        }

        const now = new Date().toISOString();
        const payoutRequest: SellerPayoutRequest = {
          id: payoutId,
          sellerId,
          sellerStoreName: storeName,
          ownerUid: user.uid,
          ownerEmail: user.email || 'seller@apaibay.com',
          amount: cleanAmount,
          amountCents: requestedCents,
          currency: SUPPORTED_PAYOUT_CURRENCY,
          destination: {
            method: destination.method,
            accountName: destination.accountName.trim(),
            accountNumber: maskedNumber, // Store masked account number only — never persist raw sensitive banking digits
            maskedAccountNumber: maskedNumber,
            bankName: destination.bankName?.trim(),
            cryptoNetwork: destination.cryptoNetwork?.trim(),
            verifiedConfirmed: destination.verifiedConfirmed ?? true,
          },
          status: 'pending',
          requestedAt: now,
          updatedAt: now,
        };

        tx.set(doc(db, SELLER_PAYOUTS_COLLECTION, payoutId), payoutRequest);
        tx.set(
          sellerRef,
          {
            sellerId,
            lastPayoutRequestId: payoutId,
            lastPayoutRequestedAt: now,
            updatedAt: now,
          },
          { merge: true }
        );

        return payoutRequest;
      });

      if (isTestInMemoryMode()) {
        this.memoryPayouts.set(payoutId, createdPayout);
      }

      return createdPayout;
    });
  }

  /**
   * Internal helper to list payouts.
   */
  private static async listPayoutsInternal(sellerId?: string): Promise<SellerPayoutRequest[]> {
    const listMap = new Map<string, SellerPayoutRequest>();

    if (isTestInMemoryMode()) {
      for (const p of this.memoryPayouts.values()) {
        if (!sellerId || p.sellerId === sellerId) {
          listMap.set(p.id, p);
        }
      }
    }

    const colRef = collection(db, SELLER_PAYOUTS_COLLECTION);
    const snap = sellerId
      ? await getDocs(query(colRef, where('sellerId', '==', sellerId)))
      : await getDocs(colRef);
    snap.docs.forEach((d) => {
      const data = d.data() as SellerPayoutRequest;
      if (!sellerId || data.sellerId === sellerId) {
        listMap.set(data.id, data);
        if (isTestInMemoryMode()) {
          this.memoryPayouts.set(data.id, data);
        }
      }
    });

    const list = Array.from(listMap.values());
    list.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
    return list;
  }

  /**
   * Lists payout requests with strict multi-tenant scoping.
   */
  static async listPayoutRequests(
    filters: { sellerId?: string; status?: PayoutStatus },
    user: AuthenticatedUser
  ): Promise<SellerPayoutRequest[]> {
    const canViewAll =
      user.isSuperAdmin ||
      user.isFinanceManager ||
      hasPermission(user, 'view_financials');

    let targetSellerId = filters.sellerId;
    if (!canViewAll) {
      // Strictly reject attempts by non-admin sellers to query another seller's payouts
      if (filters.sellerId && filters.sellerId !== user.uid && filters.sellerId !== user.sellerId) {
        throw new Error('FORBIDDEN_PAYOUT_ACCESS: You cannot access another seller’s payout history.');
      }
      targetSellerId = user.sellerId || user.uid;
    }

    let list = await this.listPayoutsInternal(targetSellerId);
    if (filters.status) {
      list = list.filter((p) => p.status === filters.status);
    }
    return list;
  }

  /**
   * Retrieves a single payout request with strict ownership / finance admin authorization.
   */
  static async getPayoutRequest(payoutId: string, user: AuthenticatedUser): Promise<SellerPayoutRequest> {
    let payout = isTestInMemoryMode() ? this.memoryPayouts.get(payoutId) : undefined;

    if (!payout) {
      const snap = await getDoc(doc(db, SELLER_PAYOUTS_COLLECTION, payoutId));
      if (snap.exists()) {
        payout = snap.data() as SellerPayoutRequest;
        if (isTestInMemoryMode()) {
          this.memoryPayouts.set(payoutId, payout);
        }
      }
    }

    if (!payout) {
      throw new Error(`Payout request #${payoutId} not found.`);
    }

    const isOwner = user.uid === payout.sellerId || user.sellerId === payout.sellerId || user.uid === payout.ownerUid;
    const isFinancialAdmin =
      user.isSuperAdmin ||
      user.isFinanceManager ||
      hasPermission(user, 'view_financials') ||
      hasPermission(user, 'manage_payouts');

    if (!isOwner && !isFinancialAdmin) {
      throw new Error('FORBIDDEN_PAYOUT_ACCESS: You are not authorized to view this payout request.');
    }

    return payout;
  }

  /**
   * Step 1 of Payout Governance: Administrative Review (Approve, Reject, or Hold).
   * Clearance: SUPER_ADMIN, FINANCE_MANAGER, or ADMIN with manage_payouts permission.
   * NOTE: 'approve' moves status to 'approved' (queued for provider execution), NOT 'completed'.
   * A payout only transitions to 'completed' after authoritative provider confirmation via confirmPayoutProviderResult().
   */
  static async reviewPayoutRequest(
    payoutId: string,
    action: 'approve' | 'reject' | 'hold',
    reason: string | undefined,
    user: AuthenticatedUser
  ): Promise<SellerPayoutRequest> {
    const isAuthorized =
      user.isSuperAdmin ||
      user.isFinanceManager ||
      hasPermission(user, 'manage_payouts') ||
      hasPermission(user, 'payouts:manage');

    if (!isAuthorized) {
      throw new Error('FORBIDDEN_PAYOUT_ACTION: Only authorized administrators or Finance Managers may review payouts.');
    }

    if (action === 'reject' && (!reason || typeof reason !== 'string' || reason.trim().length < 5)) {
      throw new Error('A mandatory rejection reason (min 5 chars) is required when rejecting a payout request.');
    }

    if (!['approve', 'reject', 'hold'].includes(action)) {
      throw new Error(`Unsupported payout action: ${action}`);
    }

    const { payout, prevStatus } = await runTransaction(db, async (tx) => {
      const payoutRef = doc(db, SELLER_PAYOUTS_COLLECTION, payoutId);
      const snap = await tx.get(payoutRef);
      const existing = snap.exists()
        ? (snap.data() as SellerPayoutRequest)
        : isTestInMemoryMode()
        ? this.memoryPayouts.get(payoutId)
        : undefined;

      if (!existing) {
        throw new Error(`Payout request #${payoutId} not found.`);
      }

      if (existing.status === 'completed' || existing.status === 'rejected' || existing.status === 'failed') {
        throw new Error(`Cannot modify a terminal payout request in status: ${existing.status}`);
      }

      const previous = existing.status;
      if (action === 'approve' && existing.status === 'approved') {
        return { payout: existing, prevStatus: previous };
      }

      const now = new Date().toISOString();
      const updated: SellerPayoutRequest = { ...existing };

      if (action === 'reject') {
        updated.status = 'rejected';
        updated.rejectionReason = reason!.trim();
        updated.reviewedBy = user.email || user.uid;
        updated.reviewedAt = now;
        updated.updatedAt = now;

        tx.update(payoutRef, {
          status: 'rejected',
          rejectionReason: updated.rejectionReason,
          reviewedBy: updated.reviewedBy,
          reviewedAt: now,
          updatedAt: now,
        });
      } else if (action === 'hold') {
        updated.status = 'held';
        updated.adminNotes = reason?.trim() || 'Payout placed on compliance review hold.';
        updated.reviewedBy = user.email || user.uid;
        updated.reviewedAt = now;
        updated.updatedAt = now;

        tx.update(payoutRef, {
          status: 'held',
          adminNotes: updated.adminNotes,
          reviewedBy: updated.reviewedBy,
          reviewedAt: now,
          updatedAt: now,
        });
      } else {
        updated.status = 'approved';
        updated.adminNotes = reason?.trim() || existing.adminNotes;
        updated.reviewedBy = user.email || user.uid;
        updated.reviewedAt = now;
        updated.updatedAt = now;

        tx.update(payoutRef, {
          status: 'approved',
          adminNotes: updated.adminNotes || null,
          reviewedBy: updated.reviewedBy,
          reviewedAt: now,
          updatedAt: now,
        });
      }

      return { payout: updated, prevStatus: previous };
    });

    if (isTestInMemoryMode()) {
      this.memoryPayouts.set(payoutId, payout);
    }

    if (payout.status !== prevStatus) {
      const actionMap: Record<string, string> = {
        rejected: 'PAYOUT_REJECTED',
        held: 'PAYOUT_HELD',
        approved: 'PAYOUT_APPROVED',
      };
      await AdminActivityLogService.logAction({
        admin: user,
        action: actionMap[payout.status] || 'PAYOUT_REVIEW',
        targetResourceId: payoutId,
        targetResourceType: 'payment',
        previousValue: { status: prevStatus },
        newValue:
          payout.status === 'rejected'
            ? { status: 'rejected', reason: payout.rejectionReason }
            : payout.status === 'held'
            ? { status: 'held', notes: payout.adminNotes }
            : { status: 'approved' },
        metadata: {
          sellerId: payout.sellerId,
          amount: payout.amount,
          currency: payout.currency,
          destinationMethod: payout.destination.method,
        },
      }).catch(() => {});
    }

    return payout;
  }

  /**
   * Step 2 of Payout Governance: Authoritative Payment-Provider / Corporate Batch Confirmation.
   * Only marks a payout 'completed' after authoritative confirmation with a non-empty providerReference.
   * On failure, marks 'failed' and restores the reserved funds cleanly back to availableForPayout.
   */
  static async confirmPayoutProviderResult(
    payoutId: string,
    params: {
      success: boolean;
      providerReference?: string;
      failureReason?: string;
    },
    user: AuthenticatedUser
  ): Promise<SellerPayoutRequest> {
    const isAuthorized =
      user.isSuperAdmin ||
      user.isFinanceManager ||
      hasPermission(user, 'payouts:process') ||
      hasPermission(user, 'manage_payouts');

    if (!isAuthorized) {
      throw new Error('FORBIDDEN_PAYOUT_ACTION: Only authorized administrators or Finance Managers may confirm provider payout execution.');
    }

    if (params.success) {
      if (!params.providerReference || typeof params.providerReference !== 'string' || params.providerReference.trim().length < 3) {
        throw new Error('An authoritative payment-provider or batch transfer reference (min 3 chars) is required to complete a payout.');
      }
    }

    const payout = await runTransaction(db, async (tx) => {
      const payoutRef = doc(db, SELLER_PAYOUTS_COLLECTION, payoutId);
      const snap = await tx.get(payoutRef);
      const existing = snap.exists()
        ? (snap.data() as SellerPayoutRequest)
        : isTestInMemoryMode()
        ? this.memoryPayouts.get(payoutId)
        : undefined;

      if (!existing) {
        throw new Error(`Payout request #${payoutId} not found.`);
      }

      if (existing.status !== 'approved') {
        throw new Error(
          `INVALID_PAYOUT_CONFIRMATION_STATE: Payout #${payoutId} is in '${existing.status}' state and must be 'approved' before recording provider confirmation.`
        );
      }

      const now = new Date().toISOString();
      const updated: SellerPayoutRequest = { ...existing };

      if (params.success) {
        const ref = params.providerReference!.trim();
        updated.status = 'completed';
        updated.disbursementReference = ref;
        updated.providerConfirmedBy = user.email || user.uid;
        updated.providerConfirmedAt = now;
        updated.completedAt = now;
        updated.updatedAt = now;

        tx.update(payoutRef, {
          status: 'completed',
          disbursementReference: ref,
          providerConfirmedBy: updated.providerConfirmedBy,
          providerConfirmedAt: now,
          completedAt: now,
          updatedAt: now,
        });
      } else {
        const failReason = params.failureReason?.trim() || 'Provider disbursement failed or rejected by destination bank.';
        updated.status = 'failed';
        updated.failureReason = failReason;
        updated.providerConfirmedBy = user.email || user.uid;
        updated.providerConfirmedAt = now;
        updated.updatedAt = now;

        tx.update(payoutRef, {
          status: 'failed',
          failureReason: failReason,
          providerConfirmedBy: updated.providerConfirmedBy,
          providerConfirmedAt: now,
          updatedAt: now,
        });
      }

      return updated;
    });

    if (isTestInMemoryMode()) {
      this.memoryPayouts.set(payoutId, payout);
    }

    await AdminActivityLogService.logAction({
      admin: user,
      action: payout.status === 'completed' ? 'PAYOUT_COMPLETED' : 'PAYOUT_FAILED',
      targetResourceId: payoutId,
      targetResourceType: 'payment',
      previousValue: { status: 'approved' },
      newValue:
        payout.status === 'completed'
          ? { status: 'completed', disbursementReference: payout.disbursementReference }
          : { status: 'failed', failureReason: payout.failureReason },
      metadata: { sellerId: payout.sellerId, amount: payout.amount, currency: payout.currency },
    }).catch(() => {});

    return payout;
  }

  /**
   * Reset helper for test suites.
   */
  static clearMemoryLedgerForTesting(): void {
    this.memoryLedger.clear();
    this.memoryPayouts.clear();
    this.payoutMutexes.clear();
    this.platformCommissionRateOverride = undefined;
    this.sellerCommissionOverrides.clear();
    this.settlementHoldDaysOverride = undefined;
    if (process.env.NODE_ENV === 'test') {
      clearServerFirestoreTestStore();
    }
  }
}

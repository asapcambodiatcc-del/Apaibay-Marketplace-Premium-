import { db, collection, getDocs } from '../repositories/serverFirestore';
import { PaymentIntent } from './paymentTypes';
import { ALLOWED_PAYMENT_TRANSITIONS } from './paymentStateMachine';

export type DiscrepancySeverity = 'CRITICAL' | 'WARNING';

export interface DiscrepancyRecord {
  type: string;
  severity: DiscrepancySeverity;
  orderId?: string;
  paymentId?: string;
  details: string;
  safeMetadata?: Record<string, any>;
}

export interface ReconciliationReport {
  timestamp: string;
  checkedOrdersCount: number;
  checkedPaymentsCount: number;
  discrepancyCount: number;
  criticalCount: number;
  warningCount: number;
  discrepancies: DiscrepancyRecord[];
}

export class ReconciliationService {
  /**
   * Pure analytical engine to detect payment discrepancies.
   */
  static analyze(orderDocs: any[], paymentDocs: any[], eventDocs: any[] = []): ReconciliationReport {
    const timestamp = new Date().toISOString();
    const discrepancies: DiscrepancyRecord[] = [];

    const orderMap = new Map<string, any>();
    for (const ord of orderDocs) {
      orderMap.set(ord.id, ord);
    }

    const paymentsByOrderId = new Map<string, PaymentIntent[]>();
    for (const p of paymentDocs) {
      const ordId = p.orderId;
      if (ordId) {
        const existing = paymentsByOrderId.get(ordId) || [];
        existing.push(p as PaymentIntent);
        paymentsByOrderId.set(ordId, existing);
      }
    }

    const eventsByPaymentId = new Map<string, any[]>();
    for (const ev of eventDocs) {
      if (ev.paymentId) {
        const existing = eventsByPaymentId.get(ev.paymentId) || [];
        existing.push(ev);
        eventsByPaymentId.set(ev.paymentId, existing);
      }
    }

    // 2. Check each order against its payments
    for (const ord of orderDocs) {
      const relatedPayments = paymentsByOrderId.get(ord.id) || [];
      const paidPayments = relatedPayments.filter((p) => p.status === 'paid');
      const refundedPayments = relatedPayments.filter(
        (p) => p.status === 'refunded' || p.status === 'partially_refunded'
      );

      // Check A: Order marked 'paid', but no payment marked 'paid'
      if (ord.paymentStatus === 'paid' && paidPayments.length === 0) {
        discrepancies.push({
          type: 'ORDER_PAID_WITHOUT_PAID_PAYMENT',
          severity: 'CRITICAL',
          orderId: ord.id,
          details: `Order #${ord.id} is marked 'paid' in Firestore, but has no corresponding payment in 'paid' status.`,
          safeMetadata: { orderPaymentStatus: ord.paymentStatus, paymentsFound: relatedPayments.length },
        });
      }

      // Check B: Order marked 'refunded', but no payment is refunded
      if (ord.paymentStatus === 'refunded' && refundedPayments.length === 0) {
        discrepancies.push({
          type: 'ORDER_REFUNDED_WITHOUT_REFUNDED_PAYMENT',
          severity: 'WARNING',
          orderId: ord.id,
          details: `Order #${ord.id} is marked 'refunded', but no associated payment has 'refunded' status.`,
        });
      }

      // Check C: Duplicate active payment intents for the same order
      const activeIntents = relatedPayments.filter(
        (p) => p.status === 'pending' || p.status === 'requires_action' || p.status === 'processing'
      );
      if (activeIntents.length > 1) {
        discrepancies.push({
          type: 'DUPLICATE_ACTIVE_PAYMENT_INTENTS',
          severity: 'WARNING',
          orderId: ord.id,
          details: `Order #${ord.id} has ${activeIntents.length} concurrent active payment intents.`,
          safeMetadata: { intentIds: activeIntents.map((i) => i.id) },
        });
      }
    }

    // 3. Check each payment against its order and audit logs
    const validStatuses = new Set(Object.keys(ALLOWED_PAYMENT_TRANSITIONS));

    for (const p of paymentDocs) {
      // Check D: Impossible payment state
      if (!validStatuses.has(p.status)) {
        discrepancies.push({
          type: 'IMPOSSIBLE_PAYMENT_STATE',
          severity: 'CRITICAL',
          paymentId: p.id,
          orderId: p.orderId,
          details: `Payment #${p.id} has unknown/invalid status '${p.status}'.`,
        });
      }

      // Check E: Inconsistent order relationship (payment exists but order does not)
      const order = orderMap.get(p.orderId);
      if (!order) {
        discrepancies.push({
          type: 'ORPHANED_PAYMENT_RECORD',
          severity: 'CRITICAL',
          paymentId: p.id,
          orderId: p.orderId,
          details: `Payment #${p.id} references order #${p.orderId}, which does not exist.`,
        });
      } else {
        // Check F: Payment is 'paid' but order is not 'paid'
        if (p.status === 'paid' && order.paymentStatus !== 'paid') {
          discrepancies.push({
            type: 'PAYMENT_PAID_ORDER_NOT_UPDATED',
            severity: 'CRITICAL',
            paymentId: p.id,
            orderId: p.orderId,
            details: `Payment #${p.id} is marked 'paid', but order #${order.id} still has paymentStatus '${order.paymentStatus}'.`,
            safeMetadata: { paymentStatus: p.status, orderStatus: order.paymentStatus },
          });
        }

        // Check G: Amount discrepancy between payment and order total
        if (typeof p.amount === 'number' && typeof order.total === 'number') {
          if (Math.abs(p.amount - order.total) > 0.01) {
            discrepancies.push({
              type: 'AMOUNT_MISMATCH',
              severity: 'CRITICAL',
              paymentId: p.id,
              orderId: p.orderId,
              details: `Payment #${p.id} amount ($${p.amount}) does not match order #${order.id} total ($${order.total}).`,
              safeMetadata: { paymentAmount: p.amount, orderTotal: order.total },
            });
          }
        }
      }

      // Check H: Missing payment audit events
      const events = eventsByPaymentId.get(p.id) || [];
      if (events.length === 0 && eventDocs.length > 0) {
        discrepancies.push({
          type: 'MISSING_PAYMENT_EVENTS',
          severity: 'WARNING',
          paymentId: p.id,
          orderId: p.orderId,
          details: `Payment #${p.id} has no audit records in /paymentEvents.`,
        });
      }

      // Check I: Paid payment missing transaction reference
      if (p.status === 'paid' && !p.transactionReference && !(p as any).providerTransactionId) {
        discrepancies.push({
          type: 'MISSING_PROVIDER_TRANSACTION_REFERENCE',
          severity: 'WARNING',
          paymentId: p.id,
          orderId: p.orderId,
          details: `Payment #${p.id} is marked 'paid' but is missing provider transaction reference.`,
        });
      }

      // Check J: Currency mismatch between order and payment
      if (order && p.currency && order.currency) {
        if (p.currency.toUpperCase() !== order.currency.toUpperCase()) {
          discrepancies.push({
            type: 'CURRENCY_MISMATCH',
            severity: 'CRITICAL',
            paymentId: p.id,
            orderId: p.orderId,
            details: `Payment #${p.id} currency (${p.currency}) differs from order #${order.id} currency (${order.currency}).`,
            safeMetadata: { paymentCurrency: p.currency, orderCurrency: order.currency },
          });
        }
      }
    }

    // Check K: Duplicate provider transaction references across distinct payments
    const txnRefMap = new Map<string, string>();
    for (const p of paymentDocs) {
      const ref = p.transactionReference || (p as any).providerTransactionId;
      if (ref && typeof ref === 'string' && ref.trim() !== '') {
        if (txnRefMap.has(ref) && txnRefMap.get(ref) !== p.id) {
          discrepancies.push({
            type: 'DUPLICATE_PROVIDER_TRANSACTION',
            severity: 'CRITICAL',
            paymentId: p.id,
            details: `Provider transaction reference '${ref}' is reused by payments ${txnRefMap.get(ref)} and ${p.id}.`,
            safeMetadata: { transactionReference: ref, firstPaymentId: txnRefMap.get(ref), secondPaymentId: p.id },
          });
        } else {
          txnRefMap.set(ref, p.id);
        }
      }
    }

    const criticalCount = discrepancies.filter((d) => d.severity === 'CRITICAL').length;
    const warningCount = discrepancies.filter((d) => d.severity === 'WARNING').length;

    return {
      timestamp,
      checkedOrdersCount: orderDocs.length,
      checkedPaymentsCount: paymentDocs.length,
      discrepancyCount: discrepancies.length,
      criticalCount,
      warningCount,
      discrepancies,
    };
  }

  /**
   * Scans orders and payments in Firestore to detect state inconsistencies.
   */
  static async reconcile(): Promise<ReconciliationReport> {
    let orderDocs: any[] = [];
    let paymentDocs: any[] = [];
    let eventDocs: any[] = [];

    try {
      const ordersSnap = await getDocs(collection(db, 'orders'));
      orderDocs = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {}

    try {
      const paymentsSnap = await getDocs(collection(db, 'payments'));
      paymentDocs = paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {}

    try {
      const eventsSnap = await getDocs(collection(db, 'paymentEvents'));
      eventDocs = eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {}

    return this.analyze(orderDocs, paymentDocs, eventDocs);
  }
}

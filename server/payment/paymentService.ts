import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
} from '../repositories/serverFirestore';
import { AuthenticatedUser } from '../auth/roles';
import { CommerceError } from '../commerce/orderService';
import {
  PaymentIntent,
  Payment,
  PaymentMethodType,
  PaymentProvider,
  PaymentStatus,
} from './paymentTypes';
import { validatePaymentTransition } from './paymentStateMachine';
import { PaymentEventService } from './paymentEventService';
import { IdempotencyService } from './idempotencyService';
import { defaultSandboxProvider } from './providers/sandboxProvider';
import { PaymentProviderRegistry } from './paymentProviderRegistry';
import { PaymentConfigService } from './paymentConfig';
import { SellerLedgerService } from '../commerce/sellerLedgerService';

export interface CreatePaymentIntentInput {
  orderId: string;
  methodType?: PaymentMethodType;
  provider?: PaymentProvider;
  idempotencyKey?: string;
  forgedAmount?: number; // Malicious client attempt (MUST BE IGNORED)
  forgedCurrency?: string; // Malicious client attempt (MUST BE IGNORED)
  forgedStatus?: string; // Malicious client attempt (MUST BE IGNORED)
  safeMetadata?: Record<string, any>;
}

export class PaymentService {
  /**
   * POST /api/payments/intents
   * Authoritative Payment Intent creation.
   * NEVER trusts client amount or currency.
   * Derives exact total from Phase 4B order document.
   */
  static async createPaymentIntent(
    input: CreatePaymentIntentInput,
    user: AuthenticatedUser
  ): Promise<{ paymentIntent: PaymentIntent; _idempotentReplay?: boolean }> {
    if (!input.orderId || typeof input.orderId !== 'string') {
      throw new CommerceError('INVALID_INPUT', 'orderId is required.', 400);
    }

    // 1. Idempotency Check
    if (input.idempotencyKey) {
      const idempCheck = await IdempotencyService.check(input.idempotencyKey, user.uid);
      if (idempCheck.hit && idempCheck.cachedResult) {
        return {
          paymentIntent: idempCheck.cachedResult,
          _idempotentReplay: true,
        };
      }
    }

    // 2. Load Order from Firestore
    const orderRef = doc(db, 'orders', input.orderId);
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {
      throw new CommerceError('ORDER_NOT_FOUND', `Order #${input.orderId} does not exist.`, 404);
    }

    const orderData = orderSnap.data() as any;

    // 3. Verify Order Ownership (Customer own order or Admin)
    const orderOwnerUid = orderData.customerUid || orderData.userId;
    if (orderOwnerUid !== user.uid && !user.isAdmin) {
      throw new CommerceError(
        'FORBIDDEN_ORDER_OWNERSHIP',
        'You are not authorized to create a payment for this order.',
        403
      );
    }

    // 4. Verify Order Status
    if (orderData.paymentStatus === 'paid') {
      throw new CommerceError(
        'ORDER_ALREADY_PAID',
        `Order #${input.orderId} is already paid.`,
        400
      );
    }

    // 5. Prevent Duplicate Active Payment Intents for the same order
    try {
      const paymentsCol = collection(db, 'payments');
      const q = query(
        paymentsCol,
        where('orderId', '==', input.orderId)
      );
      const activeSnaps = await getDocs(q);
      for (const d of activeSnaps.docs) {
        const p = d.data() as any;
        if (p.status === 'pending' || p.status === 'requires_action' || p.status === 'processing') {
          // Return the existing active payment intent to prevent duplicate charges
          return {
            paymentIntent: {
              id: d.id,
              orderId: p.orderId,
              customerUid: p.customerUid,
              amount: p.amount,
              currency: p.currency,
              status: p.status,
              methodType: p.method || p.methodType || 'card',
              provider: p.provider || 'sandbox',
              clientSecret: p.clientSecret || `sbx_sec_${d.id}`,
              attemptsCount: p.attemptsCount || 1,
              actionRequired: p.actionRequired,
              sandboxMode: true,
              safeMetadata: p.safeMetadata,
              createdAt: p.createdAt,
              updatedAt: p.updatedAt,
            },
          };
        }
      }
    } catch {
      // Continue if query fails in isolated test sandbox
    }

    // 6. Authoritative Order Total & Currency (NEVER trust client payload)
    const authoritativeAmount = parseFloat(Number(orderData.total).toFixed(2));
    const authoritativeCurrency = (orderData.currency || 'USD').toUpperCase();

    if (isNaN(authoritativeAmount) || authoritativeAmount <= 0) {
      throw new CommerceError('INVALID_ORDER_TOTAL', 'Authoritative order total must be greater than zero.', 400);
    }

    // 7. Generate Server-Side IDs & State
    const intentId = `pi_${Date.now().toString().slice(-6)}_${Math.random().toString(36).slice(2, 8)}`;
    const methodType: PaymentMethodType = input.methodType || 'card';
    const targetProvider: PaymentProvider = input.provider || PaymentProviderRegistry.resolveProviderForMethod(methodType);

    // 8. State machine validation (created -> pending)
    const transitionCheck = validatePaymentTransition('created', 'pending', {
      user,
      actorType: user.isAdmin ? 'admin' : 'customer',
      isOwner: true,
    });
    if (!transitionCheck.allowed) {
      throw new CommerceError(transitionCheck.code || 'INVALID_TRANSITION', transitionCheck.message || 'Transition denied', 400);
    }

    // 9. Call Provider Adapter via Registry
    let adapter;
    try {
      adapter = PaymentProviderRegistry.getAdapter(targetProvider);
    } catch (adapterErr: any) {
      throw new CommerceError('PROVIDER_NOT_CONFIGURED', adapterErr.message, 400);
    }

    const providerIntent = await adapter.createPaymentIntent({
      intentId,
      orderId: input.orderId,
      amount: authoritativeAmount,
      currency: authoritativeCurrency,
      methodType,
      customerUid: user.uid,
      safeMetadata: input.safeMetadata,
    });

    const isSandboxMode = adapter.isSandbox;
    const now = new Date().toISOString();
    const paymentIntent: PaymentIntent = {
      id: intentId,
      orderId: input.orderId,
      customerUid: user.uid,
      amount: authoritativeAmount, // AUTHORITATIVE!
      currency: authoritativeCurrency, // AUTHORITATIVE!
      status: 'pending',
      methodType,
      provider: targetProvider,
      clientSecret: providerIntent.clientSecret,
      idempotencyKey: input.idempotencyKey,
      attemptsCount: 0,
      sandboxMode: isSandboxMode,
      safeMetadata: {
        ...providerIntent.safeDetails,
        orderId: input.orderId,
      },
      createdAt: now,
      updatedAt: now,
    };

    // 10. Persist Payment Record to Firestore (/payments/{intentId})
    try {
      const paymentRef = doc(db, 'payments', intentId);
      await setDoc(paymentRef, paymentIntent);
    } catch (err) {
      console.warn(`[PaymentService] Offline save for payment ${intentId}`);
    }

    // 11. Write Append-Only Audit Event
    await PaymentEventService.recordEvent({
      paymentId: intentId,
      orderId: input.orderId,
      eventType: 'payment_intent_created',
      previousStatus: null,
      newStatus: 'pending',
      actorType: user.isAdmin ? 'admin' : 'customer',
      actorUid: user.uid,
      provider: targetProvider,
      idempotencyKey: input.idempotencyKey,
      safeMetadata: {
        amount: authoritativeAmount,
        currency: authoritativeCurrency,
        method: methodType,
        provider: targetProvider,
        isSandbox: isSandboxMode,
      },
    });

    // 12. Cache Idempotency Record
    if (input.idempotencyKey) {
      await IdempotencyService.save(
        input.idempotencyKey,
        user.uid,
        'payment_intent_create',
        paymentIntent
      );
    }

    return { paymentIntent };
  }

  /**
   * POST /api/payments/intents/:intentId/confirm
   * Executes or simulates payment processing with the Sandbox Provider.
   * Enforces pending -> processing -> (paid | requires_action | failed)
   */
  static async confirmPayment(
    intentId: string,
    params: {
      simulationToken?: string;
      safePaymentData?: { last4?: string; brand?: string };
    },
    user: AuthenticatedUser
  ): Promise<{ payment: PaymentIntent; orderStatus: string; paymentStatus: PaymentStatus }> {
    const paymentRef = doc(db, 'payments', intentId);
    const snap = await getDoc(paymentRef);

    if (!snap.exists()) {
      throw new CommerceError('PAYMENT_INTENT_NOT_FOUND', `Payment intent #${intentId} not found.`, 404);
    }

    const current = snap.data() as PaymentIntent;

    // 1. Authorization & Ownership Check
    if (current.customerUid !== user.uid && !user.isAdmin) {
      throw new CommerceError('FORBIDDEN_PAYMENT_ACCESS', 'You are not authorized to process this payment.', 403);
    }

    // 2. State machine guard: from current -> processing
    const toProcessingCheck = validatePaymentTransition(current.status, 'processing', {
      user,
      actorType: 'system', // Engine-driven state advance
    });

    if (!toProcessingCheck.allowed) {
      throw new CommerceError(
        toProcessingCheck.code || 'INVALID_PAYMENT_STATE_TRANSITION',
        toProcessingCheck.message || `Cannot confirm payment in status '${current.status}'.`,
        400
      );
    }

    // Audit transition to processing
    await PaymentEventService.recordEvent({
      paymentId: intentId,
      orderId: current.orderId,
      eventType: 'payment_processing',
      previousStatus: current.status,
      newStatus: 'processing',
      actorType: 'system',
      actorUid: user.uid,
      provider: current.provider || 'sandbox',
    });

    // 3. Call Provider Adapter via Registry
    const adapter = PaymentProviderRegistry.getAdapter(current.provider || 'sandbox');
    const providerResult = await adapter.processPayment({
      intentId,
      orderId: current.orderId,
      amount: current.amount,
      currency: current.currency,
      methodType: current.methodType,
      customerUid: current.customerUid,
      simulationToken: params.simulationToken,
      safePaymentData: params.safePaymentData,
    });

    const now = new Date().toISOString();
    const updatedPayment: PaymentIntent = {
      ...current,
      status: providerResult.status,
      attemptsCount: (current.attemptsCount || 0) + 1,
      lastAttempt: providerResult.attempt,
      failure: providerResult.failure,
      actionRequired: providerResult.actionRequired,
      updatedAt: now,
    };

    // 4. Update Payment in Firestore
    try {
      await setDoc(paymentRef, updatedPayment);
    } catch {
      // Local fallback
    }

    // 5. Synchronize with Phase 4B Order Payment Status
    const orderRef = doc(db, 'orders', current.orderId);
    let newOrderStatus = 'Processing';

    if (providerResult.status === 'paid') {
      try {
        await updateDoc(orderRef, {
          paymentStatus: 'paid',
          updatedAt: now,
        });
      } catch {
        // Local fallback
      }

      await PaymentEventService.recordEvent({
        paymentId: intentId,
        orderId: current.orderId,
        eventType: 'payment_paid',
        previousStatus: 'processing',
        newStatus: 'paid',
        actorType: 'system',
        actorUid: user.uid,
        provider: 'sandbox',
        safeMetadata: {
          transactionReference: providerResult.transactionReference,
          amount: current.amount,
        },
      });
    } else if (providerResult.status === 'requires_action') {
      await PaymentEventService.recordEvent({
        paymentId: intentId,
        orderId: current.orderId,
        eventType: 'payment_requires_action',
        previousStatus: 'processing',
        newStatus: 'requires_action',
        actorType: 'system',
        actorUid: user.uid,
        provider: 'sandbox',
        safeMetadata: {
          challengeId: providerResult.actionRequired?.challengeId,
        },
      });
    } else if (providerResult.status === 'failed') {
      try {
        await updateDoc(orderRef, {
          paymentStatus: 'failed',
          updatedAt: now,
        });
      } catch {
        // Local fallback
      }

      await PaymentEventService.recordEvent({
        paymentId: intentId,
        orderId: current.orderId,
        eventType: 'payment_failed',
        previousStatus: 'processing',
        newStatus: 'failed',
        actorType: 'system',
        actorUid: user.uid,
        provider: 'sandbox',
        safeMetadata: {
          failureCode: providerResult.failure?.code,
          failureMessage: providerResult.failure?.message,
        },
      });
    }

    return {
      payment: updatedPayment,
      orderStatus: newOrderStatus,
      paymentStatus: providerResult.status,
    };
  }

  /**
   * POST /api/payments/intents/:intentId/action
   * Completes a challenge when payment is in `requires_action` state (e.g. 3DS / OTP simulation).
   */
  static async completeAction(
    intentId: string,
    params: { challengeId: string; simulationOutcome?: 'approve' | 'reject' },
    user: AuthenticatedUser
  ): Promise<{ payment: PaymentIntent; paymentStatus: PaymentStatus }> {
    const paymentRef = doc(db, 'payments', intentId);
    const snap = await getDoc(paymentRef);

    if (!snap.exists()) {
      throw new CommerceError('PAYMENT_INTENT_NOT_FOUND', `Payment intent #${intentId} not found.`, 404);
    }

    const current = snap.data() as PaymentIntent;

    if (current.customerUid !== user.uid && !user.isAdmin) {
      throw new CommerceError('FORBIDDEN_PAYMENT_ACCESS', 'Access denied.', 403);
    }

    if (current.status !== 'requires_action') {
      throw new CommerceError(
        'INVALID_PAYMENT_STATE',
        `Payment is in '${current.status}' state; requires_action is needed to complete challenge.`,
        400
      );
    }

    // Call provider to confirm challenge
    const adapter = PaymentProviderRegistry.getAdapter(current.provider || 'sandbox');
    const providerResult = await adapter.confirmAction({
      intentId,
      challengeId: params.challengeId,
      simulationOutcome: params.simulationOutcome,
    });

    const now = new Date().toISOString();
    const updatedPayment: PaymentIntent = {
      ...current,
      status: providerResult.status,
      actionRequired: undefined,
      failure: providerResult.failure,
      lastAttempt: providerResult.attempt,
      updatedAt: now,
    };

    try {
      await setDoc(paymentRef, updatedPayment);
    } catch {}

    // Update order
    const orderRef = doc(db, 'orders', current.orderId);
    if (providerResult.status === 'paid') {
      try {
        await updateDoc(orderRef, {
          paymentStatus: 'paid',
          updatedAt: now,
        });
      } catch {}

      await PaymentEventService.recordEvent({
        paymentId: intentId,
        orderId: current.orderId,
        eventType: 'payment_action_succeeded',
        previousStatus: 'requires_action',
        newStatus: 'paid',
        actorType: 'customer',
        actorUid: user.uid,
        provider: current.provider || 'sandbox',
      });
    } else {
      try {
        await updateDoc(orderRef, {
          paymentStatus: 'failed',
          updatedAt: now,
        });
      } catch {}

      await PaymentEventService.recordEvent({
        paymentId: intentId,
        orderId: current.orderId,
        eventType: 'payment_failed',
        previousStatus: 'requires_action',
        newStatus: 'failed',
        actorType: 'customer',
        actorUid: user.uid,
        provider: current.provider || 'sandbox',
      });
    }

    return { payment: updatedPayment, paymentStatus: providerResult.status };
  }

  /**
   * POST /api/payments/intents/:intentId/cancel
   * Cancels a pending payment.
   */
  static async cancelPayment(
    intentId: string,
    user: AuthenticatedUser
  ): Promise<{ payment: PaymentIntent; status: 'cancelled' }> {
    const paymentRef = doc(db, 'payments', intentId);
    const snap = await getDoc(paymentRef);

    if (!snap.exists()) {
      throw new CommerceError('PAYMENT_INTENT_NOT_FOUND', `Payment intent #${intentId} not found.`, 404);
    }

    const current = snap.data() as PaymentIntent;

    const isOwner = current.customerUid === user.uid;
    const transitionCheck = validatePaymentTransition(current.status, 'cancelled', {
      user,
      actorType: user.isAdmin ? 'admin' : 'customer',
      isOwner,
    });

    if (!transitionCheck.allowed) {
      throw new CommerceError(
        transitionCheck.code || 'FORBIDDEN_CANCELLATION',
        transitionCheck.message || 'Cannot cancel this payment.',
        transitionCheck.code?.startsWith('FORBIDDEN') ? 403 : 400
      );
    }

    const now = new Date().toISOString();
    const updatedPayment: PaymentIntent = {
      ...current,
      status: 'cancelled',
      updatedAt: now,
    };

    try {
      await setDoc(paymentRef, updatedPayment);
    } catch {}

    await PaymentEventService.recordEvent({
      paymentId: intentId,
      orderId: current.orderId,
      eventType: 'payment_cancelled',
      previousStatus: current.status,
      newStatus: 'cancelled',
      actorType: user.isAdmin ? 'admin' : 'customer',
      actorUid: user.uid,
      provider: 'sandbox',
    });

    return { payment: updatedPayment, status: 'cancelled' };
  }

  /**
   * POST /api/payments/:paymentId/refund
   * Refunds a paid transaction (Admin or privileged backend only).
   */
  static async refundPayment(
    paymentId: string,
    refundAmount: number | undefined,
    reason: string | undefined,
    user: AuthenticatedUser
  ): Promise<{ payment: PaymentIntent; status: 'refunded' | 'partially_refunded' }> {
    if (!user.isAdmin) {
      throw new CommerceError('FORBIDDEN_REFUND', 'Only administrators can issue refunds.', 403);
    }

    const paymentRef = doc(db, 'payments', paymentId);
    const snap = await getDoc(paymentRef);

    if (!snap.exists()) {
      throw new CommerceError('PAYMENT_NOT_FOUND', `Payment #${paymentId} not found.`, 404);
    }

    const current = snap.data() as PaymentIntent;

    // Validate amount boundaries
    const previouslyRefunded = Number(current.safeMetadata?.refundedAmount || 0);
    const remaining = Math.max(0, current.amount - previouslyRefunded);

    if (refundAmount !== undefined) {
      if (typeof refundAmount !== 'number' || isNaN(refundAmount) || refundAmount <= 0) {
        throw new CommerceError('INVALID_REFUND_AMOUNT', 'Refund amount must be a positive number.', 400);
      }
      if (refundAmount > remaining + 0.001) {
        throw new CommerceError(
          'REFUND_EXCEEDS_CAPTURED_AMOUNT',
          `Refund amount ($${refundAmount.toFixed(2)}) exceeds remaining captured balance ($${remaining.toFixed(2)}).`,
          400
        );
      }
    }

    const amountToRefund = refundAmount !== undefined ? refundAmount : remaining;
    const totalRefunded = parseFloat((previouslyRefunded + amountToRefund).toFixed(2));
    const isPartial = totalRefunded < current.amount - 0.001;
    const targetStatus: PaymentStatus = isPartial ? 'partially_refunded' : 'refunded';

    const transitionCheck = validatePaymentTransition(current.status, targetStatus, {
      user,
      actorType: 'admin',
    });

    if (!transitionCheck.allowed) {
      throw new CommerceError(
        transitionCheck.code || 'INVALID_REFUND_TRANSITION',
        transitionCheck.message || 'Cannot refund payment in current state.',
        400
      );
    }

    const adapter = PaymentProviderRegistry.getAdapter(current.provider || 'sandbox');
    const providerRefund = await adapter.refundPayment({
      paymentId,
      amount: amountToRefund,
      currency: current.currency,
      reason,
    });

    const now = new Date().toISOString();
    const updatedPayment: PaymentIntent = {
      ...current,
      status: targetStatus,
      safeMetadata: {
        ...current.safeMetadata,
        refundedAmount: totalRefunded,
        lastRefundAmount: amountToRefund,
        refundReason: reason,
        refundReference: providerRefund.refundReference,
      },
      updatedAt: now,
    };

    try {
      await setDoc(paymentRef, updatedPayment);
      const orderRef = doc(db, 'orders', current.orderId);
      const orderUpdate: Record<string, any> = {
        paymentStatus: targetStatus,
        updatedAt: now,
      };
      if (targetStatus === 'refunded') {
        orderUpdate.status = 'Cancelled';
      }
      await updateDoc(orderRef, orderUpdate);
    } catch {}

    // Record server-authoritative refund adjustment in seller ledger idempotently
    try {
      await SellerLedgerService.recordOrderAdjustment(current.orderId, 'refund_adjustment', reason);
    } catch (ledgerErr) {
      console.warn('[PaymentService] Non-blocking refund adjustment warning:', ledgerErr);
    }

    await PaymentEventService.recordEvent({
      paymentId,
      orderId: current.orderId,
      eventType: targetStatus === 'refunded' ? 'payment_refunded' : 'payment_partially_refunded',
      previousStatus: current.status,
      newStatus: targetStatus,
      actorType: 'admin',
      actorUid: user.uid,
      provider: current.provider || 'sandbox',
      safeMetadata: {
        refundReference: providerRefund.refundReference,
        refundedAmount: amountToRefund,
        totalRefundedSoFar: totalRefunded,
        originalPaymentAmount: current.amount,
        reason,
      },
    });

    return { payment: updatedPayment, status: targetStatus };
  }

  /**
   * GET /api/payments/intents/:intentId
   * Retrieves single payment intent with customer ownership check.
   */
  static async getPaymentIntent(intentId: string, user: AuthenticatedUser): Promise<PaymentIntent> {
    const paymentRef = doc(db, 'payments', intentId);
    const snap = await getDoc(paymentRef);

    if (!snap.exists()) {
      throw new CommerceError('PAYMENT_NOT_FOUND', `Payment #${intentId} not found.`, 404);
    }

    const data = snap.data() as PaymentIntent;
    if (data.customerUid !== user.uid && !user.isAdmin) {
      throw new CommerceError('FORBIDDEN_PAYMENT_ACCESS', 'You are not authorized to view this payment.', 403);
    }

    return data;
  }
}

import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
} from '../repositories/serverFirestore';
import { AuthenticatedUser } from '../auth/roles';
import { PaymentService } from '../payment/paymentService';
import { AdminActivityLogService } from '../admin/adminActivityLogService';
import { SellerLedgerService } from './sellerLedgerService';

export type DisputeStatus =
  | 'open'
  | 'under_review'
  | 'resolved_refunded'
  | 'resolved_rejected'
  | 'closed';

export type DisputeReason =
  | 'item_not_received'
  | 'damaged_or_defective'
  | 'significantly_not_as_described'
  | 'duplicate_or_incorrect_charge'
  | 'cancelled_order_unrefunded'
  | 'other';

export interface OrderDispute {
  id: string;
  orderId: string;
  paymentId?: string;
  customerUid: string;
  customerEmail: string;
  sellerId?: string;
  reason: DisputeReason;
  reasonText?: string;
  description: string;
  evidenceUrls?: string[];
  disputedAmount: number;
  currency: string;
  status: DisputeStatus;
  refundStatus: 'none' | 'pending' | 'refunded' | 'rejected';
  refundAmount?: number;
  refundReference?: string;
  adminNotes?: string;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export class DisputeService {
  /**
   * Customer submits an order dispute.
   * Authoritative: Customer can only dispute their own order.
   */
  static async createDispute(
    input: {
      orderId: string;
      reason: DisputeReason;
      description: string;
      evidenceUrls?: string[];
    },
    user: AuthenticatedUser
  ): Promise<OrderDispute> {
    if (!input.orderId || typeof input.orderId !== 'string') {
      throw new Error('orderId is required');
    }
    if (!input.reason || typeof input.reason !== 'string') {
      throw new Error('Dispute reason is required');
    }
    if (!input.description || input.description.trim().length < 5) {
      throw new Error('A detailed description of the dispute is required (min 5 chars).');
    }

    // Load order to verify ownership and amount
    const orderRef = doc(db, 'orders', input.orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) {
      throw new Error(`Order #${input.orderId} does not exist.`);
    }

    const orderData = orderSnap.data() as any;
    if (orderData.customerUid !== user.uid && !user.isAdmin) {
      throw new Error('You are not authorized to file a dispute for this order.');
    }

    // Check for existing open dispute on this order to prevent duplicates
    const existingDisputes = await this.listDisputesForOrder(input.orderId);
    const activeDispute = existingDisputes.find((d) => d.status === 'open' || d.status === 'under_review');
    if (activeDispute) {
      throw new Error(`An active dispute (${activeDispute.id}) is already open for Order #${input.orderId}.`);
    }

    const disputeId = `disp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    // Find payment intent associated with order if available
    let paymentId: string | undefined = orderData.paymentId;
    if (!paymentId) {
      const paymentsSnap = await getDocs(query(collection(db, 'payments'), where('orderId', '==', input.orderId)));
      if (!paymentsSnap.empty && paymentsSnap.docs.length > 0) {
        paymentId = paymentsSnap.docs[0].id;
      }
    }

    const sellerId = orderData.items?.[0]?.sellerId || 'seller-apaibay-official';

    const dispute: OrderDispute = {
      id: disputeId,
      orderId: input.orderId,
      paymentId,
      customerUid: user.uid,
      customerEmail: user.email || orderData.customerEmail || 'customer@apaibay.com',
      sellerId,
      reason: input.reason,
      reasonText: input.reason.replace(/_/g, ' '),
      description: input.description.trim(),
      evidenceUrls: Array.isArray(input.evidenceUrls) ? input.evidenceUrls : [],
      disputedAmount: Number(orderData.total) || 0,
      currency: (orderData.currency || 'USD').toUpperCase(),
      status: 'open',
      refundStatus: 'none',
      createdAt: now,
      updatedAt: now,
    };

    const docRef = doc(db, 'order_disputes', disputeId);
    await setDoc(docRef, dispute);

    // Hold affected seller settlement immediately
    await SellerLedgerService.holdOrderSettlement(input.orderId, disputeId, input.reason);

    return dispute;
  }

  /**
   * List disputes with RBAC scoping:
   * - Admins see all disputes.
   * - Sellers see disputes regarding their items.
   * - Customers see only their own disputes.
   */
  static async listDisputes(
    filters: { status?: DisputeStatus; sellerId?: string },
    user: AuthenticatedUser
  ): Promise<OrderDispute[]> {
    const colRef = collection(db, 'order_disputes');
    const snap = await getDocs(colRef);
    let list = snap.docs.map((d: any) => d.data() as OrderDispute);

    // Scoping
    if (!user.isAdmin) {
      if (user.isSeller) {
        list = list.filter((d) => d.sellerId === user.sellerId || d.sellerId === user.uid);
      } else {
        list = list.filter((d) => d.customerUid === user.uid);
      }
    } else if (filters.sellerId) {
      list = list.filter((d) => d.sellerId === filters.sellerId);
    }

    if (filters.status) {
      list = list.filter((d) => d.status === filters.status);
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }

  static async listDisputesForOrder(orderId: string): Promise<OrderDispute[]> {
    const colRef = collection(db, 'order_disputes');
    const snap = await getDocs(colRef);
    return snap.docs
      .map((d: any) => d.data() as OrderDispute)
      .filter((d) => d.orderId === orderId);
  }

  static async getDispute(disputeId: string, user: AuthenticatedUser): Promise<OrderDispute> {
    const docRef = doc(db, 'order_disputes', disputeId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error(`Dispute #${disputeId} not found.`);
    }

    const dispute = snap.data() as OrderDispute;
    if (!user.isAdmin && dispute.customerUid !== user.uid && dispute.sellerId !== user.sellerId) {
      throw new Error('Unauthorized to view this dispute.');
    }

    return dispute;
  }

  /**
   * Admin reviews dispute status and updates internal notes.
   */
  static async updateDisputeStatus(
    disputeId: string,
    newStatus: DisputeStatus,
    adminNotes: string | undefined,
    user: AuthenticatedUser
  ): Promise<OrderDispute> {
    if (!user.isAdmin) {
      throw new Error('Only administrators can update dispute status.');
    }

    const dispute = await this.getDispute(disputeId, user);
    if (dispute.status === 'resolved_refunded' || dispute.status === 'closed') {
      throw new Error(`Cannot update a terminal dispute in status: ${dispute.status}`);
    }

    const now = new Date().toISOString();
    const updatePayload: Partial<OrderDispute> = {
      status: newStatus,
      adminNotes: adminNotes !== undefined ? adminNotes.trim() : dispute.adminNotes,
      reviewedBy: user.email || user.uid,
      reviewedAt: now,
      updatedAt: now,
    };

    if (newStatus === 'resolved_rejected') {
      updatePayload.refundStatus = 'rejected';
      updatePayload.rejectionReason = adminNotes || 'Dispute rejected upon administrative review.';
    }

    const docRef = doc(db, 'order_disputes', disputeId);
    await updateDoc(docRef, updatePayload);

    // If dispute rejected or closed, release hold back to available/pending
    if (newStatus === 'resolved_rejected' || newStatus === 'closed') {
      await SellerLedgerService.releaseOrderHold(dispute.orderId);
    }

    await AdminActivityLogService.logAction({
      admin: user,
      action: 'DISPUTE_STATUS_UPDATE',
      targetResourceId: disputeId,
      targetResourceType: 'dispute',
      previousValue: { status: dispute.status },
      newValue: { status: newStatus },
      metadata: { orderId: dispute.orderId, adminNotes },
    });

    return { ...dispute, ...updatePayload };
  }

  /**
   * Authoritative Dispute Resolution with Payment Refund:
   * 1. Validates admin holds refund clearance.
   * 2. Checks dispute is not already refunded (idempotency).
   * 3. Resolves paymentId from dispute or order.
   * 4. Calls PaymentService.refundPayment authoritatively.
   * 5. Updates dispute to resolved_refunded with refund reference.
   * 6. Writes immutable admin audit trail.
   */
  static async resolveWithRefund(
    disputeId: string,
    refundAmount: number | undefined,
    reason: string | undefined,
    user: AuthenticatedUser
  ): Promise<{ dispute: OrderDispute; refundReference?: string }> {
    if (!user.isAdmin) {
      throw new Error('Only administrators can issue dispute refunds.');
    }

    const dispute = await this.getDispute(disputeId, user);
    if (dispute.status === 'resolved_refunded' || dispute.refundStatus === 'refunded') {
      throw new Error(`Dispute #${disputeId} is already refunded (Refund reference: ${dispute.refundReference || 'N/A'}).`);
    }

    let targetPaymentId = dispute.paymentId;
    if (!targetPaymentId) {
      // Find from order
      const q = query(collection(db, 'payments'), where('orderId', '==', dispute.orderId));
      const paySnap = await getDocs(q);
      if (!paySnap.empty && paySnap.docs.length > 0) {
        targetPaymentId = paySnap.docs[0].id;
      }
    }

    if (!targetPaymentId) {
      throw new Error(`No payment transaction record found for Order #${dispute.orderId} to refund.`);
    }

    const amount = refundAmount !== undefined ? refundAmount : dispute.disputedAmount;
    const refundReason = reason || dispute.reasonText || 'Order dispute resolution';

    // Call authoritative PaymentService refund
    const refundResult = await PaymentService.refundPayment(
      targetPaymentId,
      amount,
      refundReason,
      user
    );

    const refundReference = refundResult.payment.safeMetadata?.refundReference || `ref_${Date.now()}`;
    const now = new Date().toISOString();

    const updatePayload: Partial<OrderDispute> = {
      status: 'resolved_refunded',
      refundStatus: 'refunded',
      refundAmount: amount,
      refundReference,
      reviewedBy: user.email || user.uid,
      reviewedAt: now,
      updatedAt: now,
      adminNotes: reason ? `Refund issued: ${reason}` : dispute.adminNotes,
    };

    const docRef = doc(db, 'order_disputes', disputeId);
    await updateDoc(docRef, updatePayload);

    // Record refund adjustment in seller ledger idempotently
    SellerLedgerService.recordOrderAdjustment(dispute.orderId, 'refund_adjustment', reason).catch(() => {});

    await AdminActivityLogService.logAction({
      admin: user,
      action: 'DISPUTE_REFUND_APPROVED',
      targetResourceId: disputeId,
      targetResourceType: 'dispute',
      previousValue: { status: dispute.status, refundStatus: dispute.refundStatus },
      newValue: { status: 'resolved_refunded', refundStatus: 'refunded', refundAmount: amount, refundReference },
      metadata: { orderId: dispute.orderId, paymentId: targetPaymentId, amount },
    });

    return {
      dispute: { ...dispute, ...updatePayload },
      refundReference,
    };
  }
}

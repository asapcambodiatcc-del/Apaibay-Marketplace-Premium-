import crypto from 'crypto';
import { db, doc, getDoc, updateDoc } from '../repositories/serverFirestore';
import { AuthenticatedUser } from '../auth/roles';
import {
  normalizeStatus,
  validateStatusTransition,
  CanonicalOrderStatus,
} from './orderLifecycle';
import { validateShipmentInput } from '../validation/shipmentValidation';
import { NotificationService } from './notificationService';
import { SellerLedgerService } from './sellerLedgerService';
import {
  OrderTrackingEvent,
  SellerShipmentInfo,
  TrackingHistorySource,
} from '../../src/types';

export const ALLOWED_RAW_ORDER_STATUSES = [
  'Placed',
  'Order Placed',
  'Processing',
  'Shipped',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
  'Canceled',
];

export async function assertVerifiedActiveSeller(
  uid: string
): Promise<{ status: number; code: string; message: string } | null> {
  const sellerSnap = await getDoc(doc(db, 'sellers', uid));
  if (!sellerSnap.exists()) {
    return {
      status: 403,
      code: 'NOT_A_SELLER',
      message: 'You must apply and be verified as a seller to perform merchant operations.',
    };
  }

  const sellerData = sellerSnap.data() as any;
  if (sellerData.verificationStatus !== 'verified') {
    return {
      status: 403,
      code: 'SELLER_NOT_VERIFIED',
      message: `Operation requires verified seller status. Current status is '${sellerData.verificationStatus}'.`,
    };
  }

  if (sellerData.kycStatus === 'EXPIRED' || sellerData.kycStatus === 'SUSPENDED') {
    return {
      status: 403,
      code: 'SELLER_KYC_INACTIVE',
      message: `Operation blocked while KYC status is '${sellerData.kycStatus}'.`,
    };
  }

  return null;
}

async function getPublicSellerStoreName(sellerId: string): Promise<string> {
  if (!sellerId) return 'Marketplace Seller';
  try {
    const snap = await getDoc(doc(db, 'sellers', sellerId));
    if (snap.exists()) {
      const data = snap.data() as any;
      if (typeof data.storeName === 'string' && data.storeName.trim()) {
        return data.storeName.trim();
      }
    }
  } catch {
    // Non-blocking fallback
  }
  return 'Marketplace Seller';
}

function getDistinctOrderSellerIds(order: any): string[] {
  if (!Array.isArray(order?.items)) return [];
  const ids = new Set<string>();
  for (const item of order.items) {
    const sid = item?.sellerId || item?.product?.sellerId;
    if (typeof sid === 'string' && sid.trim()) {
      ids.add(sid.trim());
    }
  }
  return Array.from(ids);
}

function pickPublicShipmentFields(shipment: any): SellerShipmentInfo {
  return {
    sellerId: String(shipment.sellerId || ''),
    sellerStoreName: shipment.sellerStoreName ? String(shipment.sellerStoreName) : 'Marketplace Seller',
    carrier: String(shipment.carrier || ''),
    trackingNumber: String(shipment.trackingNumber || ''),
    ...(shipment.trackingUrl ? { trackingUrl: String(shipment.trackingUrl) } : {}),
    shippedAt: String(shipment.shippedAt || ''),
    status: shipment.status || 'Processing',
    ...(shipment.notes ? { notes: String(shipment.notes) } : {}),
    source: shipment.source === 'platform' ? 'platform' : 'seller_manual',
    updatedAt: String(shipment.updatedAt || ''),
  };
}

/**
 * Sanitizes order data according to the caller's role:
 * - Admins: full view
 * - Customer owner: full public merchant shipments (no seller PII, no internal admin UIDs/emails)
 * - Non-admin seller: strictly isolated to own sellerShipments & own/platform trackingHistory; customerEmail redacted
 */
export function sanitizeOrderForViewer(order: any, user: AuthenticatedUser): any {
  if (!order) return order;
  if (user.isAdmin) {
    return order;
  }

  const isCustomerOwner = order.customerUid === user.uid;
  const actingSellerId = user.sellerId || user.uid;

  if (!isCustomerOwner && user.isSeller) {
    const allShipments: Record<string, any> =
      order.sellerShipments && typeof order.sellerShipments === 'object' ? order.sellerShipments : {};
    const ownShipment = allShipments[actingSellerId]
      ? pickPublicShipmentFields(allShipments[actingSellerId])
      : undefined;

    const scopedShipments: Record<string, SellerShipmentInfo> | undefined = ownShipment
      ? { [actingSellerId]: ownShipment }
      : undefined;

    const distinctSellers = getDistinctOrderSellerIds(order);
    const isMultiVendor = distinctSellers.length > 1;

    const scopedHistory = Array.isArray(order.trackingHistory)
      ? order.trackingHistory
          .filter((evt: any) => !evt?.sellerId || evt.sellerId === actingSellerId)
          .map((evt: any) => {
            const { updatedByUid: _hiddenUid, ...safeEvt } = evt || {};
            return safeEvt;
          })
      : undefined;

    const {
      customerEmail: _hiddenCustomerEmail,
      statusOverriddenBy: _hiddenAdmin,
      ...rest
    } = order;

    return {
      ...rest,
      // On multi-vendor orders, never expose another seller's top-level tracking details
      ...(isMultiVendor
        ? {
            carrier: ownShipment?.carrier || '',
            trackingNumber: ownShipment?.trackingNumber || '',
            trackingUrl: ownShipment?.trackingUrl,
            shippedAt: ownShipment?.shippedAt,
          }
        : {}),
      ...(scopedShipments ? { sellerShipments: scopedShipments } : { sellerShipments: {} }),
      ...(scopedHistory ? { trackingHistory: scopedHistory } : {}),
    };
  }

  // Customer owner view: strip internal staff identifiers, preserve non-PII seller shipments
  const safeShipments: Record<string, SellerShipmentInfo> | undefined =
    order.sellerShipments && typeof order.sellerShipments === 'object'
      ? Object.fromEntries(
          Object.entries(order.sellerShipments).map(([sid, sh]) => [sid, pickPublicShipmentFields(sh)])
        )
      : undefined;

  const safeHistory = Array.isArray(order.trackingHistory)
    ? order.trackingHistory.map((evt: any) => {
        const { updatedByUid: _hiddenUid, ...safeEvt } = evt || {};
        return safeEvt;
      })
    : undefined;

  const { statusOverriddenBy: _hiddenAdmin, ...safeOrder } = order;
  return {
    ...safeOrder,
    ...(safeShipments ? { sellerShipments: safeShipments } : {}),
    ...(safeHistory ? { trackingHistory: safeHistory } : {}),
  };
}

function buildTrackingEvent(params: {
  sellerId?: string;
  sellerStoreName?: string;
  status: CanonicalOrderStatus;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  shippedAt?: string;
  notes?: string;
  source: TrackingHistorySource;
  updatedByUid: string;
  createdAt: string;
}): OrderTrackingEvent {
  return {
    id: `trk_${crypto.randomBytes(6).toString('hex')}`,
    ...(params.sellerId ? { sellerId: params.sellerId } : {}),
    ...(params.sellerStoreName ? { sellerStoreName: params.sellerStoreName } : {}),
    status: params.status,
    ...(params.carrier ? { carrier: params.carrier } : {}),
    ...(params.trackingNumber ? { trackingNumber: params.trackingNumber } : {}),
    ...(params.trackingUrl ? { trackingUrl: params.trackingUrl } : {}),
    ...(params.shippedAt ? { shippedAt: params.shippedAt } : {}),
    ...(params.notes ? { notes: params.notes } : {}),
    source: params.source,
    updatedByUid: params.updatedByUid,
    createdAt: params.createdAt,
  };
}

export interface ServiceResult {
  ok: boolean;
  status: number;
  code?: string;
  message?: string;
  details?: any;
  order?: any;
}

export async function recordSellerTrackingUpdate(
  orderId: string,
  body: any,
  user: AuthenticatedUser
): Promise<ServiceResult> {
  if (user.accountStatus === 'suspended') {
    return {
      ok: false,
      status: 403,
      code: 'ACCOUNT_SUSPENDED',
      message: 'Suspended accounts cannot modify order shipping details.',
    };
  }

  if (!user.isAdmin && !user.isSeller) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN_SELLER_REQUIRED',
      message: 'Only verified sellers or administrators may record shipping tracking.',
    };
  }

  const actingSellerId = user.sellerId || user.uid;

  // Block client attempt to mutate another seller's shipment slot
  if (!user.isAdmin && body?.sellerId && String(body.sellerId).trim() !== actingSellerId) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN_SELLER_OWNERSHIP',
      message: 'You are not authorized to modify another seller’s shipment information.',
    };
  }

  const orderDocRef = doc(db, 'orders', orderId);
  const snap = await getDoc(orderDocRef);
  if (!snap.exists()) {
    return {
      ok: false,
      status: 404,
      code: 'ORDER_NOT_FOUND',
      message: `Order #${orderId} not found.`,
    };
  }

  const order = snap.data() as any;
  const distinctSellers = getDistinctOrderSellerIds(order);

  // Verify seller owns at least one item in this order
  if (!user.isAdmin) {
    const sellerOwnsItem =
      Array.isArray(order.items) &&
      order.items.some((it: any) => it.sellerId === actingSellerId || it.sellerId === user.uid);
    if (!sellerOwnsItem) {
      return {
        ok: false,
        status: 403,
        code: 'FORBIDDEN_SELLER_OWNERSHIP',
        message: 'You can only manage shipping tracking for orders containing your own products.',
      };
    }

    const sellerErr = await assertVerifiedActiveSeller(actingSellerId);
    if (sellerErr) {
      return {
        ok: false,
        status: sellerErr.status,
        code: sellerErr.code,
        message: sellerErr.message,
      };
    }
  }

  const currentStatus = normalizeStatus(order.orderStatus || order.status || 'Placed');
  const markAsShipped = body?.markAsShipped === true;

  if (markAsShipped) {
    if (currentStatus !== 'Shipped') {
      const transitionCheck = validateStatusTransition(currentStatus, 'Shipped', order, user);
      if (!transitionCheck.allowed) {
        return {
          ok: false,
          status: transitionCheck.code?.startsWith('FORBIDDEN') ? 403 : 400,
          code: transitionCheck.code || 'INVALID_STATUS_TRANSITION',
          message: transitionCheck.message || 'Cannot transition order to Shipped.',
        };
      }
    }
  } else if (currentStatus !== 'Processing' && currentStatus !== 'Shipped') {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_ORDER_STAGE_FOR_TRACKING',
      message: `Tracking details can only be added when order is in 'Processing' or 'Shipped' status. Current status is '${currentStatus}'.`,
    };
  }

  const validation = validateShipmentInput(body);
  if (!validation.valid || !validation.data) {
    return {
      ok: false,
      status: 400,
      code: 'VALIDATION_FAILED',
      message: validation.errors.join(' '),
      details: validation.errors,
    };
  }

  const targetSellerId =
    user.isAdmin && typeof body?.sellerId === 'string' && body.sellerId.trim()
      ? body.sellerId.trim()
      : distinctSellers.includes(actingSellerId)
      ? actingSellerId
      : distinctSellers[0] || actingSellerId;

  const sellerStoreName = await getPublicSellerStoreName(targetSellerId);
  const now = new Date().toISOString();
  const nextOrderStatus: CanonicalOrderStatus = markAsShipped ? 'Shipped' : currentStatus;
  const source: TrackingHistorySource = user.isAdmin ? 'platform' : 'seller_manual';

  const existingShipments: Record<string, any> =
    order.sellerShipments && typeof order.sellerShipments === 'object' ? { ...order.sellerShipments } : {};
  const previousShipment = existingShipments[targetSellerId];

  const shipmentRecord: SellerShipmentInfo = {
    sellerId: targetSellerId,
    sellerStoreName,
    carrier: validation.data.carrier,
    trackingNumber: validation.data.trackingNumber,
    ...(validation.data.trackingUrl ? { trackingUrl: validation.data.trackingUrl } : {}),
    shippedAt: validation.data.shippedAt,
    status: nextOrderStatus === 'Shipped' ? 'Shipped' : 'Processing',
    ...(validation.data.notes ? { notes: validation.data.notes } : {}),
    source,
    updatedAt: now,
  };

  existingShipments[targetSellerId] = shipmentRecord;

  const historyEvent = buildTrackingEvent({
    sellerId: targetSellerId,
    sellerStoreName,
    status: nextOrderStatus,
    carrier: validation.data.carrier,
    trackingNumber: validation.data.trackingNumber,
    trackingUrl: validation.data.trackingUrl,
    shippedAt: validation.data.shippedAt,
    notes:
      validation.data.notes ||
      (previousShipment
        ? 'Updated carrier & tracking details.'
        : 'Recorded carrier & shipping tracking details.'),
    source,
    updatedByUid: user.uid,
    createdAt: now,
  });

  const existingHistory = Array.isArray(order.trackingHistory) ? order.trackingHistory : [];
  const nextHistory = [...existingHistory, historyEvent];

  const isSingleSellerOrder = distinctSellers.length <= 1;
  const shouldSyncTopLevel =
    isSingleSellerOrder || !order.trackingNumber || String(order.trackingNumber).trim() === '';

  const updatePayload: Record<string, any> = {
    sellerShipments: existingShipments,
    trackingHistory: nextHistory,
    updatedAt: now,
  };

  if (markAsShipped) {
    updatePayload.status = 'Shipped';
    updatePayload.orderStatus = 'Shipped';
  }

  if (shouldSyncTopLevel) {
    updatePayload.carrier = validation.data.carrier;
    updatePayload.trackingNumber = validation.data.trackingNumber;
    updatePayload.shippedAt = validation.data.shippedAt;
    updatePayload.trackingSource = source;
    if (validation.data.trackingUrl) {
      updatePayload.trackingUrl = validation.data.trackingUrl;
    } else if (isSingleSellerOrder && order.trackingUrl) {
      updatePayload.trackingUrl = '';
    }
  }

  await updateDoc(orderDocRef, updatePayload);

  const shipmentDetailsChanged =
    !previousShipment ||
    previousShipment.carrier !== shipmentRecord.carrier ||
    previousShipment.trackingNumber !== shipmentRecord.trackingNumber ||
    (previousShipment.trackingUrl || '') !== (shipmentRecord.trackingUrl || '') ||
    (previousShipment.shippedAt || '') !== (shipmentRecord.shippedAt || '') ||
    previousShipment.status !== shipmentRecord.status;

  if (shipmentDetailsChanged) {
    try {
      await NotificationService.notifyCustomerOrderEvent({
        customerUid: order.customerUid || order.userId,
        orderId,
        eventType: previousShipment ? 'tracking_updated' : 'tracking_added',
        status: nextOrderStatus,
        sellerId: targetSellerId,
        sellerStoreName,
        carrier: validation.data.carrier,
        trackingNumber: validation.data.trackingNumber,
        trackingUrl: validation.data.trackingUrl,
        shippedAt: validation.data.shippedAt,
      });
    } catch (notifErr: any) {
      console.warn('[OrderTrackingService] Non-blocking notification error:', notifErr?.message);
    }
  }

  const mergedOrder = {
    ...order,
    id: snap.id,
    ...updatePayload,
  };

  return {
    ok: true,
    status: 200,
    order: sanitizeOrderForViewer(mergedOrder, user),
  };
}

export async function applyOrderStatusTransition(
  orderId: string,
  body: any,
  user: AuthenticatedUser
): Promise<ServiceResult> {
  if (user.accountStatus === 'suspended') {
    return {
      ok: false,
      status: 403,
      code: 'ACCOUNT_SUSPENDED',
      message: 'Suspended accounts cannot modify order statuses.',
    };
  }

  const targetStatus = body?.status;
  if (!targetStatus || typeof targetStatus !== 'string' || !ALLOWED_RAW_ORDER_STATUSES.includes(targetStatus.trim())) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_STATUS',
      message: 'A valid target order status is required.',
    };
  }

  const orderDocRef = doc(db, 'orders', orderId);
  const snap = await getDoc(orderDocRef);
  if (!snap.exists()) {
    return {
      ok: false,
      status: 404,
      code: 'ORDER_NOT_FOUND',
      message: `Order #${orderId} not found.`,
    };
  }

  const order = snap.data() as any;
  const actingSellerId = user.sellerId || user.uid;

  if (!user.isAdmin && user.isSeller) {
    const sellerErr = await assertVerifiedActiveSeller(actingSellerId);
    if (sellerErr) {
      return {
        ok: false,
        status: sellerErr.status,
        code: sellerErr.code,
        message: sellerErr.message,
      };
    }
  }

  const validation = validateStatusTransition(order.status || 'Placed', targetStatus, order, user);
  if (!validation.allowed) {
    return {
      ok: false,
      status: validation.code?.startsWith('FORBIDDEN') ? 403 : 400,
      code: validation.code || 'INVALID_TRANSITION',
      message: validation.message || 'Status transition rejected.',
    };
  }

  const canonicalNewStatus = normalizeStatus(targetStatus);
  const hasTrackingFields =
    body?.carrier !== undefined ||
    body?.trackingNumber !== undefined ||
    body?.trackingUrl !== undefined;

  let validatedShipment: ReturnType<typeof validateShipmentInput>['data'];
  if (hasTrackingFields) {
    if (canonicalNewStatus !== 'Processing' && canonicalNewStatus !== 'Shipped') {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_ORDER_STAGE_FOR_TRACKING',
        message: `Tracking details cannot be set when transitioning order to '${canonicalNewStatus}'.`,
      };
    }

    const shipmentCheck = validateShipmentInput(body);
    if (!shipmentCheck.valid || !shipmentCheck.data) {
      return {
        ok: false,
        status: 400,
        code: 'VALIDATION_FAILED',
        message: shipmentCheck.errors.join(' '),
        details: shipmentCheck.errors,
      };
    }
    validatedShipment = shipmentCheck.data;
  }

  const now = new Date().toISOString();
  const distinctSellers = getDistinctOrderSellerIds(order);
  const targetSellerId = user.isSeller
    ? actingSellerId
    : distinctSellers.length === 1
    ? distinctSellers[0]
    : undefined;
  const sellerStoreName = targetSellerId ? await getPublicSellerStoreName(targetSellerId) : undefined;
  const source: TrackingHistorySource = user.isAdmin ? 'platform' : 'seller_manual';

  const existingShipments: Record<string, any> =
    order.sellerShipments && typeof order.sellerShipments === 'object' ? { ...order.sellerShipments } : {};

  if (validatedShipment && targetSellerId) {
    existingShipments[targetSellerId] = {
      sellerId: targetSellerId,
      sellerStoreName: sellerStoreName || 'Marketplace Seller',
      carrier: validatedShipment.carrier,
      trackingNumber: validatedShipment.trackingNumber,
      ...(validatedShipment.trackingUrl ? { trackingUrl: validatedShipment.trackingUrl } : {}),
      shippedAt: validatedShipment.shippedAt,
      status: canonicalNewStatus === 'Shipped' ? 'Shipped' : 'Processing',
      ...(validatedShipment.notes ? { notes: validatedShipment.notes } : {}),
      source,
      updatedAt: now,
    };
  } else if (targetSellerId && existingShipments[targetSellerId]) {
    existingShipments[targetSellerId] = {
      ...existingShipments[targetSellerId],
      status:
        canonicalNewStatus === 'Delivered' ||
        canonicalNewStatus === 'Cancelled' ||
        canonicalNewStatus === 'Shipped'
          ? canonicalNewStatus
          : 'Processing',
      updatedAt: now,
    };
  } else if (user.isAdmin && Object.keys(existingShipments).length > 0 && (canonicalNewStatus === 'Delivered' || canonicalNewStatus === 'Cancelled')) {
    for (const sid of Object.keys(existingShipments)) {
      existingShipments[sid] = {
        ...existingShipments[sid],
        status: canonicalNewStatus,
        updatedAt: now,
      };
    }
  }

  const historyEvent = buildTrackingEvent({
    sellerId: targetSellerId,
    sellerStoreName,
    status: canonicalNewStatus,
    carrier: validatedShipment?.carrier,
    trackingNumber: validatedShipment?.trackingNumber,
    trackingUrl: validatedShipment?.trackingUrl,
    shippedAt: validatedShipment?.shippedAt,
    notes:
      validatedShipment?.notes ||
      (typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : undefined),
    source,
    updatedByUid: user.uid,
    createdAt: now,
  });

  const existingHistory = Array.isArray(order.trackingHistory) ? order.trackingHistory : [];
  const updatePayload: Record<string, any> = {
    status: canonicalNewStatus,
    orderStatus: canonicalNewStatus,
    trackingHistory: [...existingHistory, historyEvent],
    updatedAt: now,
  };

  if (Object.keys(existingShipments).length > 0) {
    updatePayload.sellerShipments = existingShipments;
  }

  if (user.isAdmin) {
    updatePayload.statusOverrideReason = body?.reason || 'Administrative lifecycle transition';
    updatePayload.statusOverriddenBy = user.email || user.uid;
  }

  if (validatedShipment) {
    const isSingleSellerOrder = distinctSellers.length <= 1;
    const shouldSyncTopLevel =
      isSingleSellerOrder || !order.trackingNumber || String(order.trackingNumber).trim() === '';
    if (shouldSyncTopLevel) {
      updatePayload.carrier = validatedShipment.carrier;
      updatePayload.trackingNumber = validatedShipment.trackingNumber;
      updatePayload.shippedAt = validatedShipment.shippedAt;
      updatePayload.trackingSource = source;
      if (validatedShipment.trackingUrl) {
        updatePayload.trackingUrl = validatedShipment.trackingUrl;
      }
    }
  }

  await updateDoc(orderDocRef, updatePayload);

  if (canonicalNewStatus === 'Cancelled') {
    try {
      await SellerLedgerService.recordOrderAdjustment(orderId, 'cancellation_adjustment');
    } catch (adjErr: any) {
      console.warn('[OrderTrackingService] Non-blocking cancellation adjustment warning:', adjErr?.message || 'Unknown error');
    }
  } else if (canonicalNewStatus === 'Delivered') {
    try {
      await SellerLedgerService.confirmDeliverySettlement(orderId);
    } catch (delivErr: any) {
      console.warn('[OrderTrackingService] Non-blocking delivery settlement warning:', delivErr?.message || 'Unknown error');
    }
  }

  try {
    await NotificationService.notifyCustomerOrderEvent({
      customerUid: order.customerUid || order.userId,
      orderId,
      eventType: validatedShipment ? 'tracking_added' : 'order_status_changed',
      status: canonicalNewStatus,
      sellerId: targetSellerId,
      sellerStoreName,
      carrier: validatedShipment?.carrier || existingShipments[targetSellerId || '']?.carrier,
      trackingNumber: validatedShipment?.trackingNumber || existingShipments[targetSellerId || '']?.trackingNumber,
      trackingUrl: validatedShipment?.trackingUrl || existingShipments[targetSellerId || '']?.trackingUrl,
      shippedAt: validatedShipment?.shippedAt || existingShipments[targetSellerId || '']?.shippedAt,
    });
  } catch (notifErr: any) {
    console.warn('[OrderTrackingService] Non-blocking notification error:', notifErr?.message);
  }

  const mergedOrder = {
    ...order,
    id: snap.id,
    ...updatePayload,
  };

  return {
    ok: true,
    status: 200,
    order: sanitizeOrderForViewer(mergedOrder, user),
  };
}

import crypto from 'crypto';
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
} from '../repositories/serverFirestore';
import { NotificationItem } from '../../src/types';

export interface CustomerOrderNotificationParams {
  customerUid?: string;
  orderId: string;
  eventType: 'order_status_changed' | 'tracking_added' | 'tracking_updated';
  status: string;
  sellerId?: string;
  sellerStoreName?: string;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  shippedAt?: string;
}

export class NotificationService {
  /**
   * Computes a deterministic notification ID so duplicate retries or repeated
   * identical tracking/status updates never spam duplicate notifications.
   */
  static buildOrderNotificationId(params: CustomerOrderNotificationParams): string {
    const normalizedEventBucket =
      params.eventType === 'tracking_added' || params.eventType === 'tracking_updated'
        ? 'tracking_state'
        : params.eventType;

    const fingerprint = [
      params.orderId.trim(),
      (params.customerUid || '').trim(),
      normalizedEventBucket,
      (params.sellerId || '').trim(),
      params.status.trim(),
      (params.carrier || '').trim(),
      (params.trackingNumber || '').trim(),
      (params.trackingUrl || '').trim(),
      (params.shippedAt || '').trim(),
    ].join('|');

    const digest = crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 24);
    return `ord_${digest}`;
  }

  /**
   * Creates an in-app customer notification in /notifications/{id} with deduplication.
   */
  static async notifyCustomerOrderEvent(
    params: CustomerOrderNotificationParams
  ): Promise<{ created: boolean; duplicate: boolean; notificationId?: string }> {
    const customerUid = (params.customerUid || '').trim();
    if (!customerUid) {
      return { created: false, duplicate: false };
    }

    const notificationId = this.buildOrderNotificationId(params);
    const notifRef = doc(db, 'notifications', notificationId);

    const existing = await getDoc(notifRef);
    if (existing.exists()) {
      return { created: false, duplicate: true, notificationId };
    }

    const storePrefix = params.sellerStoreName ? `${params.sellerStoreName}: ` : '';
    let title = `Order #${params.orderId} Update`;
    let message = `Your order #${params.orderId} status is now ${params.status}.`;

    if (params.eventType === 'tracking_added' && params.trackingNumber) {
      title = `Tracking Added for Order #${params.orderId}`;
      message = `${storePrefix}Shipped via ${params.carrier || 'Carrier'} (Tracking: ${params.trackingNumber}).`;
    } else if (params.eventType === 'tracking_updated' && params.trackingNumber) {
      title = `Shipping Tracking Updated for Order #${params.orderId}`;
      message = `${storePrefix}Updated carrier details: ${params.carrier || 'Carrier'} • ${params.trackingNumber}.`;
    } else if (params.status === 'Shipped') {
      title = `Order #${params.orderId} Has Shipped`;
      message = params.trackingNumber
        ? `${storePrefix}Your package is on the way via ${params.carrier || 'Carrier'} (${params.trackingNumber}).`
        : `${storePrefix}Your order has been marked as Shipped.`;
    } else if (params.status === 'Processing') {
      title = `Order #${params.orderId} Is Processing`;
      message = `${storePrefix}Your items are being prepared for shipment.`;
    } else if (params.status === 'Delivered') {
      title = `Order #${params.orderId} Delivered`;
      message = `Your order #${params.orderId} has been marked as Delivered.`;
    } else if (params.status === 'Cancelled') {
      title = `Order #${params.orderId} Cancelled`;
      message = `Your order #${params.orderId} has been cancelled.`;
    }

    const payload: NotificationItem = {
      id: notificationId,
      userId: customerUid,
      type: 'order',
      title,
      message,
      read: false,
      createdAt: new Date().toISOString(),
      link: `/orders/${params.orderId}`,
      orderId: params.orderId,
      sellerId: params.sellerId || undefined,
      eventType: params.eventType,
    };

    await setDoc(notifRef, payload);
    return { created: true, duplicate: false, notificationId };
  }

  static async listUserNotifications(uid: string): Promise<NotificationItem[]> {
    const colRef = collection(db, 'notifications');
    const q = query(colRef, where('userId', '==', uid));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<NotificationItem, 'id'>),
    }));
    list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return list;
  }

  static async markAsRead(
    uid: string,
    notificationId: string
  ): Promise<{ ok: boolean; status: number; code?: string; message?: string }> {
    const notifRef = doc(db, 'notifications', notificationId);
    const snap = await getDoc(notifRef);
    if (!snap.exists()) {
      return { ok: false, status: 404, code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found.' };
    }
    const data = snap.data() as NotificationItem;
    if (data.userId !== uid) {
      return {
        ok: false,
        status: 403,
        code: 'FORBIDDEN',
        message: 'You are not authorized to modify another user’s notification.',
      };
    }

    if (!data.read) {
      await updateDoc(notifRef, { read: true });
    }
    return { ok: true, status: 200 };
  }
}

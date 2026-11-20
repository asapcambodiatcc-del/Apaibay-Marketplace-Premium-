import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from './firebase/config';
import { AdminNotification } from '../types';

const ADMIN_NOTIFICATIONS_COLLECTION = 'admin_notifications';

export class AdminNotificationClient {
  /**
   * Creates or updates an administrative notification document.
   * If customId is provided (e.g., `seller_app_${sellerId}`), ensures idempotent upsert.
   */
  static async createNotification(
    data: Omit<AdminNotification, 'id'>,
    customId?: string
  ): Promise<AdminNotification> {
    const id = customId || `admin_notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const notification: AdminNotification = {
      id,
      ...data,
    };

    try {
      const docRef = doc(db, ADMIN_NOTIFICATIONS_COLLECTION, id);
      await setDoc(docRef, notification, { merge: true });
    } catch (fsErr) {
      console.warn('[AdminNotificationClient] Firestore write note:', fsErr);
    }

    return notification;
  }

  /**
   * Retrieves all admin notifications sorted by newest first.
   */
  static async listNotifications(): Promise<AdminNotification[]> {
    try {
      const colRef = collection(db, ADMIN_NOTIFICATIONS_COLLECTION);
      const q = query(colRef, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AdminNotification, 'id'>),
        }));
      }
    } catch (fsErr) {
      console.warn('[AdminNotificationClient] Direct list note:', fsErr);
    }

    // Backend fallback
    try {
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken();
        const res = await fetch('/api/commerce/admin/notifications', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const body = await res.json();
          if (body.success && Array.isArray(body.notifications)) {
            return body.notifications;
          }
        }
      }
    } catch {
      // ignore
    }

    return [];
  }

  /**
   * Real-time listener for admin notifications with proper unsubscribe cleanup.
   */
  static listenNotifications(
    callback: (notifications: AdminNotification[]) => void
  ): () => void {
    try {
      const colRef = collection(db, ADMIN_NOTIFICATIONS_COLLECTION);
      const q = query(colRef, orderBy('createdAt', 'desc'));
      return onSnapshot(
        q,
        (snap) => {
          const list = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<AdminNotification, 'id'>),
          }));
          callback(list);
        },
        (err) => {
          console.warn('[AdminNotificationClient] Snapshot listener error:', err?.message);
          // Fallback initial fetch
          this.listNotifications().then(callback).catch(() => callback([]));
        }
      );
    } catch (err) {
      console.warn('[AdminNotificationClient] Listener setup error:', err);
      this.listNotifications().then(callback).catch(() => callback([]));
      return () => {};
    }
  }

  /**
   * Marks a notification as read.
   */
  static async markAsRead(notificationId: string): Promise<void> {
    try {
      const docRef = doc(db, ADMIN_NOTIFICATIONS_COLLECTION, notificationId);
      await updateDoc(docRef, { read: true });
    } catch (fsErr) {
      console.warn('[AdminNotificationClient] Direct markAsRead note:', fsErr);
    }

    try {
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken();
        await fetch(`/api/commerce/admin/notifications/${notificationId}/read`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // non-blocking
    }
  }
}

import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../../services/firebase/config';
import { handleFirestoreError, OperationType } from '../../services/firebase/firestoreErrors';
import { NotificationItem } from '../../types';
import { NotificationRepository } from '../NotificationRepository';

const NOTIFICATIONS_COLLECTION = 'notifications';

export class FirebaseNotificationRepository implements NotificationRepository {
  async getUserNotifications(uid: string): Promise<NotificationItem[]> {
    if (!uid) return [];
    try {
      const colRef = collection(db, NOTIFICATIONS_COLLECTION);
      const q = query(colRef, where('userId', '==', uid));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<NotificationItem, 'id'>),
      }));
    } catch (error) {
      console.warn('Notifications query:', error);
      return [];
    }
  }

  listenUserNotifications(uid: string, callback: (notifications: NotificationItem[]) => void): () => void {
    if (!uid) {
      callback([]);
      return () => {};
    }
    const colRef = collection(db, NOTIFICATIONS_COLLECTION);
    const q = query(colRef, where('userId', '==', uid));
    return onSnapshot(
      q,
      (snap) => {
        const notifications = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<NotificationItem, 'id'>),
        }));
        callback(notifications);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, NOTIFICATIONS_COLLECTION);
      }
    );
  }

  async markAsRead(notificationId: string): Promise<void> {
    try {
      const docRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
      await setDoc(docRef, { read: true }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${NOTIFICATIONS_COLLECTION}/${notificationId}`);
    }
  }
}

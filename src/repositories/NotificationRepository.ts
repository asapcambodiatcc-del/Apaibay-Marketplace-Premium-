import { NotificationItem } from '../types';

export interface NotificationRepository {
  getUserNotifications(uid: string): Promise<NotificationItem[]>;
  listenUserNotifications(uid: string, callback: (notifications: NotificationItem[]) => void): () => void;
  markAsRead(notificationId: string): Promise<void>;
}

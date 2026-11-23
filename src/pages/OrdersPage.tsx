import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { orderRepository, notificationRepository } from '../repositories';
import { NotificationItem, Order } from '../types';
import {
  getCustomerOrderShipments,
  normalizeOrderItemsForDisplay,
} from '../utils/orderTrackingUtils';
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  ChevronRight,
  Bell,
  XCircle,
} from 'lucide-react';

export const OrdersPage: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user, firebaseUser } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const activeUid = firebaseUser?.uid || user?.uid || '';

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      const list = await orderRepository.getAll();
      setOrders(list);
      setLoading(false);
    };
    fetchOrders();
  }, [activeUid]);

  useEffect(() => {
    if (!activeUid) {
      setNotifications([]);
      return;
    }

    let isMounted = true;
    notificationRepository.getUserNotifications(activeUid).then((initial) => {
      if (isMounted && initial.length > 0) {
        setNotifications(initial);
      }
    });

    const unsubscribe = notificationRepository.listenUserNotifications(activeUid, (liveList) => {
      if (isMounted && liveList.length > 0) {
        setNotifications(liveList);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [activeUid]);

  const unreadNotifications = notifications.filter((n) => !n.read);

  const handleMarkNotificationRead = async (notification: NotificationItem) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
    );
    await notificationRepository.markAsRead(notification.id);
  };

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'Delivered':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-md">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Delivered</span>
          </span>
        );
      case 'Cancelled':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/50 px-2.5 py-0.5 rounded-md">
            <XCircle className="w-3.5 h-3.5" />
            <span>Cancelled</span>
          </span>
        );
      case 'Shipped':
      case 'Out for Delivery':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-sky-600 bg-sky-50 dark:bg-sky-950/50 px-2.5 py-0.5 rounded-md">
            <Truck className="w-3.5 h-3.5" />
            <span>{status}</span>
          </span>
        );
      case 'Processing':
      case 'Placed':
      case 'Order Placed':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/50 px-2.5 py-0.5 rounded-md">
            <Clock className="w-3.5 h-3.5" />
            <span>{status}</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            {t('orders.title', 'My Orders & Shipments')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Track packages, view receipts, and monitor delivery timelines
          </p>
        </div>

        {unreadNotifications.length > 0 && (
          <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-[#ff6a00]/30 text-xs font-bold text-[#ff6a00]">
            <Bell className="w-4 h-4" />
            <span>{unreadNotifications.length} unread shipment update{unreadNotifications.length > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Customer Order & Shipment Updates */}
      {notifications.length > 0 && (
        <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#ff6a00]" />
              <span>Order &amp; Shipment Updates</span>
            </h2>
            <span className="text-[11px] text-slate-400">
              {unreadNotifications.length} unread
            </span>
          </div>

          <div className="space-y-2">
            {notifications.slice(0, 5).map((notif) => (
              <div
                key={notif.id}
                className={`p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs ${
                  notif.read
                    ? 'bg-slate-50/60 dark:bg-slate-800/30 border-slate-200/70 dark:border-slate-800'
                    : 'bg-orange-50/50 dark:bg-orange-950/20 border-[#ff6a00]/30'
                }`}
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    {!notif.read && <span className="w-2 h-2 rounded-full bg-[#ff6a00] shrink-0" />}
                    <span className="font-bold text-slate-900 dark:text-white">{notif.title}</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">{notif.message}</p>
                  <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                    {new Date(notif.createdAt).toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {notif.link && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!notif.read) {
                          handleMarkNotificationRead(notif);
                        }
                        navigate(notif.link!);
                      }}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold text-[11px] cursor-pointer"
                    >
                      View Order
                    </button>
                  )}
                  {!notif.read && (
                    <button
                      type="button"
                      onClick={() => handleMarkNotificationRead(notif)}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-[11px] cursor-pointer"
                    >
                      Mark Read
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-[#ff6a00] flex items-center justify-center">
            <Package className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">No orders placed yet</h3>
          <p className="text-xs text-slate-500 max-w-sm">
            Once you place an order, delivery tracking and receipt summaries will appear here.
          </p>
          <Link
            to="/"
            className="mt-2 px-5 py-2.5 rounded-xl bg-[#ff6a00] text-white text-xs font-bold"
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const displayItems = normalizeOrderItemsForDisplay(order);
            const shipments = getCustomerOrderShipments(order);

            return (
              <div
                key={order.id}
                onClick={() => navigate(`/orders/${order.id}`)}
                className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#ff6a00]/40 transition-all shadow-xs hover:shadow-md cursor-pointer space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/50 text-[#ff6a00] flex items-center justify-center">
                      <Package className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Order ID</div>
                      <div className="text-sm font-extrabold text-slate-900 dark:text-white font-mono">
                        #{order.id}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div>
                      <div className="text-slate-400">Placed on</div>
                      <div className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                        {order.date || (order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'Recent')}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">Total</div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-[#ff6a00] text-sm tabular-nums">
                          ${Number(order.total || 0).toFixed(2)}
                        </span>
                        {order.paymentMethod === 'crypto' && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            {order.cryptoCurrency || 'Crypto'}
                          </span>
                        )}
                      </div>
                    </div>
                    {getStatusBadge(order.status)}
                  </div>
                </div>

                {/* Shipment Summary Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  {shipments.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300">
                      <Truck className="w-3.5 h-3.5 text-[#ff6a00] shrink-0" />
                      <span className="font-semibold">
                        {shipments[0].carrier}: <span className="font-mono font-bold">{shipments[0].trackingNumber}</span>
                      </span>
                      {shipments.length > 1 && (
                        <span className="text-[11px] text-slate-400">
                          (+{shipments.length - 1} more shipment{shipments.length > 2 ? 's' : ''})
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400">
                      Tracking information not yet provided by seller
                    </div>
                  )}
                </div>

                {/* Items Preview */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 overflow-x-auto py-1">
                    {displayItems.map((item, idx) => (
                      <img
                        key={`${item.productId}_${idx}`}
                        src={
                          item.image ||
                          'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=150&q=80'
                        }
                        alt={item.name}
                        title={item.name}
                        className="w-12 h-12 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 shrink-0"
                      />
                    ))}
                    <div className="text-xs text-slate-500 pl-2 whitespace-nowrap">
                      {displayItems.length} {displayItems.length === 1 ? 'item' : 'items'}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-xs font-bold text-[#ff6a00] shrink-0">
                    <span>Track Package</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

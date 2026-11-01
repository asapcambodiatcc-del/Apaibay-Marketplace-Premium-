import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { orderRepository } from '../repositories';
import { Order } from '../types';
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  ChevronRight,
  ExternalLink,
  ShoppingBag,
} from 'lucide-react';

export const OrdersPage: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      const list = await orderRepository.getAll();
      setOrders(list);
      setLoading(false);
    };
    fetchOrders();
  }, []);

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'Delivered':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-md">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Delivered</span>
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
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
          {t('orders.title', 'My Orders & Shipments')}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Track packages, view receipts, and monitor delivery timelines
        </p>
      </div>

      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-[#ff6a00] flex items-center justify-center">
            <Package className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">No orders placed yet</h3>
          <p className="text-xs text-slate-500 max-w-sm">
            Once you place an order, live delivery tracking and receipt summaries will appear here.
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
          {orders.map((order) => (
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

                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <div className="text-slate-400">Placed on</div>
                    <div className="font-semibold text-slate-700 dark:text-slate-300">
                      {order.date || 'Recent'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Total</div>
                    <div className="font-extrabold text-[#ff6a00] text-sm">
                      ${order.total.toFixed(2)}
                    </div>
                  </div>
                  {getStatusBadge(order.status)}
                </div>
              </div>

              {/* Items Preview */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 overflow-x-auto py-1">
                  {order.items.map((item, idx) => (
                    <img
                      key={idx}
                      src={item.product?.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=150&q=80'}
                      alt={item.product?.name || 'Item'}
                      title={item.product?.name || 'Item'}
                      className="w-12 h-12 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800"
                    />
                  ))}
                  <div className="text-xs text-slate-500 pl-2">
                    {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                  </div>
                </div>

                <div className="flex items-center gap-1 text-xs font-bold text-[#ff6a00]">
                  <span>Track Package</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

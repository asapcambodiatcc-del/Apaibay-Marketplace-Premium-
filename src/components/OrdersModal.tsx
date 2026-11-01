import React, { useState } from 'react';
import {
  X,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { Order } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface OrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
}

export const OrdersModal: React.FC<OrdersModalProps> = ({
  isOpen,
  onClose,
  orders,
}) => {
  const { t } = useLanguage();
  if (!isOpen) return null;

  const [selectedOrder, setSelectedOrder] = useState<Order>(orders[0] || null);

  const STATUS_STEPS = [
    'Order Placed',
    'Processing',
    'Shipped',
    'Out for Delivery',
    'Delivered'
  ];

  const getStepIndex = (status: string) => {
    const idx = STATUS_STEPS.indexOf(status);
    return idx === -1 ? 0 : idx;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl max-w-3xl w-full shadow-2xl overflow-hidden relative my-auto">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-[#ff6a00]" />
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
              {t('orders.title', 'Orders & Live Tracking')} ({orders.length})
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 max-h-[75vh] overflow-y-auto">
          {/* Order List (md:col-span-5) */}
          <div className="md:col-span-5 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50 dark:bg-slate-950/40">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {t('orders.history', 'Order History')}
            </div>
            {orders.map((order) => {
              const isSelected = selectedOrder?.id === order.id;
              return (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white dark:bg-slate-800 border-[#ff6a00] shadow-sm ring-1 ring-[#ff6a00]'
                      : 'bg-white/70 dark:bg-slate-900/70 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {order.id}
                    </span>
                    <span className="text-[10px] text-slate-400">{order.date}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-[#ff6a00]">
                      ${order.total.toFixed(2)}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        order.status === 'Delivered'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400'
                          : 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-400'
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Order Details (md:col-span-7) */}
          {selectedOrder && (
            <div className="md:col-span-7 p-6 space-y-6">
              {/* Top metadata */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    {t('orders.liveDispatch', 'Live Dispatch Info')}
                  </span>
                  <div className="text-sm font-mono font-bold text-[#ff6a00]">
                    {selectedOrder.trackingNumber}
                  </div>
                  <div className="text-xs text-slate-500">
                    {t('orders.carrier', 'Carrier:')} {selectedOrder.carrier}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    {t('orders.expectedArrival', 'Expected Arrival')}
                  </span>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {selectedOrder.estimatedDelivery}
                  </div>
                </div>
              </div>

              {/* Progress Timeline */}
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white mb-3">
                  {t('orders.progress', 'Shipment Progress')}
                </div>
                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
                  {STATUS_STEPS.map((st, idx) => {
                    const activeIndex = getStepIndex(selectedOrder.status);
                    const isPassed = idx <= activeIndex;
                    const isCurrent = idx === activeIndex;

                    return (
                      <div key={st} className="relative flex items-center gap-3">
                        <div
                          className={`absolute -left-6 w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                            isPassed
                              ? 'bg-[#ff6a00] text-white ring-4 ring-orange-100 dark:ring-orange-950/60'
                              : 'bg-slate-300 dark:bg-slate-700 text-slate-500'
                          }`}
                        >
                          {isPassed ? '✓' : ''}
                        </div>
                        <div>
                          <p
                            className={`text-xs ${
                              isCurrent
                                ? 'font-black text-[#ff6a00]'
                                : isPassed
                                ? 'font-bold text-slate-800 dark:text-slate-200'
                                : 'text-slate-400'
                            }`}
                          >
                            {st}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Order Items */}
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white mb-2">
                  {t('orders.items', 'Purchased Items')}
                </div>
                <div className="space-y-2 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {selectedOrder.items.map((item, i) => (
                    <div key={i} className="pt-2 first:pt-0 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={item.product?.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=150&q=80'}
                          alt={item.product?.name || 'Item'}
                          className="w-10 h-10 rounded-lg object-cover bg-slate-100"
                        />
                        <div className="truncate max-w-[200px]">
                          <div className="font-bold text-slate-900 dark:text-white truncate">
                            {item.product.name}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Qty: {item.quantity}
                          </div>
                        </div>
                      </div>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        ${(item.product.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Destination */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs flex items-start gap-2.5 text-slate-600 dark:text-slate-400">
                <MapPin className="w-4 h-4 text-[#ff6a00] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {t('orders.deliveryDestination', 'Delivery Destination')}
                  </div>
                  <div>{selectedOrder.shippingAddress.name}</div>
                  <div>{selectedOrder.shippingAddress.street}</div>
                  <div>
                    {selectedOrder.shippingAddress.city}, {selectedOrder.shippingAddress.postalCode}, {selectedOrder.shippingAddress.country}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


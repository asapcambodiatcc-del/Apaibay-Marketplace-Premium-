import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { orderRepository } from '../repositories';
import { Order } from '../types';
import { NotFound } from '../components/NotFound';
import { RouteLoading } from '../components/RouteLoading';
import {
  copyTextSafely,
  getCustomerOrderShipments,
  getSortedTrackingHistory,
  isValidSafeTrackingUrl,
  normalizeOrderItemsForDisplay,
} from '../utils/orderTrackingUtils';
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  Calendar,
  ChevronLeft,
  Copy,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  XCircle,
  History,
  Info,
} from 'lucide-react';

interface OrderDetailPageProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

const TIMELINE_STEPS = [
  { key: 'placed', label: 'Order Placed', desc: 'Confirmed & reserved' },
  { key: 'processing', label: 'Processing', desc: 'Packed by seller' },
  { key: 'shipped', label: 'Shipped', desc: 'Handed to carrier' },
  { key: 'delivered', label: 'Delivered', desc: 'Received by customer' },
];

export const OrderDetailPage: React.FC<OrderDetailPageProps> = ({ onShowToast }) => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrder = useCallback(async (isRefresh = false) => {
    if (!orderId) return;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const found = await orderRepository.getById(orderId);
      setOrder(found);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadOrder(false);
  }, [loadOrder]);

  if (loading) {
    return <RouteLoading message="Loading tracking details..." />;
  }

  if (!order) {
    return <NotFound />;
  }

  const getActiveStepIndex = (status: Order['status']) => {
    switch (status) {
      case 'Delivered':
      case 'Out for Delivery':
        return 3;
      case 'Shipped':
        return 2;
      case 'Processing':
        return 1;
      case 'Placed':
      case 'Order Placed':
      default:
        return 0;
    }
  };

  const isCancelled = order.status === 'Cancelled' || order.orderStatus === 'Cancelled';
  const currentStep = getActiveStepIndex(order.status);
  const shipments = getCustomerOrderShipments(order);
  const trackingHistory = getSortedTrackingHistory(order);
  const normalizedItems = normalizeOrderItemsForDisplay(order);

  const handleCopy = async (value: string, label: string) => {
    const ok = await copyTextSafely(value);
    onShowToast(ok ? `${label} copied!` : `Unable to copy ${label.toLowerCase()}.`, ok ? 'success' : 'error');
  };

  return (
    <div className="space-y-6 sm:space-y-8 pb-16">
      {/* Header with Back & Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/orders')}
            className="min-w-[44px] min-h-[44px] p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer"
            aria-label="Back to orders"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
              Order #{order.id}
            </h1>
            <p className="text-xs text-slate-500 tabular-nums">
              Placed on {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : order.date || 'Recent'} &bull;{' '}
              {normalizedItems.length} {normalizedItems.length === 1 ? 'item' : 'items'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <button
            type="button"
            onClick={() => loadOrder(true)}
            disabled={refreshing}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-[#ff6a00] hover:text-[#ff6a00] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <div className="text-right">
            <div className="text-xs text-slate-400">Total Paid</div>
            <div className="text-xl font-extrabold text-[#ff6a00] tabular-nums">${Number(order.total || 0).toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Shipment Tracker Card */}
      <div className="p-5 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#ff6a00]" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Fulfillment &amp; Shipment Tracking
              </span>
            </div>
            <div className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
              Current Status:{' '}
              <span className={isCancelled ? 'text-rose-600 dark:text-rose-400' : 'text-[#ff6a00]'}>
                {order.status}
              </span>
            </div>
          </div>

          <div className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 rounded-xl">
            <Calendar className="w-4 h-4 text-[#ff6a00] shrink-0" />
            <span>Est. Delivery: {order.estimatedDelivery || '3 - 5 business days'}</span>
          </div>
        </div>

        {/* Visual Progress Steps (or Cancelled Notice) */}
        {isCancelled ? (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 flex items-center gap-3 text-xs text-rose-700 dark:text-rose-300 font-semibold">
            <XCircle className="w-5 h-5 shrink-0" />
            <span>This order has been cancelled. If payment was captured, settlement/refund adjustments apply automatically.</span>
          </div>
        ) : (
          <div className="pt-2">
            <div className="grid grid-cols-4 gap-2 text-center relative">
              <div className="absolute top-4 left-6 right-6 h-1 bg-slate-200 dark:bg-slate-800 z-0" />
              <div
                className="absolute top-4 left-6 h-1 bg-[#ff6a00] z-0 transition-all duration-500"
                style={{ width: `${(currentStep / 3) * 85}%` }}
              />

              {TIMELINE_STEPS.map((step, idx) => {
                const isPassed = idx <= currentStep;
                return (
                  <div key={step.key} className="flex flex-col items-center space-y-2 relative z-10">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                        isPassed
                          ? 'bg-[#ff6a00] text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                      }`}
                    >
                      {isPassed ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                    </div>
                    <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-tight">
                      {step.label}
                    </div>
                    <div className="hidden sm:block text-[10px] text-slate-400 leading-tight">
                      {step.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Carrier Tracking Cards (Single or Multi-Vendor) OR Honest Pending Notice */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
          {shipments.length === 0 ? (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-start gap-3 text-xs text-slate-600 dark:text-slate-300">
              <Info className="w-4 h-4 text-[#ff6a00] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">
                  Tracking information has not been provided yet
                </div>
                <p className="text-slate-500 dark:text-slate-400">
                  {isCancelled
                    ? 'No shipment tracking was recorded prior to cancellation.'
                    : 'Once the seller dispatches your items and records a carrier tracking number, it will appear here.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {shipments.map((shipment) => (
                <div
                  key={`${shipment.sellerId}_${shipment.trackingNumber}`}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-[#ff6a00]">
                        {shipment.carrier}
                      </span>
                      {shipment.sellerStoreName && (
                        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          &bull; {shipment.sellerStoreName}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {shipment.source === 'seller_manual' ? 'Seller-Entered Tracking' : 'Platform Dispatch'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white font-mono select-all break-all">
                        {shipment.trackingNumber}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(shipment.trackingNumber, 'Tracking number')}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-[#ff6a00] hover:text-[#ff6a00] inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </button>
                    </div>

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
                      {shipment.shippedAt && (
                        <span>Shipped: {new Date(shipment.shippedAt).toLocaleDateString()}</span>
                      )}
                      {shipment.notes && <span>Note: {shipment.notes}</span>}
                    </div>
                  </div>

                  {shipment.trackingUrl && isValidSafeTrackingUrl(shipment.trackingUrl) && (
                    <a
                      href={shipment.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] text-white text-xs font-bold inline-flex items-center justify-center gap-2 shrink-0 transition-colors"
                    >
                      <span>Open Carrier Tracking</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Items, Tracking History & Destination Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
        {/* Items + Tracking History */}
        <div className="lg:col-span-8 space-y-6">
          <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Package className="w-4 h-4 text-[#ff6a00]" />
              <span>Items in this Order</span>
            </h3>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {normalizedItems.map((item, idx) => (
                <div key={`${item.productId}_${idx}`} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={
                        item.image ||
                        'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=150&q=80'
                      }
                      alt={item.name}
                      className="w-16 h-16 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
                    />
                    <div className="space-y-0.5 min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white line-clamp-2">
                        {item.name}
                      </h4>
                      <div className="text-xs text-slate-500 tabular-nums">
                        Qty: {item.quantity} {item.selectedColor && `• Color: ${item.selectedColor}`}{' '}
                        {item.selectedSize && `• Size: ${item.selectedSize}`}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 tabular-nums">
                    <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                      ${item.subtotal.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-slate-400">${item.unitPrice.toFixed(2)} each</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tracking & Status Timeline History */}
          <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <History className="w-4 h-4 text-[#ff6a00]" />
                <span>Tracking &amp; Status History</span>
              </h3>
              <span className="text-[11px] text-slate-400">Chronological order updates</span>
            </div>

            {trackingHistory.length === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400 py-3">
                No tracking updates recorded yet.
              </div>
            ) : (
              <div className="relative pl-5 space-y-4 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                {trackingHistory.map((evt, index) => (
                  <div key={evt.id || `${evt.createdAt}_${index}`} className="relative space-y-1 text-xs">
                    <div
                      className={`absolute -left-5 top-1 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 ${
                        index === 0 ? 'bg-[#ff6a00]' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-slate-900 dark:text-white">{evt.status}</span>
                        {evt.sellerStoreName && (
                          <span className="text-[11px] font-semibold text-slate-500">
                            ({evt.sellerStoreName})
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                          {evt.source === 'seller_manual' ? 'Seller-Entered Tracking' : 'Platform Event'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                        {new Date(evt.createdAt).toLocaleString()}
                      </span>
                    </div>

                    {evt.trackingNumber && (
                      <div className="text-[11px] font-mono text-slate-700 dark:text-slate-300">
                        {evt.carrier ? `${evt.carrier}: ` : ''}
                        {evt.trackingNumber}
                      </div>
                    )}
                    {evt.notes && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{evt.notes}</div>
                    )}
                    {evt.trackingUrl && isValidSafeTrackingUrl(evt.trackingUrl) && (
                      <div>
                        <a
                          href={evt.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#ff6a00] hover:underline"
                        >
                          <span>Carrier Tracking Link</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Delivery Details */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#ff6a00]" />
              <span>Shipping Destination</span>
            </h3>

            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <div className="font-bold text-slate-900 dark:text-white">
                {order.shippingAddress?.name || (order.shippingAddress as any)?.fullName || 'Customer'}
              </div>
              <div>{order.shippingAddress?.street}</div>
              <div>
                {order.shippingAddress?.city}
                {order.shippingAddress?.postalCode ? `, ${order.shippingAddress.postalCode}` : ''}
              </div>
              <div>{order.shippingAddress?.country}</div>
              {order.shippingAddress?.phone && (
                <div className="pt-1 text-slate-400 font-mono tabular-nums">{order.shippingAddress.phone}</div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Protected by Apaibay Buyer Delivery Guarantee</span>
            </div>
          </div>

          {/* Crypto Payment Settlement Details */}
          {(order.paymentMethod === 'crypto' || order.cryptoCurrency || order.cryptoPayment) && (
            <div className="p-6 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 border border-slate-700 text-white space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-[#ff6a00]/20 border border-[#ff6a00]/40 flex items-center justify-center text-[#ff6a00]">
                    ⚡
                  </span>
                  <h4 className="font-extrabold text-sm text-white">Crypto Settlement</h4>
                </div>
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  On-Chain Verified
                </span>
              </div>

              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Asset &amp; Network</span>
                  <span className="font-bold text-white font-mono">
                    {order.cryptoCurrency || 'USDT'} ({order.cryptoNetwork || 'BEP-20'})
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Crypto Amount</span>
                  <span className="font-extrabold text-emerald-400 font-mono tabular-nums">
                    {order.cryptoAmount || order.cryptoPayment?.payAmount || order.total}{' '}
                    {order.cryptoCurrency || 'USDT'}
                  </span>
                </div>

                {order.payAddress && (
                  <div className="space-y-1 pt-1">
                    <span className="text-slate-400 text-[11px]">Deposit Address</span>
                    <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700 font-mono text-[10px] text-slate-300 break-all select-all flex items-center justify-between gap-1">
                      <span>{order.payAddress}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(order.payAddress!, 'Deposit address')}
                        className="p-2 hover:text-white cursor-pointer"
                        title="Copy address"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {order.transactionReference && (
                  <div className="space-y-1 pt-1">
                    <span className="text-slate-400 text-[11px]">Transaction Reference</span>
                    <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700 font-mono text-[10px] text-slate-300 break-all select-all flex items-center justify-between gap-1">
                      <span>{order.transactionReference}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(order.transactionReference!, 'Transaction reference')}
                        className="p-2 hover:text-white cursor-pointer"
                        title="Copy reference"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="pt-2 text-[10px] text-slate-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Settled via NOWPayments Gateway Architecture (Sandbox)</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

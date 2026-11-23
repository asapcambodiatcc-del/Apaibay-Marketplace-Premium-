import React, { useState, useMemo } from 'react';
import {
  Package,
  RefreshCw,
  Search,
  Truck,
  CheckCircle2,
  Clock,
  XCircle,
  MapPin,
  ExternalLink,
  Copy,
  Edit3,
  History,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Order } from '../../types';
import { SellerClient } from '../../services/sellerClient';
import {
  CanonicalDisplayOrderStatus,
  getSellerOrderItems,
  normalizeDisplayOrderStatus,
} from './sellerUtils';
import {
  COMMON_SHIPPING_CARRIERS,
  copyTextSafely,
  getSellerOwnShipment,
  getSortedTrackingHistory,
  isValidSafeTrackingUrl,
  validateShipmentFormInput,
} from '../../utils/orderTrackingUtils';

interface SellerOrdersPanelProps {
  sellerUid?: string;
  orders: Order[];
  loadingOrders: boolean;
  canFulfillOrders: boolean;
  onRefreshOrders: () => Promise<void>;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

type StatusFilter = 'all' | CanonicalDisplayOrderStatus;

interface TrackingDraftState {
  orderId: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string;
  shippedDate: string;
  notes: string;
  markAsShipped: boolean;
}

export const SellerOrdersPanel: React.FC<SellerOrdersPanelProps> = ({
  sellerUid,
  orders,
  loadingOrders,
  canFulfillOrders,
  onRefreshOrders,
  onShowToast,
}) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [confirmCancelOrderId, setConfirmCancelOrderId] = useState<string | null>(null);
  const [trackingDraft, setTrackingDraft] = useState<TrackingDraftState | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [expandedHistoryOrderIds, setExpandedHistoryOrderIds] = useState<Record<string, boolean>>({});

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: orders.length,
      Placed: 0,
      Processing: 0,
      Shipped: 0,
      Delivered: 0,
      Cancelled: 0,
    };
    orders.forEach((o) => {
      const st = normalizeDisplayOrderStatus(o.orderStatus || o.status);
      counts[st]++;
    });
    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return orders.filter((ord) => {
      const st = normalizeDisplayOrderStatus(ord.orderStatus || ord.status);
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (q) {
        const items = getSellerOrderItems(ord, sellerUid);
        const ownShipment = getSellerOwnShipment(ord, sellerUid);
        const itemNames = items.map((i) => i.name).join(' ');
        const hay = `${ord.id} ${ownShipment?.trackingNumber || ord.trackingNumber || ''} ${
          ownShipment?.carrier || ord.carrier || ''
        } ${ord.shippingAddress?.name || ''} ${itemNames}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, searchTerm, sellerUid]);

  const handleTransition = async (orderId: string, nextStatus: 'Processing' | 'Shipped' | 'Cancelled') => {
    if (!canFulfillOrders) {
      onShowToast('Verified active merchant status is required to update order fulfillment.', 'error');
      return;
    }

    setUpdatingOrderId(orderId);
    try {
      await SellerClient.updateSellerOrderStatus(orderId, nextStatus);
      setConfirmCancelOrderId(null);
      await onRefreshOrders();
      onShowToast(`Order #${orderId} updated to "${nextStatus}".`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to update order status.', 'error');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const openTrackingEditor = (ord: Order, markAsShippedDefault: boolean) => {
    const existing = getSellerOwnShipment(ord, sellerUid);
    const todayIsoDate = new Date().toISOString().slice(0, 10);
    const existingDate = existing?.shippedAt ? existing.shippedAt.slice(0, 10) : todayIsoDate;

    setTrackingError(null);
    setTrackingDraft({
      orderId: ord.id,
      carrier: existing?.carrier || '',
      trackingNumber: existing?.trackingNumber || '',
      trackingUrl: existing?.trackingUrl || '',
      shippedDate: existingDate,
      notes: existing?.notes || '',
      markAsShipped: markAsShippedDefault,
    });
  };

  const handleSaveTracking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingDraft) return;
    if (!canFulfillOrders) {
      onShowToast('Verified active merchant status is required to update shipping tracking.', 'error');
      return;
    }

    const shippedAtIso = trackingDraft.shippedDate
      ? new Date(`${trackingDraft.shippedDate}T12:00:00Z`).toISOString()
      : new Date().toISOString();

    const validationErr = validateShipmentFormInput({
      carrier: trackingDraft.carrier,
      trackingNumber: trackingDraft.trackingNumber,
      trackingUrl: trackingDraft.trackingUrl,
      shippedAt: shippedAtIso,
      notes: trackingDraft.notes,
    });

    if (validationErr) {
      setTrackingError(validationErr);
      return;
    }

    setTrackingError(null);
    setUpdatingOrderId(trackingDraft.orderId);
    try {
      await SellerClient.updateOrderTracking(trackingDraft.orderId, {
        carrier: trackingDraft.carrier.trim(),
        trackingNumber: trackingDraft.trackingNumber.trim(),
        trackingUrl: trackingDraft.trackingUrl.trim() || undefined,
        shippedAt: shippedAtIso,
        notes: trackingDraft.notes.trim() || undefined,
        markAsShipped: trackingDraft.markAsShipped,
      });
      const savedOrderId = trackingDraft.orderId;
      const markedShipped = trackingDraft.markAsShipped;
      setTrackingDraft(null);
      await onRefreshOrders();
      onShowToast(
        markedShipped
          ? `Order #${savedOrderId} marked Shipped with carrier tracking.`
          : `Shipping tracking saved for Order #${savedOrderId}.`,
        'success'
      );
    } catch (err: any) {
      const msg = err?.message || 'Failed to save shipping tracking details.';
      setTrackingError(msg);
      onShowToast(msg, 'error');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const toggleHistory = (orderId: string) => {
    setExpandedHistoryOrderIds((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  const getStatusBadgeStyle = (st: CanonicalDisplayOrderStatus) => {
    switch (st) {
      case 'Delivered':
        return 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300';
      case 'Shipped':
        return 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300';
      case 'Processing':
        return 'bg-orange-50 dark:bg-orange-950/50 text-[#ff6a00]';
      case 'Cancelled':
        return 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300';
      default:
        return 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300';
    }
  };

  return (
    <div className="p-4 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-[#ff6a00]" />
            <span>Orders, Fulfillment &amp; Shipping Tracking ({orders.length})</span>
          </h2>
          <p className="text-xs text-slate-400">
            Process incoming orders for your store, record carrier tracking details, and advance fulfillment stages
          </p>
        </div>
        <button
          type="button"
          onClick={onRefreshOrders}
          disabled={loadingOrders}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingOrders ? 'animate-spin' : ''}`} />
          <span>Refresh Orders</span>
        </button>
      </div>

      {/* Status Filter Strip & Search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(['all', 'Placed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                statusFilter === st
                  ? 'bg-[#ff6a00] text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {st === 'all' ? 'All' : st} ({statusCounts[st]})
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Order ID, tracking #, carrier..."
            className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-[#ff6a00]"
          />
        </div>
      </div>

      {/* Orders List */}
      {loadingOrders && orders.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-28 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400 space-y-2">
          <Package className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
          <p className="font-semibold text-slate-600 dark:text-slate-300">No store orders recorded yet.</p>
          <p>When customers purchase products from your catalog, orders and shipping controls will appear here.</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-400 space-y-2">
          <p>No orders match the selected filter.</p>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('all');
              setSearchTerm('');
            }}
            className="text-[#ff6a00] font-bold hover:underline cursor-pointer"
          >
            Show all orders
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((ord) => {
            const st = normalizeDisplayOrderStatus(ord.orderStatus || ord.status);
            const sellerItems = getSellerOrderItems(ord, sellerUid);
            const sellerSubtotal = sellerItems.reduce((sum, item) => sum + item.subtotal, 0);
            const ownShipment = getSellerOwnShipment(ord, sellerUid);
            const trackingHistory = getSortedTrackingHistory(ord);
            const isUpdating = updatingOrderId === ord.id;
            const isPaid = ord.paymentStatus === 'paid';
            const isEditingTracking = trackingDraft?.orderId === ord.id;
            const canEditTracking = canFulfillOrders && (st === 'Processing' || st === 'Shipped');
            const historyExpanded = !!expandedHistoryOrderIds[ord.id];

            return (
              <div
                key={ord.id}
                className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 space-y-4"
              >
                {/* Top Order Meta */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-700/60 pb-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-extrabold text-sm text-slate-900 dark:text-white">
                        #{ord.id}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase ${getStatusBadgeStyle(st)}`}>
                        {st}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                          isPaid
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                            : ord.paymentStatus === 'refunded' || ord.paymentStatus === 'failed'
                            ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Payment: {ord.paymentStatus || 'pending'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
                      <span>{ord.date || new Date(ord.createdAt || Date.now()).toLocaleDateString()}</span>
                      {ownShipment ? (
                        <span className="font-mono text-slate-700 dark:text-slate-200">
                          {ownShipment.carrier}: {ownShipment.trackingNumber}
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                          No seller tracking recorded yet
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <div className="text-[11px] text-slate-400">Your Store Items Subtotal</div>
                    <div className="text-base font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">
                      ${sellerSubtotal.toFixed(2)} USD
                    </div>
                  </div>
                </div>

                {/* Seller Line Items */}
                <div className="divide-y divide-slate-200/60 dark:divide-slate-700/50">
                  {sellerItems.map((item, idx) => (
                    <div key={`${ord.id}_${item.productId}_${idx}`} className="py-2 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-2">
                          <span className="tabular-nums">Qty: {item.quantity} &times; ${item.unitPrice.toFixed(2)}</span>
                          {item.sku && <span className="font-mono">{item.sku}</span>}
                          {item.selectedColor && <span>Color: {item.selectedColor}</span>}
                          {item.selectedSize && <span>Size: {item.selectedSize}</span>}
                        </div>
                      </div>
                      <div className="font-mono font-bold text-slate-900 dark:text-white tabular-nums shrink-0">
                        ${item.subtotal.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Seller's Own Recorded Shipment Box */}
                {ownShipment && (
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#ff6a00]">
                          {ownShipment.carrier}
                        </span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          Seller-Entered Tracking
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 dark:text-white break-all">
                          {ownShipment.trackingNumber}
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await copyTextSafely(ownShipment.trackingNumber);
                            onShowToast(
                              ok ? 'Tracking number copied.' : 'Copy failed.',
                              ok ? 'success' : 'error'
                            );
                          }}
                          className="min-h-[32px] px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#ff6a00] inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        Shipped Date:{' '}
                        {ownShipment.shippedAt
                          ? new Date(ownShipment.shippedAt).toLocaleDateString()
                          : 'Recorded'}
                        {ownShipment.notes ? ` • ${ownShipment.notes}` : ''}
                      </div>
                    </div>

                    {ownShipment.trackingUrl && isValidSafeTrackingUrl(ownShipment.trackingUrl) && (
                      <a
                        href={ownShipment.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-[#ff6a00] hover:text-[#ff6a00] inline-flex items-center justify-center gap-1.5 shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Carrier Link</span>
                      </a>
                    )}
                  </div>
                )}

                {/* Inline Add/Edit Tracking Form */}
                {isEditingTracking && trackingDraft && (
                  <form
                    onSubmit={handleSaveTracking}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900 border-2 border-[#ff6a00]/40 space-y-4 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">
                          {ownShipment ? 'Update Shipping & Tracking Details' : 'Add Shipping & Tracking Details'}
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          Recorded strictly for your store&apos;s items on Order #{ord.id}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTrackingDraft(null);
                          setTrackingError(null);
                        }}
                        className="min-h-[36px] px-3 py-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>

                    {/* Quick Carrier Suggestions */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        Carrier Quick Select
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {COMMON_SHIPPING_CARRIERS.map((carrierOption) => (
                          <button
                            key={carrierOption}
                            type="button"
                            onClick={() =>
                              setTrackingDraft((prev) =>
                                prev ? { ...prev, carrier: carrierOption } : prev
                              )
                            }
                            className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors ${
                              trackingDraft.carrier === carrierOption
                                ? 'bg-[#ff6a00] border-[#ff6a00] text-white'
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-[#ff6a00]'
                            }`}
                          >
                            {carrierOption}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="font-bold text-slate-700 dark:text-slate-300 block">
                          Shipping Carrier *
                        </label>
                        <input
                          type="text"
                          required
                          value={trackingDraft.carrier}
                          onChange={(e) =>
                            setTrackingDraft((prev) =>
                              prev ? { ...prev, carrier: e.target.value } : prev
                            )
                          }
                          placeholder="e.g. DHL Express, J&T Express"
                          className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-[#ff6a00]"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-700 dark:text-slate-300 block">
                          Tracking Number *
                        </label>
                        <input
                          type="text"
                          required
                          value={trackingDraft.trackingNumber}
                          onChange={(e) =>
                            setTrackingDraft((prev) =>
                              prev ? { ...prev, trackingNumber: e.target.value } : prev
                            )
                          }
                          placeholder="e.g. DHL-99881122"
                          className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-[#ff6a00]"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-700 dark:text-slate-300 block">
                          Shipped Date *
                        </label>
                        <input
                          type="date"
                          required
                          value={trackingDraft.shippedDate}
                          onChange={(e) =>
                            setTrackingDraft((prev) =>
                              prev ? { ...prev, shippedDate: e.target.value } : prev
                            )
                          }
                          className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono tabular-nums focus:outline-[#ff6a00]"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-700 dark:text-slate-300 block">
                          Tracking URL (Optional, https://)
                        </label>
                        <input
                          type="url"
                          value={trackingDraft.trackingUrl}
                          onChange={(e) =>
                            setTrackingDraft((prev) =>
                              prev ? { ...prev, trackingUrl: e.target.value } : prev
                            )
                          }
                          placeholder="https://carrier.example.com/track/..."
                          className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-[#ff6a00]"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300 block">
                        Dispatch Note (Optional)
                      </label>
                      <input
                        type="text"
                        maxLength={500}
                        value={trackingDraft.notes}
                        onChange={(e) =>
                          setTrackingDraft((prev) =>
                            prev ? { ...prev, notes: e.target.value } : prev
                          )
                        }
                        placeholder="e.g. Dispatched from Phnom Penh warehouse"
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-[#ff6a00]"
                      />
                    </div>

                    {st === 'Processing' && (
                      <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={trackingDraft.markAsShipped}
                          onChange={(e) =>
                            setTrackingDraft((prev) =>
                              prev ? { ...prev, markAsShipped: e.target.checked } : prev
                            )
                          }
                          className="w-4 h-4 accent-[#ff6a00]"
                        />
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          Also mark order status as &ldquo;Shipped&rdquo; and notify customer
                        </span>
                      </label>
                    )}

                    {trackingError && (
                      <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold">
                        {trackingError}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      <button
                        type="submit"
                        disabled={isUpdating}
                        className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] disabled:opacity-50 text-white font-bold text-xs cursor-pointer transition-colors"
                      >
                        {isUpdating
                          ? 'Saving...'
                          : trackingDraft.markAsShipped && st === 'Processing'
                          ? 'Save Tracking & Mark Shipped'
                          : 'Save Tracking Details'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Shipping Destination & Fulfillment Actions */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-slate-200/70 dark:border-slate-700/60 text-xs">
                  <div className="flex items-start gap-2 text-slate-500 dark:text-slate-400 text-[11px]">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      Ship to: <strong className="text-slate-700 dark:text-slate-200">{ord.shippingAddress?.name || 'Customer'}</strong>
                      {ord.shippingAddress?.city ? `, ${ord.shippingAddress.city}` : ''}
                      {ord.shippingAddress?.country ? `, ${ord.shippingAddress.country}` : ''}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {st === 'Placed' && canFulfillOrders && (
                      <>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleTransition(ord.id, 'Processing')}
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] disabled:opacity-50 text-white font-bold text-xs cursor-pointer transition-colors"
                        >
                          {isUpdating ? 'Updating...' : 'Start Processing'}
                        </button>
                        {confirmCancelOrderId === ord.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => handleTransition(ord.id, 'Cancelled')}
                              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer"
                            >
                              Confirm Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmCancelOrderId(null)}
                              className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 text-xs font-bold cursor-pointer"
                            >
                              Keep
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => setConfirmCancelOrderId(ord.id)}
                            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 font-bold text-xs cursor-pointer"
                          >
                            Cancel Order
                          </button>
                        )}
                      </>
                    )}

                    {canEditTracking && !isEditingTracking && (
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => openTrackingEditor(ord, st === 'Processing')}
                        className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#ff6a00]/40 text-[#ff6a00] hover:bg-orange-50 dark:hover:bg-orange-950/30 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{ownShipment ? 'Edit Tracking' : 'Add Tracking'}</span>
                      </button>
                    )}

                    {st === 'Processing' && canFulfillOrders && (
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleTransition(ord.id, 'Shipped')}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span>{isUpdating ? 'Updating...' : 'Mark Shipped'}</span>
                      </button>
                    )}

                    {st === 'Shipped' && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                        <Clock className="w-3.5 h-3.5" />
                        Awaiting buyer/platform delivery confirmation
                      </span>
                    )}

                    {st === 'Delivered' && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Delivered
                      </span>
                    )}

                    {st === 'Cancelled' && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-500">
                        <XCircle className="w-3.5 h-3.5" />
                        Order Cancelled
                      </span>
                    )}

                    {trackingHistory.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleHistory(ord.id)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>History ({trackingHistory.length})</span>
                        {historyExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable Tracking History */}
                {historyExpanded && trackingHistory.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/60 space-y-2 text-[11px]">
                    <div className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px]">
                      Tracking &amp; Status History
                    </div>
                    <div className="space-y-2">
                      {trackingHistory.map((evt) => (
                        <div
                          key={evt.id}
                          className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                        >
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-slate-800 dark:text-slate-200">{evt.status}</span>
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-semibold">
                                {evt.source === 'seller_manual' ? 'Seller-Entered' : 'Platform Event'}
                              </span>
                            </div>
                            {evt.trackingNumber && (
                              <div className="font-mono text-slate-600 dark:text-slate-300">
                                {evt.carrier ? `${evt.carrier}: ` : ''}
                                {evt.trackingNumber}
                              </div>
                            )}
                            {evt.notes && <div className="text-slate-500">{evt.notes}</div>}
                          </div>
                          <div className="text-slate-400 font-mono tabular-nums shrink-0">
                            {new Date(evt.createdAt).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

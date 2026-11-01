import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { orderRepository } from '../repositories';
import { Order } from '../types';
import { NotFound } from '../components/NotFound';
import { RouteLoading } from '../components/RouteLoading';
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
} from 'lucide-react';

interface OrderDetailPageProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

const TIMELINE_STEPS = [
  { key: 'placed', label: 'Order Placed', desc: 'Order confirmed & reserved' },
  { key: 'processing', label: 'Processing at Hub', desc: 'Packed and inspected' },
  { key: 'shipped', label: 'Shipped', desc: 'Handed over to carrier' },
  { key: 'out_for_delivery', label: 'Out for Delivery', desc: 'Courier en route' },
  { key: 'delivered', label: 'Delivered', desc: 'Package signed & received' },
];

export const OrderDetailPage: React.FC<OrderDetailPageProps> = ({ onShowToast }) => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!orderId) return;
      setLoading(true);
      const found = await orderRepository.getById(orderId);
      setOrder(found);
      setLoading(false);
    };
    load();
  }, [orderId]);

  if (loading) {
    return <RouteLoading message="Loading tracking details..." />;
  }

  if (!order) {
    return <NotFound />;
  }

  const getActiveStepIndex = (status: Order['status']) => {
    switch (status) {
      case 'Delivered':
        return 4;
      case 'Out for Delivery':
        return 3;
      case 'Shipped':
        return 2;
      case 'Processing':
        return 1;
      case 'Order Placed':
      default:
        return 0;
    }
  };

  const currentStep = getActiveStepIndex(order.status);

  const copyTracking = () => {
    if (order.trackingNumber && navigator.clipboard) {
      navigator.clipboard.writeText(order.trackingNumber);
      onShowToast('Tracking number copied!', 'success');
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header with Back button */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/orders')}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
              Order #{order.id}
            </h1>
            <p className="text-xs text-slate-500">
              Placed on {new Date(order.createdAt).toLocaleDateString()} • {order.items.length} items
            </p>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs text-slate-400">Total Paid</div>
          <div className="text-xl font-extrabold text-[#ff6a00]">${order.total.toFixed(2)}</div>
        </div>
      </div>

      {/* Shipment Tracker Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-black uppercase text-[#ff6a00] tracking-wider">
              {order.carrier || 'Global Express'}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white font-mono">
                {order.trackingNumber || 'APAI-TRACK-PENDING'}
              </span>
              <button
                type="button"
                onClick={copyTracking}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                title="Copy tracking number"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2 rounded-xl">
            <Calendar className="w-4 h-4 text-[#ff6a00]" />
            <span>Est. Delivery: {order.estimatedDelivery || 'In 3-5 business days'}</span>
          </div>
        </div>

        {/* 5-step visual tracking progress */}
        <div className="pt-4">
          <div className="grid grid-cols-5 gap-2 text-center relative">
            {/* Connecting line */}
            <div className="absolute top-4 left-6 right-6 h-1 bg-slate-200 dark:bg-slate-800 -z-0" />
            <div
              className="absolute top-4 left-6 h-1 bg-[#ff6a00] -z-0 transition-all duration-500"
              style={{ width: `${(currentStep / 4) * 85}%` }}
            />

            {TIMELINE_STEPS.map((step, idx) => {
              const isPassed = idx <= currentStep;
              return (
                <div key={step.key} className="flex flex-col items-center space-y-2 relative z-10">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                      isPassed
                        ? 'bg-[#ff6a00] text-white shadow-md'
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
      </div>

      {/* Items & Shipping Address Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Items List */}
        <div className="lg:col-span-8 space-y-4">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Package className="w-4 h-4 text-[#ff6a00]" />
              <span>Items in this Shipment</span>
            </h3>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {order.items.map((item, idx) => (
                <div key={idx} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={item.product?.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=150&q=80'}
                      alt={item.product?.name || 'Item'}
                      className="w-16 h-16 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
                    />
                    <div className="space-y-0.5">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white line-clamp-1">
                        {item.product?.name}
                      </h4>
                      <div className="text-xs text-slate-500">
                        Qty: {item.quantity} {item.selectedColor && `• Color: ${item.selectedColor}`}{' '}
                        {item.selectedSize && `• Size: ${item.selectedSize}`}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                      ${((item.product?.price || 0) * item.quantity).toFixed(2)}
                    </div>
                    <div className="text-[11px] text-slate-400">${item.product?.price?.toFixed(2)} each</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Delivery Details */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#ff6a00]" />
              <span>Shipping Destination</span>
            </h3>

            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <div className="font-bold text-slate-900 dark:text-white">
                {order.shippingAddress.name || (order.shippingAddress as any).fullName}
              </div>
              <div>{order.shippingAddress.street}</div>
              <div>
                {order.shippingAddress.city}, {order.shippingAddress.postalCode}
              </div>
              <div>{order.shippingAddress.country}</div>
              <div className="pt-1 text-slate-400">{order.shippingAddress.phone}</div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Protected by Apaibay Buyer Delivery Guarantee</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

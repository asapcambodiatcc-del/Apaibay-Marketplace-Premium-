import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  CreditCard,
  Truck,
  CheckCircle2,
  Lock,
  ArrowRight,
  Sparkles,
  MapPin
} from 'lucide-react';
import { CartItem, Order } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  onOrderPlaced: (newOrder: Order) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  cart,
  onOrderPlaced,
}) => {
  const { t } = useLanguage();
  if (!isOpen) return null;

  const subtotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  const shipping = subtotal >= 50 ? 0 : 5.99;
  const total = subtotal + shipping;

  const [step, setStep] = useState<'checkout' | 'success'>('checkout');
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: 'Alexander Vance',
    email: 'alex.vance@example.com',
    street: '42 Kensington High St, Flat 4B',
    city: 'London',
    state: 'Greater London',
    postalCode: 'SW1A 1AA',
    country: 'United Kingdom',
    phone: '+44 20 7946 0912',
    cardNumber: '•••• •••• •••• 4242',
    cardExp: '12/28',
    cardCvc: '•••'
  });

  const [paymentMethod, setPaymentMethod] = useState<'card' | 'paypal' | 'applepay'>('card');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      const newOrder: Order = {
        id: `ORD-${Math.floor(10000 + Math.random() * 90000)}-GB`,
        date: 'Just now',
        items: [...cart],
        total: total,
        subtotal: subtotal,
        shipping: shipping,
        discount: 0,
        status: 'Order Placed',
        trackingNumber: `APAI-GB-${Math.floor(1000000 + Math.random() * 9000000)}`,
        carrier: 'Royal Mail Global Priority',
        estimatedDelivery: 'In 3-5 business days',
        shippingAddress: {
          name: formData.name,
          street: formData.street,
          city: formData.city,
          state: formData.state,
          postalCode: formData.postalCode,
          country: formData.country,
          phone: formData.phone,
        }
      };

      setPlacedOrder(newOrder);
      onOrderPlaced(newOrder);
      setIsSubmitting(false);
      setStep('success');
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden relative my-auto">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#ff6a00]" />
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
              {step === 'checkout' ? t('checkout.title', 'Checkout') : t('checkout.thankYou', 'Order Confirmed!')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'checkout' ? (
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-6 max-h-[80vh] overflow-y-auto">
            {/* Delivery address section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-[#ff6a00]" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  {t('checkout.shippingInfo', 'Shipping Information')}
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    {t('checkout.fullName', 'Full Recipient Name')}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-[#ff6a00]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    {t('checkout.address', 'Street Address & Apartment')}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.street}
                    onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-[#ff6a00]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    {t('checkout.city', 'City')}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-[#ff6a00]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    {t('checkout.zip', 'Postal Code / ZIP')}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-[#ff6a00]"
                  />
                </div>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CreditCard className="w-4 h-4 text-[#ff6a00]" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  {t('checkout.paymentMethod', 'Payment Gateways')}
                </h3>
              </div>

              <div className="grid grid-cols-3 gap-2.5 mb-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    paymentMethod === 'card'
                      ? 'border-[#ff6a00] bg-orange-50/50 dark:bg-orange-950/30 text-[#ff6a00] font-bold'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="text-xs font-bold">{t('checkout.creditCard', 'Credit / Debit')}</div>
                  <div className="text-[10px] text-slate-400">VISA / MC</div>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('paypal')}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    paymentMethod === 'paypal'
                      ? 'border-[#ff6a00] bg-orange-50/50 dark:bg-orange-950/30 text-[#ff6a00] font-bold'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="text-xs font-bold">{t('checkout.paypal', 'PayPal')}</div>
                  <div className="text-[10px] text-slate-400">Instant One-Click</div>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('applepay')}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    paymentMethod === 'applepay'
                      ? 'border-[#ff6a00] bg-orange-50/50 dark:bg-orange-950/30 text-[#ff6a00] font-bold'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="text-xs font-bold">Apple / Google Pay</div>
                  <div className="text-[10px] text-slate-400">Biometric Pay</div>
                </button>
              </div>

              {paymentMethod === 'card' && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-1">Card Number</label>
                    <input
                      type="text"
                      readOnly
                      value={formData.cardNumber}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 block mb-1">Expiry</label>
                      <input
                        type="text"
                        readOnly
                        value={formData.cardExp}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 block mb-1">CVC</label>
                      <input
                        type="text"
                        readOnly
                        value={formData.cardCvc}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Order Items Preview */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/80">
              <div className="text-xs font-bold text-slate-900 dark:text-white mb-2 flex items-center justify-between">
                <span>{t('checkout.orderSummary', 'Order Summary')} ({cart.length} unique items)</span>
                <span className="text-[#ff6a00] font-black">${total.toFixed(2)}</span>
              </div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 text-xs">
                {cart.map((item) => (
                  <div key={item.product.id} className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                    <span className="truncate max-w-[280px]">
                      {item.quantity}x {item.product.name}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-slate-200">
                      ${(item.product.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || cart.length === 0}
              className="w-full py-3.5 bg-[#ff6a00] hover:bg-[#e65f00] text-white font-black text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Authorizing Payment...</span>
              ) : (
                <>
                  <span>{t('checkout.placeOrder', 'Place Order')} (${total.toFixed(2)})</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Success Screen */
          <div className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
              {t('checkout.thankYou', 'Thank You for Your Order!')}
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Your order <span className="font-mono font-bold text-slate-900 dark:text-white">{placedOrder?.id}</span> has been confirmed. A tracking notification will be dispatched to your email.
            </p>

            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl max-w-md mx-auto text-left text-xs space-y-2 border border-slate-200 dark:border-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('checkout.trackingNumber', 'Tracking Number:')}</span>
                <span className="font-mono font-bold text-[#ff6a00]">{placedOrder?.trackingNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('checkout.carrier', 'Carrier:')}</span>
                <span className="font-semibold text-slate-800 dark:text-white">{placedOrder?.carrier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('checkout.estimatedDelivery', 'Estimated Delivery:')}</span>
                <span className="font-semibold text-slate-800 dark:text-white">{placedOrder?.estimatedDelivery}</span>
              </div>
            </div>

            <div className="pt-4 flex justify-center gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-[#ff6a00] hover:bg-[#e65f00] text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                {t('checkout.continueShopping', 'Continue Shopping')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


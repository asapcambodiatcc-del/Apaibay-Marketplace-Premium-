import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { orderRepository } from '../repositories';
import { Order } from '../types';
import { PaymentMethodType, PaymentIntent, PaymentActionRequired } from '../types/payment';
import { PaymentClient } from '../services/paymentClient';
import {
  ShieldCheck,
  CreditCard,
  Truck,
  Lock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  QrCode,
  Smartphone,
  Info,
  RefreshCw,
} from 'lucide-react';

interface CheckoutPageProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({ onShowToast }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { cart, subtotal, clearCart } = useCart();
  const { user, openAuthModal } = useAuth();

  const [fullName, setFullName] = useState(user?.name || 'Jane Doe');
  const [email, setEmail] = useState(user?.email || 'jane.doe@example.com');
  const [street, setStreet] = useState('100 Oxford Street');
  const [city, setCity] = useState('London');
  const [postalCode, setPostalCode] = useState('W1D 1LL');
  const [country, setCountry] = useState('United Kingdom');
  const [phone, setPhone] = useState('+44 20 7946 0912');

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('card');
  const [cardNumber, setCardNumber] = useState('•••• •••• •••• 4242');
  const [cardExp, setCardExp] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('123');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync user details if user signs in during checkout
  React.useEffect(() => {
    if (user) {
      if (user.name) setFullName(user.name);
      if (user.email) setEmail(user.email);
    }
  }, [user]);

  // Phase 5A: Sandbox Simulation Controls
  const [simulationToken, setSimulationToken] = useState<string>('test_success');
  const [activeChallenge, setActiveChallenge] = useState<{
    intentId: string;
    orderId: string;
    actionRequired: PaymentActionRequired;
  } | null>(null);
  const [paymentError, setPaymentError] = useState<{
    code: string;
    message: string;
    retryable: boolean;
    orderId?: string;
  } | null>(null);

  const shipping = subtotal > 50 || cart.length === 0 ? 0 : 9.99;
  const total = subtotal + shipping;

  if (cart.length === 0 && !activeChallenge) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Your cart is empty</h2>
        <p className="text-xs sm:text-sm text-slate-500">Add items to your cart before proceeding to checkout.</p>
        <Link
          to="/"
          className="px-6 py-2.5 rounded-xl bg-[#ff6a00] text-white font-bold text-xs"
        >
          Browse Products
        </Link>
      </div>
    );
  }

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onShowToast('Please sign in to complete your checkout securely.', 'info');
      openAuthModal('login');
      return;
    }

    if (!fullName || !street || !city || !postalCode) {
      onShowToast('Please fill in all required shipping fields', 'error');
      return;
    }

    setIsSubmitting(true);
    setPaymentError(null);

    try {
      // 1. Create Authoritative Order via Phase 4B Backend Endpoint
      const orderData: Omit<Order, 'id'> = {
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        items: [...cart],
        total,
        subtotal,
        shipping,
        discount: 0,
        status: 'Processing',
        shippingAddress: {
          name: fullName,
          street,
          city,
          state: 'Region',
          postalCode,
          country,
          phone,
        },
        trackingNumber: '',
        carrier: 'FedEx Priority Global',
        estimatedDelivery: '3 - 5 business days',
      };

      const createdOrder = await orderRepository.create(orderData);

      // 2. Initialize Phase 5A Server-Authoritative Payment Intent
      const idempotencyKey = `idemp_pay_${createdOrder.id}_${Date.now()}`;
      const intent = await PaymentClient.createIntent({
        orderId: createdOrder.id,
        methodType: paymentMethod,
        idempotencyKey,
      });

      // 3. Confirm / Process Sandbox Payment
      const confirmResult = await PaymentClient.confirmPayment({
        intentId: intent.id,
        simulationToken,
        safePaymentData: {
          brand: paymentMethod === 'card' ? 'Visa Sandbox' : paymentMethod.toUpperCase(),
          last4: '4242',
        },
      });

      if (confirmResult.status === 'paid') {
        clearCart();
        onShowToast(`Payment confirmed! Order #${createdOrder.id} placed successfully.`, 'success');
        navigate(`/orders/${createdOrder.id}`);
      } else if (confirmResult.status === 'requires_action' && confirmResult.payment.actionRequired) {
        setActiveChallenge({
          intentId: intent.id,
          orderId: createdOrder.id,
          actionRequired: confirmResult.payment.actionRequired,
        });
      } else if (confirmResult.status === 'failed') {
        setPaymentError({
          code: confirmResult.payment.failure?.code || 'PAYMENT_FAILED',
          message: confirmResult.payment.failure?.message || 'Payment simulation failed.',
          retryable: confirmResult.payment.failure?.retryable ?? true,
          orderId: createdOrder.id,
        });
        onShowToast('Payment was not approved. You can retry with a different test scenario.', 'error');
      }
    } catch (err: any) {
      setPaymentError({
        code: 'CHECKOUT_ERROR',
        message: err?.message || 'Failed to complete order. Please try again.',
        retryable: true,
      });
      onShowToast(err?.message || 'Failed to place order. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteChallenge = async (outcome: 'approve' | 'reject') => {
    if (!activeChallenge) return;
    setIsSubmitting(true);
    try {
      const res = await PaymentClient.completeAction({
        intentId: activeChallenge.intentId,
        challengeId: activeChallenge.actionRequired.challengeId,
        simulationOutcome: outcome,
      });

      if (res.status === 'paid') {
        const orderId = activeChallenge.orderId;
        setActiveChallenge(null);
        clearCart();
        onShowToast(`3DS challenge verified! Order #${orderId} confirmed.`, 'success');
        navigate(`/orders/${orderId}`);
      } else {
        const orderId = activeChallenge.orderId;
        setActiveChallenge(null);
        setPaymentError({
          code: 'ACTION_VERIFICATION_REJECTED',
          message: 'The 3D Secure simulation challenge was rejected.',
          retryable: true,
          orderId,
        });
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to complete challenge', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Sandbox Mode Notification Header */}
      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs">
        <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-extrabold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
            Apaibay Secure Payment Gateway & Sandbox Environment
          </div>
          <p className="text-amber-800 dark:text-amber-300">
            This checkout uses a strictly isolated, server-authoritative payment state machine. No real money or live financial gateways are contacted.
          </p>
        </div>
      </div>

      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
          Secure Checkout
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Encrypted fulfillment backed by Apaibay Server Payment State Engine
        </p>
      </div>

      {/* Payment Failure Banner */}
      {paymentError && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 space-y-2 text-xs">
          <div className="flex items-center gap-2 font-bold">
            <AlertCircle className="w-4 h-4" />
            <span>Payment Simulation Error: {paymentError.code}</span>
          </div>
          <p>{paymentError.message}</p>
          {paymentError.retryable && (
            <p className="text-slate-500 dark:text-slate-400">
              This failure code is flagged as retryable. Select another sandbox scenario below and try again.
            </p>
          )}
        </div>
      )}

      {/* 3DS Challenge Simulator Modal */}
      {activeChallenge && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                  Sandbox 3D Secure / OTP Challenge
                </h3>
                <p className="text-xs text-slate-400">Requires Action State Simulator</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
              <div className="font-semibold text-slate-700 dark:text-slate-200">
                {activeChallenge.actionRequired.prompt}
              </div>
              <div className="text-slate-400 font-mono text-[11px]">
                Challenge Ref: {activeChallenge.actionRequired.challengeId}
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleCompleteChallenge('approve')}
                className="w-full py-3 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Verifying...' : 'Simulate OTP Verification (Approve)'}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleCompleteChallenge('reject')}
                className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                Simulate Reject / Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Shipping & Payment */}
        <div className="lg:col-span-8 space-y-6">
          {/* 1. Shipping Details */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#ff6a00]" />
              <span>1. Shipping Information</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1 sm:col-span-2">
                <label className="font-bold text-slate-700 dark:text-slate-300">Recipient Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Phone Number</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="font-bold text-slate-700 dark:text-slate-300">Street Address</label>
                <input
                  type="text"
                  required
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">City</label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Postal Code</label>
                <input
                  type="text"
                  required
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* 2. Payment Method */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#ff6a00]" />
                <span>2. Payment Method</span>
              </h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Sandbox Mode
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`p-3 rounded-2xl border text-xs font-bold text-center transition-all cursor-pointer ${
                  paymentMethod === 'card'
                    ? 'border-[#ff6a00] bg-orange-50/50 dark:bg-orange-950/30 text-[#ff6a00]'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                }`}
              >
                Card (Sandbox)
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('khqr')}
                className={`p-3 rounded-2xl border text-xs font-bold text-center transition-all cursor-pointer ${
                  paymentMethod === 'khqr'
                    ? 'border-[#ff6a00] bg-orange-50/50 dark:bg-orange-950/30 text-[#ff6a00]'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                }`}
              >
                KHQR (Bakong)
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('aba_payway')}
                className={`p-3 rounded-2xl border text-xs font-bold text-center transition-all cursor-pointer ${
                  paymentMethod === 'aba_payway'
                    ? 'border-[#ff6a00] bg-orange-50/50 dark:bg-orange-950/30 text-[#ff6a00]'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                }`}
              >
                ABA PAYWAY
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('wing')}
                className={`p-3 rounded-2xl border text-xs font-bold text-center transition-all cursor-pointer ${
                  paymentMethod === 'wing'
                    ? 'border-[#ff6a00] bg-orange-50/50 dark:bg-orange-950/30 text-[#ff6a00]'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                }`}
              >
                WING Money
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('paypal')}
                className={`p-3 rounded-2xl border text-xs font-bold text-center transition-all cursor-pointer ${
                  paymentMethod === 'paypal'
                    ? 'border-[#ff6a00] bg-orange-50/50 dark:bg-orange-950/30 text-[#ff6a00]'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                }`}
              >
                PayPal
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('cod')}
                className={`p-3 rounded-2xl border text-xs font-bold text-center transition-all cursor-pointer ${
                  paymentMethod === 'cod'
                    ? 'border-[#ff6a00] bg-orange-50/50 dark:bg-orange-950/30 text-[#ff6a00]'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                }`}
              >
                Cash on Delivery
              </button>
            </div>

            {/* Sandbox Simulation Scenario Selector */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Deterministic Sandbox Simulation Scenario:</span>
                <span className="text-[10px] text-slate-400 font-normal">Test Mode Only</span>
              </label>
              <select
                value={simulationToken}
                onChange={(e) => setSimulationToken(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-medium cursor-pointer"
              >
                <option value="test_success">✅ Test Success (Simulates instant approval & paid transition)</option>
                <option value="test_action_required">🛡️ Test 3DS Challenge (Simulates requires_action & OTP approval)</option>
                <option value="test_card_declined">❌ Test Card Declined (Simulates declineCode: do_not_honor)</option>
                <option value="test_insufficient_funds">⚠️ Test Insufficient Funds (Simulates non-retryable balance failure)</option>
                <option value="test_fraud_risk">🚫 Test Risk Flag (Simulates HIGH_RISK_FRAUD rejection)</option>
              </select>
            </div>

            {paymentMethod === 'card' && (
              <div className="space-y-3 pt-2 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Simulated Card Number</label>
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300">Expiry (MM/YY)</label>
                    <input
                      type="text"
                      value={cardExp}
                      onChange={(e) => setCardExp(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300">CVC</label>
                    <input
                      type="text"
                      value={cardCvc}
                      onChange={(e) => setCardCvc(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Order Review */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
              Order Review ({cart.length} items)
            </h3>

            <div className="max-h-60 overflow-y-auto space-y-3 pr-1 text-xs">
              {cart.map((item) => (
                <div key={`${item.product.id}-${item.selectedColor}`} className="flex items-center gap-3">
                  <img
                    src={item.product?.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=150&q=80'}
                    alt={item.product?.name || 'Item'}
                    className="w-12 h-12 rounded-xl object-cover bg-slate-100 dark:bg-slate-800"
                  />
                  <div className="flex-1 truncate">
                    <div className="font-bold text-slate-900 dark:text-white truncate">
                      {item.product.name}
                    </div>
                    <div className="text-slate-400">Qty: {item.quantity}</div>
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    ${(item.product.price * item.quantity).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span className="font-bold text-slate-900 dark:text-white">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Shipping</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {shipping === 0 ? 'FREE' : `$${shipping.toFixed(2)}`}
                </span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="font-bold text-slate-900 dark:text-white">Total</span>
                <span className="text-xl font-extrabold text-[#ff6a00]">${total.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-2xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-extrabold text-sm shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>{isSubmitting ? 'Processing Payment...' : `Authorize & Pay • $${total.toFixed(2)}`}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

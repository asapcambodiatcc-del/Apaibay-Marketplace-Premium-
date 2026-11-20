import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { orderRepository } from '../repositories';
import { Order } from '../types';
import { PaymentMethodType, PaymentActionRequired } from '../types/payment';
import { PaymentClient } from '../services/paymentClient';
import { CryptoCheckoutModal } from '../components/CryptoCheckoutModal';
import {
  ShieldCheck,
  CreditCard,
  Truck,
  Lock,
  ArrowRight,
  AlertCircle,
  Info,
  ChevronRight,
  Zap,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

// Authentic Payment Brand SVG Vectors (Preserved from Apaibay Brand Identity)
const AbaPayLogo: React.FC<{ className?: string }> = ({ className = 'h-5 w-auto' }) => (
  <svg viewBox="0 0 110 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="ABA PAY">
    <rect width="110" height="32" rx="6" fill="#003B5C" />
    <text x="14" y="22" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="17" letterSpacing="0.5">ABA</text>
    <rect x="62" y="6" width="38" height="20" rx="4" fill="#00A3E0" />
    <text x="67" y="21" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="13" letterSpacing="0.5">PAY</text>
  </svg>
);

const KhqrLogo: React.FC<{ className?: string }> = ({ className = 'h-5 w-auto' }) => (
  <svg viewBox="0 0 95 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="KHQR">
    <rect width="95" height="32" rx="6" fill="#E11922" />
    <rect x="8" y="7" width="16" height="16" rx="2" fill="none" stroke="#FFFFFF" strokeWidth="2.5" />
    <rect x="12" y="11" width="8" height="8" rx="1" fill="#FFFFFF" />
    <text x="30" y="22" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="15" letterSpacing="0.5">KHQR</text>
  </svg>
);

const MastercardLogo: React.FC<{ className?: string }> = ({ className = 'h-6 w-auto' }) => (
  <svg viewBox="0 0 54 34" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Mastercard">
    <circle cx="18" cy="17" r="14" fill="#EB001B" />
    <circle cx="36" cy="17" r="14" fill="#F79E1B" />
    <path d="M27 6.4a13.9 13.9 0 0 1 0 21.2 13.9 13.9 0 0 1 0-21.2Z" fill="#FF5F00" />
  </svg>
);

const VisaLogo: React.FC<{ className?: string }> = ({ className = 'h-6 w-auto' }) => (
  <svg viewBox="0 7 24 10" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="VISA">
    <path
      d="M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z"
      className="fill-[#1A1F71] dark:fill-white"
    />
  </svg>
);

const WingLogo: React.FC<{ className?: string }> = ({ className = 'h-5 w-auto' }) => (
  <svg viewBox="0 0 92 30" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Wing">
    <rect width="92" height="30" rx="6" fill="#F4FBF0" />
    <circle cx="15" cy="15" r="10" fill="#8DC63F" />
    <path d="M11 18c0-3.5 2.5-6.5 7-7.5-2.5 2.5-3 4.5-2.5 6.5-1.5 0.5-3 1.5-4.5 1z" fill="#FFFFFF" />
    <text x="32" y="20.5" fill="#0C2340" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="16" letterSpacing="-0.3">Wing</text>
  </svg>
);

const WingBankLogo: React.FC<{ className?: string }> = ({ className = 'h-5 w-auto' }) => (
  <svg viewBox="0 0 116 30" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Wing Bank">
    <rect width="116" height="30" rx="6" fill="#F4FBF0" />
    <circle cx="15" cy="15" r="10" fill="#8DC63F" />
    <path d="M11 18c0-3.5 2.5-6.5 7-7.5-2.5 2.5-3 4.5-2.5 6.5-1.5 0.5-3 1.5-4.5 1z" fill="#FFFFFF" />
    <text x="31" y="20.5" fill="#0C2340" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="14" letterSpacing="-0.3">Wing</text>
    <text x="70" y="20.5" fill="#8DC63F" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="13">Bank</text>
  </svg>
);

interface CheckoutPageProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({ onShowToast }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { cart, subtotal, clearCart } = useCart();
  const { user, openAuthModal } = useAuth();

  // STEP 1 — SHIPPING INFORMATION
  const [fullName, setFullName] = useState(user?.name || 'Jane Doe');
  const [phone, setPhone] = useState('+855 76 223 5113');
  const [country, setCountry] = useState('Cambodia');
  const [provinceCity, setProvinceCity] = useState('Phnom Penh');
  const [district, setDistrict] = useState('Chamkarmon');
  const [street, setStreet] = useState('100 Norodom Boulevard');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // STEP 2 — TRADITIONAL PAYMENT METHOD
  // Options: 'aba_payway' | 'khqr' | 'mastercard' | 'visa' | 'wing' | 'wing_bank'
  const [traditionalMethod, setTraditionalMethod] = useState<'aba_payway' | 'khqr' | 'mastercard' | 'visa' | 'wing' | 'wing_bank'>('visa');
  const [cardNumber, setCardNumber] = useState('•••• •••• •••• 4242');
  const [cardExp, setCardExp] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('123');

  // STEP 3 — CRYPTO CHECKOUT MODAL
  const [isCryptoModalOpen, setIsCryptoModalOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync user details if user signs in during checkout
  useEffect(() => {
    if (user) {
      if (user.name) setFullName(user.name);
    }
  }, [user]);

  // Sandbox Simulation Controls
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
          className="px-6 py-2.5 rounded-xl bg-[#ff6a00] text-white font-bold text-xs shadow-md"
        >
          Browse Products
        </Link>
      </div>
    );
  }

  // Validate Step 1 Shipping Information
  const validateShippingFields = (): boolean => {
    if (!fullName.trim()) {
      onShowToast('Please enter Recipient Full Name', 'error');
      return false;
    }
    if (!phone.trim()) {
      onShowToast('Please enter Recipient Phone Number', 'error');
      return false;
    }
    if (!country.trim()) {
      onShowToast('Please enter Shipping Country', 'error');
      return false;
    }
    if (!provinceCity.trim()) {
      onShowToast('Please enter Province or City', 'error');
      return false;
    }
    if (!district.trim()) {
      onShowToast('Please enter District', 'error');
      return false;
    }
    if (!street.trim()) {
      onShowToast('Please enter Street Address', 'error');
      return false;
    }
    return true;
  };

  // Helper to create an order in Firestore
  const buildAndCreateOrder = async (payMethod: string): Promise<Order> => {
    if (!user) {
      onShowToast('Please sign in to complete your checkout securely.', 'info');
      openAuthModal('login');
      throw new Error('Authentication required');
    }

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
        phone,
        country,
        provinceCity,
        district,
        street,
        city: provinceCity,
        state: provinceCity,
        postalCode: '12000',
        deliveryNotes,
      },
      paymentMethod: payMethod,
      trackingNumber: '',
      carrier: 'FedEx Priority Global',
      estimatedDelivery: '3 - 5 business days',
    };

    return await orderRepository.create(orderData);
  };

  // Traditional Payment Submission Handler
  const handlePlaceTraditionalOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateShippingFields()) return;

    setIsSubmitting(true);
    setPaymentError(null);

    try {
      // Map UI choice to authoritative payment method
      let resolvedMethod: PaymentMethodType = 'card';
      let brandName = 'VISA';

      if (traditionalMethod === 'aba_payway') {
        resolvedMethod = 'aba_payway';
        brandName = 'ABA PAY';
      } else if (traditionalMethod === 'khqr') {
        resolvedMethod = 'khqr';
        brandName = 'Bakong KHQR';
      } else if (traditionalMethod === 'wing' || traditionalMethod === 'wing_bank') {
        resolvedMethod = 'wing';
        brandName = traditionalMethod === 'wing_bank' ? 'Wing Bank' : 'Wing Money';
      } else if (traditionalMethod === 'mastercard') {
        resolvedMethod = 'card';
        brandName = 'Mastercard';
      } else {
        resolvedMethod = 'card';
        brandName = 'VISA';
      }

      // 1. Create Order
      const createdOrder = await buildAndCreateOrder(resolvedMethod);

      // 2. Initialize Authoritative Payment Intent
      const idempotencyKey = `idemp_pay_${createdOrder.id}_${Date.now()}`;
      const intent = await PaymentClient.createIntent({
        orderId: createdOrder.id,
        methodType: resolvedMethod,
        idempotencyKey,
      });

      // 3. Confirm / Process Sandbox Payment
      const confirmResult = await PaymentClient.confirmPayment({
        intentId: intent.id,
        simulationToken,
        safePaymentData: {
          brand: brandName,
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
      if (err.message !== 'Authentication required') {
        setPaymentError({
          code: 'CHECKOUT_ERROR',
          message: err?.message || 'Failed to complete order. Please try again.',
          retryable: true,
        });
        onShowToast(err?.message || 'Failed to place order. Please try again.', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open dedicated crypto payment interface
  const handleOpenCryptoCheckout = () => {
    if (!user) {
      onShowToast('Please sign in to proceed with cryptocurrency checkout.', 'info');
      openAuthModal('login');
      return;
    }
    if (!validateShippingFields()) {
      return;
    }
    setIsCryptoModalOpen(true);
  };

  // Callback passed to CryptoCheckoutModal to create the authoritative order
  const handleInitiateCryptoOrder = async (): Promise<string> => {
    const createdOrder = await buildAndCreateOrder('crypto');
    return createdOrder.id;
  };

  // 3DS Challenge Verification
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
            This checkout uses a strictly isolated, server-authoritative payment state machine. Both traditional Cambodian gateways and modern crypto networks operate in deterministic test sandbox mode.
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

      {/* Main Checkout Grid */}
      <form onSubmit={handlePlaceTraditionalOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: 3 Structured Sections */}
        <div className="lg:col-span-8 space-y-6">
          {/* ========================================================= */}
          {/* STEP 1 — SHIPPING INFORMATION                             */}
          {/* ========================================================= */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Truck className="w-5 h-5 text-[#ff6a00]" />
                <span className="uppercase tracking-wider">STEP 1 — SHIPPING INFORMATION</span>
              </h2>
              <span className="text-[11px] font-bold text-slate-400">All fields validated</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Full Name */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sokha Meng"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              {/* Phone Number */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Phone Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="+855 76 223 5113"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              {/* Country */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Country <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Cambodia"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              {/* Province / City */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Province / City <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Phnom Penh / Siem Reap"
                  value={provinceCity}
                  onChange={(e) => setProvinceCity(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              {/* District */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  District <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chamkarmon / Daun Penh"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              {/* Street Address */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Street Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="House/Unit #, Street name"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              {/* Delivery Notes (Optional) */}
              <div className="space-y-1 sm:col-span-2">
                <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Delivery Notes</span>
                  <span className="text-[10px] text-slate-400 font-normal">Optional</span>
                </label>
                <input
                  type="text"
                  placeholder="Special instructions for courier (e.g. Leave with security, call upon arrival)"
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* STEP 2 — PAYMENT METHOD (Traditional Cambodian Options)   */}
          {/* ========================================================= */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#ff6a00]" />
                <span className="uppercase tracking-wider">STEP 2 — PAYMENT METHOD</span>
              </h2>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Traditional Sandbox
              </span>
            </div>

            {/* Grid of the 6 Traditional Methods */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* 1. ABA PAY */}
              <button
                type="button"
                onClick={() => setTraditionalMethod('aba_payway')}
                className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer h-20 ${
                  traditionalMethod === 'aba_payway'
                    ? 'border-[#ff6a00] bg-orange-50/60 dark:bg-orange-950/30 ring-2 ring-[#ff6a00]/30 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-850'
                }`}
              >
                <AbaPayLogo className="h-6 w-auto" />
                <span className="text-[10px] text-slate-500 font-medium">ABA PAY</span>
              </button>

              {/* 2. KHQR */}
              <button
                type="button"
                onClick={() => setTraditionalMethod('khqr')}
                className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer h-20 ${
                  traditionalMethod === 'khqr'
                    ? 'border-[#ff6a00] bg-orange-50/60 dark:bg-orange-950/30 ring-2 ring-[#ff6a00]/30 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-850'
                }`}
              >
                <KhqrLogo className="h-6 w-auto" />
                <span className="text-[10px] text-slate-500 font-medium">Bakong KHQR</span>
              </button>

              {/* 3. Mastercard */}
              <button
                type="button"
                onClick={() => setTraditionalMethod('mastercard')}
                className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer h-20 ${
                  traditionalMethod === 'mastercard'
                    ? 'border-[#ff6a00] bg-orange-50/60 dark:bg-orange-950/30 ring-2 ring-[#ff6a00]/30 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-850'
                }`}
              >
                <MastercardLogo className="h-7 w-auto" />
                <span className="text-[10px] text-slate-500 font-medium">Mastercard</span>
              </button>

              {/* 4. VISA */}
              <button
                type="button"
                onClick={() => setTraditionalMethod('visa')}
                className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer h-20 ${
                  traditionalMethod === 'visa'
                    ? 'border-[#ff6a00] bg-orange-50/60 dark:bg-orange-950/30 ring-2 ring-[#ff6a00]/30 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-850'
                }`}
              >
                <div className="h-6 flex items-center justify-center">
                  <VisaLogo className="h-4 w-auto" />
                </div>
                <span className="text-[10px] text-slate-500 font-medium">VISA Card</span>
              </button>

              {/* 5. Wing */}
              <button
                type="button"
                onClick={() => setTraditionalMethod('wing')}
                className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer h-20 ${
                  traditionalMethod === 'wing'
                    ? 'border-[#ff6a00] bg-orange-50/60 dark:bg-orange-950/30 ring-2 ring-[#ff6a00]/30 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-850'
                }`}
              >
                <WingLogo className="h-6 w-auto" />
                <span className="text-[10px] text-slate-500 font-medium">Wing Money</span>
              </button>

              {/* 6. Wing Bank */}
              <button
                type="button"
                onClick={() => setTraditionalMethod('wing_bank')}
                className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer h-20 ${
                  traditionalMethod === 'wing_bank'
                    ? 'border-[#ff6a00] bg-orange-50/60 dark:bg-orange-950/30 ring-2 ring-[#ff6a00]/30 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-850'
                }`}
              >
                <WingBankLogo className="h-6 w-auto" />
                <span className="text-[10px] text-slate-500 font-medium">Wing Bank</span>
              </button>
            </div>

            {/* Sandbox Simulation Scenario Selector */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Deterministic Traditional Gateway Scenario:</span>
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

            {/* Card Inputs if card method is selected */}
            {(traditionalMethod === 'visa' || traditionalMethod === 'mastercard') && (
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

          {/* ========================================================= */}
          {/* STEP 3 — CRYPTO CURRENCY (Separate Dedicated Card/Button) */}
          {/* ========================================================= */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 border border-slate-700 text-white shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#ff6a00]/20 border border-[#ff6a00]/40 flex items-center justify-center text-[#ff6a00]">
                  <Zap className="w-4 h-4" />
                </div>
                <h2 className="text-base font-extrabold uppercase tracking-wider text-white">
                  STEP 3 — CRYPTO CURRENCY
                </h2>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Direct On-Chain Settlement
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
              <div className="sm:col-span-8 space-y-2">
                <div className="text-sm font-bold text-slate-200">
                  Prefer decentralized payment without bank intermediaries?
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Pay securely with <strong>USDT (BEP-20 / TRC-20)</strong>, <strong>USDC (Solana)</strong>, or <strong>BNB (BSC)</strong>. Enjoy real-time blockchain confirmation, guaranteed exchange rates, and zero card processing surcharges.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                    USDT • BEP-20
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                    USDT • TRC-20
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                    USDC • Solana
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                    BNB • BSC
                  </span>
                </div>
              </div>

              <div className="sm:col-span-4 flex flex-col justify-center sm:items-end">
                <button
                  type="button"
                  onClick={handleOpenCryptoCheckout}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-black text-sm shadow-lg shadow-[#ff6a00]/30 transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Zap className="w-4 h-4 fill-white" />
                  <span>Pay with Crypto</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-[10px] text-slate-400 mt-1.5 text-center sm:text-right">
                  Opens dedicated crypto interface
                </span>
              </div>
            </div>
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

            {/* Authorize & Pay Traditional Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-2xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-extrabold text-sm shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Processing Payment...'
                  : `Authorize with ${
                      traditionalMethod === 'aba_payway'
                        ? 'ABA PAY'
                        : traditionalMethod === 'khqr'
                        ? 'KHQR'
                        : traditionalMethod === 'mastercard'
                        ? 'Mastercard'
                        : traditionalMethod === 'wing'
                        ? 'Wing'
                        : traditionalMethod === 'wing_bank'
                        ? 'Wing Bank'
                        : 'VISA'
                    } • $${total.toFixed(2)}`}
              </span>
            </button>

            {/* Alternative Crypto Prompt */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={handleOpenCryptoCheckout}
                className="text-xs font-bold text-slate-500 hover:text-[#ff6a00] transition-colors flex items-center justify-center gap-1 mx-auto cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-[#ff6a00]" />
                <span>Or pay using USDT, USDC, or BNB in Step 3</span>
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Dedicated Cryptocurrency Checkout Modal */}
      <CryptoCheckoutModal
        isOpen={isCryptoModalOpen}
        onClose={() => setIsCryptoModalOpen(false)}
        orderTotalUsd={total}
        onOrderSuccess={(orderId) => {
          clearCart();
          setIsCryptoModalOpen(false);
          navigate(`/orders/${orderId}`);
        }}
        onShowToast={onShowToast}
        onInitiateOrder={handleInitiateCryptoOrder}
      />
    </div>
  );
};

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { useCart } from '../context/CartContext';
import {
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ShieldCheck,
  Truck,
  Tag,
  CheckCircle,
  PackageX,
  CloudOff,
} from 'lucide-react';

interface CartPageProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const CartPage: React.FC<CartPageProps> = ({ onShowToast }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { cart, updateQuantity, removeFromCart, clearCart, subtotal, cartCount, syncStatus } = useCart();

  const [promoCode, setPromoCode] = useState('');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [appliedCode, setAppliedCode] = useState<string | null>(null);

  const shipping = subtotal > 50 || cart.length === 0 ? 0 : 9.99;
  const discountAmount = (subtotal * discountPercent) / 100;
  const total = Math.max(0, subtotal - discountAmount + shipping);

  const handleApplyPromo = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = promoCode.trim().toUpperCase();
    if (clean === 'APAI10' || clean === 'WELCOME10') {
      setDiscountPercent(10);
      setAppliedCode(clean);
      onShowToast(`Promo code ${clean} applied: 10% discount!`, 'success');
    } else if (clean === 'VIP20') {
      setDiscountPercent(20);
      setAppliedCode(clean);
      onShowToast(`VIP promo code applied: 20% discount!`, 'success');
    } else {
      onShowToast('Invalid promo code. Try "APAI10"', 'error');
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            {t('cart.title', 'Shopping Cart')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {cartCount} {cartCount === 1 ? 'item' : 'items'} ready for checkout
          </p>
        </div>

        {cart.length > 0 && (
          <button
            type="button"
            onClick={clearCart}
            className="text-xs text-rose-500 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('cart.clear', 'Clear Cart')}</span>
          </button>
        )}
      </div>

      {syncStatus === 'offline_fallback' && (
        <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
          <CloudOff className="w-4 h-4 text-amber-500 shrink-0" />
          <div>
            <span className="font-bold">Offline Storage Active:</span> Your cart is safely stored on this device. Order creation and checkout continue seamlessly.
          </div>
        </div>
      )}

      {cart.length === 0 ? (
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4">
          <div className="w-20 h-20 rounded-3xl bg-orange-50 dark:bg-orange-950/40 text-[#ff6a00] flex items-center justify-center">
            <ShoppingBag className="w-10 h-10" />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              {t('cart.empty', 'Your shopping cart is empty')}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-sm">
              Discover amazing deals, popular categories, and verified global sellers across Apaibay.
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold text-sm transition-colors shadow-md shadow-[#ff6a00]/20"
          >
            <span>{t('cart.continueShopping', 'Start Shopping')}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Cart Item List */}
          <div className="lg:col-span-8 space-y-4">
            {/* Free shipping banner */}
            <div className="p-3.5 rounded-2xl bg-orange-50 dark:bg-orange-950/40 border border-[#ff6a00]/30 flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-2 font-semibold">
                <Truck className="w-4 h-4 text-[#ff6a00]" />
                {subtotal >= 50 ? (
                  <span>You've unlocked <strong>FREE Standard Shipping</strong>!</span>
                ) : (
                  <span>Add <strong>${(50 - subtotal).toFixed(2)}</strong> more to unlock FREE shipping</span>
                )}
              </div>
              <div className="hidden sm:block text-[11px] font-bold text-[#ff6a00]">
                {subtotal >= 50 ? '100% Qualified' : `${Math.round((subtotal / 50) * 100)}%`}
              </div>
            </div>

            {/* List of items */}
            <div className="space-y-3">
              {cart.map((item) => (
                <div
                  key={`${item.product.id}-${item.selectedColor || ''}-${item.selectedSize || ''}`}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={item.product?.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=150&q=80'}
                      alt={item.product?.name || 'Item'}
                      className="w-20 h-20 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
                    />
                    <div className="space-y-1">
                      <Link
                        to={`/product/${item.product.slug}`}
                        className="text-sm font-bold text-slate-900 dark:text-white hover:text-[#ff6a00] transition-colors line-clamp-1"
                      >
                        {item.product.name}
                      </Link>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>Brand: <strong className="text-slate-700 dark:text-slate-300">{item.product.brand}</strong></span>
                        {item.selectedColor && (
                          <span>• Color: <strong>{item.selectedColor}</strong></span>
                        )}
                        {item.selectedSize && (
                          <span>• Size: <strong>{item.selectedSize}</strong></span>
                        )}
                      </div>
                      <div className="text-sm font-extrabold text-[#ff6a00]">
                        ${item.product.price.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Quantity Stepper & Remove */}
                  <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4 self-end sm:self-center">
                    <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-800 overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(
                            item.product.id,
                            item.quantity - 1,
                            item.selectedColor,
                            item.selectedSize
                          )
                        }
                        className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-3 text-xs font-extrabold text-slate-900 dark:text-white">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(
                            item.product.id,
                            item.quantity + 1,
                            item.selectedColor,
                            item.selectedSize
                          )
                        }
                        className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-right sm:min-w-20">
                      <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                        ${(item.product.price * item.quantity).toFixed(2)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        removeFromCart(
                          item.product.id,
                          item.selectedColor,
                          item.selectedSize
                        )
                      }
                      className="p-2 text-slate-400 hover:text-rose-500 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Summary Card */}
          <div className="lg:col-span-4 space-y-4">
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                {t('cart.orderSummary', 'Order Summary')}
              </h2>

              {/* Promo Code Input */}
              <form onSubmit={handleApplyPromo} className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    placeholder="Coupon code (APAI10)"
                    className="w-full text-xs py-2.5 pl-8 pr-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-[#ff6a00]"
                  />
                  <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Apply
                </button>
              </form>

              {appliedCode && (
                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Coupon "{appliedCode}" applied (-{discountPercent}%)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedCode(null);
                      setDiscountPercent(0);
                    }}
                    className="underline text-[11px] cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              )}

              {/* Line item amounts */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Subtotal</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    ${subtotal.toFixed(2)}
                  </span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Discount</span>
                    <span className="font-bold">-${discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Estimated Shipping</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {shipping === 0 ? 'FREE' : `$${shipping.toFixed(2)}`}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Estimated Sales Tax</span>
                  <span className="font-bold text-slate-900 dark:text-white">$0.00</span>
                </div>
              </div>

              {/* Total */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-baseline">
                <span className="text-sm font-bold text-slate-900 dark:text-white">Total</span>
                <span className="text-2xl font-extrabold text-[#ff6a00]">
                  ${total.toFixed(2)}
                </span>
              </div>

              {/* Checkout Button */}
              <button
                type="button"
                onClick={() => navigate('/checkout')}
                className="w-full py-4 rounded-2xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-extrabold text-sm shadow-md shadow-[#ff6a00]/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <span>{t('cart.checkout', 'Proceed to Checkout')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="flex items-center justify-center gap-2 text-slate-400 text-xs pt-1">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>256-bit SSL encrypted checkout</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

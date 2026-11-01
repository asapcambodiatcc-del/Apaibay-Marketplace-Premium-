import React, { useState } from 'react';
import {
  X,
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  Truck,
  Tag,
  Check,
  CloudOff,
} from 'lucide-react';
import { CartItem } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { useCart } from '../context/CartContext';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number, selectedColor?: string, selectedSize?: string) => void;
  onRemoveItem: (productId: string, selectedColor?: string, selectedSize?: string) => void;
  onCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
}) => {
  const { t } = useLanguage();
  const { syncStatus } = useCart();
  const [promoInput, setPromoInput] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoError, setPromoError] = useState('');

  if (!isOpen) return null;

  const subtotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  const isFreeShipping = subtotal >= 50 || cart.length === 0;
  const shippingCost = isFreeShipping ? 0 : 5.99;
  const total = Math.max(0, subtotal - promoDiscount + (cart.length > 0 ? shippingCost : 0));

  const handleApplyPromo = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = promoInput.trim().toUpperCase();
    if (clean === 'APAIBAY10' || clean === 'SAVE10') {
      const discount = subtotal * 0.1;
      setPromoDiscount(discount);
      setPromoApplied(true);
      setPromoError('');
    } else if (clean === 'GLOBAL20') {
      const discount = 20;
      setPromoDiscount(discount);
      setPromoApplied(true);
      setPromoError('');
    } else {
      setPromoError('Invalid coupon. Try APAIBAY10 or GLOBAL20');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col justify-between">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-[#ff6a00]" />
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                {t('cart.title', 'Shopping Cart')} ({cart.reduce((a, b) => a + b.quantity, 0)})
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Free shipping progress bar */}
          <div className="px-4 sm:px-5 py-2.5 bg-orange-50 dark:bg-orange-950/40 border-b border-orange-100 dark:border-orange-900/30">
            {subtotal >= 50 ? (
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                <Truck className="w-4 h-4" />
                <span>You unlocked FREE Express Global Shipping!</span>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  <span>Add ${(50 - subtotal).toFixed(2)} more for Free Shipping</span>
                  <span className="font-bold text-[#ff6a00]">{Math.round((subtotal / 50) * 100)}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-[#ff6a00] h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (subtotal / 50) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {syncStatus === 'offline_fallback' && (
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                <CloudOff className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Saved locally on this device. Cloud sync paused in offline mode.</span>
              </div>
            )}
            {cart.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-base text-slate-800 dark:text-white">
                  {t('cart.emptyTitle', 'Your cart is empty')}
                </h3>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  {t('cart.emptyDesc', 'Explore trending products, flash sales, and exclusive brand deals to fill your cart.')}
                </p>
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 bg-[#ff6a00] text-white text-xs font-bold rounded-xl hover:bg-[#e65f00] shadow-sm cursor-pointer"
                >
                  {t('cart.startShopping', 'Start Shopping')}
                </button>
              </div>
            ) : (
              cart.map((item) => (
                <div key={`${item.product.id}-${item.selectedColor || ''}-${item.selectedSize || ''}`} className="pt-3 first:pt-0 flex gap-3">
                  <img
                    src={item.product?.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=150&q=80'}
                    alt={item.product?.name || 'Item'}
                    className="w-20 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-800 shrink-0 bg-slate-100"
                  />
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1 leading-snug">
                          {item.product.name}
                        </h4>
                        <button
                          onClick={() => onRemoveItem(item.product.id, item.selectedColor, item.selectedSize)}
                          className="text-slate-400 hover:text-red-500 transition-colors p-1 cursor-pointer"
                          title={t('common.delete', 'Remove')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {(item.selectedColor || item.selectedSize) && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {item.selectedColor && `Color: ${item.selectedColor}`}
                          {item.selectedColor && item.selectedSize && ' • '}
                          {item.selectedSize && `Size: ${item.selectedSize}`}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs sm:text-sm font-extrabold text-[#ff6a00]">
                        ${(item.product.price * item.quantity).toFixed(2)}
                      </span>
                      <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        <button
                          onClick={() =>
                            onUpdateQuantity(item.product.id, Math.max(1, item.quantity - 1), item.selectedColor, item.selectedSize)
                          }
                          className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2.5 py-0.5 text-xs font-bold text-slate-800 dark:text-white">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1, item.selectedColor, item.selectedSize)}
                          className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer / Summary / Checkout */}
          {cart.length > 0 && (
            <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-3">
              {/* Promo code form */}
              <form onSubmit={handleApplyPromo} className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    placeholder={t('cart.promoCode', 'Coupon code (APAIBAY10)')}
                    className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white uppercase font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-slate-900 dark:bg-slate-800 text-white hover:bg-[#ff6a00] text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  {t('cart.apply', 'Apply')}
                </button>
              </form>
              {promoApplied && (
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  {t('cart.promoSuccess', 'Coupon applied successfully!')}
                </div>
              )}
              {promoError && (
                <div className="text-[11px] text-red-500 font-medium">
                  {promoError}
                </div>
              )}

              {/* Cost calculations */}
              <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex justify-between">
                  <span>{t('cart.subtotal', 'Subtotal')}</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    ${subtotal.toFixed(2)}
                  </span>
                </div>
                {promoDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                    <span>{t('cart.discount', 'Coupon Discount')}</span>
                    <span>-${promoDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>{t('cart.shipping', 'Estimated Shipping')}</span>
                  <span>{isFreeShipping ? t('cart.free', 'FREE') : `$${shippingCost.toFixed(2)}`}</span>
                </div>
                <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
                  <span>{t('cart.total', 'Total')}</span>
                  <span className="text-[#ff6a00]">${total.toFixed(2)}</span>
                </div>
              </div>

              {/* Checkout Button */}
              <button
                onClick={onCheckout}
                className="w-full py-3 bg-[#ff6a00] hover:bg-[#e65f00] text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{t('cart.checkout', 'Proceed to Checkout')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>{t('cart.secureCheckout', '256-bit SSL encrypted checkout')}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


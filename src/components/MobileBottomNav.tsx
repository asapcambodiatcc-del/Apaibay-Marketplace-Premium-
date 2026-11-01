import React from 'react';
import { Home, Grid, Heart, Package, ShoppingBag } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface MobileBottomNavProps {
  cartCount: number;
  wishlistCount: number;
  onGoHome: () => void;
  onOpenCategories: () => void;
  onOpenWishlist: () => void;
  onOpenOrders: () => void;
  onOpenCart: () => void;
  activeView?: string;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  cartCount,
  wishlistCount,
  onGoHome,
  onOpenCategories,
  onOpenWishlist,
  onOpenOrders,
  onOpenCart,
  activeView = 'home',
}) => {
  const { t } = useLanguage();

  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-3 py-2 shadow-lg">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {/* Home */}
        <button
          onClick={onGoHome}
          className={`flex flex-col items-center gap-1 transition-colors cursor-pointer ${
            activeView === 'home' ? 'text-[#ff6a00]' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-bold">{t('mobileNav.home', 'Home')}</span>
        </button>

        {/* Categories */}
        <button
          onClick={onOpenCategories}
          className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
        >
          <Grid className="w-5 h-5" />
          <span className="text-[10px] font-bold">{t('mobileNav.categories', 'Categories')}</span>
        </button>

        {/* Wishlist */}
        <button
          onClick={onOpenWishlist}
          className="relative flex flex-col items-center gap-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
        >
          <Heart className="w-5 h-5" />
          {wishlistCount > 0 && (
            <span className="absolute -top-1 right-2 bg-[#ff6a00] text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center">
              {wishlistCount}
            </span>
          )}
          <span className="text-[10px] font-bold">{t('mobileNav.wishlist', 'Wishlist')}</span>
        </button>

        {/* Orders */}
        <button
          onClick={onOpenOrders}
          className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
        >
          <Package className="w-5 h-5" />
          <span className="text-[10px] font-bold">{t('mobileNav.orders', 'Orders')}</span>
        </button>

        {/* Cart */}
        <button
          onClick={onOpenCart}
          className="relative flex flex-col items-center gap-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
        >
          <div className="relative">
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-[#ff6a00] text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold">{t('mobileNav.cart', 'Cart')}</span>
        </button>
      </div>
    </div>
  );
};


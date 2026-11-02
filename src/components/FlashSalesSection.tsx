import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Heart, ShoppingBag, Star, ChevronLeft, ChevronRight, Sparkles, Check, Zap } from 'lucide-react';
import { Product } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface FlashSalesSectionProps {
  products: Product[];
  wishlist: string[];
  onToggleWishlist: (productId: string) => void;
  onAddToCart: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
}

export const FlashSalesSection: React.FC<FlashSalesSectionProps> = ({
  products,
  wishlist,
  onToggleWishlist,
  onAddToCart,
  onSelectProduct,
}) => {
  const { t, tCategory } = useLanguage();
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Real campaign countdown: End of current UTC day
  const [timeLeft, setTimeLeft] = useState(() => {
    const now = new Date();
    const endOfDay = new Date();
    endOfDay.setUTCHours(23, 59, 59, 999);
    const diff = Math.max(0, Math.floor((endOfDay.getTime() - now.getTime()) / 1000));
    return {
      hours: Math.floor(diff / 3600),
      minutes: Math.floor((diff % 3600) / 60),
      seconds: diff % 60,
      totalSeconds: diff,
    };
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.totalSeconds <= 1) {
          // Campaign ended - advance to next window
          return { hours: 23, minutes: 59, seconds: 59, totalSeconds: 86399 };
        }
        const nextTotal = prev.totalSeconds - 1;
        return {
          hours: Math.floor(nextTotal / 3600),
          minutes: Math.floor((nextTotal % 3600) / 60),
          seconds: nextTotal % 60,
          totalSeconds: nextTotal,
        };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter genuine flash products with real discounts
  const flashProducts = useMemo(() => {
    return products
      .filter((p) => {
        const hasDiscount = p.originalPrice > p.price || p.discountPercentage > 0;
        return (p.isFlashSale || p.discountPercentage >= 30) && hasDiscount;
      })
      .slice(0, 12);
  }, [products]);

  if (flashProducts.length === 0) {
    return null; // Automatically hide if no active flash sale items
  }

  const handleQuickAdd = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    onAddToCart(product);
    setAddedIds((prev) => ({ ...prev, [product.id]: true }));
    setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [product.id]: false }));
    }, 1500);
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === 'left' ? -320 : 320;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const formatDigits = (n: number) => n.toString().padStart(2, '0');

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xs">
      {/* Header with real countdown & controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 mb-5 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3 sm:gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#ff6a00] fill-[#ff6a00]" />
              {t('home.flashSales', 'Flash Sales')}
            </h2>
          </div>

          {/* Countdown block */}
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 px-3 py-1.5 rounded-xl">
            <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wide flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              {t('home.endsIn', 'Ends In:')}
            </span>
            <div className="flex items-center gap-1 font-mono font-black text-xs sm:text-sm">
              <span className="bg-red-600 text-white px-1.5 py-0.5 rounded shadow-xs">
                {formatDigits(timeLeft.hours)}
              </span>
              <span className="text-red-600 font-bold">:</span>
              <span className="bg-red-600 text-white px-1.5 py-0.5 rounded shadow-xs">
                {formatDigits(timeLeft.minutes)}
              </span>
              <span className="text-red-600 font-bold">:</span>
              <span className="bg-red-600 text-white px-1.5 py-0.5 rounded shadow-xs">
                {formatDigits(timeLeft.seconds)}
              </span>
            </div>
          </div>
        </div>

        {/* Right actions: View all + scroll buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (scrollContainerRef.current) scrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
            }}
            className="text-xs font-semibold text-[#ff6a00] hover:text-[#e65f00] cursor-pointer"
          >
            {t('common.viewAll', 'See all')}
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => scroll('left')}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Product Grid */}
      <div
        ref={scrollContainerRef}
        className="flex gap-4 overflow-x-auto pb-2 scroll-smooth no-scrollbar"
      >
        {flashProducts.map((product) => {
          const isWishlisted = wishlist.includes(product.id);
          const isJustAdded = !!addedIds[product.id];

          // Compute genuine discount percentage based on price math
          const computedDiscount = product.originalPrice > product.price
            ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
            : product.discountPercentage || 0;

          return (
            <div
              key={product.id}
              onClick={() => onSelectProduct(product)}
              className="w-56 sm:w-60 shrink-0 bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-3 flex flex-col justify-between group hover:shadow-md hover:border-[#ff6a00]/50 transition-all cursor-pointer relative"
            >
              {/* Image & Badges */}
              <div className="relative h-44 rounded-xl overflow-hidden bg-white dark:bg-slate-900 mb-3">
                <img
                  src={product.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=400&q=80'}
                  alt={product.name || 'Product'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />

                {/* Real Discount Badge */}
                {computedDiscount > 0 && (
                  <div className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-xs">
                    -{computedDiscount}%
                  </div>
                )}

                {/* Wishlist Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleWishlist(product.id);
                  }}
                  className={`absolute top-2 right-2 p-1.5 rounded-full backdrop-blur-md transition-all cursor-pointer ${
                    isWishlisted
                      ? 'bg-white text-red-600 shadow-md'
                      : 'bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:text-red-500 hover:bg-white'
                  }`}
                  aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                >
                  <Heart className={`w-3.5 h-3.5 ${isWishlisted ? 'fill-red-600 text-red-600' : ''}`} />
                </button>

                {/* Seller brand tag */}
                <span className="absolute bottom-2 left-2 text-[9px] font-bold text-white bg-black/60 backdrop-blur-xs px-2 py-0.5 rounded-md truncate max-w-[140px]">
                  {product.seller?.name || product.brand}
                </span>
              </div>

              {/* Product Info */}
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block truncate">
                    {tCategory(product.category)}
                  </span>
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-2 mt-0.5 group-hover:text-[#ff6a00] transition-colors leading-snug">
                    {product.name}
                  </h3>

                  {/* Rating */}
                  <div className="flex items-center gap-1 mt-1.5 text-xs">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                      {product.rating}
                    </span>
                    <span className="text-slate-400 text-[10px]">
                      ({product.reviewCount})
                    </span>
                  </div>
                </div>

                {/* Real Inventory Status if known */}
                {product.stockCount !== undefined && product.stockCount > 0 && product.stockCount < 20 && (
                  <div className="mt-2 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    Only {product.stockCount} left in stock
                  </div>
                )}

                {/* Price & Add to cart button */}
                <div className="pt-2.5 mt-2 border-t border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-extrabold text-[#ff6a00]">
                      ${product.price.toFixed(2)}
                    </div>
                    {product.originalPrice > product.price && (
                      <div className="text-[10px] text-slate-400 line-through">
                        ${product.originalPrice.toFixed(2)}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={(e) => handleQuickAdd(e, product)}
                    className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-xs ${
                      isJustAdded
                        ? 'bg-emerald-600 text-white'
                        : 'bg-orange-50 dark:bg-orange-950/40 text-[#ff6a00] hover:bg-[#ff6a00] hover:text-white'
                    }`}
                    aria-label={t('product.addToCart', 'Add to Cart')}
                  >
                    {isJustAdded ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <ShoppingBag className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

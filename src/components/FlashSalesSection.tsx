import React, { useState, useEffect, useRef } from 'react';
import { Heart, ShoppingBag, Star, ChevronLeft, ChevronRight, Sparkles, Check } from 'lucide-react';
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
  const { t } = useLanguage();
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [timeLeft, setTimeLeft] = useState({
    hours: 3,
    minutes: 9,
    seconds: 55,
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 };
        if (prev.minutes > 0) return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        if (prev.hours > 0) return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        return { hours: 3, minutes: 0, seconds: 0 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  const flashProducts = products.filter((p) => p.isFlashSale || p.discountPercentage >= 40);

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs">
      {/* Header with countdown & controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3 sm:gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {t('home.flashSales', 'Flash Sales')}
            </h2>
          </div>

          {/* Countdown block matching mockup: Countdown 03 : 09 : 55 */}
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
              title="Scroll left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              title="Scroll right"
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

                {/* Discount Badge */}
                <div className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-xs">
                  -{product.discountPercentage}%
                </div>

                {/* Wishlist Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleWishlist(product.id);
                  }}
                  className={`absolute top-2 right-2 p-1.5 rounded-full backdrop-blur-md transition-all cursor-pointer ${
                    isWishlisted
                      ? 'bg-red-50 text-red-600 shadow-sm'
                      : 'bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:text-red-500 hover:bg-white'
                  }`}
                  title={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                >
                  <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-red-600 text-red-600' : ''}`} />
                </button>

                {/* Seller Mini Tag */}
                <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-xs text-[9px] font-medium text-white px-1.5 py-0.5 rounded-md truncate max-w-[140px]">
                  {product.seller.name}
                </div>
              </div>

              {/* Product Info */}
              <div className="space-y-1.5 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-semibold text-xs text-slate-900 dark:text-white line-clamp-2 group-hover:text-[#ff6a00] transition-colors leading-snug">
                    {product.name}
                  </h3>

                  {/* Rating */}
                  <div className="flex items-center gap-1.5 mt-1 text-[11px]">
                    <div className="flex items-center text-amber-400">
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                      <span className="font-bold ml-1 text-slate-800 dark:text-slate-200">
                        {product.rating}
                      </span>
                    </div>
                    <span className="text-slate-400">({product.reviewCount})</span>
                  </div>
                </div>

                {/* Price & Add to Cart button */}
                <div className="pt-2 mt-auto">
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-base font-extrabold text-[#ff6a00]">
                      ${product.price.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-400 line-through">
                      ${product.originalPrice.toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={(e) => handleQuickAdd(e, product)}
                    className={`w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs ${
                      isJustAdded
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#ff6a00] hover:bg-[#e65f00] text-white'
                    }`}
                  >
                    {isJustAdded ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>{t('product.added', 'Added!')}</span>
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>{t('product.addToCart', 'Add to Cart')}</span>
                      </>
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


import React, { useState, useMemo } from 'react';
import {
  Star,
  Heart,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Award,
  Clock,
  ThumbsUp,
  Compass,
  Check,
  RotateCcw,
} from 'lucide-react';
import { Product } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface ProductSectionsProps {
  products: Product[];
  wishlist: string[];
  onToggleWishlist: (productId: string) => void;
  onAddToCart: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
  selectedCategory: string | null;
}

type TabType =
  | 'recommended'
  | 'trending'
  | 'daily-discover'
  | 'best-sellers'
  | 'new-arrivals'
  | 'top-rated';

export const ProductSections: React.FC<ProductSectionsProps> = ({
  products,
  wishlist,
  onToggleWishlist,
  onAddToCart,
  onSelectProduct,
  selectedCategory,
}) => {
  const { t, tCategory } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>('recommended');
  const [addedMap, setAddedMap] = useState<Record<string, boolean>>({});

  const TABS = [
    { id: 'recommended' as TabType, label: t('tabs.recommended', 'AI Recommended'), icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'trending' as TabType, label: t('tabs.trending', 'Trending Products'), icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { id: 'daily-discover' as TabType, label: t('tabs.dailyDiscover', 'Daily Discover'), icon: <Compass className="w-3.5 h-3.5" /> },
    { id: 'best-sellers' as TabType, label: t('tabs.bestSellers', 'Best Sellers'), icon: <Award className="w-3.5 h-3.5" /> },
    { id: 'new-arrivals' as TabType, label: t('tabs.newArrivals', 'New Arrivals'), icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'top-rated' as TabType, label: t('tabs.topRated', 'Top Rated'), icon: <ThumbsUp className="w-3.5 h-3.5" /> },
  ];

  const handleAdd = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    onAddToCart(product);
    setAddedMap((prev) => ({ ...prev, [product.id]: true }));
    setTimeout(() => {
      setAddedMap((prev) => ({ ...prev, [product.id]: false }));
    }, 1500);
  };

  // Base products filtered by selected category if present
  const baseProducts = useMemo(() => {
    if (!selectedCategory) return products;
    return products.filter((p) => p.category === selectedCategory);
  }, [products, selectedCategory]);

  // Tab filtering using real engagement, rating, and date rotation
  const filtered = useMemo(() => {
    if (baseProducts.length === 0) return [];

    let result: Product[] = [];

    switch (activeTab) {
      case 'trending': {
        // Genuine engagement signals: isTrending flag or high reviewCount * rating
        result = [...baseProducts].sort((a, b) => {
          if (a.isTrending && !b.isTrending) return -1;
          if (!a.isTrending && b.isTrending) return 1;
          return (b.reviewCount * b.rating) - (a.reviewCount * a.rating);
        });
        break;
      }
      case 'daily-discover': {
        // Daily rotation using day of year seed to rotate catalog deterministically
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 0);
        const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
        const offset = dayOfYear % Math.max(1, baseProducts.length);
        result = [...baseProducts.slice(offset), ...baseProducts.slice(0, offset)];
        break;
      }
      case 'best-sellers': {
        result = baseProducts.filter((p) => p.isBestSeller || p.reviewCount >= 250);
        if (result.length === 0) {
          result = [...baseProducts].sort((a, b) => b.reviewCount - a.reviewCount);
        }
        break;
      }
      case 'new-arrivals': {
        result = baseProducts.filter((p) => p.isNewArrival);
        if (result.length === 0) {
          result = [...baseProducts].slice(-8).reverse();
        }
        break;
      }
      case 'top-rated': {
        result = [...baseProducts].sort((a, b) => b.rating - a.rating);
        break;
      }
      case 'recommended':
      default: {
        result = baseProducts.filter((p) => p.isRecommended || p.rating >= 4.7);
        if (result.length === 0) {
          result = baseProducts;
        }
        break;
      }
    }

    // Sensible fallback if filtering yielded zero
    return result.length > 0 ? result : baseProducts;
  }, [baseProducts, activeTab]);

  return (
    <section className="space-y-6">
      {/* Tab bar with responsive scroll */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar gap-2 pb-1">
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-bold transition-all rounded-t-xl cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'border-b-2 border-[#ff6a00] text-[#ff6a00] bg-orange-50/50 dark:bg-orange-950/20'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/60 dark:hover:bg-slate-800/60'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="hidden md:flex items-center text-xs text-slate-500 shrink-0 pr-2">
          <span>{filtered.length} {t('common.items', 'products')}</span>
        </div>
      </div>

      {/* Empty State fallback */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-8 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-[#ff6a00] flex items-center justify-center mx-auto">
            <RotateCcw className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {t('common.noProductsFound', 'No products available for this selection')}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {t('common.tryClearingFilters', 'Try choosing a different department or viewing all marketplace items.')}
          </p>
        </div>
      ) : (
        /* Product Card Grid (2 cols mobile, 3 sm, 4 lg, 5 xl) */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-4 lg:gap-5">
          {filtered.map((product) => {
            const isWishlisted = wishlist.includes(product.id);
            const isAdded = !!addedMap[product.id];

            // Genuine discount calculation
            const computedDiscount = product.originalPrice > product.price
              ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
              : product.discountPercentage || 0;

            return (
              <div
                key={product.id}
                onClick={() => onSelectProduct(product)}
                className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 sm:p-3.5 flex flex-col justify-between hover:shadow-xl hover:border-[#ff6a00]/60 transition-all duration-300 cursor-pointer relative"
              >
                {/* Product Visual Container */}
                <div className="relative h-36 xs:h-44 sm:h-52 w-full rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 mb-2 sm:mb-3">
                  <img
                    src={product.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=400&q=80'}
                    alt={product.name || 'Product'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />

                  {/* Badges */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    {computedDiscount > 0 && (
                      <span className="bg-red-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-xs">
                        -{computedDiscount}%
                      </span>
                    )}
                    {product.isBestSeller && (
                      <span className="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-xs">
                        {t('product.bestSeller', 'Best Seller')}
                      </span>
                    )}
                  </div>

                  {/* Wishlist Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleWishlist(product.id);
                    }}
                    className={`absolute top-2 right-2 p-2 rounded-full backdrop-blur-md transition-all cursor-pointer ${
                      isWishlisted
                        ? 'bg-white text-red-600 shadow-md'
                        : 'bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:text-red-500 hover:bg-white'
                    }`}
                    aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                  >
                    <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-red-600 text-red-600' : ''}`} />
                  </button>

                  {/* Seller / Brand watermark */}
                  <span className="absolute bottom-2 right-2 text-[10px] font-bold text-white/90 bg-black/50 backdrop-blur-xs px-2 py-0.5 rounded truncate max-w-[120px]">
                    {product.seller?.name || product.brand}
                  </span>
                </div>

                {/* Product Content Details */}
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mb-1 truncate">
                      {tCategory(product.category)}
                    </div>
                    <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 group-hover:text-[#ff6a00] transition-colors leading-snug">
                      {product.name}
                    </h3>

                    {/* Rating & Review */}
                    <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                      <div className="flex items-center text-amber-400">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                        <span className="font-bold ml-1 text-slate-800 dark:text-slate-200 text-xs">
                          {product.rating}
                        </span>
                      </div>
                      <span className="text-slate-400 text-[11px]">
                        ({product.reviewCount})
                      </span>
                    </div>
                  </div>

                  {/* Price & Action Row */}
                  <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                    <div>
                      <div className="text-sm sm:text-base font-extrabold text-[#ff6a00]">
                        ${product.price.toFixed(2)}
                      </div>
                      {product.originalPrice > product.price && (
                        <div className="text-[11px] text-slate-400 line-through">
                          ${product.originalPrice.toFixed(2)}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={(e) => handleAdd(e, product)}
                      className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-xs ${
                        isAdded
                          ? 'bg-emerald-600 text-white'
                          : 'bg-orange-50 dark:bg-orange-950/40 text-[#ff6a00] hover:bg-[#ff6a00] hover:text-white'
                      }`}
                      aria-label={t('product.addToCart', 'Add to Cart')}
                    >
                      {isAdded ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <ShoppingBag className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

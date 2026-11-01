import React, { useState } from 'react';
import {
  Star,
  Heart,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Award,
  Clock,
  ThumbsUp,
  Eye,
  Check,
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
  | 'best-sellers'
  | 'new-arrivals'
  | 'recently-viewed'
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
    { id: 'recommended' as TabType, label: t('home.recommended', 'AI Recommended For You'), icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'trending' as TabType, label: t('home.trending', 'Trending Products'), icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { id: 'best-sellers' as TabType, label: t('home.bestSellers', 'Best Sellers'), icon: <Award className="w-3.5 h-3.5" /> },
    { id: 'new-arrivals' as TabType, label: t('home.newArrivals', 'New Arrivals'), icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'recently-viewed' as TabType, label: t('home.recentlyViewed', 'Recently Viewed'), icon: <Eye className="w-3.5 h-3.5" /> },
    { id: 'top-rated' as TabType, label: t('home.topRated', 'Top Rated'), icon: <ThumbsUp className="w-3.5 h-3.5" /> },
  ];

  const handleAdd = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    onAddToCart(product);
    setAddedMap((prev) => ({ ...prev, [product.id]: true }));
    setTimeout(() => {
      setAddedMap((prev) => ({ ...prev, [product.id]: false }));
    }, 1500);
  };

  // Filter products according to active tab and selectedCategory if any
  let displayed = products;
  if (selectedCategory) {
    displayed = displayed.filter((p) => p.category === selectedCategory);
  }

  // Filter according to active tab
  let filtered = displayed;
  switch (activeTab) {
    case 'trending':
      filtered = displayed.filter((p) => p.isTrending);
      break;
    case 'best-sellers':
      filtered = displayed.filter((p) => p.isBestSeller || p.reviewCount > 300);
      break;
    case 'new-arrivals':
      filtered = displayed.filter((p) => p.isNewArrival || p.discountPercentage < 50);
      break;
    case 'top-rated':
      filtered = displayed.filter((p) => p.rating >= 4.8);
      break;
    case 'recently-viewed':
      filtered = displayed.slice(0, 6);
      break;
    case 'recommended':
    default:
      filtered = displayed.filter((p) => p.isRecommended || p.isFlashSale);
      break;
  }

  // Fallback if empty
  if (filtered.length === 0) {
    filtered = displayed;
  }

  return (
    <section className="space-y-6">
      {/* Tab bar matching screenshot navigation */}
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

      {/* Product Card Grid (2 cols mobile, 3 sm, 4 lg, 5 xl) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-4 lg:gap-5">
        {filtered.map((product) => {
          const isWishlisted = wishlist.includes(product.id);
          const isAdded = !!addedMap[product.id];

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
                  className="w-full h-full object-cover group-hover:scale-106 transition-transform duration-500"
                  loading="lazy"
                />

                {/* Badges */}
                <div className="absolute top-2 left-2 flex flex-col gap-1">
                  {product.discountPercentage > 0 && (
                    <span className="bg-red-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-xs">
                      -{product.discountPercentage}%
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
                  title={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                >
                  <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-red-600 text-red-600' : ''}`} />
                </button>

                {/* Brand watermark */}
                <span className="absolute bottom-2 right-2 text-[10px] font-bold text-white/80 bg-black/40 backdrop-blur-xs px-1.5 py-0.5 rounded">
                  {product.brand}
                </span>
              </div>

              {/* Product Content Details */}
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mb-1">
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
                    title={t('product.addToCart', 'Add to Cart')}
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
    </section>
  );
};


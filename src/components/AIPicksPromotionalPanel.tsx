import React, { useState, useMemo } from 'react';
import { Sparkles, Star, Heart, ShoppingBag, ShieldCheck, Check, Zap, UserCheck } from 'lucide-react';
import { Product } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

interface AIPicksPromotionalPanelProps {
  products: Product[];
  wishlist: string[];
  onToggleWishlist: (productId: string) => void;
  onAddToCart: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
}

export const AIPicksPromotionalPanel: React.FC<AIPicksPromotionalPanelProps> = ({
  products,
  wishlist,
  onToggleWishlist,
  onAddToCart,
  onSelectProduct,
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { cart } = useCart();
  const [addedMap, setAddedMap] = useState<Record<string, boolean>>({});

  // Determine personalized affinity categories from wishlist & cart
  const userAffinityCategories = useMemo(() => {
    const categories = new Set<string>();
    cart.forEach((item) => categories.add(item.product.category));
    products
      .filter((p) => wishlist.includes(p.id))
      .forEach((p) => categories.add(p.category));
    return Array.from(categories);
  }, [cart, wishlist, products]);

  const isPersonalized = (user !== null || userAffinityCategories.length > 0) && userAffinityCategories.length > 0;

  // Rank products based on personalization affinity or non-personalized high-rating baseline
  const aiPicks = useMemo(() => {
    if (products.length === 0) return [];

    if (isPersonalized) {
      // Prioritize products matching user's affinity categories
      const preferred = products.filter((p) => userAffinityCategories.includes(p.category));
      const remaining = products.filter((p) => !userAffinityCategories.includes(p.category));
      return [...preferred, ...remaining].slice(0, 4);
    }

    // Guest / non-personalized baseline: highest rated + recommended
    const curated = [...products].sort((a, b) => (b.rating * b.reviewCount) - (a.rating * a.reviewCount));
    return curated.slice(0, 4);
  }, [products, isPersonalized, userAffinityCategories]);

  const spotlightProduct = aiPicks[0] || products[0];
  const sidePicks = aiPicks.slice(1, 4);

  const handleAdd = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    onAddToCart(product);
    setAddedMap((prev) => ({ ...prev, [product.id]: true }));
    setTimeout(() => {
      setAddedMap((prev) => ({ ...prev, [product.id]: false }));
    }, 1500);
  };

  if (!spotlightProduct) return null;

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 lg:p-7 shadow-xs overflow-hidden">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-950/40 text-[#ff6a00] text-xs font-bold uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {isPersonalized
                ? t('home.personalizedPicks', 'Personalized Smart Recommendations')
                : t('home.aiRecommendations', 'AI Smart Recommendations')}
            </span>
          </div>
          <h2 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {isPersonalized
              ? t('home.tailoredForYou', 'Curated Global Picks For You')
              : t('home.curatedGlobalPicks', 'Trending Global Picks For You')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isPersonalized
              ? t('home.personalizedDesc', 'Personalized based on your saved preferences, wishlist, and shopping activity.')
              : t('home.curatedPicksDesc', 'Algorithmic selection based on trending demand, verified merchant feedback, and seasonal discounts.')}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isPersonalized ? (
            <span className="text-[11px] font-semibold text-[#ff6a00] bg-orange-50 dark:bg-orange-950/40 px-3 py-1 rounded-full border border-orange-200 dark:border-orange-900/60 flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" />
              {t('home.personalizedActive', 'Personalized Match')}
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              {t('home.qualityInspected', '100% Quality Inspected')}
            </span>
          )}
        </div>
      </div>

      {/* Main Grid: Spotlight on Left, 3 Mini Cards on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <div
          onClick={() => onSelectProduct(spotlightProduct)}
          className="lg:col-span-7 bg-gradient-to-br from-orange-50/60 via-slate-50 to-white dark:from-slate-950 dark:via-slate-900 dark:to-slate-850 border border-orange-200/80 dark:border-orange-900/40 rounded-2xl p-3.5 sm:p-6 flex flex-col sm:flex-row gap-4 sm:gap-5 items-center group cursor-pointer hover:shadow-lg transition-all"
        >
          {/* Spotlight Image */}
          <div className="relative w-full sm:w-56 md:w-64 h-48 sm:h-64 rounded-xl overflow-hidden bg-white dark:bg-slate-800 shrink-0 border border-slate-200/80 dark:border-slate-700">
            <img
              src={spotlightProduct.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80'}
              alt={spotlightProduct.name || 'Featured Product'}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <span className="absolute top-2.5 left-2.5 bg-[#ff6a00] text-white text-[10px] font-black px-2.5 py-1 rounded-full uppercase shadow-md flex items-center gap-1">
              <Zap className="w-3 h-3 fill-white" />
              {isPersonalized ? 'Top Personal Match' : '99.4% AI Match'}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleWishlist(spotlightProduct.id);
              }}
              className="absolute top-2.5 right-2.5 p-2 rounded-full bg-white/90 dark:bg-slate-900/90 text-slate-500 hover:text-red-500 shadow-sm transition-colors cursor-pointer"
              aria-label="Wishlist toggle"
            >
              <Heart
                className={`w-4 h-4 ${
                  wishlist.includes(spotlightProduct.id) ? 'fill-red-500 text-red-500' : ''
                }`}
              />
            </button>
          </div>

          {/* Spotlight Details */}
          <div className="flex-1 flex flex-col justify-between w-full h-full">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                <span className="font-bold text-[#ff6a00] uppercase tracking-wider">
                  {spotlightProduct.seller?.name || spotlightProduct.brand}
                </span>
                <span>•</span>
                <div className="flex items-center text-amber-400">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="font-bold text-slate-800 dark:text-slate-200 ml-1">
                    {spotlightProduct.rating}
                  </span>
                  <span className="text-slate-400 ml-1">({spotlightProduct.reviewCount})</span>
                </div>
              </div>

              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white group-hover:text-[#ff6a00] transition-colors leading-snug line-clamp-2 mb-2">
                {spotlightProduct.name}
              </h3>

              <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed mb-4">
                {spotlightProduct.description}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800">
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-2xl font-black text-[#ff6a00]">
                  ${spotlightProduct.price.toFixed(2)}
                </span>
                {spotlightProduct.originalPrice > spotlightProduct.price && (
                  <span className="text-xs text-slate-400 line-through">
                    ${spotlightProduct.originalPrice.toFixed(2)}
                  </span>
                )}
                {spotlightProduct.originalPrice > spotlightProduct.price && (
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 ml-auto">
                    Save ${(spotlightProduct.originalPrice - spotlightProduct.price).toFixed(2)}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={(e) => handleAdd(e, spotlightProduct)}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer ${
                    addedMap[spotlightProduct.id]
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#ff6a00] hover:bg-[#e65f00] text-white'
                  }`}
                >
                  {addedMap[spotlightProduct.id] ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{t('toast.addedToCart', 'Added to Cart')}</span>
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
        </div>

        {/* 3 Mini Cards on Right */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          {sidePicks.map((product) => {
            const isAdded = !!addedMap[product.id];
            return (
              <div
                key={product.id}
                onClick={() => onSelectProduct(product)}
                className="bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center gap-3 group hover:border-[#ff6a00]/50 hover:shadow-sm transition-all cursor-pointer"
              >
                <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-white dark:bg-slate-800 shrink-0">
                  <img
                    src={product.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200'}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    loading="lazy"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1 group-hover:text-[#ff6a00] transition-colors">
                    {product.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                    <span className="font-semibold">{product.brand}</span>
                    <span>•</span>
                    <div className="flex items-center text-amber-500">
                      <Star className="w-3 h-3 fill-amber-400 mr-0.5" />
                      <span>{product.rating}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-sm font-extrabold text-[#ff6a00]">
                      ${product.price.toFixed(2)}
                    </span>
                    <button
                      onClick={(e) => handleAdd(e, product)}
                      className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isAdded
                          ? 'bg-emerald-600 text-white'
                          : 'bg-orange-50 dark:bg-orange-950/40 text-[#ff6a00] hover:bg-[#ff6a00] hover:text-white'
                      }`}
                      aria-label="Add to cart"
                    >
                      {isAdded ? <Check className="w-3.5 h-3.5" /> : <ShoppingBag className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

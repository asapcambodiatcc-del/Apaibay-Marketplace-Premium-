import React, { useState } from 'react';
import { Sparkles, Star, Heart, ShoppingBag, ShieldCheck, Check, Zap } from 'lucide-react';
import { Product } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

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
  const [addedMap, setAddedMap] = useState<Record<string, boolean>>({});

  // Pick top 4 products for AI Picks
  const aiPicks = products.filter((p) => p.isRecommended || p.isTrending).slice(0, 4);
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

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 lg:p-7 shadow-xs overflow-hidden">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-950/40 text-[#ff6a00] text-xs font-bold uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('home.aiRecommendations', 'AI Smart Recommendations')}</span>
          </div>
          <h2 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {t('home.curatedGlobalPicks', 'Curated Global Picks For You')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('home.curatedPicksDesc', 'Algorithmic selection based on trending demand, verified merchant feedback, and seasonal discounts')}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            {t('home.qualityInspected', '100% Quality Inspected')}
          </span>
        </div>
      </div>

      {/* Main Grid: Spotlight on Left, 3 Mini Cards on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {spotlightProduct && (
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
                99.4% AI Match
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleWishlist(spotlightProduct.id);
                }}
                className="absolute top-2.5 right-2.5 p-2 rounded-full bg-white/90 dark:bg-slate-900/90 text-slate-500 hover:text-red-500 shadow-sm transition-colors"
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
                    {spotlightProduct.brand}
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
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 ml-auto">
                    Save ${(spotlightProduct.originalPrice - spotlightProduct.price).toFixed(2)}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={(e) => handleAdd(e, spotlightProduct)}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                      addedMap[spotlightProduct.id]
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#ff6a00] hover:bg-[#e65f00] text-white cursor-pointer'
                    }`}
                  >
                    {addedMap[spotlightProduct.id] ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>{t('product.added', 'Added to Cart')}</span>
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="w-4 h-4" />
                        <span>{t('product.quickAdd', 'Quick Add to Cart')}</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectProduct(spotlightProduct);
                    }}
                    className="px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-[#ff6a00] text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-[#ff6a00] transition-colors"
                  >
                    {t('product.viewDetails', 'View Details')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Side Stack of 3 Complementary Picks (5 cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-3">
          {sidePicks.map((product) => {
            const isAdded = !!addedMap[product.id];

            return (
              <div
                key={product.id}
                onClick={() => onSelectProduct(product)}
                className="bg-slate-50/70 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl p-3 flex items-center gap-3.5 group cursor-pointer transition-all hover:shadow-xs"
              >
                <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-white dark:bg-slate-900 shrink-0 border border-slate-200 dark:border-slate-700">
                  <img
                    src={product.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=200&q=80'}
                    alt={product.name || 'Product'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  {product.discountPercentage > 0 && (
                    <span className="absolute top-1 left-1 bg-red-600 text-white text-[9px] font-black px-1 rounded">
                      -{product.discountPercentage}%
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-0.5">
                    <span className="font-semibold text-[#ff6a00] uppercase text-[10px]">
                      {product.brand}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      ★ {product.rating}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-[#ff6a00] transition-colors">
                    {product.name}
                  </h4>

                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-black text-[#ff6a00]">
                      ${product.price.toFixed(2)}
                    </span>

                    <button
                      onClick={(e) => handleAdd(e, product)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
                        isAdded
                          ? 'bg-emerald-600 text-white'
                          : 'bg-orange-50 dark:bg-orange-950/40 text-[#ff6a00] hover:bg-[#ff6a00] hover:text-white'
                      }`}
                    >
                      {isAdded ? <Check className="w-3 h-3" /> : <ShoppingBag className="w-3 h-3" />}
                      <span>{isAdded ? t('product.added', 'Added') : t('product.addToCart', 'Add')}</span>
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


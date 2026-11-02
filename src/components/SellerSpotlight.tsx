import React, { useState } from 'react';
import { Store, ShieldCheck, Star, ChevronRight, ArrowRight, Award, ShoppingBag } from 'lucide-react';
import { Product } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface SellerSpotlightProps {
  products: Product[];
  onSelectProduct: (product: Product) => void;
  onSelectSeller: (sellerName: string) => void;
  onExploreSellerCenter: () => void;
}

interface SellerSummary {
  name: string;
  verified: boolean;
  rating: number;
  badge?: string;
  items: Product[];
  country: string;
  established: number;
}

export const SellerSpotlight: React.FC<SellerSpotlightProps> = ({
  products,
  onSelectProduct,
  onSelectSeller,
  onExploreSellerCenter,
}) => {
  const { t, tCategory } = useLanguage();

  // Aggregate verified sellers from real catalog items
  const sellerMap: Record<string, SellerSummary> = {};

  products.forEach((p) => {
    const sName = p.seller?.name || 'Verified Marketplace Partner';
    if (!sellerMap[sName]) {
      sellerMap[sName] = {
        name: sName,
        verified: p.seller?.verified ?? true,
        rating: p.seller?.rating || p.rating || 4.9,
        badge: p.seller?.badge || 'Verified Merchant',
        items: [],
        country: sName.includes('Paris') ? 'FR' : sName.includes('Nordic') ? 'SE' : 'US',
        established: 2022,
      };
    }
    sellerMap[sName].items.push(p);
  });

  const verifiedSellers = Object.values(sellerMap).filter((s) => s.items.length > 0);
  const [activeSellerIndex, setActiveSellerIndex] = useState(0);

  if (verifiedSellers.length === 0) return null;

  const currentSeller = verifiedSellers[activeSellerIndex] || verifiedSellers[0];

  return (
    <section className="bg-gradient-to-br from-slate-50 via-white to-orange-50/30 dark:from-slate-900/90 dark:via-slate-900 dark:to-orange-950/20 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-7 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{t('seller.spotlightBadge', 'Verified Merchant Spotlight')}</span>
          </div>
          <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
            {t('seller.spotlightTitle', 'Flagship Brands & Verified Global Sellers')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('seller.spotlightDesc', 'Direct manufacturer warranties, authentic provenance, and expedited international dispatch.')}
          </p>
        </div>

        <button
          onClick={onExploreSellerCenter}
          className="self-start sm:self-center flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#ff6a00] text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-[#ff6a00] transition-colors cursor-pointer"
        >
          <Store className="w-3.5 h-3.5 text-[#ff6a00]" />
          <span>{t('seller.merchantPortal', 'Seller Center')}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Seller Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-3 mb-5">
        {verifiedSellers.map((seller, idx) => {
          const isSelected = idx === activeSellerIndex;
          return (
            <button
              key={seller.name}
              onClick={() => setActiveSellerIndex(idx)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 border ${
                isSelected
                  ? 'bg-white dark:bg-slate-800 border-[#ff6a00] text-[#ff6a00] shadow-sm ring-1 ring-[#ff6a00]'
                  : 'bg-white/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white'
              }`}
            >
              <Store className={`w-3.5 h-3.5 ${isSelected ? 'text-[#ff6a00]' : 'text-slate-400'}`} />
              <span>{seller.name}</span>
              {seller.verified && (
                <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Active Seller Banner & Product Showcase */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: Seller Profile Card */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-900/50 flex items-center justify-center text-[#ff6a00] font-black text-lg">
                <Store className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                <Award className="w-3 h-3" />
                {currentSeller.badge}
              </span>
            </div>

            <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
              {currentSeller.name}
            </h3>

            <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center text-amber-500 font-bold">
                <Star className="w-3.5 h-3.5 fill-amber-400 mr-1" />
                <span>{currentSeller.rating.toFixed(1)}</span>
              </div>
              <span>•</span>
              <span>{currentSeller.items.length} {t('common.items', 'listings')}</span>
              <span>•</span>
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                {currentSeller.country} Verified
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mt-3 leading-relaxed line-clamp-3">
              {t('seller.officialStoreDesc', 'Official brand flagships offering verified warranty, authentic certified goods, and direct buyer protection.')}
            </p>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => onSelectSeller(currentSeller.name)}
              className="w-full py-2.5 px-4 rounded-xl bg-[#ff6a00] hover:bg-[#e65f00] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
            >
              <span>{t('seller.exploreStore', 'View Seller Products')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right: Seller Product Carousel */}
        <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {currentSeller.items.slice(0, 3).map((product) => (
            <div
              key={product.id}
              onClick={() => onSelectProduct(product)}
              className="group bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col justify-between hover:shadow-md hover:border-[#ff6a00]/50 transition-all cursor-pointer"
            >
              <div className="relative h-32 sm:h-36 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 mb-2.5">
                <img
                  src={product.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400'}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                {product.discountPercentage > 0 && (
                  <span className="absolute top-1.5 left-1.5 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-xs">
                    -{product.discountPercentage}%
                  </span>
                )}
              </div>

              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase truncate block">
                  {tCategory(product.category)}
                </span>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-snug group-hover:text-[#ff6a00] transition-colors mt-0.5">
                  {product.name}
                </h4>
              </div>

              <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs sm:text-sm font-black text-[#ff6a00]">
                  ${product.price.toFixed(2)}
                </span>
                <div className="flex items-center text-amber-500 text-[11px] font-bold">
                  <Star className="w-3 h-3 fill-amber-400 mr-0.5" />
                  <span>{product.rating}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

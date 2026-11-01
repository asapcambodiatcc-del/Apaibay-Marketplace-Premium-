import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { BRANDS } from '../data/mockData';
import { useLanguage } from '../i18n/LanguageContext';

interface BrandShowcaseProps {
  onSelectBrand: (brandName: string | null) => void;
  selectedBrand: string | null;
}

export const BrandShowcase: React.FC<BrandShowcaseProps> = ({
  onSelectBrand,
  selectedBrand,
}) => {
  const { t } = useLanguage();
  const carouselRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const offset = direction === 'left' ? -280 : 280;
      carouselRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
              {t('home.brandShowcase', 'Interactive Brand Showcase')}
            </h2>
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-[#ff6a00] bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 rounded-full border border-orange-100 dark:border-orange-900/30">
              <Sparkles className="w-3 h-3" />
              {t('home.officialStores', 'Official Stores')}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('home.brandShowcaseDesc', 'Verified flagship stores with direct manufacturer warranty & express global dispatch')}
          </p>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {selectedBrand && (
            <button
              onClick={() => onSelectBrand(null)}
              className="text-xs font-semibold text-[#ff6a00] hover:underline"
            >
              {t('common.clearFilter', 'Clear Filter')} ({selectedBrand})
            </button>
          )}

          {/* Carousel Arrows */}
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

      {/* Horizontal Carousel Track */}
      <div
        ref={carouselRef}
        className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scroll-smooth no-scrollbar"
      >
        {BRANDS.map((brand) => {
          const isSelected = selectedBrand?.toLowerCase() === brand.name.toLowerCase();

          return (
            <button
              key={brand.id}
              onClick={() => onSelectBrand(isSelected ? null : brand.name)}
              className={`w-36 sm:w-40 shrink-0 group flex flex-col items-center justify-center p-4 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'border-[#ff6a00] bg-orange-50/70 dark:bg-orange-950/40 ring-2 ring-[#ff6a00]'
                  : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-[#ff6a00]/50 hover:bg-white dark:hover:bg-slate-800 hover:shadow-xs'
              }`}
            >
              {/* Brand Typography/Logo Badge */}
              <span className="font-extrabold text-sm sm:text-base text-slate-800 dark:text-slate-200 group-hover:text-[#ff6a00] transition-colors tracking-tight">
                {brand.name}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 font-medium">
                {brand.itemCount}+ {t('common.items', 'items')}
              </span>
              {isSelected && (
                <span className="text-[9px] font-bold text-[#ff6a00] mt-1 bg-orange-100 dark:bg-orange-900/50 px-2 py-0.5 rounded-full">
                  {t('common.active', 'Filtering Active')}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
};


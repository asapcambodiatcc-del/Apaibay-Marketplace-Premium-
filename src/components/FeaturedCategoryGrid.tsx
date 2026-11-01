import React from 'react';
import { ChevronRight } from 'lucide-react';
import { CATEGORIES } from '../data/mockData';
import { useLanguage } from '../i18n/LanguageContext';

interface FeaturedCategoryGridProps {
  onSelectCategory: (categoryId: string) => void;
  selectedCategory: string | null;
}

export const FeaturedCategoryGrid: React.FC<FeaturedCategoryGridProps> = ({
  onSelectCategory,
  selectedCategory,
}) => {
  const { t, tCategory } = useLanguage();

  return (
    <section className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {t('home.featuredCategories', 'Featured Category Grid')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('home.featuredCategoriesDesc', 'Explore millions of verified items across primary global collections')}
          </p>
        </div>
        <button
          onClick={() => onSelectCategory(CATEGORIES[0].slug)}
          className="text-xs font-semibold text-[#ff6a00] hover:text-[#e65f00] flex items-center gap-1 cursor-pointer transition-colors"
        >
          <span>{t('common.viewAll', 'See all')}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Grid: 2 cols on mobile, 3 on sm, 4 on md, 6 on xl - 12 categories total */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-4">
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.slug;
          return (
            <div
              key={cat.id}
              onClick={() => onSelectCategory(cat.slug)}
              className={`group relative h-32 xs:h-36 sm:h-40 md:h-44 rounded-2xl overflow-hidden cursor-pointer shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-lg border ${
                isSelected
                  ? 'ring-3 ring-[#ff6a00] border-[#ff6a00]'
                  : 'border-slate-200/80 dark:border-slate-800'
              }`}
            >
              {/* Image */}
              <img
                src={cat.image || 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=400&q=80'}
                alt={cat.name || 'Category'}
                className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-500"
                loading="lazy"
              />

              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

              {/* Badge & Text */}
              <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                <h3 className="font-bold text-xs sm:text-sm text-white group-hover:text-amber-300 transition-colors truncate">
                  {tCategory(cat.slug)}
                </h3>
                <span className="text-[10px] text-slate-300 block font-medium">
                  {cat.productCount.toLocaleString()}+ {t('common.items', 'items')}
                </span>
              </div>

              {/* Active pill indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2 bg-[#ff6a00] text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase shadow-md">
                  {t('common.active', 'Active')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};


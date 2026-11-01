import React from 'react';
import {
  Shirt,
  Smartphone,
  Sparkles,
  Sparkle,
  Home,
  Dumbbell,
  Armchair,
  Apple,
  Gamepad2,
  PawPrint,
  Car,
  Grid,
  ChevronRight,
  SlidersHorizontal
} from 'lucide-react';
import { CATEGORIES } from '../data/mockData';
import { useLanguage } from '../i18n/LanguageContext';

interface CategorySidebarProps {
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  className?: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'fashion': <Shirt className="w-4 h-4" />,
  'electronics': <Smartphone className="w-4 h-4" />,
  'modern-campaign': <Sparkles className="w-4 h-4" />,
  'beauty': <Sparkle className="w-4 h-4" />,
  'home-kitchen': <Home className="w-4 h-4" />,
  'sports': <Dumbbell className="w-4 h-4" />,
  'furniture': <Armchair className="w-4 h-4" />,
  'groceries': <Apple className="w-4 h-4" />,
  'gaming': <Gamepad2 className="w-4 h-4" />,
  'pet-supplies': <PawPrint className="w-4 h-4" />,
  'automotive': <Car className="w-4 h-4" />,
  'audio-accessories': <Smartphone className="w-4 h-4" />
};

export const CategorySidebar: React.FC<CategorySidebarProps> = ({
  selectedCategory,
  onSelectCategory,
  className = '',
}) => {
  const { t, tCategory } = useLanguage();

  return (
    <aside className={`w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden shrink-0 ${className}`}>
      {/* Category header */}
      <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white px-4 py-3.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[#ff6a00]" />
          <span className="font-bold text-sm tracking-wide">{t('header.categories', 'Category')}</span>
        </div>
        {selectedCategory && (
          <button
            onClick={() => onSelectCategory(null)}
            className="text-[11px] text-[#ff6a00] hover:underline"
          >
            {t('common.reset', 'Reset')}
          </button>
        )}
      </div>

      {/* Categories List */}
      <div className="py-2 divide-y divide-slate-100 dark:divide-slate-800/60">
        {CATEGORIES.slice(0, 11).map((cat) => {
          const isSelected = selectedCategory === cat.slug;
          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(isSelected ? null : cat.slug)}
              className={`w-full px-4 py-2.5 flex items-center justify-between text-xs font-medium transition-colors group cursor-pointer ${
                isSelected
                  ? 'bg-orange-50 dark:bg-orange-950/40 text-[#ff6a00] font-bold border-l-4 border-[#ff6a00]'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-[#ff6a00]'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`transition-colors ${isSelected ? 'text-[#ff6a00]' : 'text-slate-400 group-hover:text-[#ff6a00]'}`}>
                  {CATEGORY_ICONS[cat.slug] || <Grid className="w-4 h-4" />}
                </span>
                <span>{tCategory(cat.slug)}</span>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isSelected ? 'text-[#ff6a00] translate-x-1' : 'text-slate-400 group-hover:translate-x-0.5'}`} />
            </button>
          );
        })}

        {/* More Categories */}
        <button
          onClick={() => onSelectCategory(null)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-[#ff6a00] transition-colors group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Grid className="w-4 h-4 text-slate-400 group-hover:text-[#ff6a00]" />
            <span>{t('header.allCategories', 'More Categories')}</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </aside>
  );
};


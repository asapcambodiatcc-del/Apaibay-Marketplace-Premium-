import React from 'react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { CATEGORIES } from '../data/mockData';

interface CategoryMerchandisingQuadsProps {
  onSelectCategory: (categorySlug: string) => void;
}

interface QuadItem {
  labelKey: string;
  defaultLabel: string;
  slug: string;
  image: string;
  itemCount: string;
}

interface QuadCard {
  titleKey: string;
  defaultTitle: string;
  primarySlug: string;
  items: QuadItem[];
}

export const CategoryMerchandisingQuads: React.FC<CategoryMerchandisingQuadsProps> = ({
  onSelectCategory,
}) => {
  const { t, tCategory } = useLanguage();

  // Helper to get image from CATEGORIES if available
  const getCatImg = (slug: string, fallback: string) => {
    const found = CATEGORIES.find((c) => c.slug === slug);
    return found?.image || fallback;
  };

  const QUAD_CARDS: QuadCard[] = [
    {
      titleKey: 'quads.techTitle',
      defaultTitle: 'Flagship Tech & Digital Living',
      primarySlug: 'electronics',
      items: [
        {
          labelKey: 'quads.headphones',
          defaultLabel: 'Audio & Tech',
          slug: 'electronics',
          image: getCatImg('electronics', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400'),
          itemCount: '9,800+ items',
        },
        {
          labelKey: 'quads.wearables',
          defaultLabel: 'Smart Wearables',
          slug: 'electronics',
          image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400',
          itemCount: '4,200+ items',
        },
        {
          labelKey: 'quads.gaming',
          defaultLabel: 'Gaming Gear',
          slug: 'gaming',
          image: getCatImg('gaming', 'https://images.unsplash.com/photo-1600080972464-8e5f35f63d08?w=400'),
          itemCount: '5,700+ items',
        },
        {
          labelKey: 'quads.smartphones',
          defaultLabel: 'Smart Devices',
          slug: 'electronics',
          image: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=400',
          itemCount: '6,400+ items',
        },
      ],
    },
    {
      titleKey: 'quads.fashionTitle',
      defaultTitle: 'Global Fashion & Apparel',
      primarySlug: 'fashion',
      items: [
        {
          labelKey: 'quads.outerwear',
          defaultLabel: 'Luxury Coats',
          slug: 'fashion',
          image: getCatImg('fashion', 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400'),
          itemCount: '14,200+ items',
        },
        {
          labelKey: 'quads.footwear',
          defaultLabel: 'Footwear',
          slug: 'fashion',
          image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400',
          itemCount: '8,100+ items',
        },
        {
          labelKey: 'quads.campaign',
          defaultLabel: 'Modern Collections',
          slug: 'modern-campaign',
          image: getCatImg('modern-campaign', 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=400'),
          itemCount: '4,200+ items',
        },
        {
          labelKey: 'quads.accessories',
          defaultLabel: 'Bags & Accessories',
          slug: 'fashion',
          image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400',
          itemCount: '6,900+ items',
        },
      ],
    },
    {
      titleKey: 'quads.homeTitle',
      defaultTitle: 'Home Sanctuary & Furniture',
      primarySlug: 'home-kitchen',
      items: [
        {
          labelKey: 'quads.furniture',
          defaultLabel: 'Living Furniture',
          slug: 'furniture',
          image: getCatImg('furniture', 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400'),
          itemCount: '4,800+ items',
        },
        {
          labelKey: 'quads.kitchen',
          defaultLabel: 'Kitchen Essentials',
          slug: 'home-kitchen',
          image: getCatImg('home-kitchen', 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=400'),
          itemCount: '12,800+ items',
        },
        {
          labelKey: 'quads.groceries',
          defaultLabel: 'Pantry & Coffee',
          slug: 'groceries',
          image: getCatImg('groceries', 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400'),
          itemCount: '15,300+ items',
        },
        {
          labelKey: 'quads.decor',
          defaultLabel: 'Smart Home',
          slug: 'home-kitchen',
          image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=400',
          itemCount: '5,100+ items',
        },
      ],
    },
    {
      titleKey: 'quads.wellnessTitle',
      defaultTitle: 'Beauty, Wellness & Sports',
      primarySlug: 'beauty',
      items: [
        {
          labelKey: 'quads.beauty',
          defaultLabel: 'Skincare & Beauty',
          slug: 'beauty',
          image: getCatImg('beauty', 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400'),
          itemCount: '7,100+ items',
        },
        {
          labelKey: 'quads.sports',
          defaultLabel: 'Fitness Equipment',
          slug: 'sports',
          image: getCatImg('sports', 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=400'),
          itemCount: '6,500+ items',
        },
        {
          labelKey: 'quads.automotive',
          defaultLabel: 'Auto & Travel',
          slug: 'automotive',
          image: getCatImg('automotive', 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=400'),
          itemCount: '4,600+ items',
        },
        {
          labelKey: 'quads.pets',
          defaultLabel: 'Pet Supplies',
          slug: 'pet-supplies',
          image: getCatImg('pet-supplies', 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=400'),
          itemCount: '3,900+ items',
        },
      ],
    },
  ];

  return (
    <section className="space-y-4">
      {/* 4 Multi-Category Merchandising Cards (Amazon-inspired layout) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {QUAD_CARDS.map((card, cardIdx) => (
          <div
            key={cardIdx}
            className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow"
          >
            <div>
              {/* Card Title */}
              <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight leading-snug mb-3">
                {t(card.titleKey, card.defaultTitle)}
              </h3>

              {/* 2x2 Image Grid */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                {card.items.map((item, itemIdx) => (
                  <div
                    key={itemIdx}
                    onClick={() => onSelectCategory(item.slug)}
                    className="group flex flex-col cursor-pointer active:scale-95 transition-transform"
                  >
                    <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 mb-1.5 border border-slate-100 dark:border-slate-800/80">
                      <img
                        src={item.image}
                        alt={item.defaultLabel}
                        className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                    <span className="text-[11px] sm:text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-[#ff6a00] transition-colors truncate">
                      {t(item.labelKey, item.defaultLabel)}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                      {item.itemCount}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Category Link */}
            <div className="pt-3.5 mt-3.5 border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => onSelectCategory(card.primarySlug)}
                className="text-xs font-bold text-[#ff6a00] hover:text-[#e65f00] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>{t('common.seeMore', 'Explore department')}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

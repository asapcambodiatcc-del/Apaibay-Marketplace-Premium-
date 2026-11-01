import React from 'react';
import { Globe, ShieldCheck, Truck, ArrowRight, Sparkles } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface PromotionalBannersProps {
  onSelectPromotion: (filter: string) => void;
}

export const PromotionalBanners: React.FC<PromotionalBannersProps> = ({ onSelectPromotion }) => {
  const { t } = useLanguage();

  const PROMOS = [
    {
      id: 'global-deals',
      tag: 'WORLDWIDE SELECTION',
      title: t('promo.globalDeals', 'Global Deals'),
      subtitle: t('promo.globalDealsDesc', 'Up to 70% off international top-tier brands with seamless customs clearance.'),
      bgImage: 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=800&q=80',
      icon: <Globe className="w-5 h-5 text-amber-400" />,
      accentColor: 'from-blue-900/90 via-slate-900/85 to-slate-950',
      cta: t('promo.exploreDeals', 'Explore Global Deals'),
      filter: 'deals'
    },
    {
      id: 'verified-sellers',
      tag: 'AUTHENTICITY GUARANTEED',
      title: t('promo.verifiedSellers', 'Verified Sellers'),
      subtitle: t('promo.verifiedSellersDesc', 'Shop with full confidence from certified manufacturers & gold rated merchants.'),
      bgImage: 'https://images.unsplash.com/photo-1556740738-b6a63e27c4df?auto=format&fit=crop&w=800&q=80',
      icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
      accentColor: 'from-emerald-950/90 via-slate-900/85 to-slate-950',
      cta: t('promo.meetSellers', 'Meet Certified Stores'),
      filter: 'verified'
    },
    {
      id: 'free-shipping',
      tag: 'ZERO TRANSIT COST',
      title: t('promo.freeShipping', 'Free Shipping Over $50'),
      subtitle: t('promo.freeShippingDesc', 'Express doorstep logistics and priority handling across eligible catalog items.'),
      bgImage: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80',
      icon: <Truck className="w-5 h-5 text-orange-400" />,
      accentColor: 'from-orange-950/90 via-slate-900/85 to-slate-950',
      cta: t('promo.claimShipping', 'Claim Free Shipping'),
      filter: 'shipping'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
      {PROMOS.map((promo) => (
        <div
          key={promo.id}
          onClick={() => onSelectPromotion(promo.filter)}
          className="group relative rounded-2xl overflow-hidden shadow-xs hover:shadow-xl transition-all duration-300 min-h-[190px] sm:min-h-[240px] flex flex-col justify-between p-4 sm:p-6 cursor-pointer border border-slate-200 dark:border-slate-800"
        >
          {/* Background Image with Zoom */}
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-108"
            style={{ backgroundImage: `url(${promo.bgImage})` }}
          />

          {/* Color Gradient Overlay */}
          <div className={`absolute inset-0 bg-gradient-to-t ${promo.accentColor}`} />

          {/* Top Tag & Icon */}
          <div className="relative z-10 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white uppercase tracking-wider">
              <Sparkles className="w-3 h-3 text-[#ff6a00]" />
              {promo.tag}
            </span>
            <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
              {promo.icon}
            </div>
          </div>

          {/* Bottom Title & CTA */}
          <div className="relative z-10 text-white mt-auto pt-4">
            <h3 className="text-xl font-black tracking-tight mb-1.5 group-hover:text-amber-300 transition-colors">
              {promo.title}
            </h3>
            <p className="text-xs text-slate-300 line-clamp-2 mb-4 leading-relaxed">
              {promo.subtitle}
            </p>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-white group-hover:text-[#ff6a00] transition-colors">
              <span>{promo.cta}</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};


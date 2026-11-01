import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface HeroCarouselProps {
  onShopNow: (category?: string) => void;
  onExploreSale: () => void;
}

const SLIDES = [
  {
    id: 1,
    tag: 'AUTUMN LUXURY',
    title: 'Elevate Your Style: Autumn Luxury Collection',
    subtitle: 'Elevating your wardrobe at seasonal campaign prices with authentic designer codes.',
    category: 'fashion',
    bgImage: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1200&q=80',
    modelImage: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=600&q=80',
    badgeText: 'FLASH SALE'
  },
  {
    id: 2,
    tag: 'NEXT-GEN TECH',
    title: 'Precision Wearables & Flagship Smart Devices',
    subtitle: 'Experience active noise cancellation, AMOLED displays, and 14-day battery endurance.',
    category: 'electronics',
    bgImage: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80',
    modelImage: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80',
    badgeText: 'UP TO 60% OFF'
  },
  {
    id: 3,
    tag: 'NORDIC LIVING',
    title: 'Modern Living Room & Scandinavian Furniture',
    subtitle: 'Reinvigorate your sanctuary with velvet modular sofas, barista stations, and smart home vacuums.',
    category: 'furniture',
    bgImage: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=80',
    modelImage: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80',
    badgeText: 'FREE SHIPPING'
  }
];

export const HeroCarousel: React.FC<HeroCarouselProps> = ({ onShopNow, onExploreSale }) => {
  const { t } = useLanguage();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [countdown, setCountdown] = useState({
    hours: 9,
    minutes: 0,
    seconds: 58
  });

  // Countdown timer simulation
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 };
        }
        if (prev.minutes > 0) {
          return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        }
        if (prev.hours > 0) {
          return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        }
        return { hours: 9, minutes: 0, seconds: 0 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Slide autoplay
  useEffect(() => {
    const slideInterval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SLIDES.length);
    }, 7000);
    return () => clearInterval(slideInterval);
  }, []);

  const slide = SLIDES[currentSlide];

  const format2 = (num: number) => num.toString().padStart(2, '0');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
      {/* Main Banner Slide (8 cols on desktop) */}
      <div className="lg:col-span-8 relative rounded-2xl overflow-hidden shadow-sm bg-slate-900 min-h-[300px] xs:min-h-[340px] sm:min-h-[400px] lg:min-h-[420px] flex items-center group">
        {/* Background Image with Dark & Warm Overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-all duration-700 transform scale-105"
          style={{ backgroundImage: `url(${slide.bgImage})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-900/80 to-transparent" />

        {/* Slide Content */}
        <div className="relative z-10 p-4 xs:p-6 sm:p-8 lg:p-10 max-w-xl text-white">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[10px] sm:text-[11px] font-bold tracking-widest text-amber-300 uppercase mb-2 sm:mb-3">
            <Sparkles className="w-3 h-3 text-[#ff6a00]" />
            <span>{slide.tag}</span>
          </div>

          <h1 className="text-xl xs:text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight text-white mb-2 sm:mb-3">
            {slide.title}
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 mb-4 sm:mb-6 leading-relaxed line-clamp-2 sm:line-clamp-3">
            {slide.subtitle}
          </p>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <button
              id="hero-primary-cta"
              onClick={() => onShopNow(slide.category)}
              className="bg-[#ff6a00] hover:bg-[#e65f00] text-white px-4 sm:px-6 py-2 sm:py-2.5 rounded-full font-bold text-xs sm:text-sm transition-all shadow-lg flex items-center gap-1.5 sm:gap-2 cursor-pointer group/btn"
            >
              <span>{t('hero.shopNow', 'Shop Now')}</span>
              <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover/btn:translate-x-1 transition-transform" />
            </button>
            <button
              id="hero-secondary-cta"
              onClick={onExploreSale}
              className="bg-white/15 hover:bg-white/25 text-white border border-white/30 backdrop-blur-sm px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full font-semibold text-xs sm:text-sm transition-all cursor-pointer"
            >
              {t('hero.exploreSale', 'Explore Flash Sales')}
            </button>
          </div>
        </div>

        {/* Live Flash Sale countdown box inside slide (bottom right) */}
        <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 z-20 bg-black/75 backdrop-blur-md border border-white/15 rounded-xl p-3 text-white hidden sm:block">
          <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider mb-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
            {t('hero.flashSale', 'FLASH SALE')}
          </div>
          <div className="flex items-center gap-1.5 font-mono text-sm font-black">
            <span className="bg-white/20 px-1.5 py-0.5 rounded text-white">{format2(countdown.hours)}</span>
            <span className="text-amber-400">:</span>
            <span className="bg-white/20 px-1.5 py-0.5 rounded text-white">{format2(countdown.minutes)}</span>
            <span className="text-amber-400">:</span>
            <span className="bg-white/20 px-1.5 py-0.5 rounded text-white">{format2(countdown.seconds)}</span>
          </div>
        </div>

        {/* Slide Controls */}
        <div className="hidden sm:block absolute top-1/2 -translate-y-1/2 left-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setCurrentSlide((prev) => (prev - 1 + SLIDES.length) % SLIDES.length)}
            className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm border border-white/20 transition-all cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
        <div className="hidden sm:block absolute top-1/2 -translate-y-1/2 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setCurrentSlide((prev) => (prev + 1) % SLIDES.length)}
            className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm border border-white/20 transition-all cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Dots indicators */}
        <div className="absolute bottom-3 left-4 sm:bottom-4 sm:left-10 z-20 flex items-center gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                currentSlide === i ? 'w-6 bg-[#ff6a00]' : 'w-2 bg-white/40 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Companion Right Card (4 cols on desktop - matching mockup) */}
      <div className="hidden lg:flex lg:col-span-4 flex-col justify-between relative rounded-2xl overflow-hidden shadow-sm bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 text-white group">
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
          style={{ backgroundImage: `url(${slide.modelImage})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/60 to-slate-900/30" />

        <div className="relative z-10 flex items-center justify-between">
          <span className="px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-full text-[10px] font-bold text-amber-300 border border-white/10 uppercase">
            {t('hero.curatedPick', 'Curated Pick')}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-slate-300 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            {t('hero.verified', 'Verified')}
          </span>
        </div>

        <div className="relative z-10">
          <div className="text-[11px] font-bold text-[#ff6a00] uppercase tracking-wider mb-1">
            {t('hero.featuredHighlight', 'Featured Highlight')}
          </div>
          <h3 className="text-lg font-bold leading-snug mb-2 text-white">
            {slide.title}
          </h3>
          <p className="text-xs text-slate-300 mb-4 line-clamp-2">
            {t('hero.curatedDesc', 'Explore authentic merchant collections with certified quality control.')}
          </p>
          <button
            id="hero-companion-shop-btn"
            onClick={() => onShopNow(slide.category)}
            className="w-full py-2.5 bg-white text-slate-900 hover:bg-amber-400 hover:text-slate-950 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
          >
            <span>{t('hero.shopNow', 'Shop Now')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};


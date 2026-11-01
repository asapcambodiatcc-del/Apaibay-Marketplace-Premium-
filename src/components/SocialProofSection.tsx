import React from 'react';
import { Star, ShieldCheck, ChevronRight } from 'lucide-react';
import { REVIEWS } from '../data/mockData';
import { useLanguage } from '../i18n/LanguageContext';

export const SocialProofSection: React.FC = () => {
  const { t } = useLanguage();

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {t('home.socialProof', 'Social Proof')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('home.socialProofDesc', 'Real feedback from verified global buyers across 140+ countries')}
          </p>
        </div>
        <button className="text-xs font-semibold text-[#ff6a00] hover:text-[#e65f00] flex items-center gap-1 cursor-pointer">
          <span>{t('common.viewAll', 'Show all')}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Grid of 4 review cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {REVIEWS.map((rev) => (
          <div
            key={rev.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow"
          >
            <div>
              {/* Star Rating & Verified Badge */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center text-amber-400">
                  {[...Array(rev.rating)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />
                  ))}
                </div>
                {rev.verifiedPurchase && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    <ShieldCheck className="w-3 h-3" />
                    {t('hero.verified', 'Verified')}
                  </span>
                )}
              </div>

              {/* Review Text */}
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mb-4 italic">
                "{rev.comment}"
              </p>
            </div>

            {/* Customer info & Product */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-3">
                <img
                  src={rev.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                  alt={rev.userName || 'Customer'}
                  className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700"
                />
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {rev.userName}
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    Purchased {rev.productName}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};


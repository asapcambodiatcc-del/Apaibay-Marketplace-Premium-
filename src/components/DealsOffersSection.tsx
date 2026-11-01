import React from 'react';
import {
  Percent,
  Flame,
  Sparkles,
  TicketPercent,
  Coins,
  PackageCheck,
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import { DEALS_OFFERS } from '../data/mockData';
import { useLanguage } from '../i18n/LanguageContext';

interface DealsOffersSectionProps {
  onSelectDeal: (dealId: string, categoryFilter?: string) => void;
}

const DEAL_ICONS: Record<string, React.ReactNode> = {
  Percent: <Percent className="w-5 h-5 text-[#ff6a00]" />,
  Flame: <Flame className="w-5 h-5 text-red-500" />,
  Sparkles: <Sparkles className="w-5 h-5 text-amber-500" />,
  TicketPercent: <TicketPercent className="w-5 h-5 text-emerald-600" />,
  Coins: <Coins className="w-5 h-5 text-amber-600" />,
  PackageCheck: <PackageCheck className="w-5 h-5 text-blue-600" />,
};

export const DealsOffersSection: React.FC<DealsOffersSectionProps> = ({ onSelectDeal }) => {
  const { t } = useLanguage();

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {t('home.dealsOffers', 'Deals & Offers')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('home.dealsOffersDesc', 'Claim limited-time vouchers, bundle incentives, and cash rewards')}
          </p>
        </div>
        <button
          onClick={() => onSelectDeal('deal-daily')}
          className="text-xs font-semibold text-[#ff6a00] hover:text-[#e65f00] flex items-center gap-1 cursor-pointer transition-colors"
        >
          <span>{t('common.viewAll', 'Show all')}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 6 White/Light Neutral Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {DEALS_OFFERS.map((deal) => (
          <div
            key={deal.id}
            onClick={() => onSelectDeal(deal.id, deal.categoryFilter)}
            className="group relative rounded-2xl overflow-hidden p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white flex flex-col justify-between min-h-[160px] cursor-pointer hover:shadow-lg hover:border-[#ff6a00]/60 transition-all duration-300 hover:-translate-y-1"
          >
            {/* Top row: Badge & Icon */}
            <div className="relative z-10 flex items-center justify-between">
              <span className="bg-orange-50 dark:bg-orange-950/40 text-[#ff6a00] text-[9px] font-black px-2 py-0.5 rounded-md tracking-wider uppercase border border-orange-200/60 dark:border-orange-800/40">
                {deal.badge}
              </span>
              <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                {DEAL_ICONS[deal.iconName] || <Percent className="w-4 h-4 text-[#ff6a00]" />}
              </div>
            </div>

            {/* Middle: Discount Callout */}
            <div className="relative z-10 my-2">
              <div className="text-lg font-black tracking-tight leading-none text-[#ff6a00] group-hover:scale-105 transition-transform origin-left">
                {deal.discount}
              </div>
              <h3 className="font-bold text-xs mt-1 text-slate-800 dark:text-slate-100 leading-tight">
                {deal.title}
              </h3>
            </div>

            {/* Bottom action */}
            <div className="relative z-10 flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300 group-hover:text-[#ff6a00] transition-colors">
              <span>{deal.actionText}</span>
              <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform text-[#ff6a00]" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};


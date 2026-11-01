import React from 'react';
import { Truck, ShieldCheck, RefreshCw, Headphones, Award } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export const TrustStrip: React.FC = () => {
  const { t } = useLanguage();

  const TRUST_ITEMS = [
    {
      icon: <Truck className="w-5 h-5 text-[#ff6a00]" />,
      title: t('trust.freeShipping', 'Free Shipping'),
      description: t('trust.freeShippingDesc', 'On all orders over $50')
    },
    {
      icon: <ShieldCheck className="w-5 h-5 text-[#ff6a00]" />,
      title: t('trust.securePayment', 'Secure Payment'),
      description: t('trust.securePaymentDesc', '256-bit encrypted checkout')
    },
    {
      icon: <RefreshCw className="w-5 h-5 text-[#ff6a00]" />,
      title: t('trust.easyReturns', 'Easy Returns'),
      description: t('trust.easyReturnsDesc', '30-day money back guarantee')
    },
    {
      icon: <Headphones className="w-5 h-5 text-[#ff6a00]" />,
      title: t('trust.support', '24/7 Support'),
      description: t('trust.supportDesc', 'Dedicated support hotline')
    },
    {
      icon: <Award className="w-5 h-5 text-[#ff6a00]" />,
      title: t('trust.authentic', 'Authentic Goods'),
      description: t('trust.authenticDesc', '100% verified merchants')
    }
  ];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-xs">
      <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-5">
        {TRUST_ITEMS.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/40 flex items-center justify-center shrink-0 border border-orange-100 dark:border-orange-900/30">
              {item.icon}
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-tight">
                {item.title}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


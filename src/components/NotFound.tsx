import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { ShoppingBag, Home, ArrowLeft } from 'lucide-react';

export const NotFound: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <main
      id="main-404-content"
      role="main"
      className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto my-12"
    >
      <div className="relative mb-6">
        <div className="text-8xl sm:text-9xl font-extrabold tracking-tight text-slate-200 dark:text-slate-800 select-none">
          404
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-[#ff6a00]/10 border border-[#ff6a00]/20 flex items-center justify-center text-[#ff6a00] shadow-lg">
            <ShoppingBag className="w-8 h-8" />
          </div>
        </div>
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2">
        {t('common.pageNotFound', 'Page not found')}
      </h1>

      <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mb-8 max-w-md">
        {t(
          'common.pageNotFoundDesc',
          "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable on Apaibay Marketplace."
        )}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('common.goBack', 'Go Back')}</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] text-white text-sm font-semibold shadow-md shadow-[#ff6a00]/20 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40"
        >
          <Home className="w-4 h-4" />
          <span>{t('common.backToHome', 'Back to Home')}</span>
        </button>
      </div>
    </main>
  );
};

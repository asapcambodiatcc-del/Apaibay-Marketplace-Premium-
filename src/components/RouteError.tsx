import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';

interface RouteErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const RouteError: React.FC<RouteErrorProps> = ({ title, message, onRetry }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <div
      role="alert"
      className="min-h-[55vh] flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto"
    >
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
        {title || t('common.errorTitle', 'Something went wrong')}
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
        {message || t('common.errorMessage', 'We encountered an error loading this section. Please try again or return to the marketplace.')}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ff6a00] text-white text-sm font-semibold hover:bg-[#e05d00] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{t('common.retry', 'Try Again')}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40"
        >
          <Home className="w-4 h-4 text-[#ff6a00]" />
          <span>{t('common.backToHome', 'Back to Home')}</span>
        </button>
      </div>
    </div>
  );
};

import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { Loader2 } from 'lucide-react';

interface RouteLoadingProps {
  message?: string;
}

export const RouteLoading: React.FC<RouteLoadingProps> = ({ message }) => {
  const { t } = useLanguage();

  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center"
    >
      <div className="relative flex items-center justify-center mb-4">
        <div className="w-14 h-14 rounded-full border-4 border-[#ff6a00]/20 border-t-[#ff6a00] animate-spin" />
        <Loader2 className="w-6 h-6 text-[#ff6a00] absolute animate-pulse" />
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
        {message || t('common.loading', 'Loading marketplace...')}
      </p>
      <span className="sr-only">Loading content</span>
    </div>
  );
};

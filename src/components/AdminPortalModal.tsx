import React from 'react';
import {
  X,
  ShieldCheck,
  Users,
  DollarSign,
  Package,
  Activity,
  AlertTriangle,
  CheckCircle,
  Database
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface AdminPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalProducts: number;
}

export const AdminPortalModal: React.FC<AdminPortalModalProps> = ({
  isOpen,
  onClose,
  totalProducts,
}) => {
  const { t } = useLanguage();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl max-w-3xl w-full shadow-2xl overflow-hidden relative my-auto">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#ff6a00]" />
            <div>
              <h2 className="text-base font-bold">{t('admin.title', 'apaibay Global Admin Portal')}</h2>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                System Health: 99.99% Uptime • Asia-East1 / London Cluster
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                {t('admin.platformVolume', 'Platform Volume')}
              </span>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
                $1,420,890
              </div>
              <span className="text-[10px] text-emerald-500 font-semibold">+14.2% YoY</span>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                {t('admin.activeBuyers', 'Active Buyers')}
              </span>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
                248,300
              </div>
              <span className="text-[10px] text-slate-400">142 countries</span>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                {t('admin.verifiedMerchants', 'Verified Merchants')}
              </span>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
                3,420
              </div>
              <span className="text-[10px] text-emerald-500 font-semibold">100% Vetted</span>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                {t('admin.disputeRatio', 'Dispute Ratio')}
              </span>
              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                0.04%
              </div>
              <span className="text-[10px] text-slate-400">Lowest in industry</span>
            </div>
          </div>

          {/* System Status and Audit Log */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                {t('admin.systemHealth', 'System Security & Service Nodes')}
              </h3>
              <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                {t('admin.allServicesNominal', 'All Services Nominal')}
              </span>
            </div>

            <div className="space-y-2 text-xs divide-y divide-slate-100 dark:divide-slate-800">
              <div className="pt-2 first:pt-0 flex items-center justify-between">
                <span>Database Sync & Persistence Pipeline</span>
                <span className="font-mono text-emerald-600 font-bold">READY</span>
              </div>
              <div className="pt-2 flex items-center justify-between">
                <span>Search Indexing & AI Autocomplete Engine</span>
                <span className="font-mono text-emerald-600 font-bold">OPERATIONAL</span>
              </div>
              <div className="pt-2 flex items-center justify-between">
                <span>Payment Gateway Sandbox (Stripe / PayPal)</span>
                <span className="font-mono text-emerald-600 font-bold">SECURED</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


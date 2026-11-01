import React from 'react';
import {
  X,
  User,
  Mail,
  Shield,
  Award,
  CreditCard,
  MapPin,
  LogOut,
  LogIn,
  CheckCircle2,
  Calendar,
  Store,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAuth?: (mode?: 'login' | 'register') => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  onOpenAuth,
}) => {
  const { t } = useLanguage();
  const { user, logout, openAuthModal, role, isAdmin, isSeller } = useAuth();

  if (!isOpen) return null;

  const handleOpenLogin = () => {
    onClose();
    if (onOpenAuth) {
      onOpenAuth('login');
    } else {
      openAuthModal('login');
    }
  };

  const handleOpenRegister = () => {
    onClose();
    if (onOpenAuth) {
      onOpenAuth('register');
    } else {
      openAuthModal('register');
    }
  };

  const handleSignOut = async () => {
    await logout();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-modal-title"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden relative my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-[#ff6a00]" />
            <h2
              id="account-modal-title"
              className="text-base font-extrabold text-slate-900 dark:text-white"
            >
              {user ? t('account.title', 'Account Management') : t('auth.login', 'Sign In')}
            </h2>
          </div>
          <button
            id="account-modal-close-btn"
            onClick={onClose}
            aria-label={t('common.close', 'Close')}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {user ? (
          <div className="p-6 space-y-5">
            {/* User Profile Card */}
            <div className="flex items-center gap-4 p-4 bg-orange-50/60 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/40 rounded-2xl">
              <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-[#ff6a00] bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                {(user.avatar?.trim() || user.photoURL?.trim()) ? (
                  <img
                    src={user.avatar || user.photoURL || undefined}
                    alt={user.name || 'User'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-8 h-8 text-slate-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white truncate">
                    {user.name || user.displayName || 'Apaibay Customer'}
                  </h3>
                  {isAdmin && (
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-rose-500 text-white rounded-full flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Admin</span>
                    </span>
                  )}
                  {isSeller && !isAdmin && (
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-amber-500 text-white rounded-full flex items-center gap-1">
                      <Store className="w-3 h-3" />
                      <span>Seller</span>
                    </span>
                  )}
                  {!isAdmin && !isSeller && (
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-500/30">
                      Customer
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">{user.email}</p>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">
                  <Calendar className="w-3 h-3" />
                  <span>Verified Member</span>
                </div>
              </div>
            </div>

            {/* Account Quick Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
                <span className="text-lg font-black text-slate-900 dark:text-white">
                  {user.apaibayPoints ?? 2450}
                </span>
                <span className="text-[10px] text-slate-400 block truncate">
                  {t('account.rewardPoints', 'Points')}
                </span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
                <span className="text-lg font-black text-slate-900 dark:text-white">
                  {user.savedAddresses ?? 1}
                </span>
                <span className="text-[10px] text-slate-400 block truncate">
                  {t('account.savedAddresses', 'Addresses')}
                </span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
                <span className="text-lg font-black text-emerald-500">
                  Active
                </span>
                <span className="text-[10px] text-slate-400 block truncate">
                  {t('account.securityScore', 'Security')}
                </span>
              </div>
            </div>

            {/* Sign Out Button */}
            <button
              id="account-modal-signout-btn"
              onClick={handleSignOut}
              className="w-full py-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('auth.signOut', 'Sign Out')}</span>
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-100 dark:bg-orange-950/60 text-[#ff6a00] flex items-center justify-center mx-auto">
              <User className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                {t('auth.welcomeBack', 'Welcome to apaibay')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto mt-1 leading-relaxed">
                {t('auth.createAccountTitle', 'Sign in to access your orders, saved addresses, and secure checkout.')}
              </p>
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                id="account-modal-signin-btn"
                onClick={handleOpenLogin}
                className="w-full py-2.5 bg-[#ff6a00] hover:bg-[#e65f00] text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>{t('auth.login', 'Sign In')}</span>
              </button>

              <button
                id="account-modal-register-btn"
                onClick={handleOpenRegister}
                className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                <span>{t('auth.register', 'Create New Account')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

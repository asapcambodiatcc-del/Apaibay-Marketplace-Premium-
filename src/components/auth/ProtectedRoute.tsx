import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { RouteLoading } from '../RouteLoading';
import { ShieldAlert, Store, ArrowLeft, LogIn } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'customer' | 'seller' | 'admin';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole = 'customer',
}) => {
  const { user, firebaseUser, loading, role, isAdmin, isSeller } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  // Prevent flash while Firebase Auth initializes session from IndexedDB/localStorage
  if (loading) {
    return <RouteLoading message={t('common.loading', 'Verifying security credentials...')} />;
  }

  // Not authenticated -> redirect to /login with redirect parameter
  if (!user && !firebaseUser) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  // Role: Admin Protected Route
  if (requiredRole === 'admin' && !isAdmin) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 sm:p-12 text-center max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4 ring-1 ring-rose-200 dark:ring-rose-800">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white mb-2">
          {t('auth.unauthorizedTitle', 'Access Restricted')}
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
          {t('auth.adminRequired', 'Administrative clearance required. Your current account role does not possess permissions for this console.')}
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
          <Link
            to="/"
            className="w-full sm:flex-1 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-750 font-semibold text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Marketplace</span>
          </Link>
          <Link
            to="/account"
            className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-[#ff6a00] hover:bg-[#e65f00] text-white font-bold text-xs shadow-sm transition-colors text-center"
          >
            Go to My Account
          </Link>
        </div>
      </div>
    );
  }

  // Role: Seller Protected Route
  if (requiredRole === 'seller' && !isSeller && !isAdmin) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 sm:p-12 text-center max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4 ring-1 ring-amber-200 dark:ring-amber-800">
          <Store className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white mb-2">
          {t('auth.sellerRequired', 'Seller Verification Required')}
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
          {t('auth.unauthorizedDesc', 'This portal is restricted to verified Apaibay merchant stores. You can apply to become an official seller from your account profile.')}
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
          <Link
            to="/"
            className="w-full sm:flex-1 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-750 font-semibold text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Marketplace Home</span>
          </Link>
          <Link
            to="/account"
            className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-[#ff6a00] hover:bg-[#e65f00] text-white font-bold text-xs shadow-sm transition-colors text-center"
          >
            View Account Status
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

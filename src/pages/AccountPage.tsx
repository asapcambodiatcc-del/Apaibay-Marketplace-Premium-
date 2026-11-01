import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import {
  User,
  MapPin,
  CreditCard,
  Package,
  Award,
  Shield,
  Bell,
  LogOut,
  Edit2,
  CheckCircle2,
} from 'lucide-react';

interface AccountPageProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const AccountPage: React.FC<AccountPageProps> = ({ onShowToast }) => {
  const { t, language, setLanguage, languages } = useLanguage();
  const { user, firebaseUser, isAuthenticated, signInWithGoogle, logout, updateProfile, isAdmin, isSeller } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
    }
  }, [user]);

  const handleGoogleSignIn = async () => {
    try {
      setAuthLoading(true);
      await signInWithGoogle();
      onShowToast('Signed in with Google successfully', 'success');
    } catch (err) {
      onShowToast('Google Sign-In cancelled or failed', 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    onShowToast('Signed out of Apaibay', 'info');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateProfile({ name, email });
    setIsEditing(false);
    onShowToast('Profile information updated', 'success');
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Account Overview Header */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-orange-500/20 text-[#ff6a00] border border-[#ff6a00]/30 flex items-center justify-center font-black text-2xl">
            {user?.name?.[0] || 'A'}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-extrabold">{user?.name || user?.displayName || 'Customer'}</h1>
              {isAdmin && (
                <span className="text-xs bg-rose-600 text-white px-2.5 py-0.5 rounded-full font-bold">
                  Admin
                </span>
              )}
              {isSeller && !isAdmin && (
                <span className="text-xs bg-amber-500 text-white px-2.5 py-0.5 rounded-full font-bold">
                  Verified Seller
                </span>
              )}
              {!isAdmin && !isSeller && (
                <span className="text-xs bg-[#ff6a00] text-white px-2.5 py-0.5 rounded-full font-bold">
                  Customer
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-400">{user?.email || firebaseUser?.email || ''}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-white/10 px-5 py-3 rounded-2xl backdrop-blur-md">
          <Award className="w-6 h-6 text-amber-400" />
          <div>
            <div className="text-[11px] text-slate-300">Reward Points</div>
            <div className="text-lg font-black text-white">{user?.apaibayPoints || 2450} pts</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Personal Information & Settings */}
        <div className="lg:col-span-8 space-y-6">
          {/* Personal Information */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <User className="w-4 h-4 text-[#ff6a00]" />
                <span>Personal Information</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsEditing((prev) => !prev)}
                className="text-xs text-[#ff6a00] font-bold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>{isEditing ? 'Cancel' : 'Edit'}</span>
              </button>
            </div>

            {isEditing ? (
              <form onSubmit={handleSaveProfile} className="space-y-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300">Full Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#ff6a00] text-white text-xs font-bold cursor-pointer"
                >
                  Save Changes
                </button>
              </form>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
                <div>
                  <span className="text-slate-400">Full Name</span>
                  <div className="font-bold text-slate-900 dark:text-white text-sm">
                    {user?.name || 'Alex Morgan'}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">Email Address</span>
                  <div className="font-bold text-slate-900 dark:text-white text-sm">
                    {user?.email || 'alex.morgan@apaibay.com'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Delivery Addresses */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#ff6a00]" />
              <span>Saved Shipping Addresses</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl border-2 border-[#ff6a00] bg-orange-50/30 dark:bg-orange-950/20 space-y-1 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-extrabold text-slate-900 dark:text-white">Primary Residence</span>
                  <span className="text-[10px] bg-[#ff6a00] text-white font-black px-2 py-0.5 rounded-full">
                    DEFAULT
                  </span>
                </div>
                <div className="text-slate-600 dark:text-slate-400">100 Oxford Street, W1D 1LL</div>
                <div className="text-slate-600 dark:text-slate-400">London, United Kingdom</div>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1 text-xs">
                <span className="font-extrabold text-slate-900 dark:text-white">Office</span>
                <div className="text-slate-600 dark:text-slate-400">45 Tech City Hub, EC1V 1AB</div>
                <div className="text-slate-600 dark:text-slate-400">London, United Kingdom</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Quick Navigation & Preferences */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
              Account Short-cuts
            </h3>

            <div className="space-y-2 text-xs font-semibold">
              <Link
                to="/orders"
                className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Package className="w-4 h-4 text-[#ff6a00]" />
                  <span>Order History & Shipments</span>
                </div>
                <span className="text-slate-400 font-normal">View</span>
              </Link>

              <Link
                to="/cart"
                className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <CreditCard className="w-4 h-4 text-[#ff6a00]" />
                  <span>Shopping Cart</span>
                </div>
                <span className="text-slate-400 font-normal">Open</span>
              </Link>

              <Link
                to="/seller"
                className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Shield className="w-4 h-4 text-[#ff6a00]" />
                  <span>Merchant & Seller Center</span>
                </div>
                <span className="text-[#ff6a00]">Switch</span>
              </Link>
            </div>
          </div>

          {/* Firebase Authentication & Cloud Session */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#ff6a00]" />
              <span>Firebase Identity</span>
            </h3>

            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Database</span>
                <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                  Active Firestore
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Auth Status</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {firebaseUser ? 'Authenticated' : 'Guest / Demo'}
                </span>
              </div>
              {firebaseUser && (
                <div className="pt-1 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-400 truncate">
                  UID: {firebaseUser.uid}
                </div>
              )}
            </div>

            {firebaseUser ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full py-2.5 px-4 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-bold transition-colors flex items-center justify-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out of Account</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={authLoading}
                onClick={handleGoogleSignIn}
                className="w-full py-2.5 px-4 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] text-white text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <span>{authLoading ? 'Signing in...' : 'Sign in with Google'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

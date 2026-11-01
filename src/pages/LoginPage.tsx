import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Shield,
  ShoppingBag,
} from 'lucide-react';
import { useAuth, AuthModalMode } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { getAuthErrorMessageKey } from '../services/firebase/authErrors';

export const LoginPage: React.FC = () => {
  const { t } = useLanguage();
  const {
    user,
    isAuthenticated,
    loading: authLoading,
    loginWithEmail,
    registerWithEmail,
    sendPasswordReset,
    signInWithGoogle,
  } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/';

  const initialTab = (searchParams.get('mode') as AuthModalMode) || 'login';
  const [mode, setMode] = useState<AuthModalMode>(initialTab);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  // If already authenticated, redirect to destination
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirectPath, { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate, redirectPath]);

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  };

  const handleGoogleSignIn = async () => {
    setErrorKey(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
      navigate(redirectPath, { replace: true });
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        const key = getAuthErrorMessageKey(err?.code || err?.message || '');
        setErrorKey(key);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorKey(null);

    if (!validateEmail(email)) {
      setErrorKey('auth.errorInvalidEmail');
      return;
    }

    if (mode === 'forgot-password') {
      setSubmitting(true);
      try {
        await sendPasswordReset(email.trim());
        setResetSent(true);
      } catch (err: any) {
        const key = getAuthErrorMessageKey(err?.code || err?.message || '');
        setErrorKey(key);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (password.length < 6) {
      setErrorKey('auth.errorWeakPassword');
      return;
    }

    if (mode === 'register') {
      if (!name.trim()) {
        setErrorKey('auth.errorNameRequired');
        return;
      }
      if (password !== confirmPassword) {
        setErrorKey('auth.errorPasswordMismatch');
        return;
      }

      setSubmitting(true);
      try {
        await registerWithEmail(email.trim(), password, name.trim());
        navigate(redirectPath, { replace: true });
      } catch (err: any) {
        const key = getAuthErrorMessageKey(err?.code || err?.message || '');
        setErrorKey(key);
      } finally {
        setSubmitting(false);
      }
    } else {
      setSubmitting(true);
      try {
        await loginWithEmail(email.trim(), password);
        navigate(redirectPath, { replace: true });
      } catch (err: any) {
        const key = getAuthErrorMessageKey(err?.code || err?.message || '');
        setErrorKey(key);
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center py-10 px-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl overflow-hidden p-6 sm:p-8 space-y-6">
        {/* Brand Banner */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 text-[#ff6a00] border border-[#ff6a00]/30 flex items-center justify-center mx-auto mb-3">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {mode === 'login' && t('auth.login', 'Sign In')}
            {mode === 'register' && t('auth.register', 'Create Account')}
            {mode === 'forgot-password' && t('auth.forgotPasswordTitle', 'Recover Password')}
          </h1>
          <p className="text-xs text-slate-400">
            {mode === 'login' && t('auth.welcomeBack', 'Welcome back to apaibay')}
            {mode === 'register' && t('auth.createAccountTitle', 'Join the global marketplace')}
            {mode === 'forgot-password' && t('auth.forgotPasswordDesc', 'Enter your registered email address to receive a secure link.')}
          </p>
        </div>

        {/* Mode switcher tabs (Login vs Register) */}
        {mode !== 'forgot-password' && (
          <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setErrorKey(null);
                setMode('login');
              }}
              className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t('auth.login', 'Sign In')}
            </button>
            <button
              type="button"
              onClick={() => {
                setErrorKey(null);
                setMode('register');
              }}
              className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t('auth.register', 'Create Account')}
            </button>
          </div>
        )}

        {/* Error Notice */}
        {errorKey && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-medium"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{t(errorKey, 'Authentication error occurred. Please try again.')}</span>
          </div>
        )}

        {/* Forgot Password Confirmation */}
        {resetSent && mode === 'forgot-password' ? (
          <div className="space-y-4 text-center py-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                {t('auth.resetEmailSent', 'Password reset link sent!')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('auth.forgotPasswordDesc', 'Check your email inbox for instructions to reset your password.')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setResetSent(false);
                setMode('login');
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-[#ff6a00] hover:bg-[#e65f00] text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
            >
              {t('auth.backToLogin', 'Back to Sign In')}
            </button>
          </div>
        ) : (
          <>
            {/* Google Sign-In */}
            {mode !== 'forgot-password' && (
              <>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-semibold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-60"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>{t('auth.googleSignIn', 'Continue with Google')}</span>
                </button>

                <div className="relative flex items-center justify-center my-3">
                  <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
                  <span className="bg-white dark:bg-slate-900 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">
                    {t('auth.or', 'or')}
                  </span>
                </div>
              </>
            )}

            {/* Email/Password Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label
                    htmlFor="login-page-name"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    {t('auth.name', 'Full Name')}
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      id="login-page-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. John Doe"
                      autoComplete="name"
                      className="w-full pl-10 pr-4 py-2.5 text-xs rounded-2xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30 focus:border-[#ff6a00] text-slate-900 dark:text-white transition-colors"
                    />
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="login-page-email"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  {t('auth.email', 'Email Address')}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    id="login-page-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    autoComplete="email"
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-2xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30 focus:border-[#ff6a00] text-slate-900 dark:text-white transition-colors"
                  />
                </div>
              </div>

              {mode !== 'forgot-password' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="login-page-password"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      {t('auth.password', 'Password')}
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setErrorKey(null);
                          setMode('forgot-password');
                        }}
                        className="text-[11px] font-semibold text-[#ff6a00] hover:underline cursor-pointer"
                      >
                        {t('auth.forgotPassword', 'Forgot Password?')}
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      id="login-page-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      className="w-full pl-10 pr-10 py-2.5 text-xs rounded-2xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30 focus:border-[#ff6a00] text-slate-900 dark:text-white transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? t('auth.hidePassword', 'Hide password') : t('auth.showPassword', 'Show password')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {mode === 'register' && (
                <div>
                  <label
                    htmlFor="login-page-confirm-password"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    {t('auth.confirmPassword', 'Confirm Password')}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      id="login-page-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="w-full pl-10 pr-10 py-2.5 text-xs rounded-2xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30 focus:border-[#ff6a00] text-slate-900 dark:text-white transition-colors"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-3 px-4 rounded-2xl bg-[#ff6a00] hover:bg-[#e65f00] text-white font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('common.apply', 'Processing...')}</span>
                  </>
                ) : (
                  <span>
                    {mode === 'login' && t('auth.login', 'Sign In')}
                    {mode === 'register' && t('auth.register', 'Create Account')}
                    {mode === 'forgot-password' && t('auth.sendResetLink', 'Send Reset Link')}
                  </span>
                )}
              </button>
            </form>

            {mode === 'forgot-password' && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrorKey(null);
                    setMode('login');
                  }}
                  className="inline-flex items-center gap-1 font-bold text-xs text-[#ff6a00] hover:underline cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{t('auth.backToLogin', 'Back to Sign In')}</span>
                </button>
              </div>
            )}

            <p className="text-[11px] text-center text-slate-400 dark:text-slate-500 leading-tight pt-2">
              {t('auth.termsNotice', 'By continuing, you agree to Apaibay Terms of Service and Privacy Policy.')}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

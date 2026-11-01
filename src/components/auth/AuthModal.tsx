import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Shield,
} from 'lucide-react';
import { useAuth, AuthModalMode } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { getAuthErrorMessageKey } from '../../services/firebase/authErrors';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: AuthModalMode;
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login',
  onSuccess,
}) => {
  const { t } = useLanguage();
  const {
    loginWithEmail,
    registerWithEmail,
    sendPasswordReset,
    signInWithGoogle,
  } = useAuth();

  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  // Sync mode when initialMode changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setErrorKey(null);
      setResetSent(false);
      setPassword('');
      setConfirmPassword('');
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  };

  const handleGoogleSignIn = async () => {
    setErrorKey(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      onSuccess?.();
      onClose();
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        const key = getAuthErrorMessageKey(err?.code || err?.message || '');
        setErrorKey(key);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorKey(null);

    // Client-side validation
    if (!validateEmail(email)) {
      setErrorKey('auth.errorInvalidEmail');
      return;
    }

    if (mode === 'forgot-password') {
      setLoading(true);
      try {
        await sendPasswordReset(email.trim());
        setResetSent(true);
      } catch (err: any) {
        const key = getAuthErrorMessageKey(err?.code || err?.message || '');
        setErrorKey(key);
      } finally {
        setLoading(false);
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

      setLoading(true);
      try {
        await registerWithEmail(email.trim(), password, name.trim());
        onSuccess?.();
        onClose();
      } catch (err: any) {
        const key = getAuthErrorMessageKey(err?.code || err?.message || '');
        setErrorKey(key);
      } finally {
        setLoading(false);
      }
    } else {
      // Login mode
      setLoading(true);
      try {
        await loginWithEmail(email.trim(), password);
        onSuccess?.();
        onClose();
      } catch (err: any) {
        const key = getAuthErrorMessageKey(err?.code || err?.message || '');
        setErrorKey(key);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl max-w-md w-full shadow-2xl overflow-hidden relative my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/50 flex items-center justify-center text-[#ff6a00]">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="auth-modal-title"
                className="text-base sm:text-lg font-black text-slate-900 dark:text-white"
              >
                {mode === 'login' && t('auth.login', 'Sign In')}
                {mode === 'register' && t('auth.register', 'Create Account')}
                {mode === 'forgot-password' && t('auth.forgotPasswordTitle', 'Recover Password')}
              </h2>
              <p className="text-xs text-slate-400">
                {mode === 'login' && t('auth.welcomeBack', 'Welcome back to apaibay')}
                {mode === 'register' && t('auth.createAccountTitle', 'Join the global marketplace')}
                {mode === 'forgot-password' && t('auth.forgotPassword', 'Forgot Password?')}
              </p>
            </div>
          </div>
          <button
            id="auth-modal-close-btn"
            onClick={onClose}
            aria-label={t('common.close', 'Close')}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* Error Banner */}
          {errorKey && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-medium"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{t(errorKey, 'Authentication error occurred. Please try again.')}</span>
            </div>
          )}

          {/* Reset Sent Success Notice */}
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
              {/* Google Sign-In Button (for Login & Register) */}
              {mode !== 'forgot-password' && (
                <>
                  <button
                    id="auth-google-btn"
                    type="button"
                    disabled={loading}
                    onClick={handleGoogleSignIn}
                    className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-semibold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-60"
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
              <form onSubmit={handleSubmit} className="space-y-3.5">
                {/* Full Name field (Register only) */}
                {mode === 'register' && (
                  <div>
                    <label
                      htmlFor="auth-name-input"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                    >
                      {t('auth.name', 'Full Name')}
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        id="auth-name-input"
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. John Doe"
                        autoComplete="name"
                        className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30 focus:border-[#ff6a00] text-slate-900 dark:text-white transition-colors"
                      />
                    </div>
                  </div>
                )}

                {/* Email address field */}
                <div>
                  <label
                    htmlFor="auth-email-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    {t('auth.email', 'Email Address')}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      id="auth-email-input"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      autoComplete="email"
                      className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30 focus:border-[#ff6a00] text-slate-900 dark:text-white transition-colors"
                    />
                  </div>
                </div>

                {/* Password field (Login & Register) */}
                {mode !== 'forgot-password' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor="auth-password-input"
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
                        id="auth-password-input"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        className="w-full pl-10 pr-10 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30 focus:border-[#ff6a00] text-slate-900 dark:text-white transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? t('auth.hidePassword', 'Hide password') : t('auth.showPassword', 'Show password')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Confirm Password field (Register only) */}
                {mode === 'register' && (
                  <div>
                    <label
                      htmlFor="auth-confirm-password-input"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                    >
                      {t('auth.confirmPassword', 'Confirm Password')}
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        id="auth-confirm-password-input"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className="w-full pl-10 pr-10 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30 focus:border-[#ff6a00] text-slate-900 dark:text-white transition-colors"
                      />
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  id="auth-submit-btn"
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-2.5 px-4 rounded-xl bg-[#ff6a00] hover:bg-[#e65f00] text-white font-bold text-xs shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {loading ? (
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

              {/* Mode Toggle Footer */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
                {mode === 'login' && (
                  <p>
                    {t('auth.noAccount', "Don't have an account?")}{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setErrorKey(null);
                        setMode('register');
                      }}
                      className="font-bold text-[#ff6a00] hover:underline cursor-pointer"
                    >
                      {t('auth.register', 'Create Account')}
                    </button>
                  </p>
                )}
                {mode === 'register' && (
                  <p>
                    {t('auth.haveAccount', 'Already have an account?')}{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setErrorKey(null);
                        setMode('login');
                      }}
                      className="font-bold text-[#ff6a00] hover:underline cursor-pointer"
                    >
                      {t('auth.login', 'Sign In')}
                    </button>
                  </p>
                )}
                {mode === 'forgot-password' && (
                  <button
                    type="button"
                    onClick={() => {
                      setErrorKey(null);
                      setMode('login');
                    }}
                    className="inline-flex items-center gap-1 font-bold text-[#ff6a00] hover:underline cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>{t('auth.backToLogin', 'Back to Sign In')}</span>
                  </button>
                )}
              </div>

              {/* Terms notice */}
              <p className="text-[10px] text-center text-slate-400 dark:text-slate-500 leading-tight">
                {t('auth.termsNotice', 'By continuing, you agree to Apaibay Terms of Service and Privacy Policy.')}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

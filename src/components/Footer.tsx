import React, { useState } from 'react';
import {
  Mail,
  Send,
  Check,
  ShieldCheck,
  Globe,
  Phone
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface FooterProps {
  onSelectCategory?: (category: string) => void;
  onOpenSellerCenter: () => void;
  onOpenAdmin: () => void;
  onOpenOrders: () => void;
}

// ---------------------------------------------------------------------------
// Authentic Payment Brand Vectors
// ---------------------------------------------------------------------------

const AbaPayLogo: React.FC<{ className?: string }> = ({ className = 'h-5 w-auto' }) => (
  <svg viewBox="0 0 110 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="ABA PAY">
    <rect width="110" height="32" rx="6" fill="#003B5C" />
    <text x="14" y="22" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="17" letterSpacing="0.5">ABA</text>
    <rect x="62" y="6" width="38" height="20" rx="4" fill="#00A3E0" />
    <text x="67" y="21" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="13" letterSpacing="0.5">PAY</text>
  </svg>
);

const KhqrLogo: React.FC<{ className?: string }> = ({ className = 'h-5 w-auto' }) => (
  <svg viewBox="0 0 95 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="KHQR">
    <rect width="95" height="32" rx="6" fill="#E11922" />
    <rect x="8" y="7" width="16" height="16" rx="2" fill="none" stroke="#FFFFFF" strokeWidth="2.5" />
    <rect x="12" y="11" width="8" height="8" rx="1" fill="#FFFFFF" />
    <text x="30" y="22" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="15" letterSpacing="0.5">KHQR</text>
  </svg>
);

const MastercardLogo: React.FC<{ className?: string }> = ({ className = 'h-6 w-auto' }) => (
  <svg viewBox="0 0 54 34" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Mastercard">
    <circle cx="18" cy="17" r="14" fill="#EB001B" />
    <circle cx="36" cy="17" r="14" fill="#F79E1B" />
    <path d="M27 6.4a13.9 13.9 0 0 1 0 21.2 13.9 13.9 0 0 1 0-21.2Z" fill="#FF5F00" />
  </svg>
);

const VisaLogo: React.FC<{ className?: string }> = ({ className = 'h-6 w-auto' }) => (
  <svg viewBox="0 7 24 10" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="VISA">
    <path
      d="M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z"
      className="fill-[#1A1F71] dark:fill-white"
    />
  </svg>
);

const WingLogo: React.FC<{ className?: string }> = ({ className = 'h-5 w-auto' }) => (
  <svg viewBox="0 0 92 30" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Wing">
    <rect width="92" height="30" rx="6" fill="#F4FBF0" />
    <circle cx="15" cy="15" r="10" fill="#8DC63F" />
    <path d="M11 18c0-3.5 2.5-6.5 7-7.5-2.5 2.5-3 4.5-2.5 6.5-1.5 0.5-3 1.5-4.5 1z" fill="#FFFFFF" />
    <text x="32" y="20.5" fill="#0C2340" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="16" letterSpacing="-0.3">Wing</text>
  </svg>
);

const WingBankLogo: React.FC<{ className?: string }> = ({ className = 'h-5 w-auto' }) => (
  <svg viewBox="0 0 116 30" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Wing Bank">
    <rect width="116" height="30" rx="6" fill="#F4FBF0" />
    <circle cx="15" cy="15" r="10" fill="#8DC63F" />
    <path d="M11 18c0-3.5 2.5-6.5 7-7.5-2.5 2.5-3 4.5-2.5 6.5-1.5 0.5-3 1.5-4.5 1z" fill="#FFFFFF" />
    <text x="31" y="20.5" fill="#0C2340" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="14" letterSpacing="-0.3">Wing</text>
    <text x="70" y="20.5" fill="#8DC63F" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="13">Bank</text>
  </svg>
);

// ---------------------------------------------------------------------------
// Official GitChat Android App Brand Icon
// ---------------------------------------------------------------------------

const GitChatAppIcon: React.FC<{ className?: string }> = ({ className = 'w-11 h-11' }) => (
  <svg viewBox="0 0 44 44" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="GitChat">
    {/* Green App Icon Background */}
    <rect width="44" height="44" rx="11" fill="#10B981" />
    
    {/* White Chat Bubble */}
    <path
      d="M10 21.5C10 15.7 14.7 11 20.5 11h3c5.8 0 10.5 4.7 10.5 10.5S29.3 32 23.5 32H18l-5.5 3.5c-.7.4-1.5-.1-1.5-.9V28.5C10.4 26.6 10 24.1 10 21.5z"
      fill="#FFFFFF"
    />
    
    {/* Green Connected-Node Symbol (Git Branch Graph) */}
    <line x1="17.5" y1="17" x2="17.5" y2="26" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />
    <path d="M17.5 24.5C17.5 21 21 19 24.5 19" stroke="#10B981" strokeWidth="2" strokeLinecap="round" fill="none" />
    
    {/* Top node (green) */}
    <circle cx="17.5" cy="17" r="2.5" fill="#10B981" />
    {/* Bottom node (green) */}
    <circle cx="17.5" cy="26" r="2.5" fill="#10B981" />
    
    {/* Branch node with Orange Center Dot */}
    <circle cx="25" cy="19" r="3" fill="#10B981" />
    <circle cx="25" cy="19" r="1.5" fill="#FF6A00" />
  </svg>
);

// ---------------------------------------------------------------------------
// Footer Component
// ---------------------------------------------------------------------------

export const Footer: React.FC<FooterProps> = ({
  onOpenSellerCenter,
  onOpenAdmin,
  onOpenOrders,
}) => {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setIsSubscribed(true);
      setEmail('');
      setTimeout(() => setIsSubscribed(false), 4000);
    }
  };

  return (
    <footer className="bg-white dark:bg-[#05070b] text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-800 pt-12 pb-20 lg:pb-8 text-xs transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 space-y-12">
        {/* Top Newsletter banner */}
        <div className="bg-slate-50 dark:bg-[#0b1220] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col lg:flex-row items-center justify-between gap-6 shadow-xs">
          <div className="max-w-md text-center lg:text-left">
            <span className="text-[#ff6a00] font-bold text-xs uppercase tracking-wider block mb-1">
              {t('footer.stayInLoop', 'Stay in the Loop')}
            </span>
            <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
              {t('footer.promoHeadline', 'Get $20 Off Your First Global Order')}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
              {t('footer.promoSub', 'Subscribe for flash sale drops, VIP seasonal codes, and seller releases.')}
            </p>
          </div>

          {/* Subscribe form */}
          <form onSubmit={handleSubscribe} className="w-full lg:w-auto flex-1 max-w-md">
            <div className="flex items-center rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus-within:border-[#ff6a00] p-1 transition-colors">
              <Mail className="w-4 h-4 text-slate-400 ml-3 shrink-0" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('footer.emailPlaceholder', 'Enter your business or personal email')}
                className="w-full bg-transparent px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden"
              />
              <button
                type="submit"
                className="bg-[#ff6a00] hover:bg-[#e65f00] text-white px-4 py-2 rounded-lg font-bold text-xs transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                {isSubscribed ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{t('footer.joined', 'Joined!')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('footer.subscribe', 'Subscribe')}</span>
                    <Send className="w-3 h-3" />
                  </>
                )}
              </button>
            </div>
            {isSubscribed && (
              <span className="text-emerald-500 text-[11px] mt-1.5 block">
                {t('footer.welcomeCode', '✓ Check your inbox for your $20 welcome code!')}
              </span>
            )}
          </form>
        </div>

        {/* Main 3-Column Content Layout matching Reference Screenshot */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
          {/* LEFT COLUMN: APAIBAY BRAND */}
          <div className="space-y-4">
            <div className="flex flex-col select-none">
              <div className="flex items-center tracking-tight">
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  apai<span className="text-[#ff6a00]">bay</span>
                </span>
                <span className="w-2 h-2 rounded-full bg-[#ff6a00] ml-1 mb-1.5 sm:mb-2"></span>
              </div>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest -mt-0.5">
                {t('footer.taglineSub', 'Your Global Marketplace')}
              </span>
            </div>

            <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed max-w-sm">
              {t(
                'footer.descExact',
                'Your premier global marketplace connecting shoppers with verified merchants and authentic brands worldwide.'
              )}
            </p>

            {/* Business Information */}
            <div className="flex flex-col gap-2.5 text-xs text-slate-600 dark:text-slate-400 pt-1">
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-[#ff6a00] shrink-0" />
                <span>
                  <strong className="text-slate-800 dark:text-slate-200 font-semibold">
                    {t('footer.chinaOperationsLabel', 'China Operations')}:
                  </strong>{' '}
                  {t('footer.chinaOperationsVal', 'China')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-[#ff6a00] shrink-0" />
                <span>
                  <strong className="text-slate-800 dark:text-slate-200 font-semibold">
                    {t('footer.supplierNetworkLabel', 'Supplier Network')}:
                  </strong>{' '}
                  {t('footer.supplierNetworkVal', 'China & Global Markets')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-[#ff6a00] shrink-0" />
                <span>
                  <strong className="text-slate-800 dark:text-slate-200 font-semibold">
                    {t('footer.customerSupportLabel', 'Customer Support')}:
                  </strong>{' '}
                  <a
                    href="tel:+855762235113"
                    className="hover:text-[#ff6a00] text-slate-700 dark:text-slate-300 transition-colors font-medium hover:underline"
                  >
                    +855 76 223 5113
                  </a>
                </span>
              </div>
            </div>
          </div>

          {/* MIDDLE COLUMN: ABOUT US & SELL ON APAIBAY */}
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-6 sm:gap-8">
            {/* ABOUT US */}
            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                {t('footer.aboutUs', 'About Us')}
              </h4>
              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <li>
                  <a href="#about" className="hover:text-[#ff6a00] transition-colors">
                    {t('footer.companyStory', 'Company Story')}
                  </a>
                </li>
                <li>
                  <a href="#leadership" className="hover:text-[#ff6a00] transition-colors">
                    {t('footer.leadership', 'Leadership & Team')}
                  </a>
                </li>
                <li>
                  <a href="#careers" className="hover:text-[#ff6a00] transition-colors">
                    {t('footer.careers', 'Careers & Culture')}
                  </a>
                </li>
                <li>
                  <a href="#press" className="hover:text-[#ff6a00] transition-colors">
                    {t('footer.press', 'Press Releases')}
                  </a>
                </li>
                <li>
                  <a href="#sustainability" className="hover:text-[#ff6a00] transition-colors">
                    {t('footer.sustainability', 'Eco Sustainability')}
                  </a>
                </li>
              </ul>
            </div>

            {/* SELL ON APAIBAY */}
            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                {t('footer.sellOnApaibayTitle', 'Sell on Apaibay')}
              </h4>
              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <li>
                  <button
                    onClick={onOpenSellerCenter}
                    className="hover:text-[#ff6a00] transition-colors cursor-pointer text-left font-semibold text-slate-800 dark:text-slate-200"
                  >
                    {t('footer.sellOnApaibay', 'Sell on Apaibay')}
                  </button>
                </li>
                <li>
                  <button
                    onClick={onOpenSellerCenter}
                    className="hover:text-[#ff6a00] transition-colors cursor-pointer text-left"
                  >
                    {t('footer.sellerDashboard', 'Seller Dashboard')}
                  </button>
                </li>
                <li>
                  <a href="#logistics" className="hover:text-[#ff6a00] transition-colors">
                    {t('footer.fulfillment', 'Apaibay Fulfillment')}
                  </a>
                </li>
                <li>
                  <a href="#advertising" className="hover:text-[#ff6a00] transition-colors">
                    {t('footer.merchantAds', 'Merchant Ads & Promo')}
                  </a>
                </li>
                <li>
                  <button
                    onClick={onOpenAdmin}
                    className="hover:text-[#ff6a00] transition-colors cursor-pointer text-left"
                  >
                    {t('footer.adminConsole', 'Admin Console')}
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* RIGHT COLUMN: HELP CENTER */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
              {t('footer.helpCenter', 'Help Center')}
            </h4>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <button
                  onClick={onOpenOrders}
                  className="hover:text-[#ff6a00] transition-colors cursor-pointer text-left"
                >
                  {t('footer.trackPackage', 'Track Your Package')}
                </button>
              </li>
              <li>
                <a href="#shipping" className="hover:text-[#ff6a00] transition-colors">
                  {t('footer.shippingRates', 'Shipping Rates & Times')}
                </a>
              </li>
              <li>
                <a href="#returns" className="hover:text-[#ff6a00] transition-colors">
                  {t('footer.returnsPolicy', '30-Day Returns Policy')}
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-[#ff6a00] transition-colors">
                  {t('footer.helpCenter', 'Help Center')}
                </a>
              </li>
              <li>
                <a href="#dispute" className="hover:text-[#ff6a00] transition-colors">
                  {t('footer.dispute', 'Dispute Resolution')}
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Payment Methods & GitChat Section */}
        <div className="pt-8 border-t border-slate-200 dark:border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              {t('footer.paymentMethods', 'Supported Payment Methods')}
            </span>
          </div>

          {/* 6 Supported Payment Methods in One Horizontal Row on Desktop */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            {/* 1. ABA PAY */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 sm:p-3 h-12 flex items-center justify-center shadow-xs transition-shadow hover:border-slate-300 dark:hover:border-slate-700">
              <AbaPayLogo className="h-6 w-auto" />
            </div>

            {/* 2. KHQR */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 sm:p-3 h-12 flex items-center justify-center shadow-xs transition-shadow hover:border-slate-300 dark:hover:border-slate-700">
              <KhqrLogo className="h-6 w-auto" />
            </div>

            {/* 3. Mastercard */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 sm:p-3 h-12 flex items-center justify-center shadow-xs transition-shadow hover:border-slate-300 dark:hover:border-slate-700">
              <MastercardLogo className="h-7 w-auto" />
            </div>

            {/* 4. VISA */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 sm:p-3 h-12 flex items-center justify-center shadow-xs transition-shadow hover:border-slate-300 dark:hover:border-slate-700">
              <VisaLogo className="h-6 w-auto" />
            </div>

            {/* 5. Wing */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 sm:p-3 h-12 flex items-center justify-center shadow-xs transition-shadow hover:border-slate-300 dark:hover:border-slate-700">
              <WingLogo className="h-6 w-auto" />
            </div>

            {/* 6. Wing Bank */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 sm:p-3 h-12 flex items-center justify-center shadow-xs transition-shadow hover:border-slate-300 dark:hover:border-slate-700">
              <WingBankLogo className="h-6 w-auto" />
            </div>
          </div>

          {/* GitChat Android App - Separate Row Directly Below ABA PAY Position */}
          <div className="pt-2 flex justify-start">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-3.5 shadow-xs flex items-center justify-between gap-3 w-full max-w-[280px] sm:max-w-[310px] transition-all hover:border-[#10b981]/40">
              <div className="flex items-center gap-3">
                <GitChatAppIcon className="w-10 h-10 shrink-0" />
                <div className="leading-tight">
                  <div className="font-extrabold text-sm sm:text-base flex items-center tracking-tight">
                    <span className="text-[#059669] dark:text-[#10b981]">Git</span>
                    <span className="text-slate-900 dark:text-white">Chat</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    {t('footer.gitchatSubtitle', 'Android Application')}
                  </div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 whitespace-nowrap">
                {t('footer.comingSoon', 'Coming Soon')}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Strip: Copyright & Legal */}
        <div className="pt-6 border-t border-slate-200 dark:border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-slate-500 dark:text-slate-400 text-[11px] text-center md:text-left font-medium">
            {t('footer.allRightsExact', '© 2026 apaibay Marketplace Premium. All rights reserved.')}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-slate-500 dark:text-slate-400 text-[11px]">
            <a href="#global-shopping" className="hover:text-[#ff6a00] transition-colors">
              {t('footer.globalShopping', 'Global Online Shopping')}
            </a>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <a href="#terms" className="hover:text-[#ff6a00] transition-colors">
              {t('footer.termsOfService', 'Terms of Service')}
            </a>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <a href="#privacy" className="hover:text-[#ff6a00] transition-colors">
              {t('footer.privacyPolicy', 'Privacy Policy')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

import React, { useState } from 'react';
import {
  Mail,
  Send,
  Check,
  ShieldCheck,
  Globe,
  Smartphone,
  CreditCard,
  Headphones,
  MapPin,
  Phone,
  ArrowRight
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface FooterProps {
  onSelectCategory: (category: string) => void;
  onOpenSellerCenter: () => void;
  onOpenAdmin: () => void;
  onOpenOrders: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onSelectCategory,
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
    <footer className="bg-slate-50 dark:bg-[#05070b] text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-800 pt-12 pb-8 text-xs transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 space-y-12">
        {/* Top Newsletter & Perks banner inside footer */}
        <div className="bg-white dark:bg-[#0b1220] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col lg:flex-row items-center justify-between gap-6 shadow-xs">
          <div className="max-w-md text-center lg:text-left">
            <span className="text-[#ff6a00] font-bold text-xs uppercase tracking-wider block mb-1">
              {t('footer.newsletterSubtitle', 'Stay in the Loop')}
            </span>
            <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
              {t('footer.newsletterTitle', 'Get $20 Off Your First Global Order')}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
              {t('footer.newsletterDesc', 'Subscribe for flash sale drops, VIP seasonal codes, and seller releases.')}
            </p>
          </div>

          {/* Subscribe form */}
          <form onSubmit={handleSubscribe} className="w-full lg:w-auto flex-1 max-w-md">
            <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus-within:border-[#ff6a00] p-1 transition-colors">
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
                    <span>{t('footer.subscribed', 'Joined!')}</span>
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
              <span className="text-emerald-400 text-[11px] mt-1.5 block">
                ✓ Check your inbox for your $20 welcome code!
              </span>
            )}
          </form>
        </div>

        {/* Main Footer Multi-Column Links */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
          {/* Col 1: Brand info */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center">
              <span className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                apai<span className="text-[#ff6a00]">bay</span>
              </span>
              <span className="w-2 h-2 rounded-full bg-[#ff6a00] ml-1 mb-1.5"></span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed max-w-sm">
              {t('footer.tagline', 'Your premier global marketplace connecting discerning shoppers with verified merchants and authentic brands worldwide.')}
            </p>
            <div className="flex flex-col gap-2 text-xs text-slate-600 dark:text-slate-400 pt-1">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#ff6a00]" />
                <span>Global HQ: 42 Kensington High St, London SW1A</span>
              </div>
              <div className="flex items-center gap-2">
                <Headphones className="w-3.5 h-3.5 text-[#ff6a00]" />
                <span>24/7 International: +44 20 7946 0912</span>
              </div>
            </div>
          </div>

          {/* Col 2: About Us */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
              {t('footer.aboutUs', 'About Us')}
            </h4>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <a href="#about" className="hover:text-[#ff6a00] transition-colors">
                  {t('footer.aboutApaibay', 'Company Story')}
                </a>
              </li>
              <li>
                <a href="#leadership" className="hover:text-[#ff6a00] transition-colors">
                  Leadership & Team
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

          {/* Col 3: Customer Care & Help Center */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
              {t('footer.customerService', 'Help Center')}
            </h4>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <button onClick={onOpenOrders} className="hover:text-[#ff6a00] transition-colors cursor-pointer text-left">
                  {t('footer.trackOrder', 'Track Your Package')}
                </button>
              </li>
              <li>
                <a href="#shipping" className="hover:text-[#ff6a00] transition-colors">
                  {t('footer.shippingPolicy', 'Shipping Rates & Times')}
                </a>
              </li>
              <li>
                <a href="#returns" className="hover:text-[#ff6a00] transition-colors">
                  {t('footer.returnsRefunds', '30-Day Returns Policy')}
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-[#ff6a00] transition-colors">
                  {t('footer.helpCenter', 'FAQ & Support Desk')}
                </a>
              </li>
              <li>
                <a href="#dispute" className="hover:text-[#ff6a00] transition-colors">
                  {t('footer.buyerProtection', 'Dispute Resolution')}
                </a>
              </li>
            </ul>
          </div>

          {/* Col 4: Seller & Business */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
              {t('footer.sellOnApaibay', 'Seller Center')}
            </h4>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <button onClick={onOpenSellerCenter} className="hover:text-[#ff6a00] transition-colors cursor-pointer text-left font-semibold text-slate-800 dark:text-slate-200">
                  {t('footer.sellOnApaibay', 'Sell on Apaibay')}
                </button>
              </li>
              <li>
                <button onClick={onOpenSellerCenter} className="hover:text-[#ff6a00] transition-colors cursor-pointer text-left">
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
                  {t('footer.affiliates', 'Merchant Ads & Promo')}
                </a>
              </li>
              <li>
                <button onClick={onOpenAdmin} className="hover:text-[#ff6a00] transition-colors cursor-pointer text-left">
                  {t('header.adminConsole', 'Platform Admin')}
                </button>
              </li>
            </ul>
          </div>

          {/* Col 5: Mobile App & Payment */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
              {t('footer.mobileApp', 'Mobile App')}
            </h4>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              {t('footer.mobileAppDesc', 'Scan or download for live AR preview and instant push alerts.')}
            </p>
            <div className="space-y-2">
              <button className="w-full bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg p-2 flex items-center gap-2 text-left cursor-pointer transition-colors shadow-xs">
                <Smartphone className="w-4 h-4 text-[#ff6a00]" />
                <div className="leading-tight">
                  <div className="text-[9px] text-slate-500 dark:text-slate-400">{t('footer.appStore', 'Download on')}</div>
                  <div className="text-[11px] font-bold">App Store</div>
                </div>
              </button>
              <button className="w-full bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg p-2 flex items-center gap-2 text-left cursor-pointer transition-colors shadow-xs">
                <Smartphone className="w-4 h-4 text-emerald-500" />
                <div className="leading-tight">
                  <div className="text-[9px] text-slate-500 dark:text-slate-400">{t('footer.googlePlay', 'Get it on')}</div>
                  <div className="text-[11px] font-bold">Google Play</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Strip: Payment Methods, Legal & Social */}
        <div className="pt-8 border-t border-slate-200 dark:border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-[11px]">
            <span>{t('footer.allRights', '© 2026 apaibay Marketplace. All rights reserved.')}</span>
            <span>•</span>
            <a href="#privacy" className="hover:text-slate-800 dark:hover:text-slate-300">{t('footer.privacyPolicy', 'Privacy Policy')}</a>
            <span>•</span>
            <a href="#terms" className="hover:text-slate-800 dark:hover:text-slate-300">{t('footer.termsOfService', 'Terms of Service')}</a>
            <span>•</span>
            <a href="#cookies" className="hover:text-slate-800 dark:hover:text-slate-300">{t('footer.cookiePreferences', 'Cookie Settings')}</a>
          </div>

          {/* Payment Badges */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 mr-1 hidden sm:inline">{t('footer.paymentMethods', 'Secure Checkout:')}</span>
            <div className="flex items-center gap-1.5">
              {['VISA', 'Mastercard', 'AMEX', 'PayPal', 'ApplePay', 'GooglePay'].map((method) => (
                <span
                  key={method}
                  className="px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[9px] font-mono font-bold rounded border border-slate-200 dark:border-slate-700 shadow-xs"
                >
                  {method}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};


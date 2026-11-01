import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Heart,
  ShoppingCart,
  User,
  Package,
  MapPin,
  Globe,
  ChevronDown,
  Moon,
  Sun,
  Store,
  ShieldCheck,
  Sparkles,
  X,
  Clock,
  ArrowRight,
  Menu,
  Camera,
  ScanLine
} from 'lucide-react';
import { UserProfile, CartItem } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  cart: CartItem[];
  wishlist: string[];
  user: UserProfile | null;
  onOpenCart: () => void;
  onOpenWishlist: () => void;
  onOpenOrders: () => void;
  onOpenAccount: () => void;
  onOpenSellerCenter: () => void;
  onOpenAdmin: () => void;
  onSelectCategory: (categoryId: string | null) => void;
  onSearch: (query: string) => void;
  searchQuery: string;
  onToggleMobileCategory: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenScanner?: () => void;
  onOpenVisualSearch?: () => void;
}

const SEARCH_SUGGESTIONS = [
  'ai-powered search',
  'ai-powered electronics',
  'ai-powered beauty',
  'ai-powered gaming',
  'ai-powered electrics',
  'wireless noise cancelling headphones',
  'autumn luxury trench coat',
  'smartwatch gps amoled'
];

const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'USD ($)' },
  { code: 'EUR', symbol: '€', label: 'EUR (€)' },
  { code: 'GBP', symbol: '£', label: 'GBP (£)' },
  { code: 'JPY', symbol: '¥', label: 'JPY (¥)' },
  { code: 'CAD', symbol: '$', label: 'CAD ($)' },
];

export const Header: React.FC<HeaderProps> = ({
  cart,
  wishlist,
  user,
  onOpenCart,
  onOpenWishlist,
  onOpenOrders,
  onOpenAccount,
  onOpenSellerCenter,
  onOpenAdmin,
  onSelectCategory,
  onSearch,
  searchQuery,
  onToggleMobileCategory,
  isDarkMode,
  onToggleDarkMode,
  onOpenScanner,
  onOpenVisualSearch,
}) => {
  const { t, language, setLanguage, languages, currentLanguageInfo, tCategory } = useLanguage();
  const { user: authUser, logout, openAuthModal, isAdmin, isSeller } = useAuth();
  const currentUser = user || authUser;
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState(CURRENCIES[0]);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showCurrencyMenu, setShowCurrencyMenu] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [deliveryLocation, setDeliveryLocation] = useState('London SW1A');
  const [tempLocation, setTempLocation] = useState(deliveryLocation);


  const searchRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  const cartTotalCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const cartTotalPrice = cart.reduce(
    (acc, item) => acc + item.product.price * item.quantity,
    0
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setShowAccountMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSuggestionClick = (text: string) => {
    onSearch(text);
    setIsSearchFocused(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors shadow-xs">
      {/* Top micro announcement bar */}
      <div className="bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800/80 text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 py-1 px-3 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <span className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5 truncate text-[11px] sm:text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff6a00] animate-pulse shrink-0"></span>
              <span className="truncate">Enterprise-level ecommerce platform</span>
            </span>
            <span className="hidden md:inline text-slate-300 dark:text-slate-700">|</span>
            <span className="hidden md:inline hover:text-[#ff6a00] cursor-pointer transition-colors" onClick={() => onSelectCategory('electronics')}>
              Autumn Flash Sale live: Up to 70% Off
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Dark Mode toggle */}
            <button
              id="theme-toggle-btn"
              onClick={onToggleDarkMode}
              className="flex items-center gap-1.5 hover:text-[#ff6a00] transition-colors cursor-pointer text-slate-600 dark:text-slate-300"
              title="Toggle theme"
            >
              {isDarkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isDarkMode ? t('header.lightMode', 'Light mode') : t('header.darkMode', 'Dark mode')}</span>
            </button>

            {/* Language Selector - Supports all 8 languages */}
            <div className="relative">
              <button
                id="language-selector-btn"
                onClick={() => {
                  setShowLangMenu(!showLangMenu);
                  setShowCurrencyMenu(false);
                }}
                className="flex items-center gap-1.5 hover:text-[#ff6a00] cursor-pointer py-1 px-1.5 rounded transition-colors"
                title="Change language"
              >
                <span className="text-sm">{currentLanguageInfo.flag}</span>
                <span className="hidden sm:inline font-medium">{currentLanguageInfo.name}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>
              {showLangMenu && (
                <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl py-1 z-50">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      id={`lang-option-${lang.code}`}
                      onClick={() => {
                        setLanguage(lang.code);
                        setShowLangMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-orange-50 dark:hover:bg-slate-800 transition-colors ${
                        language === lang.code
                          ? 'text-[#ff6a00] font-semibold bg-orange-50/50 dark:bg-slate-800/80'
                          : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-sm">{lang.flag}</span>
                        <span>{lang.name}</span>
                      </span>
                      {language === lang.code && (
                        <span className="text-[#ff6a00] font-bold">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Currency Selector */}
            <div className="relative">
              <button
                id="currency-selector-btn"
                onClick={() => {
                  setShowCurrencyMenu(!showCurrencyMenu);
                  setShowLangMenu(false);
                }}
                className="flex items-center gap-1 hover:text-[#ff6a00] cursor-pointer"
              >
                <span>{selectedCurrency.code}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>
              {showCurrencyMenu && (
                <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl py-1 z-50">
                  {CURRENCIES.map((curr) => (
                    <button
                      key={curr.code}
                      onClick={() => {
                        setSelectedCurrency(curr);
                        setShowCurrencyMenu(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                    >
                      <span>{curr.label}</span>
                      {selectedCurrency.code === curr.code && (
                        <span className="text-[#ff6a00] font-bold">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Seller & Admin portal quick links */}
            <button
              id="header-seller-link"
              onClick={onOpenSellerCenter}
              className="hidden lg:flex items-center gap-1 hover:text-[#ff6a00] cursor-pointer"
            >
              <Store className="w-3 h-3 text-slate-400" />
              <span>{t('header.sellerDashboard', 'Seller Center')}</span>
            </button>
            {isAdmin && (
              <button
                id="header-admin-link"
                onClick={onOpenAdmin}
                className="hidden lg:flex items-center gap-1 hover:text-[#ff6a00] cursor-pointer text-amber-500 font-semibold"
              >
                <ShieldCheck className="w-3 h-3 text-amber-500" />
                <span>{t('header.adminConsole', 'Admin')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Brand & Search Row */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3.5">
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-y-2.5 sm:gap-6">
          {/* Logo & Mobile Menu */}
          <div className="flex items-center gap-2 sm:gap-3 order-1 shrink-0">
            <button
              id="mobile-category-toggle"
              onClick={onToggleMobileCategory}
              className="lg:hidden p-1.5 text-slate-600 dark:text-slate-300 hover:text-[#ff6a00] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              title="Categories"
            >
              <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <div
              id="brand-logo"
              onClick={() => {
                onSelectCategory(null);
                onSearch('');
              }}
              className="cursor-pointer group flex flex-col select-none"
            >
              <div className="flex items-center tracking-tight">
                <span className="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  apai<span className="text-[#ff6a00]">bay</span>
                </span>
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#ff6a00] ml-1 mb-1.5 sm:mb-2 group-hover:scale-125 transition-transform duration-300"></span>
              </div>
              <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest -mt-1 hidden sm:block">
                Your Global Marketplace
              </span>
            </div>
          </div>

          {/* Delivery Location badge */}
          <button
            id="delivery-location-btn"
            onClick={() => setShowLocationModal(true)}
            className="hidden xl:flex items-center gap-2 px-3 py-1.5 text-left rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700 order-2 shrink-0"
          >
            <MapPin className="w-4 h-4 text-[#ff6a00] shrink-0" />
            <div className="text-xs leading-tight">
              <div className="text-[10px] text-slate-500 dark:text-slate-400">{t('header.deliverTo', 'Deliver to')}</div>
              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span className="truncate max-w-[100px]">{deliveryLocation}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </div>
            </div>
          </button>

          {/* Large AI Search Bar - Full width on mobile row 2, center column on sm+ */}
          <div ref={searchRef} className="w-full sm:flex-1 sm:max-w-2xl relative order-3 sm:order-2">
            <div className="flex items-center relative rounded-full border border-slate-300 dark:border-slate-700 focus-within:border-[#ff6a00] focus-within:ring-2 focus-within:ring-[#ff6a00]/20 bg-slate-50 dark:bg-slate-800 transition-all">
              <div className="pl-3 sm:pl-4 text-slate-400 shrink-0">
                <Sparkles className="w-4 h-4 text-[#ff6a00]" />
              </div>
              <input
                id="main-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                placeholder={t('common.searchPlaceholder', 'Search 50M+ products, luxury brands & deals...')}
                className="w-full min-w-0 py-2 sm:py-2.5 pl-2 pr-1 text-xs sm:text-sm bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden"
              />
              {searchQuery && (
                <button
                  id="clear-search-btn"
                  onClick={() => onSearch('')}
                  className="p-1 mr-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Functional Camera & Scan Action Buttons */}
              <div className="flex items-center gap-0.5 sm:gap-1 mr-1 shrink-0">
                <button
                  type="button"
                  id="header-camera-search-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSearchFocused(false);
                    onOpenVisualSearch?.();
                  }}
                  className="p-1.5 sm:p-2 text-slate-500 hover:text-[#ff6a00] dark:text-slate-400 dark:hover:text-[#ff6a00] hover:bg-orange-50 dark:hover:bg-slate-700/50 rounded-full transition-colors cursor-pointer"
                  title={t('camera.title', 'Camera Search')}
                  aria-label={t('camera.title', 'Camera Search')}
                >
                  <Camera className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </button>
                <button
                  type="button"
                  id="header-barcode-scan-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSearchFocused(false);
                    onOpenScanner?.();
                  }}
                  className="p-1.5 sm:p-2 text-slate-500 hover:text-[#ff6a00] dark:text-slate-400 dark:hover:text-[#ff6a00] hover:bg-orange-50 dark:hover:bg-slate-700/50 rounded-full transition-colors cursor-pointer"
                  title={t('camera.scanTitle', 'Barcode & QR Scanner')}
                  aria-label={t('camera.scan', 'Scan')}
                >
                  <ScanLine className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </button>
              </div>

              <button
                id="search-submit-btn"
                onClick={() => setIsSearchFocused(false)}
                className="bg-[#ff6a00] hover:bg-[#e65f00] text-white p-2 sm:p-2.5 rounded-full mr-1 transition-colors cursor-pointer shrink-0 shadow-xs"
                title={t('common.search', 'Search')}
              >
                <Search className="w-4 h-4" />
              </button>
            </div>

            {/* Autocomplete Dropdown */}
            {isSearchFocused && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-2 z-50 overflow-hidden">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-[#ff6a00]" />
                    {t('header.trendingSearches', 'Trending searches')}
                  </span>
                  <span className="text-[10px] text-slate-400">Press enter to query</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {SEARCH_SUGGESTIONS.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSuggestionClick(item)}
                      className="w-full text-left px-4 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between group transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#ff6a00] transition-colors" />
                        <span>{item}</span>
                      </div>
                      <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-[#ff6a00] opacity-0 group-hover:opacity-100 transition-all" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Icons: Wishlist, Account, Orders, Cart */}
          <div className="flex items-center gap-1 sm:gap-2.5 shrink-0 order-2 sm:order-3">
            {/* Wishlist */}
            <button
              id="header-wishlist-btn"
              onClick={onOpenWishlist}
              className="relative p-2 sm:px-3 sm:py-2 text-slate-700 dark:text-slate-300 hover:text-[#ff6a00] rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1.5"
              title={t('header.wishlist', 'Wishlist')}
            >
              <Heart className="w-5 h-5" />
              <span className="hidden lg:inline text-xs font-medium">{t('header.wishlist', 'Wishlist')}</span>
              {wishlist.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#ff6a00] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {wishlist.length}
                </span>
              )}
            </button>

            {/* Orders Tracking */}
            <button
              id="header-orders-btn"
              onClick={onOpenOrders}
              className="hidden md:flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 text-slate-700 dark:text-slate-300 hover:text-[#ff6a00] rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title={t('header.orders', 'Orders & Tracking')}
            >
              <Package className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              <div className="text-left text-xs leading-tight">
                <div className="text-[10px] text-slate-400">{t('mobileNav.orders', 'Orders')}</div>
                <div className="font-semibold text-slate-800 dark:text-slate-200">{t('header.orders', 'Tracking')}</div>
              </div>
            </button>

            {/* Account dropdown */}
            <div ref={accountRef} className="relative">
              <button
                id="header-account-btn"
                onClick={() => setShowAccountMenu(!showAccountMenu)}
                className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 text-slate-700 dark:text-slate-300 hover:text-[#ff6a00] rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 ring-1 ring-slate-300 dark:ring-slate-600 flex items-center justify-center">
                  {(currentUser?.avatar?.trim() || currentUser?.photoURL?.trim()) ? (
                    <img src={currentUser.avatar || currentUser.photoURL || undefined} alt={currentUser.name || 'User'} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  )}
                </div>
                <div className="hidden xl:block text-left text-xs leading-tight">
                  <div className="text-[10px] text-slate-400">{currentUser ? currentUser.name.split(' ')[0] : t('auth.login', 'Sign In')}</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-0.5">
                    <span>{t('header.account', 'Account')}</span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </div>
                </div>
              </button>

              {/* Account Dropdown */}
              {showAccountMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-2 z-50">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {currentUser ? currentUser.name : 'Guest User'}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {currentUser ? currentUser.email : t('auth.welcomeBack', 'Welcome to apaibay')}
                    </p>
                    {currentUser && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[10px] font-semibold rounded-full">
                        ★ {currentUser.tier || 'Member'}
                      </span>
                    )}
                  </div>

                  <div className="py-1 text-xs text-slate-700 dark:text-slate-300">
                    <button
                      id="account-profile-menu-item"
                      onClick={() => {
                        setShowAccountMenu(false);
                        if (currentUser) {
                          onOpenAccount();
                        } else {
                          openAuthModal('login');
                        }
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer"
                    >
                      <span>{currentUser ? t('header.profile', 'Profile') : t('auth.login', 'Sign In')}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                    <button
                      id="account-orders-menu-item"
                      onClick={() => {
                        onOpenOrders();
                        setShowAccountMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer"
                    >
                      <span>{t('header.orders', 'Orders tracking')}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                    <button
                      id="account-seller-menu-item"
                      onClick={() => {
                        onOpenSellerCenter();
                        setShowAccountMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer"
                    >
                      <span>{t('header.sellerDashboard', 'Seller Center')}</span>
                      <Store className="w-3.5 h-3.5 text-[#ff6a00]" />
                    </button>
                    {isAdmin && (
                      <button
                        id="account-admin-menu-item"
                        onClick={() => {
                          onOpenAdmin();
                          setShowAccountMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer text-amber-600 dark:text-amber-400 font-semibold"
                      >
                        <span>{t('header.adminConsole', 'Admin Portal')}</span>
                        <ShieldCheck className="w-3.5 h-3.5 text-[#ff6a00]" />
                      </button>
                    )}
                    <button
                      id="account-theme-menu-item"
                      onClick={() => {
                        onToggleDarkMode();
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        {isDarkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-500" />}
                        <span>{isDarkMode ? t('header.lightMode', 'Light mode') : t('header.darkMode', 'Dark mode')}</span>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        {isDarkMode ? '🌙 Dark' : '☀️ Light'}
                      </span>
                    </button>
                  </div>

                  <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                    <button
                      id="account-signout-btn"
                      onClick={async () => {
                        setShowAccountMenu(false);
                        if (currentUser) {
                          await logout();
                        } else {
                          openAuthModal('login');
                        }
                      }}
                      className="w-full text-left px-4 py-2 text-xs font-semibold text-[#ff6a00] hover:bg-orange-50 dark:hover:bg-orange-950/30 cursor-pointer"
                    >
                      {currentUser ? t('auth.signOut', 'Sign Out') : t('auth.login', 'Sign In / Register')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Cart Button */}
            <button
              id="header-cart-btn"
              onClick={onOpenCart}
              className="relative flex items-center gap-2 bg-[#ff6a00] hover:bg-[#e65f00] text-white px-3 sm:px-4 py-2 rounded-full font-semibold text-xs sm:text-sm shadow-sm transition-all cursor-pointer"
              title={t('header.cart', 'Cart')}
            >
              <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">{t('header.cart', 'Cart')}</span>
              <span className="bg-white text-[#ff6a00] font-extrabold text-[11px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {cartTotalCount}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Subheader category quick row */}
      <div className="bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/80 px-4 sm:px-8 hidden md:block">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 py-2">
          <div className="flex items-center gap-6">
            <button
              id="nav-all-categories-btn"
              onClick={() => onSelectCategory(null)}
              className="flex items-center gap-1.5 text-slate-900 dark:text-white font-bold hover:text-[#ff6a00] cursor-pointer"
            >
              <Menu className="w-4 h-4 text-[#ff6a00]" />
              <span>{t('cat.all', 'All Categories')}</span>
            </button>
            <button onClick={() => onSelectCategory('fashion')} className="hover:text-[#ff6a00] transition-colors cursor-pointer">
              {t('cat.fashion', 'Fashion')}
            </button>
            <button onClick={() => onSelectCategory('electronics')} className="hover:text-[#ff6a00] transition-colors cursor-pointer">
              {t('cat.electronics', 'Electronics')}
            </button>
            <button onClick={() => onSelectCategory('modern-campaign')} className="hover:text-[#ff6a00] transition-colors cursor-pointer">
              {t('cat.modernCampaign', 'Modern & Campaign')}
            </button>
            <button onClick={() => onSelectCategory('beauty')} className="hover:text-[#ff6a00] transition-colors cursor-pointer">
              {t('cat.beauty', 'Beauty')}
            </button>
            <button onClick={() => onSelectCategory('home-kitchen')} className="hover:text-[#ff6a00] transition-colors cursor-pointer">
              {t('cat.homeKitchen', 'Home & Kitchen')}
            </button>
            <button onClick={() => onSelectCategory('sports')} className="hover:text-[#ff6a00] transition-colors cursor-pointer">
              {t('cat.sports', 'Sports')}
            </button>
            <button onClick={() => onSelectCategory('gaming')} className="hover:text-[#ff6a00] transition-colors cursor-pointer">
              {t('cat.gaming', 'Gaming')}
            </button>
          </div>

          <div className="flex items-center gap-5 text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1 text-[#ff6a00] font-semibold cursor-pointer" onClick={() => onSelectCategory('electronics')}>
              <Sparkles className="w-3.5 h-3.5" />
              {t('nav.flashSaleLive', 'Flash Sale Live')}
            </span>
            <span className="hover:text-[#ff6a00] cursor-pointer" onClick={onOpenOrders}>
              {t('nav.shippingTracking', 'Shipping & Order Tracking')}
            </span>
          </div>
        </div>
      </div>

      {/* Delivery Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#ff6a00]" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Choose Delivery Location
                </h3>
              </div>
              <button
                onClick={() => setShowLocationModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Delivery options and speeds may vary based on your postal code or city.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                  Postal Code or City
                </label>
                <input
                  type="text"
                  value={tempLocation}
                  onChange={(e) => setTempLocation(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-[#ff6a00]"
                  placeholder="e.g. London SW1A or New York 10001"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  onClick={() => setShowLocationModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  onClick={() => {
                    setDeliveryLocation(tempLocation || 'London SW1A');
                    setShowLocationModal(false);
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#ff6a00] hover:bg-[#e65f00] rounded-lg shadow-sm"
                >
                  {t('common.save', 'Save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

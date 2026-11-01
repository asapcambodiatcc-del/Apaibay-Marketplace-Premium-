import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { WishlistDrawer } from './components/WishlistDrawer';
import { CameraSearchModal } from './components/CameraSearchModal';
import { ScannerModal } from './components/ScannerModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { CategorySidebar } from './components/CategorySidebar';
import { Toast, ToastMessage } from './components/Toast';
import { NotFound } from './components/NotFound';

// Pages
import { HomePage } from './pages/HomePage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { CategoryPage } from './pages/CategoryPage';
import { SearchPage } from './pages/SearchPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrdersPage } from './pages/OrdersPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { AccountPage } from './pages/AccountPage';
import { SellerPage } from './pages/SellerPage';
import { AdminPage } from './pages/AdminPage';
import { LoginPage } from './pages/LoginPage';

// Auth Components
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AuthModal } from './components/auth/AuthModal';
import { AccountModal } from './components/AccountModal';

// Contexts
import { useProducts } from './context/ProductContext';
import { useCart } from './context/CartContext';
import { useWishlist } from './context/WishlistContext';
import { useAuth } from './context/AuthContext';
import { useLanguage } from './i18n/LanguageContext';
import { useTheme } from './theme/ThemeContext';

import { Product } from './types';
import { X, SlidersHorizontal } from 'lucide-react';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { isDarkMode, toggleTheme } = useTheme();

  const { products } = useProducts();
  const {
    cart,
    addToCart,
    updateQuantity,
    removeFromCart,
    cartCount,
  } = useCart();
  const { wishlist, toggleWishlist, isInWishlist } = useWishlist();
  const {
    user,
    isAuthModalOpen,
    authModalMode,
    openAuthModal,
    closeAuthModal,
    isAccountOpen,
    openAccount,
    closeAccount,
  } = useAuth();

  // Modals & Drawers state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showMobileCategories, setShowMobileCategories] = useState(false);

  // Toasts state
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Scroll to top on navigation change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  // Dark mode class sync
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const handleBuyNow = (
    product: Product,
    quantity: number = 1,
    selectedColor?: string,
    selectedSize?: string
  ) => {
    if (!product || !product.id) return;
    if (product.stock !== undefined && product.stock <= 0) {
      addToast('This product is currently out of stock.', 'error');
      return;
    }
    const maxStock = product.stock !== undefined && product.stock > 0 ? product.stock : 999;
    const safeQty = Math.max(1, Math.min(quantity, maxStock));
    addToCart(product, safeQty, selectedColor, selectedSize);
    setSelectedProduct(null);
    setIsCartOpen(false);
    navigate('/checkout');
  };

  const getActiveView = () => {
    if (location.pathname === '/') return 'home';
    if (location.pathname.startsWith('/orders')) return 'orders';
    if (location.pathname === '/cart') return 'cart';
    return 'other';
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-white dark:bg-[#05070b] text-slate-900 dark:text-slate-100 transition-colors flex flex-col font-sans pb-16 lg:pb-0">
      {/* Global Header */}
      <Header
        cart={cart}
        wishlist={wishlist}
        user={user}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenWishlist={() => setIsWishlistOpen(true)}
        onOpenOrders={() => navigate('/orders')}
        onOpenAccount={() => {
          if (user) {
            navigate('/account');
          } else {
            openAuthModal('login');
          }
        }}
        onOpenSellerCenter={() => navigate('/seller')}
        onOpenAdmin={() => navigate('/admin')}
        onSelectCategory={(cat) => navigate(cat ? `/category/${cat}` : '/')}
        onSearch={(q) => navigate(`/search?q=${encodeURIComponent(q)}`)}
        searchQuery=""
        onToggleMobileCategory={() => setShowMobileCategories(true)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleTheme}
        onOpenScanner={() => setIsScannerOpen(true)}
        onOpenVisualSearch={() => setIsCameraOpen(true)}
      />

      {/* Main Routed Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-5 overflow-x-hidden">
        <Routes>
          <Route
            path="/"
            element={
              <HomePage
                onShowToast={addToast}
                onOpenQuickview={(p) => setSelectedProduct(p)}
              />
            }
          />
          <Route
            path="/product/:slug"
            element={<ProductDetailPage onShowToast={addToast} />}
          />
          <Route
            path="/category/:slug"
            element={<CategoryPage onShowToast={addToast} />}
          />
          <Route
            path="/search"
            element={
              <SearchPage
                onShowToast={addToast}
                onOpenScanner={() => setIsScannerOpen(true)}
                onOpenVisualSearch={() => setIsCameraOpen(true)}
              />
            }
          />
          <Route path="/cart" element={<CartPage onShowToast={addToast} />} />
          <Route path="/checkout" element={<CheckoutPage onShowToast={addToast} />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route
            path="/orders/:orderId"
            element={<OrderDetailPage onShowToast={addToast} />}
          />
          <Route
            path="/account"
            element={
              <ProtectedRoute requiredRole="customer">
                <AccountPage onShowToast={addToast} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/seller"
            element={
              <ProtectedRoute requiredRole="seller">
                <SellerPage onShowToast={addToast} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminPage onShowToast={addToast} />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      {/* Global Footer */}
      <Footer
        onSelectCategory={(cat) => navigate(`/category/${cat}`)}
        onOpenSellerCenter={() => navigate('/seller')}
        onOpenAdmin={() => navigate('/admin')}
        onOpenOrders={() => navigate('/orders')}
      />

      {/* Sticky Mobile Bottom Navigation */}
      <MobileBottomNav
        cartCount={cartCount}
        wishlistCount={wishlist.length}
        activeView={getActiveView()}
        onGoHome={() => navigate('/')}
        onOpenCategories={() => setShowMobileCategories(true)}
        onOpenWishlist={() => setIsWishlistOpen(true)}
        onOpenOrders={() => navigate('/orders')}
        onOpenCart={() => setIsCartOpen(true)}
      />

      {/* Mobile Categories Slide-Over */}
      {showMobileCategories && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-start">
          <div className="w-4/5 max-w-xs bg-white dark:bg-slate-900 h-full p-4 overflow-y-auto shadow-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-[#ff6a00]" />
                  <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                    {t('sidebar.allCategories', 'Marketplace Categories')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMobileCategories(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <CategorySidebar
                selectedCategory={null}
                onSelectCategory={(cat) => {
                  setShowMobileCategories(false);
                  if (cat) navigate(`/category/${cat}`);
                }}
                className="w-full border-0 shadow-none p-0"
              />
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-center">
              <span className="text-xs text-slate-400">
                apaibay • {t('app.tagline', 'Your Global Marketplace')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Quickview Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={(p, qty, color, size) => {
          addToCart(p, qty, color, size);
          addToast(`Added "${p.name.slice(0, 22)}..." to cart`, 'success');
        }}
        onBuyNow={handleBuyNow}
        isWishlisted={selectedProduct ? isInWishlist(selectedProduct.id) : false}
        onToggleWishlist={(id) => {
          toggleWishlist(id);
          const inW = isInWishlist(id);
          addToast(inW ? 'Removed from wishlist' : 'Saved to wishlist', inW ? 'info' : 'success');
        }}
      />

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        onUpdateQuantity={updateQuantity}
        onRemoveItem={removeFromCart}
        onCheckout={() => {
          setIsCartOpen(false);
          navigate('/checkout');
        }}
      />

      {/* Wishlist Drawer */}
      <WishlistDrawer
        isOpen={isWishlistOpen}
        onClose={() => setIsWishlistOpen(false)}
        wishlistIds={wishlist}
        products={products}
        onRemoveFromWishlist={(id) => {
          toggleWishlist(id);
          addToast('Removed item from wishlist', 'info');
        }}
        onAddToCart={(p) => {
          addToCart(p, 1);
          addToast(`Added "${p.name.slice(0, 22)}..." to cart`, 'success');
        }}
        onSelectProduct={(p) => {
          setIsWishlistOpen(false);
          navigate(`/product/${p.slug}`);
        }}
      />

      {/* Visual Camera Search Modal */}
      <CameraSearchModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        products={products}
        onSearchResults={(query) => {
          setIsCameraOpen(false);
          navigate(`/search?q=${encodeURIComponent(query)}`);
          addToast(`Visual search results for "${query}"`, 'info');
        }}
        onToast={addToast}
      />

      {/* Barcode & QR Scanner Modal */}
      <ScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        products={products}
        onSelectProduct={(p) => {
          setIsScannerOpen(false);
          navigate(`/product/${p.slug}`);
        }}
        onSearchResults={(query) => {
          setIsScannerOpen(false);
          navigate(`/search?q=${encodeURIComponent(query)}`);
        }}
        onToast={addToast}
      />

      {/* Real Firebase Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={closeAuthModal}
        initialMode={authModalMode}
      />

      {/* Account Modal */}
      <AccountModal
        isOpen={isAccountOpen}
        onClose={closeAccount}
        onOpenAuth={(mode) => {
          closeAccount();
          openAuthModal(mode);
        }}
      />

      {/* Toast Notifications */}
      <Toast toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}

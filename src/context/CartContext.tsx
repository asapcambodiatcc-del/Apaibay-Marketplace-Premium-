import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { Product, CartItem } from '../types';
import { cartRepository } from '../repositories';
import { auth } from '../services/firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import {
  isFirestoreQuotaExhausted,
  subscribeToQuotaStatus,
} from '../services/firebase/quotaCircuitBreaker';

export type CartSyncStatus = 'synced' | 'saving' | 'offline_fallback';

export function areCartItemsEqual(a: CartItem[], b: CartItem[]): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  const getItemKey = (it: CartItem) =>
    `${it?.product?.id || ''}__${it?.selectedColor || ''}__${it?.selectedSize || ''}`;

  const sortedA = [...a].sort((x, y) => getItemKey(x).localeCompare(getItemKey(y)));
  const sortedB = [...b].sort((x, y) => getItemKey(x).localeCompare(getItemKey(y)));

  for (let i = 0; i < sortedA.length; i++) {
    const itemA = sortedA[i];
    const itemB = sortedB[i];
    if (getItemKey(itemA) !== getItemKey(itemB)) return false;
    if (itemA.quantity !== itemB.quantity) return false;
  }
  return true;
}

interface PromoValidationResult {
  success: boolean;
  message: string;
  discountPercentage: number;
}

interface CartContextType {
  cart: CartItem[];
  cartCount: number;
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  promoCode: string;
  appliedDiscountPercent: number;
  isCartOpen: boolean;
  syncStatus: CartSyncStatus;
  flushCart: () => Promise<void>;
  addToCart: (product: Product, quantity?: number, selectedColor?: string, selectedSize?: string) => void;
  removeFromCart: (productId: string, selectedColor?: string, selectedSize?: string) => void;
  updateQuantity: (productId: string, quantityOrDelta: number, selectedColor?: string, selectedSize?: string) => void;
  clearCart: () => void;
  applyPromo: (code: string) => PromoValidationResult;
  removePromo: () => void;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
}

const CART_STORAGE_KEY = 'apaibay_cart';
const FREE_SHIPPING_THRESHOLD = 50.0;
const STANDARD_SHIPPING_FEE = 4.99;

const PROMO_CODES: Record<string, number> = {
  APAIBAY10: 10,
  GLOBAL20: 20,
  VIPWELCOME: 15,
  SAVE5: 5,
};

const CartContext = createContext<CartContextType | undefined>(undefined);

// Helper to merge local guest cart with cloud cart without duplicates
export function mergeCarts(guestCart: CartItem[], cloudCart: CartItem[]): CartItem[] {
  const merged: CartItem[] = [...cloudCart];

  for (const guestItem of guestCart) {
    if (!guestItem?.product?.id) continue;
    const guestColor = guestItem.selectedColor || '';
    const guestSize = guestItem.selectedSize || '';

    const existingIndex = merged.findIndex(
      (item) =>
        item.product.id === guestItem.product.id &&
        (item.selectedColor || '') === guestColor &&
        (item.selectedSize || '') === guestSize
    );

    if (existingIndex > -1) {
      // Add quantities together, clamped to stock if specified
      const maxStock = merged[existingIndex].product.stock > 0 ? merged[existingIndex].product.stock : 999;
      merged[existingIndex] = {
        ...merged[existingIndex],
        quantity: Math.min(merged[existingIndex].quantity + (guestItem.quantity || 1), maxStock),
      };
    } else {
      merged.push(guestItem);
    }
  }

  return merged;
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUid, setCurrentUid] = useState<string | null>(auth.currentUser?.uid || null);
  const [syncStatus, setSyncStatus] = useState<CartSyncStatus>(() =>
    isFirestoreQuotaExhausted() ? 'offline_fallback' : 'synced'
  );

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(CART_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load cart from localStorage:', e);
    }
    return [];
  });

  const [promoCode, setPromoCode] = useState<string>('');
  const [appliedDiscountPercent, setAppliedDiscountPercent] = useState<number>(0);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);

  // Synchronization and Debounce Refs
  const cartRef = useRef<CartItem[]>(cart);
  cartRef.current = cart;

  const currentUidRef = useRef<string | null>(currentUid);
  currentUidRef.current = currentUid;

  const previousUidRef = useRef<string | null>(null);
  const lastPersistedCartRef = useRef<CartItem[]>(cart);
  const isRemoteUpdateRef = useRef<boolean>(false);
  const hasPendingLocalChangesRef = useRef<boolean>(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to quota circuit breaker transitions
  useEffect(() => {
    const unsubscribeQuota = subscribeToQuotaStatus((isExhausted) => {
      if (isExhausted) {
        setSyncStatus('offline_fallback');
      } else if (syncStatus === 'offline_fallback') {
        setSyncStatus('synced');
      }
    });
    return () => unsubscribeQuota();
  }, [syncStatus]);

  // Flush persistence helper
  const flushCart = useCallback(async (): Promise<void> => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const uid = currentUidRef.current;
    if (!uid || isFirestoreQuotaExhausted()) return;

    const itemsToSave = cartRef.current;
    if (areCartItemsEqual(itemsToSave, lastPersistedCartRef.current)) {
      return;
    }

    try {
      await cartRepository.saveCart(uid, itemsToSave);
      lastPersistedCartRef.current = itemsToSave;
      hasPendingLocalChangesRef.current = false;
      setSyncStatus('synced');
    } catch (err) {
      console.warn('[CartContext] flushCart error:', err);
      setSyncStatus('offline_fallback');
    }
  }, []);

  // Monitor auth state changes for cart merging and realtime sync
  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      // If previous user had pending unsaved changes, flush immediately
      if (previousUidRef.current && debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        try {
          await cartRepository.saveCart(previousUidRef.current, cartRef.current);
        } catch {}
      }

      if (user) {
        const uid = user.uid;
        setCurrentUid(uid);
        previousUidRef.current = uid;

        try {
          // Fetch existing cloud cart from Firestore
          const cloudItems = await cartRepository.getCart(uid);

          // Retrieve guest cart from local storage
          const localSaved = localStorage.getItem(CART_STORAGE_KEY);
          let guestItems: CartItem[] = [];
          if (localSaved) {
            try {
              const parsed = JSON.parse(localSaved);
              if (Array.isArray(parsed)) guestItems = parsed;
            } catch {}
          }

          let initialCart = cloudItems;
          if (guestItems.length > 0) {
            initialCart = mergeCarts(guestItems, cloudItems);
            // Save merged to Firestore
            await cartRepository.saveCart(uid, initialCart);
            // Clear only the guest cart so it doesn't merge again on next login
            localStorage.removeItem(CART_STORAGE_KEY);
          }

          isRemoteUpdateRef.current = true;
          lastPersistedCartRef.current = initialCart;
          setCart(initialCart);
          setSyncStatus(isFirestoreQuotaExhausted() ? 'offline_fallback' : 'synced');

          // Listen in realtime for cloud cart updates
          unsubscribeSnapshot = cartRepository.listenCart(uid, (remoteItems) => {
            if (!remoteItems) return;

            // If remote items match local cart, do nothing (breaks write loop)
            if (areCartItemsEqual(remoteItems, cartRef.current)) {
              lastPersistedCartRef.current = remoteItems;
              return;
            }

            // If user has local unpersisted edits, do NOT let a stale snapshot overwrite them
            if (hasPendingLocalChangesRef.current || debounceTimerRef.current !== null) {
              return;
            }

            // Genuine remote update from another session
            isRemoteUpdateRef.current = true;
            lastPersistedCartRef.current = remoteItems;
            setCart(remoteItems);
          });
        } catch (err) {
          console.warn('[CartContext] Cart sync error on auth change:', err);
          setSyncStatus('offline_fallback');
        }
      } else {
        // User logged out: clear user state & restore guest cart
        setCurrentUid(null);
        previousUidRef.current = null;
        if (unsubscribeSnapshot) {
          unsubscribeSnapshot();
          unsubscribeSnapshot = null;
        }

        const localSaved = localStorage.getItem(CART_STORAGE_KEY);
        let guestCart: CartItem[] = [];
        if (localSaved) {
          try {
            const parsed = JSON.parse(localSaved);
            if (Array.isArray(parsed)) guestCart = parsed;
          } catch {}
        }
        isRemoteUpdateRef.current = true;
        lastPersistedCartRef.current = guestCart;
        setCart(guestCart);
        setSyncStatus('synced');
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, []);

  // Safe Debounced Persistence Effect
  useEffect(() => {
    // 1. Always save to localStorage immediately for instant offline & guest resilience
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
      }
    } catch (e) {
      console.warn('Failed to save cart to localStorage:', e);
    }

    // 2. If quota circuit breaker is tripped, mark status and skip cloud write
    if (isFirestoreQuotaExhausted()) {
      setSyncStatus('offline_fallback');
      return;
    }

    if (!currentUid) {
      setSyncStatus('synced');
      return;
    }

    // 3. If change was pushed by remote snapshot, update last persisted ref and DO NOT write back
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      lastPersistedCartRef.current = cart;
      setSyncStatus('synced');
      return;
    }

    // 4. If normalized cart content is identical to last persisted state, skip
    if (areCartItemsEqual(cart, lastPersistedCartRef.current)) {
      setSyncStatus('synced');
      return;
    }

    // 5. Local changes need debounced persistence to Firestore (approx 1.5s)
    hasPendingLocalChangesRef.current = true;
    setSyncStatus('saving');

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      debounceTimerRef.current = null;
      hasPendingLocalChangesRef.current = false;
      try {
        const uid = currentUidRef.current;
        if (!uid || isFirestoreQuotaExhausted()) {
          setSyncStatus(isFirestoreQuotaExhausted() ? 'offline_fallback' : 'synced');
          return;
        }
        const itemsToSave = cartRef.current;
        await cartRepository.saveCart(uid, itemsToSave);
        lastPersistedCartRef.current = itemsToSave;
        setSyncStatus(isFirestoreQuotaExhausted() ? 'offline_fallback' : 'synced');
      } catch (err) {
        console.warn('[CartContext] Debounced save failed:', err);
        setSyncStatus('offline_fallback');
      }
    }, 1500);
  }, [cart, currentUid]);

  // Flush on page unload or component unmount to prevent data loss
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentUidRef.current && hasPendingLocalChangesRef.current) {
        cartRepository.saveCart(currentUidRef.current, cartRef.current);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        if (currentUidRef.current && hasPendingLocalChangesRef.current) {
          cartRepository.saveCart(currentUidRef.current, cartRef.current);
        }
      }
    };
  }, []);

  const addToCart = useCallback(
    (product: Product, quantity: number = 1, selectedColor?: string, selectedSize?: string) => {
      if (!product || !product.id) return;
      const validQty = Math.max(1, Math.floor(quantity || 1));

      // Resolve effective variants so default selections match subsequent quick-adds
      const effectiveColor = selectedColor !== undefined && selectedColor !== ''
        ? selectedColor
        : (product.colors && product.colors.length > 0 ? product.colors[0].name : undefined);

      const effectiveSize = selectedSize !== undefined && selectedSize !== ''
        ? selectedSize
        : (product.sizes && product.sizes.length > 0 ? product.sizes[0] : undefined);

      setCart((prevCart) => {
        const existingIndex = prevCart.findIndex(
          (item) =>
            item.product.id === product.id &&
            (item.selectedColor || '') === (effectiveColor || '') &&
            (item.selectedSize || '') === (effectiveSize || '')
        );

        const maxStock = product.stock > 0 ? product.stock : 999;

        if (existingIndex > -1) {
          const updated = [...prevCart];
          const newQty = updated[existingIndex].quantity + validQty;
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: Math.min(newQty, maxStock),
          };
          return updated;
        }

        return [
          ...prevCart,
          {
            product,
            quantity: Math.min(validQty, maxStock),
            selectedColor: effectiveColor,
            selectedSize: effectiveSize,
          },
        ];
      });
    },
    []
  );

  const removeFromCart = useCallback(
    (productId: string, selectedColor?: string, selectedSize?: string) => {
      if (!productId) return;
      setCart((prevCart) =>
        prevCart.filter((item) => {
          if (item.product.id !== productId) return true;
          // If specific color was provided, check match
          if (selectedColor !== undefined && (item.selectedColor || '') !== (selectedColor || '')) {
            return true;
          }
          // If specific size was provided, check match
          if (selectedSize !== undefined && (item.selectedSize || '') !== (selectedSize || '')) {
            return true;
          }
          return false;
        })
      );
    },
    []
  );

  const updateQuantity = useCallback(
    (productId: string, quantityOrDelta: number, selectedColor?: string, selectedSize?: string) => {
      if (!productId) return;
      setCart((prevCart) =>
        prevCart
          .map((item) => {
            const matches =
              item.product.id === productId &&
              (selectedColor === undefined || (item.selectedColor || '') === (selectedColor || '')) &&
              (selectedSize === undefined || (item.selectedSize || '') === (selectedSize || ''));

            if (!matches) return item;

            // If quantity <= 0, remove item
            if (quantityOrDelta <= 0) {
              return null;
            }

            const maxStock = item.product.stock > 0 ? item.product.stock : 999;
            return {
              ...item,
              quantity: Math.min(quantityOrDelta, maxStock),
            };
          })
          .filter((item): item is CartItem => item !== null)
      );
    },
    []
  );

  const clearCart = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    hasPendingLocalChangesRef.current = false;
    setCart([]);
    setPromoCode('');
    setAppliedDiscountPercent(0);
    lastPersistedCartRef.current = [];
    const uid = currentUidRef.current;
    if (uid && !isFirestoreQuotaExhausted()) {
      cartRepository.clearCart(uid).catch(console.warn);
    }
  }, []);

  const applyPromo = useCallback((code: string): PromoValidationResult => {
    const cleanCode = code.trim().toUpperCase();
    if (PROMO_CODES[cleanCode]) {
      const discount = PROMO_CODES[cleanCode];
      setPromoCode(cleanCode);
      setAppliedDiscountPercent(discount);
      return {
        success: true,
        message: `${cleanCode} applied (-${discount}%)`,
        discountPercentage: discount,
      };
    }
    return {
      success: false,
      message: 'Invalid or expired promotional code',
      discountPercentage: 0,
    };
  }, []);

  const removePromo = useCallback(() => {
    setPromoCode('');
    setAppliedDiscountPercent(0);
  }, []);

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);
  const toggleCart = useCallback(() => setIsCartOpen((prev) => !prev), []);

  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  }, [cart]);

  const discount = useMemo(() => {
    if (appliedDiscountPercent <= 0) return 0;
    return (subtotal * appliedDiscountPercent) / 100;
  }, [subtotal, appliedDiscountPercent]);

  const shipping = useMemo(() => {
    if (cart.length === 0) return 0;
    return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
  }, [subtotal, cart.length]);

  const total = useMemo(() => {
    if (cart.length === 0) return 0;
    return Math.max(0, subtotal - discount + shipping);
  }, [cart.length, subtotal, discount, shipping]);

  const cartCount = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.quantity, 0);
  }, [cart]);

  return (
    <CartContext.Provider
      value={{
        cart,
        cartCount,
        subtotal,
        shipping,
        discount,
        total,
        promoCode,
        appliedDiscountPercent,
        isCartOpen,
        syncStatus,
        flushCart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        applyPromo,
        removePromo,
        openCart,
        closeCart,
        toggleCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

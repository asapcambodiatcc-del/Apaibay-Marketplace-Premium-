import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Product } from '../types';
import { useCart } from './CartContext';
import { wishlistRepository, productRepository } from '../repositories';
import { auth } from '../services/firebase/config';
import { onAuthStateChanged } from 'firebase/auth';

interface WishlistContextType {
  wishlist: string[];
  wishlistCount: number;
  isWishlistOpen: boolean;
  addToWishlist: (productId: string) => void;
  removeFromWishlist: (productId: string) => void;
  toggleWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  moveToCart: (product: Product) => void;
  openWishlist: () => void;
  closeWishlist: () => void;
  toggleWishlistDrawer: () => void;
}

const WISHLIST_STORAGE_KEY = 'apaibay_wishlist';

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { addToCart } = useCart();
  const [currentUid, setCurrentUid] = useState<string | null>(auth.currentUser?.uid || null);

  const [wishlist, setWishlist] = useState<string[]>(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(WISHLIST_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load wishlist from localStorage:', e);
    }
    return ['prod-fs-1', 'prod-tr-2'];
  });

  const [isWishlistOpen, setIsWishlistOpen] = useState<boolean>(false);

  // Synchronize authenticated user wishlist with Firestore
  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUid(user.uid);
        try {
          const remoteWishlist = await wishlistRepository.getWishlist(user.uid);
          const remoteIds = remoteWishlist.map((p) => p.id);

          setWishlist((localList) => {
            const merged = Array.from(new Set([...remoteIds, ...localList]));
            return merged;
          });

          unsubscribeSnapshot = wishlistRepository.listenWishlist(user.uid, (remoteItems) => {
            if (remoteItems) {
              setWishlist(remoteItems.map((p) => p.id));
            }
          });
        } catch (err) {
          console.warn('Wishlist sync error:', err);
        }
      } else {
        setCurrentUid(null);
        if (unsubscribeSnapshot) {
          unsubscribeSnapshot();
          unsubscribeSnapshot = null;
        }
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, []);

  // Save to localStorage and Firestore
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlist));
      }
    } catch (e) {
      console.warn('Failed to save wishlist to localStorage:', e);
    }

    if (currentUid && wishlist.length > 0) {
      // Fetch product objects for saved IDs
      Promise.all(wishlist.map((id) => productRepository.getById(id)))
        .then((items) => {
          const validProducts = items.filter((p): p is Product => p !== null);
          return wishlistRepository.saveWishlist(currentUid, validProducts);
        })
        .catch(console.warn);
    }
  }, [wishlist, currentUid]);

  const addToWishlist = useCallback((productId: string) => {
    setWishlist((prev) => (prev.includes(productId) ? prev : [...prev, productId]));
  }, []);

  const removeFromWishlist = useCallback((productId: string) => {
    setWishlist((prev) => prev.filter((id) => id !== productId));
  }, []);

  const toggleWishlist = useCallback((productId: string) => {
    setWishlist((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  }, []);

  const isInWishlist = useCallback(
    (productId: string): boolean => {
      return wishlist.includes(productId);
    },
    [wishlist]
  );

  const moveToCart = useCallback(
    (product: Product) => {
      addToCart(product, 1);
      removeFromWishlist(product.id);
    },
    [addToCart, removeFromWishlist]
  );

  const openWishlist = useCallback(() => setIsWishlistOpen(true), []);
  const closeWishlist = useCallback(() => setIsWishlistOpen(false), []);
  const toggleWishlistDrawer = useCallback(() => setIsWishlistOpen((prev) => !prev), []);

  const wishlistCount = useMemo(() => wishlist.length, [wishlist]);

  return (
    <WishlistContext.Provider
      value={{
        wishlist,
        wishlistCount,
        isWishlistOpen,
        addToWishlist,
        removeFromWishlist,
        toggleWishlist,
        isInWishlist,
        moveToCart,
        openWishlist,
        closeWishlist,
        toggleWishlistDrawer,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = (): WishlistContextType => {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
};

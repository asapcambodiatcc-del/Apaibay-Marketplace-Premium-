import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile as updateFirebaseAuthProfile,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import { UserProfile } from '../types';
import { auth, googleProvider, testConnection } from '../services/firebase/config';
import { userRepository } from '../repositories';

export type AuthModalMode = 'login' | 'register' | 'forgot-password';

interface AuthContextType {
  user: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  role: 'customer' | 'seller' | 'admin';
  isAdmin: boolean;
  isSeller: boolean;
  isCustomer: boolean;
  isAuthModalOpen: boolean;
  authModalMode: AuthModalMode;
  isAccountOpen: boolean;
  signInWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (profileUpdates: Partial<UserProfile>) => Promise<void>;
  openAuthModal: (mode?: AuthModalMode) => void;
  closeAuthModal: () => void;
  openAccount: () => void;
  closeAccount: () => void;
  toggleAccount: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('login');
  const [isAccountOpen, setIsAccountOpen] = useState<boolean>(false);

  // Initialize and test Firebase Firestore connectivity on application boot
  useEffect(() => {
    testConnection().then((connected) => {
      if (connected) {
        console.info('Connected to Apaibay Marketplace Premium Firestore instance.');
      }
    });
  }, []);

  // Single source of truth: Firebase onAuthStateChanged observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentFirebaseUser) => {
      setFirebaseUser(currentFirebaseUser);

      if (currentFirebaseUser) {
        try {
          // Authoritative profile hydration from Firestore + Role verification
          const profile = await userRepository.getCurrentUser();
          setUser(profile);
        } catch (err) {
          console.warn('Profile hydration error:', err);
          setUser({
            uid: currentFirebaseUser.uid,
            name: currentFirebaseUser.displayName || 'Apaibay Customer',
            displayName: currentFirebaseUser.displayName || 'Apaibay Customer',
            email: currentFirebaseUser.email || '',
            avatar: currentFirebaseUser.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            photoURL: currentFirebaseUser.photoURL || '',
            tier: 'VIP Diamond',
            apaibayPoints: 2450,
            savedAddresses: 3,
            savedCards: 2,
            role: 'customer',
            status: 'active',
            preferredLanguage: 'en',
          });
        }
      } else {
        // Complete state teardown on sign out
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      setLoading(true);
      await signInWithPopup(auth, googleProvider);
      const profile = await userRepository.getCurrentUser();
      if (profile) setUser(profile);
      setIsAuthModalOpen(false);
    } catch (error) {
      console.error('Google Sign-In error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithEmail = useCallback(async (email: string, pass: string) => {
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email.trim(), pass);
      const profile = await userRepository.getCurrentUser();
      if (profile) setUser(profile);
      setIsAuthModalOpen(false);
    } catch (error) {
      console.error('Email login error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const registerWithEmail = useCallback(async (email: string, pass: string, name: string) => {
    try {
      setLoading(true);
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      if (cred.user && name.trim()) {
        try {
          await updateFirebaseAuthProfile(cred.user, { displayName: name.trim() });
        } catch (nameErr) {
          console.warn('Could not update Firebase user displayName:', nameErr);
        }
      }
      const profile = await userRepository.getCurrentUser();
      if (profile) setUser(profile);
      setIsAuthModalOpen(false);
    } catch (error) {
      console.error('Email registration error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (error) {
      console.error('Password reset error:', error);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setFirebaseUser(null);
      setIsAccountOpen(false);
    }
  }, []);

  const updateProfile = useCallback(async (profileUpdates: Partial<UserProfile>) => {
    if (auth.currentUser) {
      const updated = await userRepository.updateProfile(profileUpdates);
      setUser(updated);
    } else {
      setUser((prev) => (prev ? { ...prev, ...profileUpdates } : null));
    }
  }, []);

  const openAuthModal = useCallback((mode: AuthModalMode = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  const openAccount = useCallback(() => setIsAccountOpen(true), []);
  const closeAccount = useCallback(() => setIsAccountOpen(false), []);
  const toggleAccount = useCallback(() => setIsAccountOpen((prev) => !prev), []);

  const role = user?.role || 'customer';
  const isAdmin = role === 'admin';
  const isSeller = role === 'seller' || isAdmin;
  const isCustomer = !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        isAuthenticated: !!user && !!firebaseUser,
        loading,
        role,
        isAdmin,
        isSeller,
        isCustomer,
        isAuthModalOpen,
        authModalMode,
        isAccountOpen,
        signInWithGoogle,
        loginWithEmail,
        registerWithEmail,
        sendPasswordReset,
        logout,
        updateProfile,
        openAuthModal,
        closeAuthModal,
        openAccount,
        closeAccount,
        toggleAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

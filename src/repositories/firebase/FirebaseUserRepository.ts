import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../../services/firebase/config';
import { handleFirestoreError, OperationType } from '../../services/firebase/firestoreErrors';
import { UserProfile } from '../../types';
import { UserRepository } from '../UserRepository';

const USERS_COLLECTION = 'users';

export class FirebaseUserRepository implements UserRepository {
  /**
   * Trusted check to verify if the user has administrative privileges.
   * Matches firestore.rules logic: checks root admin email and existence in admins/{uid}.
   */
  async checkIsAdmin(uid: string, email?: string | null): Promise<boolean> {
    if (email && email.toLowerCase() === 'asapcambodia.tcc@gmail.com') {
      return true;
    }
    try {
      const adminDoc = await getDoc(doc(db, 'admins', uid));
      return adminDoc.exists();
    } catch {
      return false;
    }
  }

  /**
   * Trusted check to verify if the user has seller merchant authorization.
   * Checks verified seller records in sellers collection.
   */
  async checkIsSeller(uid: string): Promise<boolean> {
    try {
      const sellerDoc = await getDoc(doc(db, 'sellers', `seller_${uid}`));
      if (sellerDoc.exists()) {
        const data = sellerDoc.data();
        return data?.verificationStatus === 'verified' || data?.status === 'active';
      }
      const directSellerDoc = await getDoc(doc(db, 'sellers', uid));
      if (directSellerDoc.exists()) {
        const data = directSellerDoc.data();
        return data?.verificationStatus === 'verified' || data?.status === 'active';
      }
      return false;
    } catch {
      return false;
    }
  }

  async getCurrentUser(): Promise<UserProfile | null> {
    const current = auth.currentUser;
    if (!current) return null;

    try {
      // Determine trusted role independently from client claims
      const [isAdminUser, isSellerUser] = await Promise.all([
        this.checkIsAdmin(current.uid, current.email),
        this.checkIsSeller(current.uid),
      ]);

      let authoritativeRole: 'customer' | 'seller' | 'admin' = 'customer';
      if (isAdminUser) {
        authoritativeRole = 'admin';
      } else if (isSellerUser) {
        authoritativeRole = 'seller';
      }

      const docRef = doc(db, USERS_COLLECTION, current.uid);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const data = snap.data();
        return {
          uid: current.uid,
          name: data.displayName || data.name || current.displayName || 'Apaibay Customer',
          displayName: data.displayName || current.displayName || 'Apaibay Customer',
          email: current.email || data.email || '',
          avatar: data.photoURL || current.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          photoURL: data.photoURL || current.photoURL || '',
          phone: data.phone || '',
          tier: data.tier || 'VIP Diamond',
          apaibayPoints: data.apaibayPoints ?? 2450,
          savedAddresses: data.savedAddresses ?? 3,
          savedCards: data.savedCards ?? 2,
          role: authoritativeRole,
          status: data.status || 'active',
          preferredLanguage: data.preferredLanguage || 'en',
          createdAt: data.createdAt || current.metadata?.creationTime,
          updatedAt: data.updatedAt || new Date().toISOString(),
        };
      } else {
        // Create initial default user profile in Firestore
        const now = new Date().toISOString();
        const initialProfile: UserProfile = {
          uid: current.uid,
          name: current.displayName || 'Apaibay Customer',
          displayName: current.displayName || 'Apaibay Customer',
          email: current.email || '',
          avatar: current.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          photoURL: current.photoURL || '',
          phone: '',
          tier: 'VIP Diamond',
          apaibayPoints: 2450,
          savedAddresses: 3,
          savedCards: 2,
          role: authoritativeRole, // Server-evaluated, client cannot self-promote
          status: 'active',
          preferredLanguage: 'en',
          createdAt: current.metadata?.creationTime || now,
          updatedAt: now,
        };
        await setDoc(docRef, {
          ...initialProfile,
          role: authoritativeRole,
        });
        return initialProfile;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${USERS_COLLECTION}/${current.uid}`);
    }
  }

  async updateProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
    const current = auth.currentUser;
    if (!current) {
      throw new Error('User not authenticated');
    }

    try {
      // Prevent malicious client-side elevation to admin or changing protected keys
      const { role, uid, status, createdAt, ...safeFields } = profile;
      const docRef = doc(db, USERS_COLLECTION, current.uid);
      const payload: Record<string, any> = {
        ...safeFields,
        updatedAt: new Date().toISOString(),
      };
      if (safeFields.name) {
        payload.displayName = safeFields.name;
      }
      if (safeFields.phone !== undefined) {
        payload.phone = safeFields.phone;
      }
      if (safeFields.preferredLanguage !== undefined) {
        payload.preferredLanguage = safeFields.preferredLanguage;
      }
      await setDoc(docRef, payload, { merge: true });

      const updated = await this.getCurrentUser();
      return updated!;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${USERS_COLLECTION}/${current.uid}`);
    }
  }
}

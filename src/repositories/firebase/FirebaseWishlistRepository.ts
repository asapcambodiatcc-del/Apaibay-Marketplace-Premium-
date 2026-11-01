import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { handleFirestoreError, OperationType } from '../../services/firebase/firestoreErrors';
import { Product } from '../../types';
import { WishlistRepository } from '../WishlistRepository';

const WISHLISTS_COLLECTION = 'wishlists';

export class FirebaseWishlistRepository implements WishlistRepository {
  async getWishlist(uid: string): Promise<Product[]> {
    if (!uid) return [];
    try {
      const docRef = doc(db, WISHLISTS_COLLECTION, uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return Array.isArray(data?.items) ? data.items : [];
      }
      return [];
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${WISHLISTS_COLLECTION}/${uid}`);
    }
  }

  async saveWishlist(uid: string, items: Product[]): Promise<void> {
    if (!uid) return;
    try {
      const docRef = doc(db, WISHLISTS_COLLECTION, uid);
      await setDoc(docRef, {
        uid,
        items,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${WISHLISTS_COLLECTION}/${uid}`);
    }
  }

  listenWishlist(uid: string, callback: (items: Product[]) => void): () => void {
    if (!uid) {
      callback([]);
      return () => {};
    }
    const docRef = doc(db, WISHLISTS_COLLECTION, uid);
    return onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          callback(Array.isArray(data?.items) ? data.items : []);
        } else {
          callback([]);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `${WISHLISTS_COLLECTION}/${uid}`);
      }
    );
  }
}

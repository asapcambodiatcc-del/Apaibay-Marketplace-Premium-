import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { CartItem } from '../../types';
import { CartRepository } from '../CartRepository';
import {
  isFirestoreQuotaExhausted,
  recordFirestoreError,
} from '../../services/firebase/quotaCircuitBreaker';

const CARTS_COLLECTION = 'carts';

export class FirebaseCartRepository implements CartRepository {
  async getCart(uid: string): Promise<CartItem[]> {
    if (!uid || isFirestoreQuotaExhausted()) return [];
    try {
      const docRef = doc(db, CARTS_COLLECTION, uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return Array.isArray(data?.items) ? data.items : [];
      }
      return [];
    } catch (error) {
      recordFirestoreError(error, `FirebaseCartRepository.getCart(${uid})`);
      return [];
    }
  }

  async saveCart(uid: string, items: CartItem[]): Promise<void> {
    if (!uid || isFirestoreQuotaExhausted()) return;
    try {
      const docRef = doc(db, CARTS_COLLECTION, uid);
      await setDoc(docRef, {
        uid,
        items,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (error) {
      recordFirestoreError(error, `FirebaseCartRepository.saveCart(${uid})`);
    }
  }

  listenCart(uid: string, callback: (items: CartItem[]) => void): () => void {
    if (!uid || isFirestoreQuotaExhausted()) {
      callback([]);
      return () => {};
    }
    try {
      const docRef = doc(db, CARTS_COLLECTION, uid);
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
          recordFirestoreError(error, `FirebaseCartRepository.listenCart(${uid})`);
        }
      );
    } catch (err) {
      recordFirestoreError(err, `FirebaseCartRepository.listenCart subscription failed (${uid})`);
      return () => {};
    }
  }

  async clearCart(uid: string): Promise<void> {
    if (!uid || isFirestoreQuotaExhausted()) return;
    try {
      const docRef = doc(db, CARTS_COLLECTION, uid);
      await setDoc(docRef, {
        uid,
        items: [],
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (error) {
      recordFirestoreError(error, `FirebaseCartRepository.clearCart(${uid})`);
    }
  }
}

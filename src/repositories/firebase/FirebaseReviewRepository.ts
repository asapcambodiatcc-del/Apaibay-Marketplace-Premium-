import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  where,
} from 'firebase/firestore';
import { db, auth } from '../../services/firebase/config';
import { handleFirestoreError, OperationType } from '../../services/firebase/firestoreErrors';
import { ReviewItem } from '../../types';
import { ReviewRepository } from '../ReviewRepository';

const REVIEWS_COLLECTION = 'reviews';

export class FirebaseReviewRepository implements ReviewRepository {
  async getProductReviews(productId: string): Promise<ReviewItem[]> {
    try {
      const colRef = collection(db, REVIEWS_COLLECTION);
      const q = query(colRef, where('productId', '==', productId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ReviewItem, 'id'>),
        }));
      }
    } catch (error) {
      console.warn('Reviews query fallback:', error);
    }
    return [];
  }

  async create(reviewData: Omit<ReviewItem, 'id'>): Promise<ReviewItem> {
    const current = auth.currentUser;
    if (!current) throw new Error('Authentication required');

    const id = `rev_${Date.now()}`;
    const newReview: ReviewItem = {
      ...reviewData,
      id,
      userId: current.uid,
      userName: current.displayName || reviewData.userName || 'Apaibay Customer',
      avatar: current.photoURL || reviewData.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      status: 'published',
      createdAt: new Date().toISOString(),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    };

    try {
      const docRef = doc(db, REVIEWS_COLLECTION, id);
      await setDoc(docRef, newReview);
      return newReview;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${REVIEWS_COLLECTION}/${id}`);
    }
  }
}

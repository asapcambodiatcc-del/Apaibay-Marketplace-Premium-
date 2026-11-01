import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { handleFirestoreError, OperationType } from '../../services/firebase/firestoreErrors';
import { CategoryItem } from '../../types';
import { CategoryRepository } from '../CategoryRepository';
import { CATEGORIES } from '../../data/mockData';
import { recordFirestoreError } from '../../services/firebase/quotaCircuitBreaker';

const CATEGORIES_COLLECTION = 'categories';

export class FirebaseCategoryRepository implements CategoryRepository {
  private categories: CategoryItem[] = [];

  async getAll(): Promise<CategoryItem[]> {
    if (this.categories.length > 0) {
      return this.categories;
    }

    try {
      const colRef = collection(db, CATEGORIES_COLLECTION);
      const snap = await getDocs(colRef);
      if (!snap.empty) {
        this.categories = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CategoryItem, 'id'>),
        }));
        return this.categories;
      }

      // If empty in remote Firestore, fall back to baseline categories in memory.
      // Client code must NEVER attempt unprivileged category writes to Firestore.
      this.categories = [...CATEGORIES];
      return this.categories;
    } catch (e) {
      recordFirestoreError(e, 'FirebaseCategoryRepository.getAll');
      return [...CATEGORIES];
    }
  }

  async getBySlug(slug: string): Promise<CategoryItem | null> {
    const list = await this.getAll();
    return list.find((c) => c.slug === slug) || null;
  }

  async create(category: Omit<CategoryItem, 'id'>): Promise<CategoryItem> {
    const id = category.slug || `cat_${Date.now()}`;
    const newCat: CategoryItem = { ...category, id };
    try {
      const docRef = doc(db, CATEGORIES_COLLECTION, id);
      await setDoc(docRef, newCat);
      this.categories.push(newCat);
      return newCat;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${CATEGORIES_COLLECTION}/${id}`);
    }
  }
}

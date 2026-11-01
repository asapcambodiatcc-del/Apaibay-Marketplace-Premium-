import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../../services/firebase/config';
import { handleFirestoreError, OperationType } from '../../services/firebase/firestoreErrors';
import { Order, CartItem } from '../../types';
import { OrderRepository } from '../OrderRepository';

const ORDERS_COLLECTION = 'orders';
const PRODUCTS_COLLECTION = 'products';

export class FirebaseOrderRepository implements OrderRepository {
  async getAll(): Promise<Order[]> {
    const current = auth.currentUser;
    try {
      const colRef = collection(db, ORDERS_COLLECTION);
      let q;
      if (current) {
        q = query(colRef, where('customerUid', '==', current.uid));
      } else {
        q = query(colRef);
      }
      const snap = await getDocs(q);
      const orders = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Order, 'id'>),
      }));

      // Sort by creation date descending
      return orders.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    } catch (error) {
      console.warn('Orders query fallback:', error);
      return [];
    }
  }

  async getById(id: string): Promise<Order | null> {
    try {
      const docRef = doc(db, ORDERS_COLLECTION, id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { id: snap.id, ...(snap.data() as Omit<Order, 'id'>) };
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${ORDERS_COLLECTION}/${id}`);
    }
  }

  async create(orderData: Omit<Order, 'id'>): Promise<Order> {
    const current = auth.currentUser;
    if (!current) {
      throw new Error('You must be signed in to complete your purchase securely.');
    }

    const token = await current.getIdToken();
    const idempotencyKey = `idemp_${current.uid}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const response = await fetch('/api/commerce/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        items: orderData.items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          selectedColor: item.selectedColor,
          selectedSize: item.selectedSize,
        })),
        shippingOption: (orderData.shippingFee === 14.99 || orderData.shipping === 14.99) ? 'express' : 'standard',
        couponCode: (orderData as any).couponCode || undefined,
        shippingAddress: {
          name: orderData.shippingAddress.name || (orderData.shippingAddress as any).fullName || 'Customer',
          street: orderData.shippingAddress.street,
          city: orderData.shippingAddress.city,
          state: orderData.shippingAddress.state || 'Region',
          postalCode: orderData.shippingAddress.postalCode,
          country: orderData.shippingAddress.country,
          phone: orderData.shippingAddress.phone,
        },
        paymentMethod: (orderData as any).paymentMethod || 'card',
        idempotencyKey,
      }),
    });

    const result = await response.json();
    if (!response.ok || !result.success || !result.order) {
      const errorMsg = result?.error?.message || 'Order creation rejected by commerce authority.';
      throw new Error(errorMsg);
    }

    return result.order;
  }

  listenUserOrders(uid: string, callback: (orders: Order[]) => void): () => void {
    if (!uid) {
      callback([]);
      return () => {};
    }
    const colRef = collection(db, ORDERS_COLLECTION);
    const q = query(colRef, where('customerUid', '==', uid));
    return onSnapshot(
      q,
      (snap) => {
        const orders = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Order, 'id'>),
        }));
        callback(orders);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, ORDERS_COLLECTION);
      }
    );
  }
}

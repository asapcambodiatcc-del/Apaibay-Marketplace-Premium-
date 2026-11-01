import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { db, auth } from '../../services/firebase/config';
import { handleFirestoreError, OperationType } from '../../services/firebase/firestoreErrors';
import { Address } from '../../types';
import { AddressRepository } from '../AddressRepository';

const ADDRESSES_COLLECTION = 'addresses';

export class FirebaseAddressRepository implements AddressRepository {
  async getUserAddresses(uid: string): Promise<Address[]> {
    if (!uid) return [];
    try {
      const colRef = collection(db, ADDRESSES_COLLECTION);
      const q = query(colRef, where('uid', '==', uid));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Address, 'id'>),
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, ADDRESSES_COLLECTION);
    }
  }

  async create(addressData: Omit<Address, 'id'>): Promise<Address> {
    const current = auth.currentUser;
    if (!current) throw new Error('Authentication required');

    const id = `addr_${Date.now()}`;
    const newAddress: Address = {
      ...addressData,
      id,
      uid: current.uid,
      createdAt: new Date().toISOString(),
    };

    try {
      const docRef = doc(db, ADDRESSES_COLLECTION, id);
      await setDoc(docRef, newAddress);
      return newAddress;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${ADDRESSES_COLLECTION}/${id}`);
    }
  }

  async update(id: string, addressData: Partial<Address>): Promise<Address> {
    try {
      const docRef = doc(db, ADDRESSES_COLLECTION, id);
      await setDoc(docRef, addressData, { merge: true });
      const snap = await getDoc(docRef);
      return { id: snap.id, ...(snap.data() as Omit<Address, 'id'>) };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${ADDRESSES_COLLECTION}/${id}`);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const docRef = doc(db, ADDRESSES_COLLECTION, id);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${ADDRESSES_COLLECTION}/${id}`);
    }
  }
}

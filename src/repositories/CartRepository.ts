import { CartItem } from '../types';

export interface CartRepository {
  getCart(uid: string): Promise<CartItem[]>;
  saveCart(uid: string, items: CartItem[]): Promise<void>;
  listenCart(uid: string, callback: (items: CartItem[]) => void): () => void;
  clearCart(uid: string): Promise<void>;
}

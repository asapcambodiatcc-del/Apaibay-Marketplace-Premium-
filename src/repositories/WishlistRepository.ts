import { Product } from '../types';

export interface WishlistRepository {
  getWishlist(uid: string): Promise<Product[]>;
  saveWishlist(uid: string, items: Product[]): Promise<void>;
  listenWishlist(uid: string, callback: (items: Product[]) => void): () => void;
}

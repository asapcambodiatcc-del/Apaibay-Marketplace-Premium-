import { ReviewItem } from '../types';

export interface ReviewRepository {
  getProductReviews(productId: string): Promise<ReviewItem[]>;
  create(review: Omit<ReviewItem, 'id'>): Promise<ReviewItem>;
}

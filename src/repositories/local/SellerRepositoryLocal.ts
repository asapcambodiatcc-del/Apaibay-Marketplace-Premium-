import {
  SellerRepository,
  SellerMetrics,
  SellerProfile,
  SellerRegistrationOptions,
} from '../SellerRepository';
import { Seller } from '../../types';

export class SellerRepositoryLocal implements SellerRepository {
  private localSellers: Map<string, Seller> = new Map();

  async getMetrics(): Promise<SellerMetrics> {
    return {
      gmv: 0,
      ordersFulfilled: 0,
      activeListings: 0,
      rating: 5.0,
      fulfillmentRate: 100,
    };
  }

  async getStoreProfile(sellerId: string): Promise<SellerProfile> {
    const existing = this.localSellers.get(sellerId);
    if (existing) {
      return {
        id: existing.sellerId,
        name: existing.storeName,
        rating: existing.rating || 5.0,
        verified: existing.verificationStatus === 'verified',
        badge: existing.verificationStatus === 'verified' ? 'Verified Merchant' : 'Applicant',
        tier: 'Standard',
        establishedYear: 2024,
      };
    }

    return {
      id: sellerId,
      name: 'Apex Official Store',
      rating: 4.9,
      verified: true,
      badge: 'Premier Merchant',
      tier: 'Gold',
      establishedYear: 2021,
    };
  }

  async registerSeller(
    storeName: string,
    description: string,
    options?: SellerRegistrationOptions
  ): Promise<Seller> {
    const sellerId = `seller_local_${Date.now()}`;
    const now = new Date().toISOString();
    const seller: Seller = {
      sellerId,
      ownerUid: sellerId,
      storeName: storeName.trim(),
      description: description.trim(),
      businessCountry: options?.businessCountry || 'KH',
      businessType: options?.businessType || 'individual',
      logo: options?.logo || 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=120',
      verificationStatus: 'pending', // Defaults to pending
      submittedAt: now,
      rating: 5.0,
      createdAt: now,
      updatedAt: now,
    };
    this.localSellers.set(sellerId, seller);
    return seller;
  }

  async getSeller(sellerId: string): Promise<Seller | null> {
    return this.localSellers.get(sellerId) || null;
  }

  async getMySeller(): Promise<Seller | null> {
    const first = Array.from(this.localSellers.values())[0];
    return first || null;
  }
}

export const sellerRepository = new SellerRepositoryLocal();

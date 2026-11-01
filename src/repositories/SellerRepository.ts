import { Seller } from '../types';

export interface SellerMetrics {
  gmv: number;
  ordersFulfilled: number;
  activeListings: number;
  rating: number;
  fulfillmentRate: number;
}

export interface SellerProfile {
  id: string;
  name: string;
  rating: number;
  verified: boolean;
  badge: string;
  tier: string;
  establishedYear: number;
}

export interface SellerRegistrationOptions {
  businessCountry?: string;
  businessType?: 'individual' | 'registered_business' | 'enterprise';
  contactInfo?: { phone?: string; address?: string };
  logo?: string;
}

export interface SellerRepository {
  getMetrics(sellerId?: string): Promise<SellerMetrics>;
  getStoreProfile(sellerId: string): Promise<SellerProfile>;
  registerSeller(
    storeName: string,
    description: string,
    options?: SellerRegistrationOptions
  ): Promise<Seller>;
  getSeller(sellerId: string): Promise<Seller | null>;
  getMySeller(): Promise<Seller | null>;
}

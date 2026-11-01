import { Address } from '../types';

export interface AddressRepository {
  getUserAddresses(uid: string): Promise<Address[]>;
  create(address: Omit<Address, 'id'>): Promise<Address>;
  update(id: string, address: Partial<Address>): Promise<Address>;
  delete(id: string): Promise<void>;
}

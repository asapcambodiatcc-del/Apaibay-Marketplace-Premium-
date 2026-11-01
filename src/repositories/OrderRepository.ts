import { Order } from '../types';

export interface OrderRepository {
  getAll(): Promise<Order[]>;
  getById(id: string): Promise<Order | null>;
  create(orderData: Omit<Order, 'id'>): Promise<Order>;
}

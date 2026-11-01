import { Order } from '../../types';
import { INITIAL_ORDERS } from '../../data/mockData';
import { OrderRepository } from '../OrderRepository';

const ORDERS_STORAGE_KEY = 'apaibay_orders';

export class OrderRepositoryLocal implements OrderRepository {
  private orders: Order[];

  constructor() {
    this.orders = this.loadOrders();
  }

  private loadOrders(): Order[] {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(ORDERS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load orders from local storage:', e);
    }
    return [...INITIAL_ORDERS];
  }

  private persistOrders(): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(this.orders));
      }
    } catch (e) {
      console.warn('Failed to persist orders:', e);
    }
  }

  async getAll(): Promise<Order[]> {
    return [...this.orders];
  }

  async getById(id: string): Promise<Order | null> {
    const order = this.orders.find((o) => o.id === id);
    return order ? { ...order } : null;
  }

  async create(orderData: Omit<Order, 'id'>): Promise<Order> {
    const newId = `ORD-${Math.floor(10000 + Math.random() * 90000)}-GB`;
    const newOrder: Order = {
      ...orderData,
      id: newId,
    };
    this.orders = [newOrder, ...this.orders];
    this.persistOrders();
    return newOrder;
  }
}

export const orderRepository = new OrderRepositoryLocal();

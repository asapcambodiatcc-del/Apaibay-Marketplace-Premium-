import { UserProfile } from '../../types';
import { DEMO_USER } from '../../data/mockData';
import { UserRepository } from '../UserRepository';

const USER_STORAGE_KEY = 'apaibay_user_profile';

export class UserRepositoryLocal implements UserRepository {
  private user: UserProfile;

  constructor() {
    this.user = this.loadUser();
  }

  private loadUser(): UserProfile {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(USER_STORAGE_KEY);
        if (saved) {
          return JSON.parse(saved);
        }
      }
    } catch (e) {
      console.warn('Failed to load user profile:', e);
    }
    return { ...DEMO_USER };
  }

  async getCurrentUser(): Promise<UserProfile | null> {
    return { ...this.user };
  }

  async updateProfile(profileUpdates: Partial<UserProfile>): Promise<UserProfile> {
    this.user = { ...this.user, ...profileUpdates };
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(this.user));
      }
    } catch (e) {
      console.warn('Failed to persist user profile:', e);
    }
    return { ...this.user };
  }
}

export const userRepository = new UserRepositoryLocal();

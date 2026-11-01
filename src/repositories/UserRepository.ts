import { UserProfile } from '../types';

export interface UserRepository {
  getCurrentUser(): Promise<UserProfile | null>;
  updateProfile(profile: Partial<UserProfile>): Promise<UserProfile>;
  checkIsAdmin?(uid: string, email?: string | null): Promise<boolean>;
  checkIsSeller?(uid: string): Promise<boolean>;
}

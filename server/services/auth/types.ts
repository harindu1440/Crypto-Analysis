export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export interface User {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
  updatedAt: number;
  status: UserStatus;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  createdAt: number;
  expiresAt: number;
}

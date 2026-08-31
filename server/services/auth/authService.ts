import crypto from 'crypto';
import { LocalDatabase } from '../../config/database';
import { User, Session } from './types';

const HASH_BYTES = 64;
const SALT_BYTES = 16;
const SESSION_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export const AuthService = {
  
  hashPassword(password: string, salt: string): string {
    return crypto.scryptSync(password, salt, HASH_BYTES).toString('hex');
  },

  register(email: string, password: string, displayName: string): User {
    const users: User[] = LocalDatabase.get('users') || [];
    
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('User already exists');
    }

    const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
    const passwordHash = this.hashPassword(password, salt);

    const newUser: User = {
      id: crypto.randomUUID(),
      email,
      displayName,
      passwordHash,
      salt,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'ACTIVE'
    };

    users.push(newUser);
    LocalDatabase.set('users', users);
    
    // Initialize user preferences and watchlist
    const watchlists = LocalDatabase.get('watchlists') || {};
    watchlists[newUser.id] = [];
    LocalDatabase.set('watchlists', watchlists);

    return newUser;
  },

  login(email: string, password: string): { user: Omit<User, 'passwordHash' | 'salt'>, token: string } {
    const users: User[] = LocalDatabase.get('users') || [];
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user || user.status !== 'ACTIVE') {
      throw new Error('Invalid email or password');
    }

    const hash = this.hashPassword(password, user.salt);
    if (hash !== user.passwordHash) {
      throw new Error('Invalid email or password');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const sessions: Session[] = LocalDatabase.get('sessions') || [];
    
    const session: Session = {
      id: crypto.randomUUID(),
      userId: user.id,
      token,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_EXPIRATION_MS
    };

    sessions.push(session);
    LocalDatabase.set('sessions', sessions);

    const { passwordHash, salt, ...safeUser } = user;
    return { user: safeUser, token };
  },

  logout(token: string) {
    const sessions: Session[] = LocalDatabase.get('sessions') || [];
    const index = sessions.findIndex(s => s.token === token);
    if (index !== -1) {
      sessions.splice(index, 1);
      LocalDatabase.set('sessions', sessions);
    }
  },

  verifySession(token: string): User | null {
    const sessions: Session[] = LocalDatabase.get('sessions') || [];
    const session = sessions.find(s => s.token === token);
    
    if (!session || Date.now() > session.expiresAt) {
      if (session) this.logout(token);
      return null;
    }

    const users: User[] = LocalDatabase.get('users') || [];
    const user = users.find(u => u.id === session.userId);

    if (!user || user.status !== 'ACTIVE') {
      return null;
    }

    return user;
  }
};

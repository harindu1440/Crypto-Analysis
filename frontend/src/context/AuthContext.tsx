import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  displayName: string;
  status: string;
}

interface UserPreferences {
  userId: string;
  minQualityScore: number;
  direction: 'LONG' | 'SHORT' | 'BOTH';
  timeframes: string[];
  notifications: any;
  mode: 'BEGINNER' | 'ADVANCED';
}

interface AuthContextType {
  user: User | null;
  preferences: UserPreferences | null;
  login: (userData: User) => void;
  logout: () => void;
  updatePreferences: (prefs: Partial<UserPreferences>) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        await fetchPreferences();
      }
    } catch (err) {
      console.error('Auth check failed', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPreferences = async () => {
    try {
      const res = await fetch('/api/user/preferences');
      if (res.ok) {
        const data = await res.json();
        setPreferences(data);
      }
    } catch (err) {
      console.error('Failed to fetch preferences', err);
    }
  };

  const login = async (userData: User) => {
    setUser(userData);
    await fetchPreferences();
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
    setUser(null);
    setPreferences(null);
  };

  const updatePreferences = async (updates: Partial<UserPreferences>) => {
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const updated = await res.json();
        setPreferences(updated);
      }
    } catch (err) {
      console.error('Failed to update preferences', err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, preferences, login, logout, updatePreferences, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

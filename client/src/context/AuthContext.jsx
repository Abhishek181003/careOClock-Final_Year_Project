import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('careoclock_user');
    try {
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('careoclock_token');
    if (token) {
      api
        .get('/auth/me')
        .then((res) => {
          if (res.data?.user) {
            setUser(res.data.user);
            localStorage.setItem('careoclock_user', JSON.stringify(res.data.user));
          }
        })
        .catch(() => {
          // Token expired or invalid
          localStorage.removeItem('careoclock_token');
          localStorage.removeItem('careoclock_user');
          setUser(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const persist = useCallback((token, userRecord) => {
    localStorage.setItem('careoclock_token', token);
    localStorage.setItem('careoclock_user', JSON.stringify(userRecord));
    setUser(userRecord);
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    persist(data.token, data.user);
    return data.user;
  }, [persist]);

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    persist(data.token, data.user);
    return data.user;
  }, [persist]);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      if (res.data?.user) {
        setUser(res.data.user);
        localStorage.setItem('careoclock_user', JSON.stringify(res.data.user));
        return res.data;
      }
    } catch {
      // Ignore background refresh failure
    }
    return null;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('careoclock_token');
    localStorage.removeItem('careoclock_user');
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, setUser, isAuthenticated: Boolean(user), isLoading, login, register, logout, refreshUser }),
    [user, isLoading, login, register, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

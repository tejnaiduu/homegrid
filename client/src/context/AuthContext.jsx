import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest, getApiBase } from '../services/api.js';
import { io } from 'socket.io-client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    apiRequest('/auth/me')
      .then((result) => { if (active) setUser(result.data.user); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    let socket;
    let isMounted = true;

    getApiBase().then((apiBase) => {
      if (!isMounted) return;
      socket = io(apiBase.replace(/\/api\/v1$/, ''), { withCredentials: true });
      socket.on('NOTIFICATION_CREATED', () => window.dispatchEvent(new Event('homegrid:notification')));
    }).catch(() => {});

    return () => {
      isMounted = false;
      socket?.disconnect();
    };
  }, [user]);

  const value = useMemo(() => ({
    user,
    loading,
    async login(identifier, password) {
      const result = await apiRequest('/auth/login', {
        method: 'POST', body: JSON.stringify({ identifier, password }),
      });
      setUser(result.data.user);
      return result.data.user;
    },
    async register(payload) {
      const result = await apiRequest('/auth/register', {
        method: 'POST', body: JSON.stringify(payload),
      });
      setUser(result.data.user);
      return result.data.user;
    },
    async bootstrapAdmin(payload) {
      const result = await apiRequest('/auth/admin-setup', {
        method: 'POST', body: JSON.stringify(payload),
      });
      setUser(result.data.user);
      return result.data.user;
    },
    async logout() {
      await apiRequest('/auth/logout', { method: 'POST' });
      setUser(null);
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

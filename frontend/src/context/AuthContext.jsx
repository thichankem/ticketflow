import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setAuthToken, getAuthToken } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(getAuthToken());
  const [loading, setLoading] = useState(true);

  // Load user profile on mount
  useEffect(() => {
    let isMounted = true;
    const fetchMe = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get('/auth/me');
        if (isMounted && res.user) {
          setUser(res.user);
        }
      } catch (err) {
        // Try refresh token if 401
        try {
          const refreshRes = await api.post('/auth/refresh', {});
          if (refreshRes.token) {
            setAuthToken(refreshRes.token);
            setToken(refreshRes.token);
            const userRes = await api.get('/auth/me');
            if (isMounted) setUser(userRes.user);
          }
        } catch {
          if (isMounted) {
            setAuthToken(null);
            setToken(null);
            setUser(null);
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchMe();
    return () => { isMounted = false; };
  }, [token]);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    setAuthToken(res.token);
    setToken(res.token);
    setUser(res.user);
    return res;
  };

  const register = async (name, email, password, role = 'ATTENDEE') => {
    const res = await api.post('/auth/register', { name, email, password, role });
    setAuthToken(res.token);
    setToken(res.token);
    setUser(res.user);
    return res;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {
      // ignore
    }
    setAuthToken(null);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        role: user?.role || null,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'ADMIN',
        isOrganizer: user?.role === 'ORGANIZER' || user?.role === 'ADMIN',
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;

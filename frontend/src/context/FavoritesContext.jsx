import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../services/api';

const FavoritesContext = createContext({
  favorites: [],
  isFavorite: () => false,
  toggleFavorite: async () => false,
  subscribeRestock: async () => ({ success: true }),
});

export const FavoritesProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [favorites, setFavorites] = useState(() => {
    try {
      const stored = localStorage.getItem('tf_favorites');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Sync favorites across tabs
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'tf_favorites') {
        try {
          setFavorites(e.newValue ? JSON.parse(e.newValue) : []);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Server-authoritative fetch on user login / auth change (V12-04)
  useEffect(() => {
    let isMounted = true;
    if (isAuthenticated && user?.id) {
      api.get('/events/favorites')
        .then((res) => {
          if (!isMounted) return;
          const serverFavs = Array.isArray(res?.favorites)
            ? res.favorites
            : (Array.isArray(res) ? res : []);
          setFavorites(serverFavs);
          try {
            localStorage.setItem('tf_favorites', JSON.stringify(serverFavs));
          } catch {}
        })
        .catch((err) => {
          console.warn('[FavoritesContext] Load server favorites error:', err.message);
        });
    } else if (!isAuthenticated) {
      try {
        const stored = localStorage.getItem('tf_favorites');
        setFavorites(stored ? JSON.parse(stored) : []);
      } catch {
        setFavorites([]);
      }
    }
    return () => {
      isMounted = false;
    };
  }, [user?.id, isAuthenticated]);

  const isFavorite = useCallback(
    (eventId) => {
      if (!eventId) return false;
      return favorites.some((id) => String(id) === String(eventId));
    },
    [favorites]
  );

  const toggleFavorite = useCallback(
    async (eventId) => {
      if (!eventId) return false;
      const numId = Number(eventId) || eventId;
      const alreadyFav = favorites.some((id) => String(id) === String(eventId));
      const nextFavorites = alreadyFav
        ? favorites.filter((id) => String(id) !== String(eventId))
        : [...favorites, numId];

      const prevFavorites = favorites;
      // Optimistic local update
      setFavorites(nextFavorites);
      try {
        localStorage.setItem('tf_favorites', JSON.stringify(nextFavorites));
      } catch {}

      // Authoritative server persistence
      try {
        const payload = {
          user_id: user?.id,
          action: 'FAVORITE',
          favorited: !alreadyFav,
        };
        const res = await api.post(`/events/${eventId}/favorite`, payload);
        const serverFavorited = res?.favorited !== undefined ? res.favorited : !alreadyFav;
        if (serverFavorited !== !alreadyFav) {
          const syncedFavs = serverFavorited
            ? [...prevFavorites.filter((id) => String(id) !== String(eventId)), numId]
            : prevFavorites.filter((id) => String(id) !== String(eventId));
          setFavorites(syncedFavs);
          try {
            localStorage.setItem('tf_favorites', JSON.stringify(syncedFavs));
          } catch {}
        }
        return serverFavorited;
      } catch (err) {
        // Rollback optimistic update on error (V12-04)
        console.warn('[FavoritesContext] Server toggle failed, rolling back:', err.message);
        setFavorites(prevFavorites);
        try {
          localStorage.setItem('tf_favorites', JSON.stringify(prevFavorites));
        } catch {}
        throw err;
      }
    },
    [favorites, user]
  );

  const subscribeRestock = useCallback(
    async (eventId, eventTitle = 'sự kiện') => {
      if (!eventId) return { success: false, message: 'Thiếu mã sự kiện' };
      const numId = Number(eventId) || eventId;
      const alreadyFav = favorites.some((id) => String(id) === String(eventId));

      if (!alreadyFav) {
        const nextFavorites = [...favorites, numId];
        setFavorites(nextFavorites);
        try {
          localStorage.setItem('tf_favorites', JSON.stringify(nextFavorites));
        } catch {}
      }

      try {
        // Idempotent subscribe with action: 'SUBSCRIBE' (V12-03)
        const payload = {
          user_id: user?.id,
          action: 'SUBSCRIBE',
          favorited: true,
        };
        await api.post(`/events/${eventId}/favorite`, payload);
        return {
          success: true,
          message: `Đã đăng ký nhận thông báo mở bán cho "${eventTitle}".`,
        };
      } catch (err) {
        if (!alreadyFav) {
          setFavorites(favorites);
          try {
            localStorage.setItem('tf_favorites', JSON.stringify(favorites));
          } catch {}
        }
        return {
          success: false,
          message: err.message || 'Không thể đăng ký nhận thông báo lúc này.',
        };
      }
    },
    [favorites, user]
  );

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        isFavorite,
        toggleFavorite,
        subscribeRestock,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => useContext(FavoritesContext);

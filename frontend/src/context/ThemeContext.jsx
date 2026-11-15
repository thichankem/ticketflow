import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  // 'light' | 'dark' | 'system'
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem('tf_theme') || 'system';
    } catch {
      return 'system';
    }
  });

  const [systemIsDark, setSystemIsDark] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Keep system preference in sync
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e) => setSystemIsDark(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  // Compute resolved theme
  const resolvedTheme = theme === 'system' ? (systemIsDark ? 'dark' : 'light') : theme;

  // Apply to document and meta tag per modern-web-guidance
  useEffect(() => {
    const metaTheme = document.querySelector('meta[name="color-scheme"]');
    if (theme === 'system') {
      if (metaTheme) metaTheme.content = 'light dark';
      document.documentElement.removeAttribute('data-theme');
    } else if (theme === 'dark') {
      if (metaTheme) metaTheme.content = 'dark';
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      if (metaTheme) metaTheme.content = 'light';
      document.documentElement.setAttribute('data-theme', 'light');
    }

    try {
      localStorage.setItem('tf_theme', theme);
    } catch {}
  }, [theme, resolvedTheme]);

  // Synchronize across tabs via storage event
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'tf_theme' && e.newValue) {
        setThemeState(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = (newTheme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    // Cycle: system -> dark -> light -> system (or simple toggle dark/light)
    setThemeState((prev) => {
      if (prev === 'system') return systemIsDark ? 'light' : 'dark';
      if (prev === 'dark') return 'light';
      return 'system';
    });
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        isDark: resolvedTheme === 'dark',
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: 'system',
      resolvedTheme: 'light',
      isDark: false,
      setTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return ctx;
};

export default ThemeContext;

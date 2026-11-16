import React, { createContext, useContext, useEffect } from 'react';

const ThemeContext = createContext({
  theme: 'light',
  resolvedTheme: 'light',
  isDark: false,
  setTheme: () => {},
  toggleTheme: () => {},
});

export const ThemeProvider = ({ children }) => {
  useEffect(() => {
    try {
      localStorage.removeItem('tf_theme');
      document.documentElement.removeAttribute('data-theme');
      const metaTheme = document.querySelector('meta[name="color-scheme"]');
      if (metaTheme) metaTheme.content = 'light';
    } catch {}
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme: 'light',
        resolvedTheme: 'light',
        isDark: false,
        setTheme: () => {},
        toggleTheme: () => {},
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeContext;

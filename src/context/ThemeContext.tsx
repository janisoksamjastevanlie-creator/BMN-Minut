import React, { createContext, useContext, useLayoutEffect, useState } from 'react';

export type AppTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: AppTheme;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = 'bmn-theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);

const getInitialTheme = (): AppTheme => {
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<AppTheme>(getInitialTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(current => current === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme harus digunakan di dalam ThemeProvider.');
  return context;
};

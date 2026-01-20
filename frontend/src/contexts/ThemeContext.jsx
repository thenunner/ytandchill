import { createContext, useContext, useEffect, useState, useRef } from 'react';
import api from '../api/client';

const ThemeContext = createContext();

export const themes = {
  kernel: 'Kernel',
  fatal: 'Fatal',
  subnet: 'Subnet',
  archive: 'Archive',
  buffer: 'Buffer',
  gateway: 'Gateway',
  catppuccin: 'Catppuccin',
  pixel: 'Pixel',
  debug: 'Debug',
};

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    // Load theme from localStorage initially (fast)
    const savedTheme = localStorage.getItem('ytandchill-theme');
    return savedTheme && themes[savedTheme] ? savedTheme : 'kernel';
  });
  const isInitialMount = useRef(true);

  // Load theme from backend on mount
  useEffect(() => {
    api.getSettings().then(settings => {
      if (settings?.theme && themes[settings.theme]) {
        setThemeState(settings.theme);
      }
    }).catch(() => {});
  }, []);

  // Apply theme class and save
  useEffect(() => {
    const root = document.documentElement;

    // Remove all theme classes
    root.classList.remove('theme-kernel', 'theme-fatal', 'theme-subnet', 'theme-archive', 'theme-buffer', 'theme-gateway', 'theme-catppuccin', 'theme-pixel', 'theme-debug');

    // Add current theme class
    root.classList.add(`theme-${theme}`);

    // Save to localStorage (fallback/cache)
    localStorage.setItem('ytandchill-theme', theme);

    // Save to backend (skip initial mount to avoid unnecessary API call)
    if (!isInitialMount.current) {
      api.updateSettings({ theme }).catch(() => {});
    }
    isInitialMount.current = false;
  }, [theme]);

  const setTheme = (newTheme) => {
    setThemeState(newTheme);
  };

  const value = {
    theme,
    setTheme,
    themes,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

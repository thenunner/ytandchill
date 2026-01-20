import { createContext, useContext, useEffect } from 'react';
import { useSettings, useUpdateSettings } from '../api/queries';

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
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  // Get theme from settings, fallback to localStorage, then default
  const getInitialTheme = () => {
    const savedTheme = localStorage.getItem('ytandchill-theme');
    return savedTheme && themes[savedTheme] ? savedTheme : 'kernel';
  };

  // Use backend theme when available, otherwise localStorage fallback
  const theme = (settings?.theme && themes[settings.theme]) ? settings.theme : getInitialTheme();

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;

    // Remove all theme classes
    Object.keys(themes).forEach(t => root.classList.remove(`theme-${t}`));

    // Add current theme class
    root.classList.add(`theme-${theme}`);

    // Cache in localStorage for fast initial render
    localStorage.setItem('ytandchill-theme', theme);
  }, [theme]);

  const setTheme = (newTheme) => {
    // Optimistic update happens in useUpdateSettings hook
    updateSettings.mutate({ theme: newTheme });
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

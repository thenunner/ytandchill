import { createContext, useContext, useEffect, useState } from 'react';
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

  // Local state for immediate feedback, localStorage for fast initial render
  const [localTheme, setLocalTheme] = useState(() => {
    const savedTheme = localStorage.getItem('ytandchill-theme');
    return savedTheme && themes[savedTheme] ? savedTheme : 'kernel';
  });

  // Use backend theme when available, otherwise local
  const theme = (settings?.theme && themes[settings.theme]) ? settings.theme : localTheme;

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
    const oldTheme = localTheme;
    setLocalTheme(newTheme); // Immediate feedback
    updateSettings.mutate(
      { theme: newTheme },
      {
        onError: () => {
          // Revert on failure
          setLocalTheme(oldTheme);
        }
      }
    );
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

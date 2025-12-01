import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const themes = {
  kernel: 'Kernel',
  fatal: 'Fatal',
  subnet: 'Subnet',
  archive: 'Archive',
  buffer: 'Buffer',
  gateway: 'Gateway',
  online: 'Online',
  pixel: 'Pixel',
  debug: 'Debug',
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // Load theme from localStorage or default to 'void'
    const savedTheme = localStorage.getItem('ytandchill-theme');
    return savedTheme && themes[savedTheme] ? savedTheme : 'kernel';
  });

  useEffect(() => {
    const root = document.documentElement;

    // Remove all theme classes
    root.classList.remove('theme-kernel', 'theme-fatal', 'theme-subnet', 'theme-archive', 'theme-buffer', 'theme-gateway', 'theme-online', 'theme-pixel', 'theme-debug');

    // Add current theme class
    root.classList.add(`theme-${theme}`);

    // Save to localStorage
    localStorage.setItem('ytandchill-theme', theme);
  }, [theme]);

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

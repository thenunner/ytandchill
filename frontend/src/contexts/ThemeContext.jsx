import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const themes = {
  dark: 'Dark Mode',
  youtube: 'YouTube Red',
  midnight: 'Midnight Blue',
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // Load theme from localStorage or default to 'dark'
    const savedTheme = localStorage.getItem('ytandchill-theme');
    return savedTheme && themes[savedTheme] ? savedTheme : 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;

    // Remove all theme classes
    root.classList.remove('theme-dark', 'theme-youtube', 'theme-midnight');

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

import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const themes = {
  soot: 'Soot',
  sand: 'Sand',
  clay: 'Clay',
  tide: 'Tide',
  thorn: 'Thorn',
  ember: 'Ember',
  pollen: 'Pollen',
  lichen: 'Lichen',
  moss: 'Moss',
  fen: 'Fen',
  bark: 'Bark',
  marrow: 'Marrow',
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // Load theme from localStorage or default to 'soot'
    const savedTheme = localStorage.getItem('ytandchill-theme');
    return savedTheme && themes[savedTheme] ? savedTheme : 'soot';
  });

  useEffect(() => {
    const root = document.documentElement;

    // Remove all theme classes
    root.classList.remove('theme-soot', 'theme-sand', 'theme-clay', 'theme-tide', 'theme-thorn', 'theme-ember', 'theme-pollen', 'theme-lichen', 'theme-moss', 'theme-fen', 'theme-bark', 'theme-marrow');

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

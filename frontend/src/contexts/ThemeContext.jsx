import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const themes = {
  soot: 'Soot',
  sand: 'Sand',
  clay: 'Clay',
  pollen: 'Pollen',
  lichen: 'Lichen',
  fen: 'Fen',
  bark: 'Bark',
  coast: 'Coast',
  slate: 'Slate',
  grove: 'Grove',
  reef: 'Reef',
  skyfall: 'Skyfall',
  thicket: 'Thicket',
  nectar: 'Nectar',
  harvest: 'Harvest',
  almond: 'Almond',
  marina: 'Marina',
  bloodmoon: 'Bloodmoon',
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
    root.classList.remove('theme-soot', 'theme-sand', 'theme-clay', 'theme-pollen', 'theme-lichen', 'theme-fen', 'theme-bark', 'theme-coast', 'theme-slate', 'theme-grove', 'theme-reef', 'theme-skyfall', 'theme-thicket', 'theme-nectar', 'theme-harvest', 'theme-almond', 'theme-marina', 'theme-bloodmoon');

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

import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const themes = {
  null: 'Null',
  bleed: 'Bleed',
  cryo: 'Cryo',
  rust: 'Rust',
  phase: 'Phase',
  slate: 'Slate',
  grove: 'Grove',
  reef: 'Reef',
  thicket: 'Thicket',
  pulse: 'Pulse',
  harvest: 'Harvest',
  almond: 'Almond',
  marina: 'Marina',
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // Load theme from localStorage or default to 'null'
    const savedTheme = localStorage.getItem('ytandchill-theme');
    return savedTheme && themes[savedTheme] ? savedTheme : 'null';
  });

  useEffect(() => {
    const root = document.documentElement;

    // Remove all theme classes
    root.classList.remove('theme-null', 'theme-bleed', 'theme-cryo', 'theme-rust', 'theme-phase', 'theme-slate', 'theme-grove', 'theme-reef', 'theme-thicket', 'theme-pulse', 'theme-harvest', 'theme-almond', 'theme-marina');

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

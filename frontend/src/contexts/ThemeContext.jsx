import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const themes = {
  void: 'Void',
  burn: 'Burn',
  ice: 'Ice',
  spore: 'Spore',
  hush: 'Hush',
  sector: 'Sector',
  nexus: 'Nexus',
  lumen: 'Lumen',
  vela: 'Vela',
  node: 'Node',
  almond: 'Almond',
  trace: 'Trace',
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // Load theme from localStorage or default to 'void'
    const savedTheme = localStorage.getItem('ytandchill-theme');
    return savedTheme && themes[savedTheme] ? savedTheme : 'void';
  });

  useEffect(() => {
    const root = document.documentElement;

    // Remove all theme classes
    root.classList.remove('theme-void', 'theme-burn', 'theme-ice', 'theme-spore', 'theme-hush', 'theme-sector', 'theme-nexus', 'theme-lumen', 'theme-vela', 'theme-node', 'theme-almond', 'theme-trace');

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

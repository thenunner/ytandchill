import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useSettings, useUpdateSettings } from '../api/queries';

const PreferencesContext = createContext();

// Available themes
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

export function PreferencesProvider({ children }) {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  // Selection bar visibility (ephemeral)
  const [isSelectionBarVisible, setIsSelectionBarVisible] = useState(false);
  const setSelectionBarVisible = useCallback((visible) => {
    setIsSelectionBarVisible(visible);
  }, []);

  // === Theme ===
  const getInitialTheme = () => {
    const savedTheme = localStorage.getItem('ytandchill-theme');
    return savedTheme && themes[savedTheme] ? savedTheme : 'kernel';
  };

  const theme = (settings?.theme && themes[settings.theme]) ? settings.theme : getInitialTheme();

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;
    Object.keys(themes).forEach(t => root.classList.remove(`theme-${t}`));
    root.classList.add(`theme-${theme}`);
    localStorage.setItem('ytandchill-theme', theme);
  }, [theme]);

  const setTheme = (newTheme) => {
    updateSettings.mutate({ theme: newTheme });
  };

  // === Card Sizes ===
  // One-time cleanup of old localStorage keys
  useEffect(() => {
    localStorage.removeItem('global_card_size');
    localStorage.removeItem('channels_card_size');
    localStorage.removeItem('library_card_size');
    localStorage.removeItem('cardSizes');
    localStorage.removeItem('globalCardSize');
  }, []);

  const channelsCardSize = settings?.channels_card_size || 'md';
  const libraryCardSize = settings?.library_card_size || 'md';

  const setChannelsCardSize = (size) => {
    updateSettings.mutate({ channels_card_size: size });
  };

  const setLibraryCardSize = (size) => {
    updateSettings.mutate({ library_card_size: size });
  };

  return (
    <PreferencesContext.Provider value={{
      // Theme
      theme,
      setTheme,
      themes,
      // Card sizes
      channelsCardSize,
      setChannelsCardSize,
      libraryCardSize,
      setLibraryCardSize,
      // Selection bar
      isSelectionBarVisible,
      setSelectionBarVisible,
    }}>
      {children}
    </PreferencesContext.Provider>
  );
}

// === Hooks ===

export function useTheme() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('useTheme must be used within PreferencesProvider');
  }
  return {
    theme: context.theme,
    setTheme: context.setTheme,
    themes: context.themes,
  };
}

export function useCardSize(tab) {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('useCardSize must be used within PreferencesProvider');
  }

  const isLibraryTab = tab === 'library';

  return {
    cardSize: isLibraryTab ? context.libraryCardSize : context.channelsCardSize,
    setCardSize: isLibraryTab ? context.setLibraryCardSize : context.setChannelsCardSize,
    channelsCardSize: context.channelsCardSize,
    setChannelsCardSize: context.setChannelsCardSize,
    libraryCardSize: context.libraryCardSize,
    setLibraryCardSize: context.setLibraryCardSize,
  };
}

export function useSelectionBar() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('useSelectionBar must be used within PreferencesProvider');
  }
  return {
    isSelectionBarVisible: context.isSelectionBarVisible,
    setSelectionBarVisible: context.setSelectionBarVisible,
  };
}

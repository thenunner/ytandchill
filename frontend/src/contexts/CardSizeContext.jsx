import { createContext, useContext, useEffect } from 'react';
import { useSettings, useUpdateSettings } from '../api/queries';

// Create the context
const CardSizeContext = createContext();

// Provider component that wraps the app
export function CardSizeProvider({ children }) {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  // One-time cleanup of old localStorage keys (migrated to database)
  useEffect(() => {
    localStorage.removeItem('global_card_size');
    localStorage.removeItem('channels_card_size');
    localStorage.removeItem('library_card_size');
    localStorage.removeItem('cardSizes');
    localStorage.removeItem('globalCardSize');
  }, []);

  // Read card sizes from settings (with defaults)
  const channelsCardSize = settings?.channels_card_size || 'md';
  const libraryCardSize = settings?.library_card_size || 'md';

  // Update functions that persist to backend
  const setChannelsCardSize = (size) => {
    updateSettings.mutate({ channels_card_size: size });
  };

  const setLibraryCardSize = (size) => {
    updateSettings.mutate({ library_card_size: size });
  };

  return (
    <CardSizeContext.Provider value={{
      channelsCardSize,
      setChannelsCardSize,
      libraryCardSize,
      setLibraryCardSize
    }}>
      {children}
    </CardSizeContext.Provider>
  );
}

// Custom hook to use the card size context
// Tab determines which card size to use:
// - 'channels', 'videos' -> channelsCardSize (Channels tab views)
// - 'library' -> libraryCardSize (Library tab views)
export function useCardSize(tab) {
  const context = useContext(CardSizeContext);
  if (!context) {
    throw new Error('useCardSize must be used within CardSizeProvider');
  }

  // Map tab to the appropriate card size
  const isLibraryTab = tab === 'library';

  return {
    cardSize: isLibraryTab ? context.libraryCardSize : context.channelsCardSize,
    setCardSize: isLibraryTab ? context.setLibraryCardSize : context.setChannelsCardSize,
    // Expose both for Settings page
    channelsCardSize: context.channelsCardSize,
    setChannelsCardSize: context.setChannelsCardSize,
    libraryCardSize: context.libraryCardSize,
    setLibraryCardSize: context.setLibraryCardSize
  };
}

import { createContext, useContext, useState, useEffect } from 'react';

// Create the context
const CardSizeContext = createContext();

// Provider component that wraps the app
export function CardSizeProvider({ children }) {
  const [cardSize, setCardSizeState] = useState(() => {
    // Check for new global setting first
    const globalSize = localStorage.getItem('global_card_size');
    if (globalSize) {
      return globalSize;
    }
    // Migrate from old per-tab setting if it exists
    const oldStored = localStorage.getItem('cardSizes');
    if (oldStored) {
      const parsed = JSON.parse(oldStored);
      // Use the first non-default value found, or 'md'
      const size = parsed.library || parsed.channels || 'md';
      // Convert old 'xl' to 'lg'
      return size === 'xl' ? 'lg' : size;
    }
    return 'md';
  });

  // Save to localStorage whenever cardSize changes
  useEffect(() => {
    localStorage.setItem('global_card_size', cardSize);
  }, [cardSize]);

  // One-time cleanup of old per-tab settings
  useEffect(() => {
    localStorage.removeItem('cardSizes');
    localStorage.removeItem('globalCardSize');
  }, []);

  const setCardSize = (size) => {
    setCardSizeState(size);
  };

  return (
    <CardSizeContext.Provider value={{ cardSize, setCardSize }}>
      {children}
    </CardSizeContext.Provider>
  );
}

// Custom hook to use the card size context
// The 'tab' parameter is kept for backwards compatibility but ignored
export function useCardSize(tab) {
  const context = useContext(CardSizeContext);
  if (!context) {
    throw new Error('useCardSize must be used within CardSizeProvider');
  }

  return { cardSize: context.cardSize, setCardSize: context.setCardSize };
}

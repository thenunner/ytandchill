import { createContext, useContext, useState, useEffect } from 'react';

// Create the context
const CardSizeContext = createContext();

// Provider component that wraps the app
export function CardSizeProvider({ children }) {
  const [cardSizes, setCardSizes] = useState(() => {
    const stored = localStorage.getItem('cardSizes');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Convert old 'xl' values to 'lg'
      Object.keys(parsed).forEach(key => {
        if (parsed[key] === 'xl') parsed[key] = 'lg';
      });
      return parsed;
    }
    // Migrate from old global setting if it exists
    const oldGlobal = localStorage.getItem('globalCardSize');
    if (oldGlobal) {
      const size = oldGlobal === 'xl' ? 'lg' : oldGlobal;
      return {
        channels: size,
        videos: size,
        library: size,
        channelLibrary: size,
        playlist: size,
      };
    }
    // Default values for each tab
    return {
      channels: 'md',
      videos: 'md',
      library: 'md',
      channelLibrary: 'md',
      playlist: 'md',
    };
  });

  // Save to localStorage whenever cardSizes changes
  useEffect(() => {
    localStorage.setItem('cardSizes', JSON.stringify(cardSizes));
  }, [cardSizes]);

  // Function to get card size for a specific tab
  const getCardSize = (tab) => {
    return cardSizes[tab] || 'md';
  };

  // Function to set card size for a specific tab
  const setCardSizeForTab = (tab, size) => {
    setCardSizes(prev => ({
      ...prev,
      [tab]: size
    }));
  };

  return (
    <CardSizeContext.Provider value={{ cardSizes, getCardSize, setCardSizeForTab }}>
      {children}
    </CardSizeContext.Provider>
  );
}

// Custom hook to use the card size context for a specific tab
export function useCardSize(tab) {
  const context = useContext(CardSizeContext);
  if (!context) {
    throw new Error('useCardSize must be used within CardSizeProvider');
  }

  const cardSize = context.getCardSize(tab);
  const setCardSize = (size) => context.setCardSizeForTab(tab, size);

  return { cardSize, setCardSize };
}

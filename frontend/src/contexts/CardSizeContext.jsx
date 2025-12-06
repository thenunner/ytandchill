import { createContext, useContext, useState, useEffect } from 'react';

// Create the context
const CardSizeContext = createContext();

// Provider component that wraps the app
export function CardSizeProvider({ children }) {
  const [cardSize, setCardSize] = useState(
    localStorage.getItem('globalCardSize') || 'md'
  );

  // Save to localStorage whenever cardSize changes
  useEffect(() => {
    localStorage.setItem('globalCardSize', cardSize);
  }, [cardSize]);

  return (
    <CardSizeContext.Provider value={{ cardSize, setCardSize }}>
      {children}
    </CardSizeContext.Provider>
  );
}

// Custom hook to use the card size context
export function useCardSize() {
  const context = useContext(CardSizeContext);
  if (!context) {
    throw new Error('useCardSize must be used within CardSizeProvider');
  }
  return context;
}

import { createContext, useContext } from 'react';

const SSEContext = createContext({
  isConnected: false,
  isPaused: false,
  pause: () => {},
  resume: () => {},
});

export function SSEProvider({ children, value }) {
  return (
    <SSEContext.Provider value={value}>
      {children}
    </SSEContext.Provider>
  );
}

export function useSSE() {
  return useContext(SSEContext);
}

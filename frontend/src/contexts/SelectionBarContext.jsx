import { createContext, useContext, useState, useCallback } from 'react';

const SelectionBarContext = createContext({
  isSelectionBarVisible: false,
  setSelectionBarVisible: () => {},
});

export function SelectionBarProvider({ children }) {
  const [isSelectionBarVisible, setIsSelectionBarVisible] = useState(false);

  const setSelectionBarVisible = useCallback((visible) => {
    setIsSelectionBarVisible(visible);
  }, []);

  return (
    <SelectionBarContext.Provider value={{ isSelectionBarVisible, setSelectionBarVisible }}>
      {children}
    </SelectionBarContext.Provider>
  );
}

export function useSelectionBar() {
  return useContext(SelectionBarContext);
}

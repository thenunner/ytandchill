import { useState, useEffect } from 'react';
import { getGridColumns } from '../utils/gridUtils';

/**
 * Custom hook to manage grid columns with proper orientation change handling
 * Fixes issue where mobile orientation changes don't update grid immediately
 */
export const useGridColumns = (cardSize) => {
  const [gridColumns, setGridColumns] = useState(getGridColumns(cardSize));

  useEffect(() => {
    const updateColumns = () => {
      // Small delay to ensure window dimensions are updated after orientation change
      setTimeout(() => {
        setGridColumns(getGridColumns(cardSize));
      }, 100);
    };

    // Initial update
    updateColumns();

    // Listen for both resize and orientationchange events
    window.addEventListener('resize', updateColumns);
    window.addEventListener('orientationchange', updateColumns);

    return () => {
      window.removeEventListener('resize', updateColumns);
      window.removeEventListener('orientationchange', updateColumns);
    };
  }, [cardSize]);

  return gridColumns;
};

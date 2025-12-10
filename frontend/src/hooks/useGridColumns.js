import { useState, useEffect } from 'react';
import { getGridColumns } from '../utils/gridUtils';

/**
 * Custom hook to manage grid columns with proper orientation change handling
 * Fixes issue where mobile orientation changes don't update grid immediately
 */
export const useGridColumns = (cardSize) => {
  const [gridColumns, setGridColumns] = useState(getGridColumns(cardSize));

  useEffect(() => {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    const updateColumns = () => {
      // Only delay for touch devices during orientation changes
      if (isTouch) {
        setTimeout(() => {
          setGridColumns(getGridColumns(cardSize));
        }, 100);
      } else {
        // Desktop: update immediately, no delay
        setGridColumns(getGridColumns(cardSize));
      }
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

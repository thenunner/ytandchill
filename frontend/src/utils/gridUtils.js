// Grid column calculator utility for responsive card grids
export const getGridColumns = (cardSize) => {
  const width = window.innerWidth;
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  const columnConfig = {
    // Touch devices (tablets/phones) - fewer columns for touch targets
    touch: {
      sm: { portrait: 1, landscape: 4, tablet: 6 },
      md: { portrait: 1, landscape: 3, tablet: 5 },
      lg: { portrait: 1, landscape: 2, tablet: 4 }
    },
    // Desktop devices (mouse/trackpad)
    desktop: {
      sm: { upTo1920: 8, over1920: 12 },
      md: { upTo1920: 6, over1920: 10 },
      lg: { upTo1920: 4, over1920: 6 }
    }
  };

  const deviceType = isTouch ? 'touch' : 'desktop';
  const config = columnConfig[deviceType][cardSize] || columnConfig.desktop.md;

  if (isTouch) {
    // Touch devices: phones and tablets
    if (width < 640) return config.portrait;  // Portrait phones
    if (width < 1024) return config.landscape;  // Landscape phones
    return config.tablet;  // Tablets (>= 1024px)
  } else {
    // Desktop devices: laptops and monitors
    if (width <= 1920) return config.upTo1920;  // Up to 1920: 4-6-8
    return config.over1920;  // Over 1920: 6-10-12
  }
};

// Helper to get Tailwind grid class from column count
export const getGridClass = (cols, itemCount = Infinity) => {
  // Get minimum columns (lg position = largest cards, fewest columns)
  const minCols = getGridColumns('lg');

  // Cap at item count, but never go below the minimum column count from lg slider position
  // This prevents cards from stretching too wide when there are very few items
  const actualCols = Math.min(cols, Math.max(minCols, itemCount));

  const classMap = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
    7: 'grid-cols-7',
    8: 'grid-cols-8',
    9: 'grid-cols-9',
    10: 'grid-cols-10',
    11: 'grid-cols-11',
    12: 'grid-cols-12',
  };
  return classMap[actualCols] || classMap[6];
};

// Helper to get effective card size based on actual columns shown
// When grid is capped due to low item count, determines which card size
// normally produces that column count to keep text sizing consistent
export const getEffectiveCardSize = (cardSize, itemCount = Infinity) => {
  const configuredCols = getGridColumns(cardSize);
  const actualCols = Math.min(configuredCols, itemCount);

  // If not capped, use the selected card size
  if (actualCols === configuredCols) {
    return cardSize;
  }

  // If capped, find which card size normally produces this column count
  const smCols = getGridColumns('sm');
  const mdCols = getGridColumns('md');
  const lgCols = getGridColumns('lg');

  // Match actual columns to the card size that normally produces it
  // Check from largest to smallest to prefer larger text when ambiguous
  if (actualCols <= lgCols) return 'lg';
  if (actualCols <= mdCols) return 'md';
  return 'sm';
};

// Helper to get text size classes based on card size
export const getTextSizes = (cardSize, itemCount = Infinity) => {
  // Use effective card size when grid is capped
  const effectiveSize = getEffectiveCardSize(cardSize, itemCount);

  const sizeConfig = {
    sm: {
      title: 'text-xs',        // 12px - smaller to fit more text
      titleClamp: 'line-clamp-3', // 3 lines for small cards
      metadata: 'text-xs',
      badge: 'text-xs',
    },
    md: {
      title: 'text-sm',        // 14px
      titleClamp: 'line-clamp-2',
      metadata: 'text-xs',
      badge: 'text-xs',
    },
    lg: {
      title: 'text-base',      // 16px
      titleClamp: 'line-clamp-2',
      metadata: 'text-sm',
      badge: 'text-sm',
    }
  };
  return sizeConfig[effectiveSize] || sizeConfig.md;
};

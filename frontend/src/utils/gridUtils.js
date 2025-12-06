// Grid column calculator utility for responsive card grids
export const getGridColumns = (cardSize) => {
  const width = window.innerWidth;
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  const columnConfig = {
    // Touch devices (tablets/phones) - fewer columns for touch targets
    touch: {
      sm: { mobile: 2, tablet: 4, wide: 4 },
      md: { mobile: 1, tablet: 3, wide: 3 },
      lg: { mobile: 1, tablet: 2, wide: 2 },
      xl: { mobile: 1, tablet: 2, wide: 2 }
    },
    // Desktop devices (mouse/trackpad) - more columns for large monitors
    desktop: {
      sm: { small: 2, medium: 4, large: 6, xlarge: 8 },
      md: { small: 1, medium: 3, large: 5, xlarge: 6 },
      lg: { small: 1, medium: 2, large: 4, xlarge: 5 },
      xl: { small: 1, medium: 2, large: 3, xlarge: 4 }
    }
  };

  const deviceType = isTouch ? 'touch' : 'desktop';
  const config = columnConfig[deviceType][cardSize] || columnConfig.desktop.md;

  if (isTouch) {
    // Touch devices: phones and tablets
    if (width < 640) return config.mobile;
    if (width < 2048) return config.tablet;
    return config.wide;  // High-res tablets max out at 4 cards
  } else {
    // Desktop devices: laptops and monitors
    if (width < 768) return config.small;
    if (width < 1440) return config.medium;
    if (width < 2560) return config.large;
    return config.xlarge;  // 4K monitors can have up to 8 cards
  }
};

// Helper to get Tailwind grid class from column count
export const getGridClass = (cols) => {
  const classMap = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
    7: 'grid-cols-7',
    8: 'grid-cols-8'
  };
  return classMap[cols] || classMap[5];
};

// Helper to get text size classes based on card size
export const getTextSizes = (cardSize) => {
  const sizeConfig = {
    sm: {
      title: 'text-sm',
      metadata: 'text-xs',
      badge: 'text-xs',
    },
    md: {
      title: 'text-base',
      metadata: 'text-sm',
      badge: 'text-xs',
    },
    lg: {
      title: 'text-lg',
      metadata: 'text-sm',
      badge: 'text-sm',
    },
    xl: {
      title: 'text-xl',
      metadata: 'text-base',
      badge: 'text-sm',
    }
  };
  return sizeConfig[cardSize] || sizeConfig.md;
};

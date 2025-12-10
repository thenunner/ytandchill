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
    // Desktop devices (mouse/trackpad) - more columns for large monitors
    desktop: {
      sm: { up1440: 6, up1920: 8, up2560: 10, over2560: 12 },
      md: { up1440: 5, up1920: 6, up2560: 8, over2560: 10 },
      lg: { up1440: 4, up1920: 5, up2560: 6, over2560: 8 }
    }
  };

  const deviceType = isTouch ? 'touch' : 'desktop';
  const config = columnConfig[deviceType][cardSize] || columnConfig.desktop.md;

  if (isTouch) {
    // Touch devices: phones and tablets
    if (width < 640) return config.portrait;  // Portrait phones
    if (width < 1024) return config.landscape;  // Landscape phones
    return config.tablet;  // Tablets
  } else {
    // Desktop devices: laptops and monitors
    if (width < 1440) return config.up1440;  // Up to 1440p: 6-5-4-4
    if (width < 1920) return config.up1920;  // 1440p to 1920p: 8-6-5-5
    if (width < 2560) return config.up2560;  // 1920p to 2560p: 10-8-6-6
    return config.over2560;  // 2560p+: 12-10-8-8
  }
};

// Helper to get Tailwind grid class from column count
export const getGridClass = (cols, itemCount = Infinity) => {
  // Cap columns at actual item count to prevent stretching with few items
  const actualCols = Math.min(cols, itemCount);

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
    12: 'grid-cols-12'
  };
  return classMap[actualCols] || classMap[5];
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
    }
  };
  return sizeConfig[cardSize] || sizeConfig.md;
};

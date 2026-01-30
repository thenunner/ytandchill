/**
 * Consolidated utility functions
 *
 * Combines: formatters, dateUtils, errorMessages, gridUtils, settingsUtils
 */

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format duration in seconds to HH:MM:SS or MM:SS
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "1:23:45" or "23:45")
 */
export const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

/**
 * Format file size in bytes to human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size (e.g., "1.5 GB", "256 MB")
 */
export const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '';
  const gb = bytes / (1024 * 1024 * 1024);
  const mb = bytes / (1024 * 1024);

  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  } else {
    return `${mb.toFixed(0)} MB`;
  }
};

/**
 * Format date from YYYYMMDD format to MM/DD/YYYY
 * @param {string} dateStr - Date in YYYYMMDD format
 * @returns {string} Formatted date (e.g., "01/15/2024")
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  return `${month}/${day}/${year}`;
};

// Alias for formatDate (used in some components)
export const formatVideoDate = formatDate;

/**
 * Format ISO datetime string to MM/DD/YYYY
 * @param {string} dateTimeStr - ISO datetime string
 * @returns {string} Formatted date (e.g., "01/15/2024")
 */
export const formatDateTime = (dateTimeStr) => {
  if (!dateTimeStr) return '';
  const date = new Date(dateTimeStr);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
};

/**
 * Format a 24-hour time value to 12-hour format with AM/PM
 * @param {number} hour24 - Hour in 24-hour format (0-23)
 * @returns {string} Formatted time string (e.g., "9:00 AM", "2:00 PM")
 */
export const formatScanTime = (hour24) => {
  if (hour24 === null || hour24 === undefined) return '';
  const hour = hour24 % 12 || 12;
  const ampm = hour24 < 12 ? 'AM' : 'PM';
  return `${hour}:00 ${ampm}`;
};

/**
 * Format a date string to relative time or absolute date
 * @param {string} dateString - ISO date string or timestamp
 * @returns {string} Formatted relative time (e.g., "2 hours ago", "Yesterday", "Jan 15")
 */
export const formatLastScan = (dateString) => {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  // For older dates, show the actual date
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  return `${month} ${day}`;
};

/**
 * Check if a Date object represents today
 * @param {Date} date - Date object to check
 * @returns {boolean} True if date is today
 */
export const isToday = (date) => {
  const today = new Date();
  return date.getDate() === today.getDate() &&
         date.getMonth() === today.getMonth() &&
         date.getFullYear() === today.getFullYear();
};

/**
 * Format scan time for channel cards - shows time if today, date if past
 * @param {string} scanTimeString - ISO datetime string
 * @returns {string|null} Formatted time (e.g., "5:30pm") or date (e.g., "1/15")
 */
export const formatChannelScanTime = (scanTimeString) => {
  if (!scanTimeString) return null;
  const scanDate = new Date(scanTimeString);

  if (isToday(scanDate)) {
    const hours = scanDate.getHours();
    const minutes = scanDate.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes}${ampm}`;
  } else {
    return scanDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  }
};

/**
 * Format YYYYMMDD video date for channel cards
 * @param {string} videoDateString - Date in YYYYMMDD format
 * @returns {string|null} Formatted date (e.g., "1/15")
 */
export const formatChannelVideoDate = (videoDateString) => {
  if (!videoDateString) return null;
  const year = videoDateString.substring(0, 4);
  const month = videoDateString.substring(4, 6);
  const day = videoDateString.substring(6, 8);
  const videoDate = new Date(year, month - 1, day);
  return videoDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
};

/**
 * Format channel last scan with video date - "Scan: x | Video: x"
 * @param {string} scanTimeString - ISO datetime string for scan
 * @param {string} videoDateString - YYYYMMDD format for video date
 * @returns {string} Combined format (e.g., "Scan: 5:30pm | Video: 1/15")
 */
export const formatChannelLastScan = (scanTimeString, videoDateString) => {
  if (!scanTimeString) return 'Never';

  const scanDate = new Date(scanTimeString);

  let scanStr;
  if (isToday(scanDate)) {
    const hours = scanDate.getHours();
    const minutes = scanDate.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    scanStr = `${displayHours}:${displayMinutes}${ampm}`;
  } else {
    scanStr = scanDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  }

  if (videoDateString) {
    const year = videoDateString.substring(0, 4);
    const month = videoDateString.substring(4, 6);
    const day = videoDateString.substring(6, 8);
    const videoDate = new Date(year, month - 1, day);
    const videoStr = videoDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    return `Scan: ${scanStr} | Video: ${videoStr}`;
  } else {
    return `Scan: ${scanStr} | Video: None`;
  }
};

/**
 * Format datetime for modals - full date and time display
 * @param {string} dateString - ISO datetime string
 * @returns {string} Full datetime (e.g., "Jan 15, 2024, 3:30 PM")
 */
export const formatFullDateTime = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

/**
 * Format a date string to relative time with more granularity
 * @param {string} dateString - ISO date string
 * @returns {string} Relative time string
 */
export const formatRelativeTime = (dateString) => {
  if (!dateString) return '';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${diffYears}y ago`;
};

// ============================================================================
// ERROR MESSAGE UTILITIES
// ============================================================================

/**
 * Maps technical error messages to user-friendly messages with actionable advice
 * @param {string} errorMessage - The raw error message
 * @param {string} context - Optional context for fallback (e.g., 'delete video', 'save settings')
 */
export function getUserFriendlyError(errorMessage, context = null) {
  // If no error message, use context-specific fallback or generic message
  if (!errorMessage) {
    return context ? `Failed to ${context}. Please try again.` : 'An unknown error occurred';
  }

  const lowerError = errorMessage.toLowerCase();

  // Rate limit issues
  if (lowerError.includes('rate limit')) {
    return 'YT rate limit detected. Wait a few minutes and try again, or refresh your cookies.';
  }

  // Cookie issues
  if (lowerError.includes('cookie') || lowerError.includes('sign in') || lowerError.includes('login required')) {
    return 'Cookie authentication failed. Re-export cookies.txt from your browser. See Settings → Cookies for instructions.';
  }

  // Geoblocking
  if (lowerError.includes('geoblocked') || lowerError.includes('not available in your country') || lowerError.includes('geo restricted')) {
    return 'This video is geoblocked in your region and cannot be downloaded.';
  }

  // Private/deleted videos
  if (lowerError.includes('private video') || lowerError.includes('video unavailable') || lowerError.includes('video not found') || lowerError.includes('removed')) {
    return 'This video is private, deleted, or unavailable.';
  }

  // Members-only content
  if (lowerError.includes('members only') || lowerError.includes('join this channel')) {
    return 'This video is members-only content and cannot be downloaded.';
  }

  // Age verification
  if (lowerError.includes('age') && lowerError.includes('verif')) {
    return 'This video requires age verification and cannot be downloaded without signing in.';
  }

  // Copyright
  if (lowerError.includes('copyright')) {
    return 'This video has been taken down due to copyright.';
  }

  // Network issues
  if (lowerError.includes('network') || lowerError.includes('connection') || lowerError.includes('timeout')) {
    return 'Network connection issue. Check your internet connection and try again.';
  }

  // 403 Forbidden
  if (lowerError.includes('403') || lowerError.includes('forbidden')) {
    return 'Access forbidden (403). This usually means YT rate limiting. Update your cookies.txt and wait 30-60 minutes before trying again.';
  }

  // Generic HTTP errors
  if (lowerError.includes('500') || lowerError.includes('internal server error')) {
    return 'YT server error (500). This is a temporary issue on YT\'s end. Please try again later.';
  }

  if (lowerError.includes('502') || lowerError.includes('503') || lowerError.includes('504')) {
    return 'YT is experiencing service issues. Please try again later.';
  }

  // SSL/Certificate errors
  if (lowerError.includes('ssl') || lowerError.includes('certificate')) {
    return 'SSL certificate error. Try updating yt-dlp: pip install --upgrade yt-dlp certifi';
  }

  // Channel not found
  if (lowerError.includes('channel') && (lowerError.includes('not found') || lowerError.includes('does not exist'))) {
    return 'Channel not found. Check the URL and try again.';
  }

  // Invalid URL
  if (lowerError.includes('invalid url') || lowerError.includes('could not resolve')) {
    return 'Invalid URL. Make sure you\'re using the correct channel URL format.';
  }

  // Fallback: use context if available, otherwise return original error
  if (context) {
    return `Failed to ${context}. Please try again.`;
  }
  return errorMessage;
}

/**
 * Formats a download worker log message for display in the queue
 */
export function formatQueueError(logMessage) {
  if (!logMessage) return null;

  const lowerLog = logMessage.toLowerCase();

  // Rate limit messages (show as-is, they're already user-friendly)
  if (lowerLog.includes('rate limit detected')) {
    return { message: logMessage, icon: '⏸️', type: 'warning' };
  }

  // Geoblocked
  if (lowerLog.includes('geoblocked') || lowerLog.includes('geo restricted')) {
    return { message: '❌ Video is geoblocked in your region', icon: '🌍', type: 'error' };
  }

  // Private/unavailable
  if (lowerLog.includes('private') || lowerLog.includes('unavailable')) {
    return { message: '❌ Video is private or unavailable', icon: '🔒', type: 'error' };
  }

  // Members-only
  if (lowerLog.includes('members only')) {
    return { message: '❌ Members-only content', icon: '⭐', type: 'error' };
  }

  // Age verification
  if (lowerLog.includes('age verification')) {
    return { message: '❌ Age verification required', icon: '🔞', type: 'error' };
  }

  // Copyright
  if (lowerLog.includes('copyright')) {
    return { message: '❌ Copyright takedown', icon: '⚖️', type: 'error' };
  }

  // Timeout
  if (lowerLog.includes('timeout')) {
    return { message: '⏱️ Download timed out', icon: '⏱️', type: 'warning' };
  }

  // Generic error
  return { message: logMessage, icon: '⚠️', type: 'error' };
}

// ============================================================================
// GRID UTILITIES
// ============================================================================

/**
 * Calculate grid columns based on card size and device type
 * @param {string} cardSize - 'sm', 'md', or 'lg'
 * @param {string} context - 'channels' or 'library' (default)
 * @returns {number} Number of columns
 */
export const getGridColumns = (cardSize, context = 'library') => {
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
      channels: {
        sm: { upTo1920: 8, over1920: 12 },
        md: { upTo1920: 6, over1920: 10 },
        lg: { upTo1920: 5, over1920: 7 }
      },
      library: {
        sm: { upTo1920: 8, over1920: 12 },
        md: { upTo1920: 6, over1920: 10 },
        lg: { upTo1920: 4, over1920: 6 }
      }
    }
  };

  const desktopConfig = columnConfig.desktop[context] || columnConfig.desktop.library;
  const config = isTouch
    ? columnConfig.touch[cardSize] || columnConfig.touch.md
    : desktopConfig[cardSize] || desktopConfig.md;

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

/**
 * Get Tailwind grid class from column count
 * @param {number} cols - Number of columns
 * @param {number} itemCount - Number of items (to cap columns)
 * @returns {string} Tailwind class (e.g., "grid-cols-6")
 */
export const getGridClass = (cols, itemCount = Infinity) => {
  // Get minimum columns (lg position = largest cards, fewest columns)
  const minCols = getGridColumns('lg');

  // Cap at item count, but never go below the minimum column count from lg slider position
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

/**
 * Get effective card size based on actual columns shown
 * @param {string} cardSize - Selected card size
 * @param {number} itemCount - Number of items
 * @returns {string} Effective card size
 */
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
  if (actualCols <= lgCols) return 'lg';
  if (actualCols <= mdCols) return 'md';
  return 'sm';
};

/**
 * Get text size classes based on card size
 * @param {string} cardSize - Card size
 * @param {number} itemCount - Number of items
 * @returns {object} Text size configuration
 */
export const getTextSizes = (cardSize, itemCount = Infinity) => {
  const effectiveSize = getEffectiveCardSize(cardSize, itemCount);

  const sizeConfig = {
    sm: {
      title: 'text-xs',
      titleClamp: 'line-clamp-3',
      metadata: 'text-xs',
      badge: 'text-xs',
    },
    md: {
      title: 'text-sm',
      titleClamp: 'line-clamp-2',
      metadata: 'text-xs',
      badge: 'text-xs',
    },
    lg: {
      title: 'text-base',
      titleClamp: 'line-clamp-2',
      metadata: 'text-sm',
      badge: 'text-sm',
    }
  };
  return sizeConfig[effectiveSize] || sizeConfig.md;
};

// ============================================================================
// SETTINGS UTILITIES
// ============================================================================

/**
 * Parse a boolean setting stored as string 'true'/'false'.
 * @param {object} settings - Settings object from useSettings hook
 * @param {string} key - Setting key to read
 * @param {boolean} defaultValue - Default if setting is missing (default: false)
 * @returns {boolean}
 */
export function getBooleanSetting(settings, key, defaultValue = false) {
  if (!settings || settings[key] === undefined) {
    return defaultValue;
  }
  return settings[key] === 'true';
}

/**
 * Parse a numeric setting stored as string.
 * @param {object} settings - Settings object from useSettings hook
 * @param {string} key - Setting key to read
 * @param {number} defaultValue - Default if setting is missing or invalid
 * @param {number} minValue - Minimum allowed value (default: 1)
 * @returns {number}
 */
export function getNumericSetting(settings, key, defaultValue, minValue = 1) {
  if (!settings || settings[key] === undefined) {
    return defaultValue;
  }
  const value = Number(settings[key]);
  if (isNaN(value) || value < minValue) {
    return defaultValue;
  }
  return value;
}

/**
 * Parse a string setting with fallback.
 * @param {object} settings - Settings object from useSettings hook
 * @param {string} key - Setting key to read
 * @param {string} defaultValue - Default if setting is missing
 * @returns {string}
 */
export function getStringSetting(settings, key, defaultValue) {
  if (!settings || settings[key] === undefined) {
    return defaultValue;
  }
  return settings[key];
}

// ============================================================================
// SORT UTILITIES
// ============================================================================

/**
 * Create a comparator function for sorting by title or count
 * @param {string} sortBy - Sort option: 'title-asc', 'title-desc', 'count-asc', 'count-desc'
 * @param {string} titleField - Field name for title (default: 'title')
 * @param {string} countField - Field name for count (default: 'count')
 * @returns {Function} Comparator function for Array.sort()
 */
export function createSortComparator(sortBy, titleField = 'title', countField = 'count') {
  return (a, b) => {
    switch (sortBy) {
      case 'title-asc':
        return (a[titleField] || '').localeCompare(b[titleField] || '');
      case 'title-desc':
        return (b[titleField] || '').localeCompare(a[titleField] || '');
      case 'count-desc':
        return (b[countField] || 0) - (a[countField] || 0);
      case 'count-asc':
        return (a[countField] || 0) - (b[countField] || 0);
      default:
        return 0;
    }
  };
}

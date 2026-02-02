/**
 * Video player utilities
 *
 * Contains: date parsing, video source utilities, device detection
 */

import { getStringSetting } from './utils';

// ============================================================================
// VIDEO DATE UTILITIES
// ============================================================================

/**
 * Parse YYYYMMDD format upload_date to Date
 * @param {string} uploadDate - Date in YYYYMMDD format
 * @returns {Date|null} Parsed date or null if invalid
 */
const parseUploadDate = (uploadDate) => {
  if (!uploadDate) return null;
  const year = uploadDate.slice(0, 4);
  const month = uploadDate.slice(4, 6);
  const day = uploadDate.slice(6, 8);
  const parsed = new Date(`${year}-${month}-${day}`);
  return isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Parse video date for sorting - library/playlist context
 * Uses settings preference (uploaded vs downloaded) for downloaded videos
 * @param {object} video - Video object with upload_date and/or downloaded_at
 * @param {object} settings - Settings object from useSettings hook
 * @returns {Date} Parsed date for comparison (always valid)
 */
export const parseVideoDate = (video, settings) => {
  if (!video) return new Date(0);

  const dateDisplay = getStringSetting(settings, 'library_date_display', 'downloaded');
  if (dateDisplay === 'uploaded' && video.upload_date) {
    const parsed = parseUploadDate(video.upload_date);
    if (parsed) return parsed;
  }
  if (video.downloaded_at) {
    const date = new Date(video.downloaded_at);
    if (!isNaN(date.getTime())) return date;
  }
  return new Date(0);
};

/**
 * Parse video date for sorting - discover context (not yet downloaded videos)
 * Always uses upload_date, falls back to discovered_at
 * @param {object} video - Video object with upload_date and/or discovered_at
 * @returns {Date} Parsed date for comparison (always valid)
 */
export const parseDiscoverVideoDate = (video) => {
  if (!video) return new Date(0);

  if (video.upload_date) {
    const parsed = parseUploadDate(video.upload_date);
    if (parsed) return parsed;
  }

  if (video.discovered_at) {
    const date = new Date(video.discovered_at);
    if (!isNaN(date.getTime())) return date;
  }

  return new Date(0);
};

/**
 * Parse video date for sorting - playlist context
 * Uses downloaded_at, falls back to discovered_at
 * @param {object} video - Video object with downloaded_at and/or discovered_at
 * @returns {Date} Parsed date for comparison (always valid)
 */
export const parsePlaylistVideoDate = (video) => {
  if (!video) return new Date(0);

  if (video.downloaded_at) {
    const date = new Date(video.downloaded_at);
    if (!isNaN(date.getTime())) return date;
  }

  if (video.discovered_at) {
    const date = new Date(video.discovered_at);
    if (!isNaN(date.getTime())) return date;
  }

  return new Date(0);
};

// ============================================================================
// CONSTANTS
// ============================================================================

export const SEEK_TIME_SECONDS = 10;
export const PROGRESS_SAVE_DEBOUNCE_MS = 3000;
export const WATCHED_THRESHOLD = 0.9;

/**
 * Get user-friendly error message for video playback errors
 * @param {number} errorCode - MediaError code (1-4)
 * @param {boolean} isIOS - Whether device is iOS (affects code 4 message)
 * @returns {string} User-friendly error message
 */
export function getVideoErrorMessage(errorCode, isIOS = false) {
  switch (errorCode) {
    case 1:
      return 'Video loading was aborted';
    case 2:
      return 'Network error while loading video';
    case 3:
      return 'Video decoding failed. The file may be corrupted';
    case 4:
      return isIOS
        ? 'Video format not supported. On iOS, try opening in Safari'
        : 'Video format not supported by your browser';
    default:
      return 'Video playback error';
  }
}

// ============================================================================
// VIDEO SOURCE UTILITIES
// ============================================================================

/**
 * Extract video source path from file_path
 * Uses /media/ endpoint which routes to dedicated media server (port 4100)
 * This prevents video requests from queueing behind API calls
 * @param {string} filePath - Full file path
 * @returns {string|null} Media URL
 */
export const getVideoSource = (filePath) => {
  if (!filePath) return null;
  const pathParts = filePath.replace(/\\/g, '/').split('/');
  const downloadsIndex = pathParts.indexOf('downloads');
  const relativePath = downloadsIndex >= 0
    ? pathParts.slice(downloadsIndex + 1).join('/')
    : pathParts.slice(-2).join('/');
  return `/media/${relativePath}`;
};

// ============================================================================
// DEVICE DETECTION
// ============================================================================

/**
 * Detect device type for player configuration
 * @returns {{ isMobile: boolean, isIOS: boolean }}
 */
export const detectDeviceType = () => {
  const isMobileDevice = () => {
    const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return hasCoarsePointer && isMobileUA;
  };

  const isIOSDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  return { isMobile: isMobileDevice(), isIOS: isIOSDevice };
};

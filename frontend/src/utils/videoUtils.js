/**
 * Video player utilities for video.js
 *
 * Combines: videoPlayerUtils, createTheaterButton, createSeekButtons
 * Note: Mobile touch controls removed - mobile uses native HTML5 video player
 */

import videojs from 'video.js';
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
 * @param {string} filePath - Full file path
 * @returns {string|null} API media URL
 */
export const getVideoSource = (filePath) => {
  if (!filePath) return null;
  const pathParts = filePath.replace(/\\/g, '/').split('/');
  const downloadsIndex = pathParts.indexOf('downloads');
  const relativePath = downloadsIndex >= 0
    ? pathParts.slice(downloadsIndex + 1).join('/')
    : pathParts.slice(-2).join('/');
  return `/api/media/${relativePath}`;
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

// ============================================================================
// THEATER MODE BUTTON
// ============================================================================

const Button = videojs.getComponent('Button');

// Global flag to ensure theater button is only registered once
let theaterButtonRegistered = false;

/**
 * Registers the theater mode button component with video.js
 */
export function registerTheaterButton() {
  if (theaterButtonRegistered) return;

  class TheaterButton extends Button {
    constructor(player, options) {
      super(player, options);
      this.addClass('vjs-theater-button');

      // Store callback from options
      this.onToggleCallback = options?.onToggle;

      // Set initial state based on localStorage
      const isTheaterMode = localStorage.getItem('theaterMode') === 'true';
      if (isTheaterMode) {
        this.addClass('vjs-theater-mode-active');
        this.controlText('Default view');
      } else {
        this.controlText('Theater mode');
      }
    }

    buildCSSClass() {
      return `vjs-theater-button ${super.buildCSSClass()}`;
    }

    handleClick() {
      const currentMode = localStorage.getItem('theaterMode') === 'true';
      const newMode = !currentMode;
      localStorage.setItem('theaterMode', String(newMode));

      // Notify other components of theater mode change
      window.dispatchEvent(new Event('storage'));

      // Toggle CSS class and tooltip
      if (newMode) {
        this.addClass('vjs-theater-mode-active');
        this.controlText('Default view');
      } else {
        this.removeClass('vjs-theater-mode-active');
        this.controlText('Theater mode');
      }

      if (this.onToggleCallback) {
        this.onToggleCallback(newMode);
      }
    }

    createEl() {
      const el = super.createEl('button', {
        className: this.buildCSSClass(),
      });

      // Find the existing vjs-icon-placeholder created by parent Button
      const iconPlaceholder = el.querySelector('.vjs-icon-placeholder');
      if (iconPlaceholder) {
        // Set our SVG icon inside the existing placeholder
        iconPlaceholder.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theater-icon-expand">
            <line x1="2" y1="5" x2="2" y2="19"></line>
            <line x1="11" y1="12" x2="4" y2="12"></line>
            <polyline points="7,9 4,12 7,15"></polyline>
            <line x1="13" y1="12" x2="20" y2="12"></line>
            <polyline points="17,9 20,12 17,15"></polyline>
            <line x1="22" y1="5" x2="22" y2="19"></line>
          </svg>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theater-icon-contract">
            <line x1="1" y1="12" x2="6" y2="12"></line>
            <polyline points="3,9 6,12 3,15"></polyline>
            <line x1="9" y1="5" x2="9" y2="19"></line>
            <line x1="15" y1="5" x2="15" y2="19"></line>
            <line x1="23" y1="12" x2="18" y2="12"></line>
            <polyline points="21,9 18,12 21,15"></polyline>
          </svg>
        `;
      }

      return el;
    }
  }

  videojs.registerComponent('TheaterButton', TheaterButton);
  theaterButtonRegistered = true;
}

/**
 * Wrapper function that registers the theater button component.
 * @param {Function} onToggle - Unused, kept for backwards compatibility
 */
export function createTheaterButton(onToggle) {
  registerTheaterButton();
}

/**
 * Updates theater button visual state based on current mode
 * @param {Object} player - Video.js player instance
 * @param {boolean} isTheaterMode - Current theater mode state
 */
export function updateTheaterButtonState(player, isTheaterMode) {
  const theaterButton = player.controlBar.getChild('TheaterButton');
  if (!theaterButton) return;

  if (isTheaterMode) {
    theaterButton.addClass('vjs-theater-mode-active');
    theaterButton.controlText('Default view');
  } else {
    theaterButton.removeClass('vjs-theater-mode-active');
    theaterButton.controlText('Theater mode');
  }
}

// ============================================================================
// SEEK BUTTONS
// ============================================================================

/**
 * Seek Backward 10s Button
 */
class SeekBackward10Button extends Button {
  constructor(player, options) {
    super(player, options);
    this.controlText('Seek backward 10 seconds');
  }

  buildCSSClass() {
    return `vjs-seek-backward-10 ${super.buildCSSClass()}`;
  }

  handleClick() {
    const player = this.player();
    const currentTime = player.currentTime();
    player.currentTime(currentTime - 10);
  }

  createEl() {
    const el = super.createEl('button', {
      className: 'vjs-seek-backward-10 vjs-control vjs-button',
    });

    el.innerHTML = `
      <span class="vjs-icon-placeholder" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
          <text x="12" y="16" text-anchor="middle" font-size="7" font-weight="bold" fill="currentColor">10</text>
        </svg>
      </span>
    `;

    return el;
  }
}

/**
 * Seek Forward 10s Button
 */
class SeekForward10Button extends Button {
  constructor(player, options) {
    super(player, options);
    this.controlText('Seek forward 10 seconds');
  }

  buildCSSClass() {
    return `vjs-seek-forward-10 ${super.buildCSSClass()}`;
  }

  handleClick() {
    const player = this.player();
    const currentTime = player.currentTime();
    player.currentTime(currentTime + 10);
  }

  createEl() {
    const el = super.createEl('button', {
      className: 'vjs-seek-forward-10 vjs-control vjs-button',
    });

    el.innerHTML = `
      <span class="vjs-icon-placeholder" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
          <text x="12" y="16" text-anchor="middle" font-size="7" font-weight="bold" fill="currentColor">10</text>
        </svg>
      </span>
    `;

    return el;
  }
}

// Register seek button components with Video.js
videojs.registerComponent('SeekBackward10Button', SeekBackward10Button);
videojs.registerComponent('SeekForward10Button', SeekForward10Button);

export { SeekBackward10Button, SeekForward10Button };

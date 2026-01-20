/**
 * Settings utilities for parsing backend settings values.
 *
 * Backend stores settings as strings. These helpers provide consistent parsing.
 *
 * Settings architecture:
 * - Global settings (theme, hide_watched, items_per_page, etc.) → useSettings hook (synced to backend)
 * - UI state (sort order, filters, expansions) → localStorage (device-specific)
 */

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

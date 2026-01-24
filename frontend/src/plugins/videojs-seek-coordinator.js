import videojs from 'video.js';

const Plugin = videojs.getPlugin('plugin');

/**
 * Video.js Seek Coordinator Plugin
 *
 * Solves seeking issues with yt-dlp videos by:
 * - Batching rapid seeks via RAF (no dropped inputs)
 * - Snapping to likely keyframes (smoother playback on sparse keyframes)
 * - Respecting Chrome decoder settling window (prevents decoder resets)
 *
 * Usage:
 *   const player = videojs('video');
 *   player.seekCoordinator({
 *     snapBackward: 0.4,  // Snap 400ms backward for keyframes
 *     settleTime: 100,    // Wait 100ms after seeks for Chrome
 *     enabled: true       // Enable/disable plugin
 *   });
 */
class SeekCoordinatorPlugin extends Plugin {
  constructor(player, options) {
    super(player, options);

    // Configuration
    this.options = videojs.obj.merge({
      snapBackward: 0.4,      // Seconds to snap backward (keyframe hedge)
      settleTime: 100,        // Milliseconds to wait after seek completes
      enabled: true,          // Plugin enable/disable
      minSnapTime: 1.0,       // Don't snap if time < this (avoid negative times)
      debug: false,           // Console logging
    }, options);

    // State
    this.seekTarget = null;           // Target time for next seek
    this.rafId = null;                // RequestAnimationFrame ID
    this.isSeeking = false;           // Player is currently seeking
    this.lastSeekCompleteTime = 0;   // Timestamp of last seek completion
    this.originalCurrentTime = null;  // Store original currentTime method

    // Only initialize if enabled
    if (this.options.enabled) {
      this.initialize();
    }
  }

  initialize() {
    this.log('Initializing Seek Coordinator Plugin');

    // Wrap player.currentTime() to intercept ALL seek requests
    this.wrapCurrentTime();

    // Bind handlers so we can remove them later
    this._handleSeeking = () => this.handleSeeking();
    this._handleSeeked = () => this.handleSeeked();

    // Listen to seeking state events
    this.player.on('seeking', this._handleSeeking);
    this.player.on('seeked', this._handleSeeked);
  }

  /**
   * Wrap player.currentTime() to intercept seeks
   * This catches keyboard, scrubbing, mobile, programmatic - everything
   */
  wrapCurrentTime() {
    const player = this.player;

    // Store original method
    this.originalCurrentTime = player.currentTime.bind(player);

    // Override currentTime
    player.currentTime = (time) => {
      // Getter: return current time (no interception needed)
      if (time === undefined) {
        return this.originalCurrentTime();
      }

      // Setter: intercept and coordinate the seek
      this.requestSeek(time);

      // Return player for chaining
      return player;
    };

    this.log('Wrapped player.currentTime()');
  }

  /**
   * Request a seek - called by wrapped currentTime() or directly
   * Can be called many times per frame, RAF batches execution
   */
  requestSeek(targetTime) {
    if (!this.options.enabled) {
      // Plugin disabled, pass through to original
      return this.originalCurrentTime(targetTime);
    }

    // Validate time
    const duration = this.player.duration();
    if (isNaN(targetTime) || !duration || isNaN(duration)) {
      return;
    }

    // Update seek target (multiple calls just overwrite this value)
    this.seekTarget = targetTime;

    this.log(`Seek requested: ${targetTime.toFixed(2)}s`);

    // Schedule RAF if not already scheduled
    if (!this.rafId) {
      this.rafId = requestAnimationFrame(() => this.executeSeek());
    }
  }

  /**
   * RAF execution loop - runs once per frame when seek pending
   */
  executeSeek() {
    this.rafId = null;

    // Check if we have a valid seek target
    if (this.seekTarget === null) {
      return;
    }

    const player = this.player;

    // Safety checks
    if (!player || player.isDisposed()) {
      this.seekTarget = null;
      return;
    }

    if (player.readyState() < 1) {
      // Metadata not loaded yet, retry next frame
      this.log('Metadata not ready, retrying...');
      this.rafId = requestAnimationFrame(() => this.executeSeek());
      return;
    }

    const duration = player.duration();
    if (!duration || isNaN(duration)) {
      this.seekTarget = null;
      return;
    }

    // Don't interrupt active seeks (Chrome decoder stability)
    if (this.isSeeking) {
      this.log('Already seeking, re-queuing...');
      this.rafId = requestAnimationFrame(() => this.executeSeek());
      return;
    }

    // Chrome settling window: give decoder time to stabilize
    const timeSinceLastSeek = Date.now() - this.lastSeekCompleteTime;
    if (this.lastSeekCompleteTime > 0 && timeSinceLastSeek < this.options.settleTime) {
      this.log(`In settling window (${timeSinceLastSeek}ms), waiting...`);
      this.rafId = requestAnimationFrame(() => this.executeSeek());
      return;
    }

    // Clamp to valid range
    let targetTime = Math.max(0, Math.min(duration, this.seekTarget));

    // Apply keyframe snapping
    const snappedTime = this.snapToLikelyKeyframe(targetTime);

    this.log(`Executing seek: ${targetTime.toFixed(2)}s → ${snappedTime.toFixed(2)}s (snapped)`);

    // Clear seek target
    this.seekTarget = null;

    // Execute the seek using original method (bypass our wrapper)
    this.originalCurrentTime(snappedTime);
  }

  /**
   * Snap backward to land near likely keyframe
   * yt-dlp videos have keyframes every 2-10 seconds
   * Snapping backward ~400ms reduces decoder overhead
   */
  snapToLikelyKeyframe(time) {
    // Don't snap at video start
    if (time < this.options.minSnapTime) {
      return time;
    }

    // Snap backward (YouTube GOP hedge)
    const snapped = Math.max(0, time - this.options.snapBackward);

    return snapped;
  }

  /**
   * Handle seeking event (player started seeking)
   */
  handleSeeking() {
    this.isSeeking = true;
    this.log('Seeking started');
  }

  /**
   * Handle seeked event (seek completed)
   */
  handleSeeked() {
    this.isSeeking = false;
    this.lastSeekCompleteTime = Date.now();
    this.log('Seek completed');

    // If there's a queued seek, schedule RAF to execute it
    // (will respect settling window)
    if (this.seekTarget !== null && !this.rafId) {
      this.rafId = requestAnimationFrame(() => this.executeSeek());
    }
  }

  /**
   * Enable plugin
   */
  enable() {
    if (!this.options.enabled) {
      this.options.enabled = true;
      this.initialize();
      this.log('Plugin enabled');
    }
  }

  /**
   * Disable plugin and restore original behavior
   */
  disable() {
    if (this.options.enabled) {
      this.options.enabled = false;

      // Cancel any pending RAF
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }

      // Restore original currentTime if we wrapped it
      if (this.originalCurrentTime && this.player && !this.player.isDisposed()) {
        this.player.currentTime = this.originalCurrentTime;
      }

      this.log('Plugin disabled');
    }
  }

  /**
   * Debug logging
   */
  log(message) {
    if (this.options.debug) {
      console.log(`[SeekCoordinator] ${message}`);
    }
  }

  /**
   * Cleanup on player disposal
   */
  dispose() {
    // Cancel any pending RAF
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // Remove event listeners if player still exists
    if (this.player && !this.player.isDisposed()) {
      if (this._handleSeeking) {
        this.player.off('seeking', this._handleSeeking);
      }
      if (this._handleSeeked) {
        this.player.off('seeked', this._handleSeeked);
      }

      // Restore original currentTime if we wrapped it
      if (this.originalCurrentTime) {
        this.player.currentTime = this.originalCurrentTime;
        this.originalCurrentTime = null;
      }
    }

    this.seekTarget = null;
    this.options.enabled = false;

    // Only call super.dispose() if player is still valid
    if (this.player && !this.player.isDisposed()) {
      super.dispose();
    }
  }
}

// Register plugin with Video.js
videojs.registerPlugin('seekCoordinator', SeekCoordinatorPlugin);

export default SeekCoordinatorPlugin;

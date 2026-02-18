/**
 * Wake Sentinel Plugin
 * Keeps screen awake during video playback
 */
import videojs from 'video.js';

const Plugin = videojs.getPlugin('plugin');

class WakeSentinelPlugin extends Plugin {
  wakeLock = null;
  wakeLockFail = false;

  constructor(player, options) {
    super(player, options);

    // Listen for visibility change events
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        // Reacquire the wake lock when the page becomes visible
        await this.acquireWakeLock();
      }
    });

    // Acquire wake lock on ready and play
    player.ready(async () => {
      player.addClass('vjs-wake-sentinel');
      await this.acquireWakeLock(true);
    });
    player.on('play', () => this.acquireWakeLock());

    // Release wake lock on pause, dispose and end
    player.on('pause', () => this.releaseWakeLock());
    player.on('dispose', () => this.releaseWakeLock());
    player.on('ended', () => this.releaseWakeLock());
  }

  async releaseWakeLock() {
    this.wakeLock?.release().then(() => (this.wakeLock = null));
  }

  async acquireWakeLock(log = false) {
    // If wake lock failed, don't even try
    if (this.wakeLockFail) return;
    // Check for wake lock on startup
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
      } catch (err) {
        if (log) console.error('Failed to obtain Screen Wake Lock:', err);
        this.wakeLockFail = true;
      }
    } else {
      if (log) {
        console.warn(
          'Screen Wake Lock API not supported. Secure context (https or localhost) and modern browser required.'
        );
      }
      this.wakeLockFail = true;
    }
  }
}

videojs.registerPlugin('wakeSentinel', WakeSentinelPlugin);

export default WakeSentinelPlugin;

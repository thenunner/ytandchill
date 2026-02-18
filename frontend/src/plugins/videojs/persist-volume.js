/**
 * Persist Volume Plugin
 * Saves volume/mute state to localStorage
 */
import videojs from 'video.js';

const Plugin = videojs.getPlugin('plugin');

const levelKey = 'videojs-volume-level';
const mutedKey = 'videojs-volume-muted';

class PersistVolumePlugin extends Plugin {
  enabled = true;

  constructor(player, options) {
    super(player, options);

    this.enabled = options?.enabled ?? true;

    player.on('volumechange', () => {
      if (this.enabled) {
        localStorage.setItem(levelKey, player.volume());
        localStorage.setItem(mutedKey, player.muted());
      }
    });

    player.ready(() => {
      this.restoreVolume();
    });
  }

  restoreVolume() {
    const level = localStorage.getItem(levelKey);
    const muted = localStorage.getItem(mutedKey);

    if (level !== null) {
      this.player.volume(parseFloat(level));
    }

    if (muted !== null) {
      this.player.muted(muted === 'true');
    }
  }
}

videojs.registerPlugin('persistVolume', PersistVolumePlugin);

export default PersistVolumePlugin;

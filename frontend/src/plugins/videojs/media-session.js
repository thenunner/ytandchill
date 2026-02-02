/**
 * Media Session Plugin - from Stash
 * https://github.com/stashapp/stash/blob/master/ui/v2.5/src/components/ScenePlayer/media-session.ts
 * Converted from TypeScript to JavaScript
 */
import videojs from 'video.js';

const Plugin = videojs.getPlugin('plugin');

class MediaSessionPlugin extends Plugin {
  constructor(player, options) {
    super(player, options);

    player.ready(() => {
      player.addClass('vjs-media-session');
      this.setActionHandlers();
    });

    player.on('play', () => {
      this.updatePlaybackState();
    });

    player.on('pause', () => {
      this.updatePlaybackState();
    });

    this.updatePlaybackState();
  }

  setMetadata(title, artist, poster) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        artwork: [
          {
            src: poster || this.player.poster() || '',
            type: 'image/jpeg',
          },
        ],
      });
    }
  }

  updatePlaybackState() {
    if ('mediaSession' in navigator) {
      const playbackState = this.player.paused() ? 'paused' : 'playing';
      navigator.mediaSession.playbackState = playbackState;
    }
  }

  setActionHandlers() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => {
      this.player.play();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      this.player.pause();
    });
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      this.player.currentTime(this.player.currentTime() - 10);
    });
    navigator.mediaSession.setActionHandler('seekforward', () => {
      this.player.currentTime(this.player.currentTime() + 10);
    });
  }
}

videojs.registerPlugin('mediaSession', MediaSessionPlugin);

export default MediaSessionPlugin;

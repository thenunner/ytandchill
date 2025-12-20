import videojs from 'video.js';

const Button = videojs.getComponent('Button');

/**
 * Creates a custom theater mode button for video.js player
 * Theater mode makes the video player wider on desktop
 *
 * @param {Function} onToggle - Callback function when theater mode is toggled
 * @returns {Component} VideoJS Button component
 */
export function createTheaterButton(onToggle) {
  class TheaterButton extends Button {
    constructor(player, options) {
      super(player, options);
      this.controlText('Theater mode');
      this.addClass('vjs-theater-button');
    }

    buildCSSClass() {
      return `vjs-theater-button ${super.buildCSSClass()}`;
    }

    handleClick() {
      const currentMode = localStorage.getItem('theaterMode') === 'true';
      const newMode = !currentMode;
      localStorage.setItem('theaterMode', String(newMode));

      if (onToggle) {
        onToggle(newMode);
      }
    }

    createEl() {
      const el = super.createEl('button', {
        className: this.buildCSSClass(),
      });

      const notPressedIcon = videojs.dom.createEl('span', {
        className: 'vjs-icon-placeholder theater-icon-not-pressed',
        innerHTML: `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="6" width="20" height="12" rx="2"></rect>
            <path d="M7 6V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"></path>
          </svg>
        `,
      });

      const pressedIcon = videojs.dom.createEl('span', {
        className: 'vjs-icon-placeholder theater-icon-pressed',
        innerHTML: `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="18" rx="2"></rect>
          </svg>
        `,
      });

      el.appendChild(notPressedIcon);
      el.appendChild(pressedIcon);

      return el;
    }
  }

  videojs.registerComponent('TheaterButton', TheaterButton);
  return TheaterButton;
}

/**
 * Updates theater button visual state based on current mode
 * @param {Object} player - Video.js player instance
 * @param {boolean} isTheaterMode - Current theater mode state
 */
export function updateTheaterButtonState(player, isTheaterMode) {
  const theaterButton = player.controlBar.getChild('TheaterButton');
  if (!theaterButton) return;

  const el = theaterButton.el();
  const pressedIcon = el.querySelector('.theater-icon-pressed');
  const notPressedIcon = el.querySelector('.theater-icon-not-pressed');

  if (pressedIcon && notPressedIcon) {
    if (isTheaterMode) {
      pressedIcon.style.display = 'block';
      notPressedIcon.style.display = 'none';
    } else {
      pressedIcon.style.display = 'none';
      notPressedIcon.style.display = 'block';
    }
  }
}

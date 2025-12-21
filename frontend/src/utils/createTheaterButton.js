import videojs from 'video.js';

const Button = videojs.getComponent('Button');

// Global flag to ensure component is only registered once
let componentRegistered = false;

/**
 * Registers the theater mode button component
 */
export function registerTheaterButton() {
  if (componentRegistered) return;

  class TheaterButton extends Button {
    constructor(player, options) {
      super(player, options);
      this.controlText('Theater mode');
      this.addClass('vjs-theater-button');

      // Store callback from options
      this.onToggleCallback = options?.onToggle;

      // Set initial state based on localStorage
      const isTheaterMode = localStorage.getItem('theaterMode') === 'true';
      if (isTheaterMode) {
        this.addClass('vjs-theater-mode-active');
      }
    }

    buildCSSClass() {
      return `vjs-theater-button ${super.buildCSSClass()}`;
    }

    handleClick() {
      const currentMode = localStorage.getItem('theaterMode') === 'true';
      const newMode = !currentMode;
      localStorage.setItem('theaterMode', String(newMode));

      // Toggle CSS class
      if (newMode) {
        this.addClass('vjs-theater-mode-active');
      } else {
        this.removeClass('vjs-theater-mode-active');
      }

      if (this.onToggleCallback) {
        this.onToggleCallback(newMode);
      }
    }

    createEl() {
      const el = super.createEl('button', {
        className: this.buildCSSClass(),
      });

      // Single icon that changes via CSS
      const iconPlaceholder = videojs.dom.createEl('span', {
        className: 'vjs-icon-placeholder',
        innerHTML: `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="6" width="20" height="12" rx="2"></rect>
            <path d="M7 6V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" class="theater-top"></path>
          </svg>
        `,
      });

      el.appendChild(iconPlaceholder);
      return el;
    }
  }

  videojs.registerComponent('TheaterButton', TheaterButton);
  componentRegistered = true;
}

/**
 * Creates a custom theater mode button for video.js player (deprecated - use registerTheaterButton)
 * @deprecated Use registerTheaterButton() instead
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

  // Update button class based on mode
  if (isTheaterMode) {
    theaterButton.addClass('vjs-theater-mode-active');
  } else {
    theaterButton.removeClass('vjs-theater-mode-active');
  }
}

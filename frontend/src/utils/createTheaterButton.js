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
        // Expand icon: | ←  → | (bars on outside, arrows pointing out)
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

  // Update button class and tooltip based on mode
  if (isTheaterMode) {
    theaterButton.addClass('vjs-theater-mode-active');
    theaterButton.controlText('Default view');
  } else {
    theaterButton.removeClass('vjs-theater-mode-active');
    theaterButton.controlText('Theater mode');
  }
}

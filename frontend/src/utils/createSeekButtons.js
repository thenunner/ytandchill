import videojs from 'video.js';

const Button = videojs.getComponent('Button');

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
    player.currentTime(currentTime - 10); // Plugin will batch this
  }

  createEl() {
    const el = super.createEl('button', {
      className: 'vjs-seek-backward-10 vjs-control vjs-button',
    });

    // SVG icon (10 with curved arrow)
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
    player.currentTime(currentTime + 10); // Plugin will batch this
  }

  createEl() {
    const el = super.createEl('button', {
      className: 'vjs-seek-forward-10 vjs-control vjs-button',
    });

    // SVG icon (10 with curved arrow)
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

// Register components with Video.js
videojs.registerComponent('SeekBackward10Button', SeekBackward10Button);
videojs.registerComponent('SeekForward10Button', SeekForward10Button);

export { SeekBackward10Button, SeekForward10Button };

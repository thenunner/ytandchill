// Shared utilities for video.js players

// Constants
export const SEEK_TIME_SECONDS = 10;
export const DOUBLE_TAP_DELAY_MS = 250;
export const BUTTON_HIDE_DELAY_MS = 1500;
export const PROGRESS_SAVE_DEBOUNCE_MS = 3000;
export const WATCHED_THRESHOLD = 0.9;

// Extract video source path from file_path
export const getVideoSource = (filePath) => {
  if (!filePath) return null;
  const pathParts = filePath.replace(/\\/g, '/').split('/');
  const downloadsIndex = pathParts.indexOf('downloads');
  const relativePath = downloadsIndex >= 0
    ? pathParts.slice(downloadsIndex + 1).join('/')
    : pathParts.slice(-2).join('/');
  return `/api/media/${relativePath}`;
};

// Format duration in seconds to HH:MM:SS or MM:SS
export const formatDuration = (seconds) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hrs > 0
    ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    : `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Detect device type
export const detectDeviceType = () => {
  const isMobileDevice = () => {
    const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return hasCoarsePointer && isMobileUA;
  };

  const isIOSDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  return { isMobile: isMobileDevice(), isIOS: isIOSDevice };
};

// Initialize YouTube-style mobile touch controls for video.js player
export const initializeMobileTouchControls = (player, isIOSDevice) => {
  console.log('Initializing YouTube-style touch controls');

  // Double-tap to enter fullscreen when NOT in fullscreen, prevent exit when IN fullscreen
  let lastVideoTapTime = 0;
  const mediaTouchHandler = (e) => {
    const currentTime = Date.now();
    const isDoubleTap = (currentTime - lastVideoTapTime) < DOUBLE_TAP_DELAY_MS;

    if (!player.isFullscreen()) {
      if (isDoubleTap) {
        e.preventDefault();
        player.requestFullscreen();
      }
    } else {
      if (isDoubleTap) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    lastVideoTapTime = currentTime;
  };

  const videoElement = player.el().querySelector('video');
  videoElement.addEventListener('touchend', mediaTouchHandler);

  // Create touch overlay that covers the video area
  const touchOverlay = document.createElement('div');
  touchOverlay.className = 'vjs-touch-overlay';
  touchOverlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 60px;
    display: none;
    z-index: 150;
    -webkit-tap-highlight-color: transparent;
    pointer-events: auto !important;
  `;

  // Modern semi-transparent button style (YouTube-like)
  const buttonStyle = (size = 100) => `
    position: absolute;
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 2px solid rgba(255, 255, 255, 0.25);
    border-radius: 50%;
    width: ${size}px;
    height: ${size}px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 0.2s ease, transform 0.2s ease;
    pointer-events: auto !important;
    cursor: pointer;
    z-index: 200;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  `;

  // Create buttons in fixed positions
  const rewindBtn = document.createElement('button');
  rewindBtn.className = 'vjs-mobile-btn';
  rewindBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="white" style="width: 40px; height: 40px;">
      <path d="M11.5 12L20 18V6M11 18V6l-8.5 6"/>
    </svg>
  `;
  rewindBtn.style.cssText = buttonStyle(110) + `left: 20%; top: 50%; transform: translate(-50%, -50%) scale(0.9);`;

  const playPauseBtn = document.createElement('button');
  playPauseBtn.className = 'vjs-mobile-btn';
  playPauseBtn.innerHTML = `
    <svg class="play-icon" viewBox="0 0 24 24" fill="white" style="width: 50px; height: 50px;">
      <polygon points="8 5 19 12 8 19 8 5"/>
    </svg>
    <svg class="pause-icon" viewBox="0 0 24 24" fill="white" style="width: 50px; height: 50px; display: none;">
      <rect x="6" y="4" width="4" height="16" rx="2"/>
      <rect x="14" y="4" width="4" height="16" rx="2"/>
    </svg>
  `;
  playPauseBtn.style.cssText = buttonStyle(130) + `left: 50%; top: 50%; transform: translate(-50%, -50%) scale(0.9);`;

  const forwardBtn = document.createElement('button');
  forwardBtn.className = 'vjs-mobile-btn';
  forwardBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="white" style="width: 40px; height: 40px;">
      <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
    </svg>
  `;
  forwardBtn.style.cssText = buttonStyle(110) + `right: 20%; top: 50%; transform: translate(50%, -50%) scale(0.9);`;

  const exitBtn = document.createElement('button');
  exitBtn.className = 'vjs-mobile-btn';
  exitBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="white" style="width: 32px; height: 32px;">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>
  `;
  exitBtn.style.cssText = buttonStyle(100) + `left: 50%; top: 50px; transform: translate(-50%, 0) scale(0.9);`;

  touchOverlay.appendChild(rewindBtn);
  touchOverlay.appendChild(playPauseBtn);
  touchOverlay.appendChild(forwardBtn);
  touchOverlay.appendChild(exitBtn);

  let currentVisibleButton = null;
  let lastTapTime = 0;
  let lastTapZone = null;
  let hideTimeoutId = null;
  let lastSeekTime = 0;
  const SEEK_COOLDOWN_MS = 300; // Minimum 300ms between seeks to prevent buffer corruption

  const showButton = (button) => {
    // Hide all buttons first
    [rewindBtn, playPauseBtn, forwardBtn, exitBtn].forEach(btn => {
      btn.style.opacity = '0';
      if (btn === rewindBtn) btn.style.transform = 'translate(-50%, -50%) scale(0.9)';
      else if (btn === forwardBtn) btn.style.transform = 'translate(50%, -50%) scale(0.9)';
      else if (btn === exitBtn) btn.style.transform = 'translate(-50%, 0) scale(0.9)';
      else btn.style.transform = 'translate(-50%, -50%) scale(0.9)';
    });

    // Show only the tapped zone's button
    button.style.opacity = '1';
    if (button === rewindBtn) button.style.transform = 'translate(-50%, -50%) scale(1)';
    else if (button === forwardBtn) button.style.transform = 'translate(50%, -50%) scale(1)';
    else if (button === exitBtn) button.style.transform = 'translate(-50%, 0) scale(1)';
    else button.style.transform = 'translate(-50%, -50%) scale(1)';

    currentVisibleButton = button;

    if (hideTimeoutId) clearTimeout(hideTimeoutId);
    hideTimeoutId = setTimeout(() => {
      button.style.opacity = '0';
      if (button === rewindBtn) button.style.transform = 'translate(-50%, -50%) scale(0.9)';
      else if (button === forwardBtn) button.style.transform = 'translate(50%, -50%) scale(0.9)';
      else if (button === exitBtn) button.style.transform = 'translate(-50%, 0) scale(0.9)';
      else button.style.transform = 'translate(-50%, -50%) scale(0.9)';
      currentVisibleButton = null;
    }, BUTTON_HIDE_DELAY_MS);
  };

  const updatePlayPauseIcon = () => {
    const playIcon = playPauseBtn.querySelector('.play-icon');
    const pauseIcon = playPauseBtn.querySelector('.pause-icon');
    if (!player.paused()) {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
    } else {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
    }
  };

  // Detect which zone was tapped
  const overlayTouchHandler = (e) => {
    e.preventDefault();

    const touch = e.changedTouches[0];
    const rect = touchOverlay.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;

    const currentTime = Date.now();
    const isDoubleTap = (currentTime - lastTapTime) < DOUBLE_TAP_DELAY_MS;

    let zone = null;
    let button = null;
    let action = null;

    // Determine zone
    if (y < height * 0.2) {
      zone = 'exit';
      button = exitBtn;
      action = () => player.exitFullscreen();
    } else if (x < width * 0.3) {
      zone = 'rewind';
      button = rewindBtn;
      action = () => {
        try {
          if (!player) return;

          // Enforce cooldown to prevent buffer corruption
          const now = Date.now();
          if (now - lastSeekTime < SEEK_COOLDOWN_MS) {
            console.log('[MobileControls] Rewind ignored - cooldown active');
            return;
          }

          // Check readyState
          if (player.readyState() < 1) {
            console.warn('[MobileControls] Cannot seek - metadata not loaded');
            return;
          }

          const currentTime = player.currentTime();
          const duration = player.duration();

          if (isNaN(currentTime) || isNaN(duration) || duration === 0) return;
          if (player.seeking && player.seeking()) return;

          lastSeekTime = now;
          const newTime = Math.max(0, currentTime - SEEK_TIME_SECONDS);
          player.currentTime(newTime);
        } catch (error) {
          console.error('[MobileControls] Rewind error:', error);
        }
      };
    } else if (x > width * 0.7) {
      zone = 'forward';
      button = forwardBtn;
      action = () => {
        try {
          if (!player) return;

          // Enforce cooldown to prevent buffer corruption
          const now = Date.now();
          if (now - lastSeekTime < SEEK_COOLDOWN_MS) {
            console.log('[MobileControls] Forward ignored - cooldown active');
            return;
          }

          // Check readyState
          if (player.readyState() < 1) {
            console.warn('[MobileControls] Cannot seek - metadata not loaded');
            return;
          }

          const currentTime = player.currentTime();
          const duration = player.duration();

          if (isNaN(currentTime) || isNaN(duration) || duration === 0) return;
          if (player.seeking && player.seeking()) return;

          lastSeekTime = now;
          const newTime = Math.min(duration, currentTime + SEEK_TIME_SECONDS);
          player.currentTime(newTime);
        } catch (error) {
          console.error('[MobileControls] Forward error:', error);
        }
      };
    } else {
      zone = 'center';
      button = playPauseBtn;
      action = () => {
        if (player.paused()) {
          player.play();
        } else {
          player.pause();
        }
      };
    }

    // Center zone = instant action
    if (zone === 'center') {
      action();
      updatePlayPauseIcon();
      showButton(button);
    }
    // Other zones: show on first tap, action on second tap or double-tap
    else {
      const isSameZone = lastTapZone === zone;

      if (isDoubleTap && isSameZone) {
        // Double tap = instant action
        action();
        showButton(button);
      } else if (currentVisibleButton === button) {
        // Button already visible, second tap = action
        action();
        showButton(button);
      } else {
        // First tap = show button only
        showButton(button);
      }
    }

    lastTapTime = currentTime;
    lastTapZone = zone;
  };

  touchOverlay.addEventListener('touchend', overlayTouchHandler);

  player.on('play', updatePlayPauseIcon);
  player.on('pause', updatePlayPauseIcon);
  player.on('playing', updatePlayPauseIcon);

  player.el().appendChild(touchOverlay);

  // Show/hide overlay in fullscreen
  player.on('fullscreenchange', () => {
    if (player.isFullscreen()) {
      touchOverlay.style.display = 'block';
      updatePlayPauseIcon();
    } else {
      touchOverlay.style.display = 'none';
    }
  });

  // Return cleanup function
  return () => {
    if (hideTimeoutId) clearTimeout(hideTimeoutId);
    videoElement.removeEventListener('touchend', mediaTouchHandler);
    touchOverlay.removeEventListener('touchend', overlayTouchHandler);
    if (touchOverlay.parentNode) {
      touchOverlay.parentNode.removeChild(touchOverlay);
    }
  };
};

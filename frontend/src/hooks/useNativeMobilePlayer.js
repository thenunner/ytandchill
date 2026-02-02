import { useEffect, useRef, useCallback } from 'react';

const PROGRESS_SAVE_DEBOUNCE_MS = 3000;
const WATCHED_THRESHOLD = 0.9;

// Wake Lock helper (from Stash)
let wakeLock = null;
let wakeLockFailed = false;

async function acquireWakeLock() {
  if (wakeLockFailed || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {
    wakeLockFailed = true;
  }
}

function releaseWakeLock() {
  wakeLock?.release().then(() => (wakeLock = null)).catch(() => (wakeLock = null));
}

// Media Session helper (from Stash)
function setMediaSessionMetadata(title, artist, poster) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist,
    artwork: poster ? [{ src: poster, type: 'image/jpeg' }] : [],
  });
}

function updateMediaSessionState(paused) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = paused ? 'paused' : 'playing';
}

/**
 * Simple native video player hook for mobile
 * Uses browser's built-in controls - just adds SponsorBlock skip and progress saving
 */
export function useNativeMobilePlayer({
  video,
  videoRef,
  saveProgress = true,
  onEnded = null,
  onWatched = null,
  updateVideoMutation = null,
}) {
  const saveProgressTimeout = useRef(null);
  const hasMarkedWatchedRef = useRef(false);
  const sponsorSkipCooldownRef = useRef(0);
  const videoDataRef = useRef(video);
  const updateVideoRef = useRef(updateVideoMutation);
  const onEndedRef = useRef(onEnded);
  const onWatchedRef = useRef(onWatched);

  // Keep refs updated
  useEffect(() => {
    videoDataRef.current = video;
    updateVideoRef.current = updateVideoMutation;
    onEndedRef.current = onEnded;
    onWatchedRef.current = onWatched;
  }, [video, updateVideoMutation, onEnded, onWatched]);

  // Get video source URL
  const getVideoSource = useCallback((filePath) => {
    if (!filePath) return null;
    const pathParts = filePath.replace(/\\/g, '/').split('/');
    const downloadsIndex = pathParts.indexOf('downloads');
    const relativePath = downloadsIndex >= 0
      ? pathParts.slice(downloadsIndex + 1).join('/')
      : pathParts.slice(-2).join('/');
    return `/media/${relativePath}`;
  }, []);

  // Initialize video element
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !video?.file_path) return;

    // Build video source with resume time
    const savedTime = video.playback_seconds || 0;
    const resumeTime = savedTime >= 60 ? savedTime : 0;
    let videoSrc = getVideoSource(video.file_path);
    if (resumeTime > 0) {
      videoSrc += `#t=${resumeTime.toFixed(2)}`;
    }

    // Set source if different
    const currentSrc = videoEl.src ? new URL(videoEl.src, window.location.origin).pathname : null;
    const targetPath = videoSrc.split('#')[0];
    if (currentSrc !== targetPath) {
      videoEl.src = videoSrc;
      videoEl.load();
    }

    hasMarkedWatchedRef.current = false;

    // Set up Media Session metadata
    if (video.title) {
      setMediaSessionMetadata(
        video.title,
        video.channel_title || '',
        video.thumb_url || ''
      );
    }

    // Set up Media Session action handlers
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => videoEl.play());
      navigator.mediaSession.setActionHandler('pause', () => videoEl.pause());
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        videoEl.currentTime = Math.max(0, videoEl.currentTime - 10);
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        videoEl.currentTime = Math.min(videoEl.duration || 0, videoEl.currentTime + 10);
      });
    }

    // Save progress function
    const saveProgressNow = () => {
      if (!saveProgress || !updateVideoRef.current || !videoDataRef.current) return;
      const time = Math.floor(videoEl.currentTime);
      updateVideoRef.current.mutate({
        id: videoDataRef.current.id,
        data: { playback_seconds: time },
      });
    };

    // Debounced save
    const debouncedSave = () => {
      if (saveProgressTimeout.current) {
        clearTimeout(saveProgressTimeout.current);
      }
      saveProgressTimeout.current = setTimeout(saveProgressNow, PROGRESS_SAVE_DEBOUNCE_MS);
    };

    // SponsorBlock skip
    const checkSponsorBlock = (time) => {
      const segments = videoDataRef.current?.sponsorblock_segments || [];
      if (segments.length === 0) return;

      const now = Date.now();
      if (now - sponsorSkipCooldownRef.current < 2000) return;

      for (const segment of segments) {
        if (time >= segment.start && time < segment.end - 0.5) {
          console.log(`[SponsorBlock] Skipping ${segment.category}`);
          videoEl.currentTime = segment.end;
          sponsorSkipCooldownRef.current = now;
          break;
        }
      }
    };

    // Event handlers
    const handleTimeUpdate = () => {
      const time = videoEl.currentTime;
      debouncedSave();
      checkSponsorBlock(time);

      // Check watched threshold
      if (!hasMarkedWatchedRef.current && videoEl.duration > 0) {
        if (time / videoEl.duration >= WATCHED_THRESHOLD) {
          hasMarkedWatchedRef.current = true;
          if (onWatchedRef.current) onWatchedRef.current();
        }
      }
    };

    const handlePlay = () => {
      acquireWakeLock();
      updateMediaSessionState(false);
    };

    const handlePause = () => {
      saveProgressNow();
      releaseWakeLock();
      updateMediaSessionState(true);
    };

    const handleEnded = () => {
      releaseWakeLock();
      if (onEndedRef.current) onEndedRef.current();
    };

    const handleSeeked = () => {
      saveProgressNow();
    };

    // Add event listeners
    videoEl.addEventListener('play', handlePlay);
    videoEl.addEventListener('timeupdate', handleTimeUpdate);
    videoEl.addEventListener('pause', handlePause);
    videoEl.addEventListener('ended', handleEnded);
    videoEl.addEventListener('seeked', handleSeeked);

    // Cleanup
    return () => {
      videoEl.removeEventListener('play', handlePlay);
      videoEl.removeEventListener('timeupdate', handleTimeUpdate);
      videoEl.removeEventListener('pause', handlePause);
      videoEl.removeEventListener('ended', handleEnded);
      videoEl.removeEventListener('seeked', handleSeeked);
      releaseWakeLock();

      if (saveProgressTimeout.current) {
        clearTimeout(saveProgressTimeout.current);
      }
    };
  }, [video?.id, video?.file_path, videoRef, saveProgress, getVideoSource]);

  // Save on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      const videoEl = videoRef.current;
      if (!videoEl || !updateVideoRef.current || !videoDataRef.current) return;
      const time = Math.floor(videoEl.currentTime);
      updateVideoRef.current.mutate({
        id: videoDataRef.current.id,
        data: { playback_seconds: time },
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [videoRef]);

  // Reacquire wake lock when page becomes visible (from Stash)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const videoEl = videoRef.current;
        if (videoEl && !videoEl.paused) {
          acquireWakeLock();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [videoRef]);

  return { getVideoSource };
}

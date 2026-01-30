import { useEffect, useRef } from 'react';
import { WATCHED_THRESHOLD, PROGRESS_SAVE_DEBOUNCE_MS, getVideoSource, getVideoErrorMessage } from '../utils/videoUtils';

/**
 * Custom hook for native HTML5 video player on mobile devices
 * Lightweight alternative to Video.js that uses browser's native controls
 *
 * Features:
 * - Progress saving (timeupdate + beforeunload)
 * - Resume position (loadedmetadata → seek)
 * - Watched threshold detection
 * - SponsorBlock segment skipping
 * - Subtitle track loading
 * - Graceful error handling
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.video - Video data object
 * @param {React.RefObject} options.videoRef - Ref to native video element
 * @param {boolean} options.saveProgress - Whether to save playback progress
 * @param {Function} options.onEnded - Callback when video ends
 * @param {Function} options.onWatched - Callback when video reaches watched threshold
 * @param {Function} options.onError - Callback for playback errors
 * @param {Object} options.updateVideoMutation - React Query mutation for updating video
 * @returns {React.RefObject} Video element reference
 */
export function useNativeVideoPlayer({
  video,
  videoRef,
  saveProgress = true,
  onEnded = null,
  onWatched = null,
  onError = null,
  updateVideoMutation = null,
}) {
  const hasMarkedWatchedRef = useRef(false);
  const saveProgressTimeout = useRef(null);
  const videoDataRef = useRef(video);
  const updateVideoRef = useRef(updateVideoMutation);
  const sponsorBlockSkipCooldownRef = useRef(0);
  // Store callbacks in refs to avoid effect re-runs when they change
  const onEndedRef = useRef(onEnded);
  const onWatchedRef = useRef(onWatched);
  const onErrorRef = useRef(onError);

  // Keep refs updated with latest values
  useEffect(() => {
    videoDataRef.current = video;
    updateVideoRef.current = updateVideoMutation;
    onEndedRef.current = onEnded;
    onWatchedRef.current = onWatched;
    onErrorRef.current = onError;
  }, [video, updateVideoMutation, onEnded, onWatched, onError]);

  // Reset watched flag when video changes
  useEffect(() => {
    hasMarkedWatchedRef.current = false;
  }, [video?.id]);

  // Main video setup
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !video?.file_path) return;

    const videoSrc = getVideoSource(video.file_path);
    if (!videoSrc) return;

    // Set video source
    videoEl.src = videoSrc;

    // Save progress function
    const saveProgressNow = () => {
      if (!saveProgress || !updateVideoRef.current || !videoDataRef.current) return;
      try {
        const currentTime = Math.floor(videoEl.currentTime);
        updateVideoRef.current.mutate({
          id: videoDataRef.current.id,
          data: { playback_seconds: currentTime },
        });
      } catch (error) {
        console.warn('[useNativeVideoPlayer] Failed to save progress:', error);
      }
    };

    // Restore position on metadata load
    const handleLoadedMetadata = () => {
      const duration = videoEl.duration;
      // Only resume if: position >= 5 seconds AND position < 95% of duration
      const startTime = (video.playback_seconds &&
                         video.playback_seconds >= 5 &&
                         video.playback_seconds < duration * 0.95)
        ? video.playback_seconds
        : 0;
      if (startTime > 0) {
        videoEl.currentTime = startTime;
      }
    };

    // Error handling - graceful format/decode failures
    const handleError = () => {
      const error = videoEl.error;
      if (!error) return;

      const userMessage = getVideoErrorMessage(error.code);
      console.error('[useNativeVideoPlayer] Video error:', error.code, error.message);
      if (onErrorRef.current) onErrorRef.current(userMessage);
    };

    // Progress saving & watched detection during playback
    const handleTimeUpdate = () => {
      if (videoEl.seeking || videoEl.paused) return;

      const currentTime = videoEl.currentTime;
      const duration = videoEl.duration;

      // Watched threshold detection
      if (!hasMarkedWatchedRef.current && duration > 0 &&
          currentTime / duration >= WATCHED_THRESHOLD) {
        hasMarkedWatchedRef.current = true;
        if (onWatchedRef.current) onWatchedRef.current();
      }

      // SponsorBlock segment skipping
      const segments = videoDataRef.current?.sponsorblock_segments || [];
      if (segments.length > 0) {
        const now = Date.now();
        // Skip cooldown: don't skip again within 2 seconds of last skip
        if (now - sponsorBlockSkipCooldownRef.current >= 2000) {
          for (const seg of segments) {
            // Skip if we're past the start and before (end - 0.5s buffer)
            if (currentTime >= seg.start && currentTime < seg.end - 0.5) {
              console.log(`[SponsorBlock] Skipping ${seg.category}: ${seg.start.toFixed(1)}s -> ${seg.end.toFixed(1)}s`);
              videoEl.currentTime = seg.end;
              sponsorBlockSkipCooldownRef.current = now;
              break;
            }
          }
        }
      }

      // Debounced progress save during normal playback
      if (saveProgress) {
        if (saveProgressTimeout.current) {
          clearTimeout(saveProgressTimeout.current);
        }
        saveProgressTimeout.current = setTimeout(saveProgressNow, PROGRESS_SAVE_DEBOUNCE_MS);
      }
    };

    // Save immediately after seek
    const handleSeeked = () => saveProgressNow();

    // Save on pause
    const handlePause = () => saveProgressNow();

    // Save shortly after play starts (updates last_watched_at)
    const handlePlay = () => setTimeout(saveProgressNow, 500);

    // Handle video end
    const handleEnded = () => {
      if (onEndedRef.current) onEndedRef.current();
    };

    // Add subtitle track (VTT format) - deferred to not compete with video load
    const addSubtitles = () => {
      const subtitleUrl = videoSrc.replace(/\.[^.]+$/, '.en.vtt');
      fetch(subtitleUrl, { method: 'HEAD', credentials: 'include' })
        .then(res => {
          if (res.ok && videoEl) {
            // Check if track already exists
            const existingTracks = videoEl.querySelectorAll('track');
            for (const track of existingTracks) {
              if (track.src === subtitleUrl) return;
            }

            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = 'English';
            track.srclang = 'en';
            track.src = subtitleUrl;
            videoEl.appendChild(track);
          }
        })
        .catch(() => {}); // Silently ignore if no subtitles
    };

    // Attach event listeners
    videoEl.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoEl.addEventListener('timeupdate', handleTimeUpdate);
    videoEl.addEventListener('seeked', handleSeeked);
    videoEl.addEventListener('pause', handlePause);
    videoEl.addEventListener('play', handlePlay);
    videoEl.addEventListener('ended', handleEnded);
    videoEl.addEventListener('error', handleError);

    // Load subtitles after 1s delay (prioritize video playback)
    const subtitleTimeout = setTimeout(addSubtitles, 1000);

    // Cleanup
    return () => {
      if (saveProgressTimeout.current) {
        clearTimeout(saveProgressTimeout.current);
      }
      clearTimeout(subtitleTimeout);
      videoEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoEl.removeEventListener('timeupdate', handleTimeUpdate);
      videoEl.removeEventListener('seeked', handleSeeked);
      videoEl.removeEventListener('pause', handlePause);
      videoEl.removeEventListener('play', handlePlay);
      videoEl.removeEventListener('ended', handleEnded);
      videoEl.removeEventListener('error', handleError);
    };
  // Note: Callbacks (onEnded, onWatched, onError) are accessed via refs to prevent
  // effect re-runs when they change, which would reset the video source and cause flashing
  }, [video?.id, video?.file_path, saveProgress]);

  // Save progress before page unload (refresh/close)
  useEffect(() => {
    const handleBeforeUnload = () => {
      const videoEl = videoRef.current;
      if (videoEl && saveProgress && updateVideoRef.current && videoDataRef.current) {
        try {
          updateVideoRef.current.mutate({
            id: videoDataRef.current.id,
            data: { playback_seconds: Math.floor(videoEl.currentTime) },
          });
        } catch (error) {
          console.warn('[useNativeVideoPlayer] Failed to save progress on unload:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveProgress, videoRef]);

  return videoRef;
}

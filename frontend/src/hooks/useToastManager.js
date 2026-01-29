import { useEffect, useRef } from 'react';
import { useNotification } from '../contexts/NotificationContext';
import { TOAST_IDS } from '../constants/toastIds';
import api from '../api/client';

/**
 * Manages all toast notifications based on queue state.
 * Extracts toast logic from App.jsx for cleaner separation of concerns.
 *
 * Handles:
 * - Scan completion/progress toasts
 * - Download progress toasts
 * - Queue paused/delay toasts
 * - Error and cookie warning toasts
 *
 * @param {Object} options
 * @param {Object} options.queueData - Queue data from useQueue hook
 * @param {Object} options.location - React Router location object
 */
export function useToastManager({ queueData, location }) {
  const { showNotification, removeToast } = useNotification();

  // Refs for tracking previous states (to detect changes)
  const prevOperationRef = useRef(null);
  const prevErrorRef = useRef(null);
  const prevCookieWarningRef = useRef(null);
  const prevDelayInfoRef = useRef(null);
  const prevIsPausedRef = useRef(false);
  const prevDownloadRef = useRef(null);
  const clearingCookieWarningRef = useRef(false);

  // Track user-dismissed toasts - don't re-show until condition resets
  const dismissedToastsRef = useRef(new Set());

  // Extract queue data
  const queue = queueData?.queue_items || queueData || [];
  const currentDownload = queueData?.current_download || null;
  const currentOperation = queueData?.current_operation || null;
  const delayInfo = queueData?.delay_info || null;
  const isPaused = queueData?.is_paused || false;
  const lastErrorMessage = queueData?.last_error_message || null;
  const cookieWarning = queueData?.cookie_warning_message || null;

  // Scan completion toast (15 second duration)
  useEffect(() => {
    if (currentOperation?.type === 'scan_complete' && currentOperation?.message) {
      if (prevOperationRef.current?.type !== 'scan_complete') {
        showNotification(currentOperation.message, 'success', { duration: 15000 });
        // Clear the operation after showing toast
        api.clearOperation().catch(() => {});
      }
    }
    prevOperationRef.current = currentOperation;
  }, [currentOperation, showNotification]);

  // Active scanning toast - depend on message specifically to catch updates
  useEffect(() => {
    if (currentOperation?.type === 'scanning' && currentOperation?.message) {
      // Only show if user hasn't dismissed it
      if (!dismissedToastsRef.current.has(TOAST_IDS.SCANNING)) {
        showNotification(currentOperation.message, 'scanning', {
          id: TOAST_IDS.SCANNING,
          persistent: true,
          onDismiss: () => dismissedToastsRef.current.add(TOAST_IDS.SCANNING)
        });
      }
    } else {
      // Always remove scanning toast when not actively scanning
      removeToast(TOAST_IDS.SCANNING);
      dismissedToastsRef.current.delete(TOAST_IDS.SCANNING);
    }
  }, [currentOperation?.type, currentOperation?.message, showNotification, removeToast]);

  // Error message toast
  useEffect(() => {
    if (lastErrorMessage && lastErrorMessage !== prevErrorRef.current) {
      showNotification(lastErrorMessage, 'error');
    }
    prevErrorRef.current = lastErrorMessage;
  }, [lastErrorMessage, showNotification]);

  // Cookie warning toast
  useEffect(() => {
    if (cookieWarning && cookieWarning !== prevCookieWarningRef.current) {
      showNotification(cookieWarning, 'warning', { id: TOAST_IDS.COOKIE_WARNING, persistent: true });
    } else if (!cookieWarning && prevCookieWarningRef.current) {
      removeToast(TOAST_IDS.COOKIE_WARNING);
      // Show success notification when cookies are loaded/fixed
      showNotification('Cookies loaded successfully', 'success');
    }
    prevCookieWarningRef.current = cookieWarning;
  }, [cookieWarning, showNotification, removeToast]);

  // Clear cookie warning on navigation
  useEffect(() => {
    if (cookieWarning) {
      const clearWarning = async () => {
        if (clearingCookieWarningRef.current) return;
        clearingCookieWarningRef.current = true;
        try {
          await fetch('/api/cookie-warning/clear', { method: 'POST', credentials: 'include' });
        } catch (error) {
          console.error('Failed to clear cookie warning:', error);
        }
        setTimeout(() => { clearingCookieWarningRef.current = false; }, 1000);
      };
      clearWarning();
    }
  }, [location.pathname, cookieWarning]);

  // Queue paused toast
  useEffect(() => {
    const queueLog = queue?.find(item => item.log)?.log || null;
    if (isPaused && !prevIsPausedRef.current && queue.length > 0) {
      // Only show if user hasn't dismissed it
      if (!dismissedToastsRef.current.has(TOAST_IDS.PAUSED)) {
        showNotification(queueLog || 'Queue paused', 'paused', {
          id: TOAST_IDS.PAUSED,
          persistent: true,
          onDismiss: () => dismissedToastsRef.current.add(TOAST_IDS.PAUSED)
        });
      }
    } else if (!isPaused && prevIsPausedRef.current) {
      removeToast(TOAST_IDS.PAUSED);
      // Clear dismissed state so it can show again next time
      dismissedToastsRef.current.delete(TOAST_IDS.PAUSED);
    }
    prevIsPausedRef.current = isPaused;
  }, [isPaused, queue, showNotification, removeToast]);

  // Delay info toast
  useEffect(() => {
    if (delayInfo && delayInfo !== prevDelayInfoRef.current) {
      // Only show if user hasn't dismissed it
      if (!dismissedToastsRef.current.has(TOAST_IDS.DELAY)) {
        showNotification(delayInfo, 'delay', {
          id: TOAST_IDS.DELAY,
          persistent: true,
          onDismiss: () => dismissedToastsRef.current.add(TOAST_IDS.DELAY)
        });
      }
    } else if (!delayInfo && prevDelayInfoRef.current) {
      removeToast(TOAST_IDS.DELAY);
      dismissedToastsRef.current.delete(TOAST_IDS.DELAY);
      // Show notification that queue has resumed after delay
      showNotification('Queue resumed', 'success');
    }
    prevDelayInfoRef.current = delayInfo;
  }, [delayInfo, showNotification, removeToast]);

  // Download progress toast
  useEffect(() => {
    if (currentDownload && !isPaused) {
      // Only show if user hasn't dismissed it
      if (dismissedToastsRef.current.has(TOAST_IDS.DOWNLOAD_PROGRESS)) {
        return;
      }

      // Check if in postprocessing phase (SponsorBlock re-encoding)
      const isPostprocessing = currentDownload.phase === 'postprocessing';
      const onDismiss = () => dismissedToastsRef.current.add(TOAST_IDS.DOWNLOAD_PROGRESS);

      if (isPostprocessing) {
        // Show elapsed time for postprocessing
        const elapsed = currentDownload.postprocess_elapsed || 0;
        const elapsedStr = `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`;

        showNotification(
          currentDownload.video?.title || 'Processing...',
          'progress',
          {
            id: TOAST_IDS.DOWNLOAD_PROGRESS,
            persistent: true,
            onDismiss,
            progress: {
              isPostprocessing: true,
              elapsed: elapsedStr,
              postprocessor: currentDownload.postprocessor
            }
          }
        );
      } else {
        // Normal download progress
        const speed = currentDownload.speed_bps > 0
          ? `${(currentDownload.speed_bps / 1024 / 1024).toFixed(1)} MB/s`
          : null;
        const eta = currentDownload.eta_seconds > 0
          ? `${Math.floor(currentDownload.eta_seconds / 60)}:${Math.floor(currentDownload.eta_seconds % 60).toString().padStart(2, '0')}`
          : null;
        const percent = Math.round(currentDownload.progress_pct || 0);

        showNotification(
          currentDownload.video?.title || 'Downloading...',
          'progress',
          {
            id: TOAST_IDS.DOWNLOAD_PROGRESS,
            persistent: true,
            onDismiss,
            progress: { speed, eta, percent }
          }
        );
      }
    } else if (!currentDownload && prevDownloadRef.current) {
      removeToast(TOAST_IDS.DOWNLOAD_PROGRESS);
      dismissedToastsRef.current.delete(TOAST_IDS.DOWNLOAD_PROGRESS);
      // Show download complete notification with the previous download's title
      const completedTitle = prevDownloadRef.current.video?.title || 'Video';
      showNotification(`Downloaded: ${completedTitle}`, 'success', { duration: 15000 });
    }
    prevDownloadRef.current = currentDownload;
  }, [currentDownload, isPaused, showNotification, removeToast]);
}

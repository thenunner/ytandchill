import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNotification } from '../contexts/NotificationContext';

/**
 * Hook for receiving real-time queue updates via Server-Sent Events.
 * Automatically updates React Query cache when events are received.
 * Falls back to polling if SSE connection fails.
 */
export function useQueueSSE() {
  const queryClient = useQueryClient();
  const { removeToast } = useNotification();
  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000; // 1 second
  const longRetryDelay = 30000; // 30 seconds for periodic retry after max attempts

  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      const eventSource = new EventSource('/api/queue/stream');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        reconnectAttempts.current = 0;
      };

      // Listen for init event (sent on connect with all initial data)
      // This replaces separate API calls for queue, settings, and channels
      eventSource.addEventListener('init', (event) => {
        try {
          const data = JSON.parse(event.data);
          // Populate all caches at once - reduces HTTP connections on page load
          if (data.queue) {
            queryClient.setQueryData(['queue'], data.queue);
          }
          if (data.settings) {
            queryClient.setQueryData(['settings'], data.settings);
          }
          if (data.channels) {
            queryClient.setQueryData(['channels'], data.channels);
            // Invalidate favorite-channels to refetch with proper sorting from dedicated endpoint
            // Don't set directly from channels - favorites have special sort order
            queryClient.invalidateQueries({ queryKey: ['favorite-channels'] });
          }
        } catch (parseError) {
          console.warn('Failed to parse SSE init data:', parseError);
        }
      });

      // Listen for named 'queue' events (not generic onmessage)
      eventSource.addEventListener('queue', (event) => {
        try {
          const data = JSON.parse(event.data);
          // Update React Query cache directly - this triggers re-renders
          queryClient.setQueryData(['queue'], data);
        } catch (parseError) {
          console.warn('Failed to parse SSE data:', parseError);
        }
      });

      // Listen for settings change events (theme, preferences, etc.)
      eventSource.addEventListener('settings', (event) => {
        // Invalidate settings cache to trigger refetch
        queryClient.invalidateQueries({ queryKey: ['settings'] });
      });

      // Listen for import events (state changes and encode progress)
      eventSource.addEventListener('import', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'state') {
            // Invalidate import state cache to trigger refetch
            queryClient.invalidateQueries({ queryKey: ['import-state'] });
          } else if (data.type === 'encode') {
            // Update encode status cache directly for real-time progress
            queryClient.setQueryData(['encode-status'], (old) => ({
              ...old,
              encoding: data.data?.encoding ?? true,
              progress: data.data?.progress ?? 0,
              current: data.data?.filename ? { filename: data.data.filename } : old?.current,
            }));
          }
        } catch (parseError) {
          console.warn('Failed to parse import SSE data:', parseError);
        }
      });

      // Listen for video status changes (download complete, etc.)
      eventSource.addEventListener('videos', (event) => {
        // Invalidate videos and channels cache to trigger refetch
        // Channels need refresh too since they include video counts (needs_review, pending, etc.)
        queryClient.invalidateQueries({ queryKey: ['videos'] });
        queryClient.invalidateQueries({ queryKey: ['channels'] });
        queryClient.invalidateQueries({ queryKey: ['favorite-channels'] });
      });

      // Listen for channel changes (visited, favorite toggle, etc.)
      eventSource.addEventListener('channels', (event) => {
        queryClient.invalidateQueries({ queryKey: ['channels'] });
        queryClient.invalidateQueries({ queryKey: ['favorite-channels'] });
      });

      // Listen for toast dismissal events (sync across devices)
      eventSource.addEventListener('toast', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.action === 'dismiss' && data.id) {
            removeToast(data.id);
          }
        } catch (parseError) {
          console.warn('Failed to parse toast SSE data:', parseError);
        }
      });

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource.close();
        eventSourceRef.current = null;

        // Exponential backoff for initial reconnect attempts
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts.current);
          reconnectAttempts.current += 1;
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        } else {
          // After max attempts, retry periodically instead of giving up
          // This handles network recovery after extended outages
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current = 0; // Reset for next backoff cycle
            connect();
          }, longRetryDelay);
        }
      };
    } catch (error) {
      console.error('Failed to create EventSource:', error);
      // SSE not supported - will fall back to polling
    }
  }, [queryClient, removeToast]);

  useEffect(() => {
    connect();

    // Reconnect when tab becomes visible (handles sleep/wake)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !eventSourceRef.current) {
        reconnectAttempts.current = 0;
        connect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return { isConnected };
}

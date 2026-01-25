import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const NotificationContext = createContext();

// Generate unique IDs for toasts
let toastId = 0;
const generateId = () => ++toastId;

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timeoutsRef = useRef({});

  // Add a toast notification
  const showNotification = useCallback((message, type = 'success', options = {}) => {
    const {
      persistent = false,
      duration = null, // Custom duration in ms
      id = null, // Optional ID for updates (e.g., progress)
      progress = null, // Progress data for download toasts
      noDismiss = false, // If true, toast cannot be manually dismissed (only programmatically)
    } = options;

    // Default durations by type
    const defaultDurations = {
      success: 5000,
      error: 10000,
      warning: 8000,
      info: 5000,
      scanning: null, // Persistent
      progress: null, // Persistent
      paused: null, // Persistent
      delay: null, // Persistent until next action
    };

    const toastDuration = persistent ? null : (duration ?? defaultDurations[type] ?? 5000);
    const toastIdToUse = id || generateId();

    setToasts(prev => {
      // If this ID already exists, update it
      const existingIndex = prev.findIndex(t => t.id === toastIdToUse);
      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], message, type, progress, noDismiss };
        return updated;
      }
      // Otherwise add new toast (max 5 toasts)
      const newToast = { id: toastIdToUse, message, type, progress, noDismiss };
      return [...prev.slice(-4), newToast];
    });

    // Clear existing timeout for this ID
    if (timeoutsRef.current[toastIdToUse]) {
      clearTimeout(timeoutsRef.current[toastIdToUse]);
      delete timeoutsRef.current[toastIdToUse];
    }

    // Set auto-dismiss timeout if not persistent
    if (toastDuration) {
      timeoutsRef.current[toastIdToUse] = setTimeout(() => {
        removeToast(toastIdToUse);
      }, toastDuration);
    }

    return toastIdToUse;
  }, []);

  // Remove a specific toast by ID
  const removeToast = useCallback((id) => {
    if (timeoutsRef.current[id]) {
      clearTimeout(timeoutsRef.current[id]);
      delete timeoutsRef.current[id];
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Clear all toasts
  const clearNotification = useCallback(() => {
    Object.values(timeoutsRef.current).forEach(clearTimeout);
    timeoutsRef.current = {};
    setToasts([]);
  }, []);

  // Legacy single notification getter (for backwards compatibility)
  const notification = toasts.length > 0 ? toasts[toasts.length - 1] : null;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(timeoutsRef.current).forEach(clearTimeout);
    };
  }, []);

  return (
    <NotificationContext.Provider value={{
      notification, // Legacy single notification
      toasts, // All active toasts
      showNotification,
      removeToast,
      clearNotification,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
}

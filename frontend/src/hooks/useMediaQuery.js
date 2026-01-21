import { useState, useEffect } from 'react';

/**
 * Custom hook that returns true if the given media query matches
 * @param {string} query - Media query string (e.g., '(max-width: 767px)')
 * @returns {boolean} - Whether the media query matches
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    // Check if window is available (SSR safety)
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(query);

    // Update state when media query changes
    const handler = (event) => setMatches(event.matches);

    // Set initial value
    setMatches(mediaQuery.matches);

    // Listen for changes
    mediaQuery.addEventListener('change', handler);

    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

export default useMediaQuery;

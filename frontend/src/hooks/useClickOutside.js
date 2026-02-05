import { useEffect } from 'react';

/**
 * Hook to detect clicks outside of a referenced element
 *
 * @param {React.RefObject} ref - Ref to the element to detect clicks outside of
 * @param {Function} callback - Function to call when clicking outside
 * @param {boolean} enabled - Whether the hook is active (default: true)
 */
export function useClickOutside(ref, callback, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        callback();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [ref, callback, enabled]);
}

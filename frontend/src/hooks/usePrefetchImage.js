import { useEffect, useRef } from 'react';

/**
 * Hook to prefetch an image before it becomes visible in the viewport.
 * Uses Intersection Observer to detect when an element is approaching
 * the viewport and preloads the image into browser cache.
 *
 * @param {string} src - The image URL to prefetch
 * @param {string} rootMargin - How far before viewport to start prefetch (default: 500px)
 * @returns {React.RefObject} - Ref to attach to a container element near the image
 */
export function usePrefetchImage(src, rootMargin = '500px') {
  const elementRef = useRef(null);
  const prefetched = useRef(false);

  useEffect(() => {
    // Reset prefetched state if src changes
    prefetched.current = false;
  }, [src]);

  useEffect(() => {
    if (!src || prefetched.current || !elementRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !prefetched.current) {
          // Prefetch the image by creating a hidden Image object
          const img = new Image();
          img.src = src;
          prefetched.current = true;
          observer.disconnect();
        }
      },
      { rootMargin } // Start prefetching this far before element is visible
    );

    observer.observe(elementRef.current);

    return () => observer.disconnect();
  }, [src, rootMargin]);

  return elementRef;
}

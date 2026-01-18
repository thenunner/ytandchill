import { useState, useRef, useEffect } from 'react';

export default function Tooltip({ children, text, position = 'top' }) {
  const [isVisible, setIsVisible] = useState(false);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const tooltipRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (isVisible && tooltipRef.current && containerRef.current) {
      const tooltip = tooltipRef.current;
      const container = containerRef.current;
      const tooltipRect = tooltip.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Check if tooltip would overflow viewport
      if (position === 'top' && tooltipRect.top < 8) {
        setAdjustedPosition('bottom');
      } else if (position === 'bottom' && tooltipRect.bottom > window.innerHeight - 8) {
        setAdjustedPosition('top');
      } else {
        setAdjustedPosition(position);
      }
    }
  }, [isVisible, position]);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-[#1a1a1a]',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-[#1a1a1a]',
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-flex"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && text && (
        <div
          ref={tooltipRef}
          className={`absolute z-[100] px-2.5 py-1.5 text-xs text-white bg-[#1a1a1a] rounded-md shadow-lg whitespace-nowrap pointer-events-none ${positionClasses[adjustedPosition]}`}
        >
          {text}
          <div className={`absolute w-0 h-0 border-4 ${arrowClasses[adjustedPosition]}`} />
        </div>
      )}
    </div>
  );
}

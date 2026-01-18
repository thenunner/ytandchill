import { useState, useEffect } from 'react';

function UpdateBanner({ currentVersion, latestVersion, onDismiss }) {
  const [isVisible, setIsVisible] = useState(true);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  const handleDismiss = () => {
    setIsAnimatingOut(true);
    // Wait for animation to complete before calling onDismiss
    setTimeout(() => {
      setIsVisible(false);
      onDismiss();
    }, 200);
  };

  if (!isVisible) return null;

  return (
    <div
      className={`bg-accent/10 border-b border-accent/20 transition-all duration-200 ${
        isAnimatingOut ? 'opacity-0 -translate-y-full h-0' : 'opacity-100 translate-y-0'
      }`}
    >
      <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 xl:px-16 h-9 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Animated pulse dot */}
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
          </span>

          <span className="text-sm text-text-primary">
            Update available
            <span className="text-text-secondary mx-1.5">·</span>
            <span className="font-mono text-text-secondary">v{currentVersion}</span>
            <span className="text-text-secondary mx-1.5">→</span>
            <span className="font-mono text-accent-text">v{latestVersion}</span>
          </span>
        </div>

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="text-text-secondary hover:text-text-primary transition-colors p-1 -mr-1"
          title="Dismiss"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
  );
}

export default UpdateBanner;

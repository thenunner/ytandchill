import { useEffect } from 'react';
import { useTheme } from '../../contexts/PreferencesContext';

/**
 * FormatChoiceModal - Modal for handling videos without H.264 format available
 * Shows options to re-encode or skip the video
 * Uses the same pattern as ResponsiveModalActions for consistent styling
 */
export function FormatChoiceModal({ isOpen, data, onChoice, isLoading }) {
  const { theme } = useTheme();
  const isLightTheme = ['online', 'pixel', 'debug'].includes(theme);

  // Handle ESC key and body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen || !data) return null;

  const message = (
    <>
      <span className="font-medium">"{data.title}"</span> is not available in H.264 format.
      <br className="hidden sm:block" />
      <span className="sm:hidden"> </span>
      The download queue is paused until you decide.
    </>
  );

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 sm:p-4"
      style={{ zIndex: 50 }}
    >
      {/* Backdrop - no onClick since modal cannot be dismissed */}
      <div className="absolute inset-0 bg-black/70 animate-fade-in" />

      {/* Desktop - Glass Modal with buttons */}
      <div
        className="hidden sm:block relative backdrop-blur-xl bg-dark-secondary border border-white/10 rounded-2xl shadow-2xl max-w-md w-full animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          {/* Warning Icon + Title */}
          <div className="flex items-start gap-3 mb-4">
            <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${isLightTheme ? 'bg-yellow-100' : 'bg-yellow-500/20'}`}>
              <svg className={`w-5 h-5 ${isLightTheme ? 'text-yellow-600' : 'text-yellow-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className={`text-base font-medium ${isLightTheme ? 'text-black' : 'text-text-primary'}`}>
                Format Not Available
              </h3>
              <div className={`text-sm mt-1 ${isLightTheme ? 'text-gray-600' : 'text-text-muted'}`}>
                {message}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => onChoice('reencode')}
              disabled={isLoading}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 bg-accent/90 hover:bg-accent text-dark-deepest flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-dark-deepest/30 border-t-dark-deepest rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                'Download & Re-encode'
              )}
            </button>
            <button
              onClick={() => onChoice('skip')}
              disabled={isLoading}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 bg-white/5 hover:bg-white/10 text-text-secondary"
            >
              Skip (Mark as Ignored)
            </button>
          </div>
        </div>
      </div>

      {/* Mobile - iOS Action Sheet Style */}
      <div className="sm:hidden fixed inset-x-0 bottom-0 p-3 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="backdrop-blur-xl bg-dark-secondary rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="p-4 text-center border-b border-white/10">
            <div className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${isLightTheme ? 'bg-yellow-100' : 'bg-yellow-500/20'}`}>
              <svg className={`w-6 h-6 ${isLightTheme ? 'text-yellow-600' : 'text-yellow-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className={`font-medium ${isLightTheme ? 'text-black' : 'text-text-primary'}`}>
              Format Not Available
            </p>
            <p className={`text-sm mt-2 ${isLightTheme ? 'text-gray-600' : 'text-text-muted'}`}>
              <span className="font-medium">"{data.title}"</span> is not available in H.264 format.
            </p>
            <p className={`text-xs mt-1 ${isLightTheme ? 'text-gray-500' : 'text-text-muted'}`}>
              The download queue is paused until you decide.
            </p>
          </div>

          {/* Primary Action */}
          <button
            onClick={() => onChoice('reencode')}
            disabled={isLoading}
            className="w-full py-4 text-lg font-semibold border-b border-white/10 disabled:opacity-50 text-accent flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              'Download & Re-encode'
            )}
          </button>

          {/* Secondary Action */}
          <button
            onClick={() => onChoice('skip')}
            disabled={isLoading}
            className="w-full py-4 text-text-primary text-lg disabled:opacity-50"
          >
            Skip (Mark as Ignored)
          </button>
        </div>
      </div>
    </div>
  );
}

export default FormatChoiceModal;

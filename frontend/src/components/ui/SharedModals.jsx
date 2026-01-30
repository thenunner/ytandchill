import { useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

// Close icon SVG component
const CloseIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

/**
 * ResponsiveModal - Base modal wrapper with glass morphism desktop + bottom sheet mobile
 *
 * @param {boolean} isOpen - Controls modal visibility
 * @param {function} onClose - Called when modal should close (backdrop click, ESC, close button)
 * @param {string} title - Optional modal title
 * @param {boolean} showCloseButton - Show close button in header (default: true)
 * @param {string} maxWidth - Tailwind max-width class (default: 'max-w-sm')
 * @param {number} zIndex - z-index value (default: 50)
 * @param {React.ReactNode} children - Modal content
 */
export function ResponsiveModal({
  isOpen,
  onClose,
  title,
  showCloseButton = true,
  maxWidth = 'max-w-sm',
  zIndex = 50,
  children
}) {
  const { theme } = useTheme();
  const isLightTheme = ['online', 'pixel', 'debug'].includes(theme);

  // Handle ESC key and body scroll lock
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-${zIndex} flex items-center justify-center p-4 sm:p-4`}
      style={{ zIndex }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 animate-fade-in"
        onClick={onClose}
      />

      {/* Desktop - Glass Modal */}
      <div
        className={`hidden sm:block relative backdrop-blur-xl bg-dark-secondary border border-white/10 rounded-2xl shadow-2xl ${maxWidth} w-full animate-slide-up`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          {(title || showCloseButton) && (
            <div className="flex items-center justify-between mb-4">
              {title && (
                <h3 className={`text-base font-medium ${isLightTheme ? 'text-black' : 'text-text-primary'}`}>
                  {title}
                </h3>
              )}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors ml-auto"
                >
                  <CloseIcon />
                </button>
              )}
            </div>
          )}
          {children}
        </div>
      </div>

      {/* Mobile - Bottom Sheet */}
      <div
        className="sm:hidden fixed inset-x-0 bottom-0 backdrop-blur-xl bg-dark-secondary rounded-t-3xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3" />

        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            {title && (
              <h3 className={`font-semibold ${isLightTheme ? 'text-black' : 'text-text-primary'}`}>
                {title}
              </h3>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center ml-auto"
              >
                <CloseIcon className="w-4 h-4 text-text-secondary" />
              </button>
            )}
          </div>
        )}

        <div className="p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * ResponsiveModalActions - iOS-style action sheet for mobile confirmations
 * Used for simple confirm/cancel actions with optional destructive styling
 */
export function ResponsiveModalActions({
  isOpen,
  onClose,
  title,
  message,
  actions = [], // Array of { label, onClick, style: 'default' | 'danger' | 'cancel' }
  zIndex = 50
}) {
  const { theme } = useTheme();
  const isLightTheme = ['online', 'pixel', 'debug'].includes(theme);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 sm:p-4"
      style={{ zIndex }}
    >
      <div
        className="absolute inset-0 bg-black/70 animate-fade-in"
        onClick={onClose}
      />

      {/* Desktop - Glass Modal with buttons */}
      <div
        className="hidden sm:block relative backdrop-blur-xl bg-dark-secondary border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <h3 className={`text-base font-medium mb-1 ${isLightTheme ? 'text-black' : 'text-text-primary'}`}>
            {title}
          </h3>
          {message && (
            <div className={`text-sm mb-5 ${isLightTheme ? 'text-gray-600' : 'text-text-muted'}`}>
              {message}
            </div>
          )}
          <div className="flex gap-2">
            {actions.map((action, idx) => (
              <button
                key={idx}
                onClick={action.onClick}
                disabled={action.disabled}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                  action.style === 'danger'
                    ? 'bg-red-500/90 hover:bg-red-500 text-white'
                    : action.style === 'cancel'
                    ? 'bg-white/5 hover:bg-white/10 text-text-secondary'
                    : 'bg-accent/90 hover:bg-accent text-dark-deepest'
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile - iOS Action Sheet Style */}
      <div className="sm:hidden fixed inset-x-0 bottom-0 p-3 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="backdrop-blur-xl bg-dark-secondary rounded-2xl overflow-hidden">
          <div className="p-4 text-center border-b border-white/10">
            <p className={`font-medium ${isLightTheme ? 'text-black' : 'text-text-primary'}`}>{title}</p>
            {message && (
              <div className={`text-sm mt-1 ${isLightTheme ? 'text-gray-600' : 'text-text-muted'}`}>{message}</div>
            )}
          </div>
          {actions.filter(a => a.style !== 'cancel').map((action, idx) => (
            <button
              key={idx}
              onClick={action.onClick}
              disabled={action.disabled}
              className={`w-full py-4 text-lg font-semibold border-b border-white/10 disabled:opacity-50 ${
                action.style === 'danger' ? 'text-red-500' : 'text-accent'
              }`}
            >
              {action.label}
            </button>
          ))}
          {actions.filter(a => a.style === 'cancel').map((action, idx) => (
            <button
              key={idx}
              onClick={action.onClick}
              className="w-full py-4 text-text-primary text-lg"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * ConfirmModal - Standard confirmation dialog
 *
 * @param {boolean} isOpen - Controls visibility
 * @param {string} title - Dialog title
 * @param {string|React.ReactNode} message - Dialog message/content
 * @param {string} confirmText - Confirm button text (default: 'Confirm')
 * @param {string} cancelText - Cancel button text (default: 'Cancel')
 * @param {string} confirmStyle - 'danger' or 'primary' (default: 'danger')
 * @param {function} onConfirm - Called when confirmed
 * @param {function} onCancel - Called when cancelled
 * @param {boolean} isLoading - Shows loading state on confirm button
 */
export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmStyle = 'danger',
  onConfirm,
  onCancel,
  isLoading = false
}) {
  return (
    <ResponsiveModalActions
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      message={message}
      actions={[
        { label: cancelText, onClick: onCancel, style: 'cancel' },
        { label: isLoading ? 'Loading...' : confirmText, onClick: onConfirm, style: confirmStyle === 'danger' ? 'danger' : 'default', disabled: isLoading }
      ]}
    />
  );
}

export default ResponsiveModal;

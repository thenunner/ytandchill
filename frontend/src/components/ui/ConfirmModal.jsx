import { useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmStyle = 'danger', // 'danger' or 'primary'
  onConfirm,
  onCancel,
}) {
  const { theme } = useTheme();

  // Light themes need dark text
  const isLightTheme = ['online', 'pixel', 'debug'].includes(theme);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 animate-fade-in"
        onClick={onCancel}
      />

      {/* Desktop Modal - Glass Minimal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="hidden sm:block relative backdrop-blur-xl bg-dark-secondary border border-white/10 rounded-2xl shadow-2xl max-w-[90vw] sm:max-w-sm w-full animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <h3 id="confirm-modal-title" className={`text-base font-medium mb-1 ${isLightTheme ? 'text-black' : 'text-text-primary'}`}>
            {title}
          </h3>
          <p className={`text-sm mb-5 ${isLightTheme ? 'text-gray-600' : 'text-text-muted'}`}>
            {message}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary text-sm transition-colors"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                confirmStyle === 'danger'
                  ? 'bg-red-500/90 hover:bg-red-500 text-white'
                  : 'bg-accent/90 hover:bg-accent text-dark-deepest'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile - iOS Action Sheet Style */}
      <div className="sm:hidden fixed inset-x-0 bottom-0 p-3 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="backdrop-blur-xl bg-dark-secondary rounded-2xl overflow-hidden">
          <div className="p-4 text-center border-b border-white/10">
            <p className={`font-medium ${isLightTheme ? 'text-black' : 'text-text-primary'}`}>{title}</p>
            <p className={`text-sm mt-1 ${isLightTheme ? 'text-gray-600' : 'text-text-muted'}`}>{message}</p>
          </div>
          <button
            onClick={onConfirm}
            className={`w-full py-4 text-lg font-semibold border-b border-white/10 ${
              confirmStyle === 'danger' ? 'text-red-500' : 'text-accent'
            }`}
          >
            {confirmText}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-4 text-text-primary text-lg"
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
}

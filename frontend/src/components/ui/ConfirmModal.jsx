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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-dark-secondary border border-dark-border-light rounded-lg shadow-xl max-w-md w-full animate-fade-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-dark-border">
          <h3 className={`text-lg font-semibold ${isLightTheme ? 'text-black' : 'text-text-primary'}`}>
            {title}
          </h3>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <p className={`text-sm ${isLightTheme ? 'text-gray-800' : 'text-text-secondary'}`}>
            {message}
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-dark-border flex justify-end gap-3">
          <button
            onClick={onCancel}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isLightTheme
                ? 'bg-gray-200 hover:bg-gray-300 text-black'
                : 'bg-dark-hover hover:bg-dark-tertiary text-text-primary border border-dark-border-light'
            }`}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              confirmStyle === 'danger'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-accent hover:bg-accent-hover text-white'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

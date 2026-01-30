import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../contexts/PreferencesContext';
import { CloseIcon } from '../Icons';

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

/**
 * ConfirmDialog - Simple confirmation dialog with portal
 * Used for quick confirm/cancel actions (delete, etc.)
 */
export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText = 'Delete', cancelText = 'Cancel', isDanger = true }) {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center animate-fade-in p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="bg-dark-secondary rounded-xl border border-dark-border w-full max-w-md animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-dark-border">
          <h2 id="confirm-dialog-title" className="text-lg font-medium text-text-primary">{title}</h2>
        </div>

        {/* Message */}
        <div className="px-6 py-6">
          <p className="text-text-secondary leading-relaxed">{message}</p>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-dark-border flex justify-end gap-3">
          <button
            onClick={onClose}
            className="btn btn-secondary"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={isDanger ? 'btn btn-danger' : 'btn btn-primary'}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * SelectionListModal - Generic selection list with checkboxes
 * Used for selecting items to perform bulk actions (delete, remove, etc.)
 */
export function SelectionListModal({
  isOpen,
  onClose,
  title,
  items = [],
  selectedIds,
  setSelectedIds,
  onAction,
  isLoading = false,
  actionText = 'Confirm',
  emptyMessage = 'No items',
  headerMessage,
}) {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
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

  const hasItems = items?.length > 0;

  const toggleItem = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const toggleAll = (checked) => {
    setSelectedIds(checked ? items.map(i => i.id) : []);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Desktop - Glass Modal */}
      <div
        className="hidden sm:flex relative backdrop-blur-xl bg-dark-secondary border border-white/10 rounded-2xl shadow-2xl max-w-lg w-full flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-medium text-text-primary">{title}</h3>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors">
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!hasItems ? (
            <p className="text-sm text-text-muted text-center py-8">{emptyMessage}</p>
          ) : (
            <>
              {headerMessage && <p className="text-sm text-text-muted mb-4">{headerMessage}</p>}
              <label className="flex items-center gap-2 text-sm text-text-muted mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.length === items.length}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="rounded"
                />
                Select all ({items.length})
              </label>
              <div className="space-y-2">
                {items.map((item) => (
                  <label key={item.id} className="flex items-start gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-xl cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="mt-1 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-text-primary truncate">{item.title}</div>
                      {item.subtitle && <div className="text-xs text-text-muted">{item.subtitle}</div>}
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="p-5 border-t border-white/10 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary text-sm transition-colors">
            Cancel
          </button>
          {hasItems && (
            <button
              onClick={onAction}
              disabled={selectedIds.length === 0 || isLoading}
              className="flex-1 py-2.5 rounded-xl bg-red-500/90 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Processing...' : `${actionText} (${selectedIds.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Mobile - Bottom Sheet */}
      <div
        className="sm:hidden fixed inset-x-0 bottom-0 backdrop-blur-xl bg-dark-secondary rounded-t-3xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="font-semibold text-text-primary">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <CloseIcon className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!hasItems ? (
            <p className="text-text-muted text-center py-8">{emptyMessage}</p>
          ) : (
            <>
              {headerMessage && <p className="text-text-muted text-sm mb-4">{headerMessage}</p>}
              <label className="flex items-center gap-3 text-text-muted mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.length === items.length}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="w-5 h-5 rounded"
                />
                Select all ({items.length})
              </label>
              <div className="space-y-2">
                {items.map((item) => (
                  <label key={item.id} className="flex items-start gap-3 p-4 bg-white/5 active:bg-white/10 rounded-2xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="mt-0.5 w-5 h-5 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-text-primary truncate">{item.title}</div>
                      {item.subtitle && <div className="text-xs text-text-muted mt-0.5">{item.subtitle}</div>}
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-white/10 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3.5 bg-white/5 rounded-xl text-text-secondary font-medium">
            Cancel
          </button>
          {hasItems && (
            <button
              onClick={onAction}
              disabled={selectedIds.length === 0 || isLoading}
              className="flex-1 py-3.5 bg-red-500 rounded-xl text-white font-semibold disabled:opacity-50"
            >
              {isLoading ? 'Processing...' : `${actionText} (${selectedIds.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * InputModal - Generic single input modal
 * Used for rename/create operations with a single text field
 */
export function InputModal({
  isOpen,
  onClose,
  title,
  label,
  value,
  onChange,
  onSubmit,
  placeholder = "Enter name...",
  submitText = "Save",
  loadingText = "Saving...",
  isLoading = false,
}) {
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && value.trim() && !isLoading) {
      onSubmit();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim() && !isLoading) {
      onSubmit();
    }
  };

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit}>
        <p className="text-text-muted text-sm sm:text-xs mb-3 sm:mb-2">{label}</p>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          className="w-full bg-white/5 rounded-xl px-4 py-3.5 sm:py-3 text-base sm:text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 sm:border-0 border-2 border-transparent focus:border-accent mb-4"
          autoFocus
        />
        <div className="flex gap-3 sm:gap-2 mt-5 sm:mt-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3.5 sm:py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary text-sm font-medium sm:font-normal transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!value.trim() || isLoading}
            className="flex-1 py-3.5 sm:py-2.5 rounded-xl bg-accent hover:bg-accent/90 sm:bg-accent/90 sm:hover:bg-accent text-dark-deepest text-sm font-semibold sm:font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? loadingText : submitText}
          </button>
        </div>
      </form>
    </ResponsiveModal>
  );
}

export default ResponsiveModal;

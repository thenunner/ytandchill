import { createPortal } from 'react-dom';

export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText = 'Delete', cancelText = 'Cancel', isDanger = true }) {
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

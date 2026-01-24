import { useNotification } from '../contexts/NotificationContext';

export default function Toast() {
  const { toasts, removeToast } = useNotification();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  const { message, type, progress } = toast;

  // Style mapping for different toast types
  const typeStyles = {
    success: 'bg-green-600 border-green-500',
    error: 'bg-red-600 border-red-500',
    warning: 'bg-orange-600 border-orange-500',
    info: 'bg-blue-600 border-blue-500',
    scanning: 'bg-accent/90 border-accent',
    paused: 'bg-orange-600 border-orange-500',
    delay: 'bg-orange-600 border-orange-500',
    progress: 'bg-dark-secondary border-dark-border',
  };

  const icons = {
    success: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    ),
    scanning: (
      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
    ),
    paused: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <rect x="6" y="4" width="4" height="16" />
        <rect x="14" y="4" width="4" height="16" />
      </svg>
    ),
    delay: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    progress: (
      <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
  };

  // Progress toast has a special layout
  if (type === 'progress' && progress) {
    // Postprocessing mode (SponsorBlock re-encoding)
    if (progress.isPostprocessing) {
      return (
        <div
          onClick={onDismiss}
          className="animate-slide-up bg-dark-secondary border border-dark-border rounded-lg shadow-lg text-white overflow-hidden cursor-pointer hover:bg-dark-secondary/80 transition-colors"
        >
          <div className="flex items-center gap-3 px-4 py-3">
            {/* Spinner icon for processing */}
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary truncate">{message}</div>
              <div className="flex items-center gap-3 text-xs text-text-secondary mt-1">
                <span className="text-accent font-medium">Processing ({progress.elapsed})</span>
              </div>
            </div>
          </div>
          {/* Indeterminate progress bar */}
          <div className="h-1 bg-dark-border overflow-hidden">
            <div className="h-full w-1/3 bg-accent animate-pulse" style={{ animation: 'indeterminate 1.5s infinite linear' }} />
          </div>
        </div>
      );
    }

    // Normal download progress
    return (
      <div
        onClick={onDismiss}
        className="animate-slide-up bg-dark-secondary border border-dark-border rounded-lg shadow-lg text-white overflow-hidden cursor-pointer hover:bg-dark-secondary/80 transition-colors"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          {icons.progress}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text-primary truncate">{message}</div>
            <div className="flex items-center gap-3 text-xs text-text-secondary mt-1 font-mono">
              {progress.speed && <span>{progress.speed}</span>}
              {progress.eta && <span>ETA {progress.eta}</span>}
              <span className="text-accent font-semibold">{progress.percent}%</span>
            </div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-dark-border">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${progress.percent || 0}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onDismiss}
      className={`animate-slide-up flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-white cursor-pointer hover:opacity-90 transition-opacity ${typeStyles[type] || typeStyles.info}`}
    >
      {icons[type] || icons.info}
      <span className="text-sm font-medium flex-1">{message}</span>
    </div>
  );
}

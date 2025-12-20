/**
 * EmptyState component for consistent empty state messaging
 *
 * @param {string} icon - SVG path data or emoji
 * @param {string} title - Main message (e.g., "No videos found")
 * @param {string} message - Secondary message (e.g., "Try adjusting filters")
 * @param {string} iconType - 'svg' or 'emoji' (default: 'svg')
 */
export default function EmptyState({ icon, title, message, iconType = 'svg' }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {/* Icon */}
      {iconType === 'emoji' ? (
        <div className="text-6xl mb-4">{icon}</div>
      ) : (
        <svg className="w-16 h-16 mx-auto mb-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {icon}
        </svg>
      )}

      {/* Title */}
      <p className="text-lg font-medium text-text-primary">{title}</p>

      {/* Message */}
      {message && (
        <p className="text-sm mt-2 text-text-secondary">{message}</p>
      )}
    </div>
  );
}

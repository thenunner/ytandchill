/**
 * EditButton - Toggle button for edit/selection mode
 *
 * @param {boolean} active - Whether edit mode is active
 * @param {Function} onToggle - Callback when button is clicked
 * @param {string} className - Additional classes
 */
export default function EditButton({ active, onToggle, className = '' }) {
  return (
    <button
      onClick={onToggle}
      title={active ? "Exit selection mode" : "Select items for bulk actions"}
      className={`h-[35px] px-2.5 sm:px-4 rounded-lg text-sm font-medium transition-colors flex items-center ${
        active
          ? 'bg-accent text-black border border-accent'
          : 'bg-dark-tertiary border border-dark-border-light text-text-primary hover:bg-dark-hover'
      } ${className}`}
    >
      <span>{active ? 'Done' : 'Edit'}</span>
    </button>
  );
}

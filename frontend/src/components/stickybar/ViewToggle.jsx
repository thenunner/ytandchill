export default function ViewToggle({ mode, onChange, className = '' }) {
  return (
    <div className={`flex items-center bg-dark-secondary border border-dark-border rounded-lg overflow-hidden ${className}`}>
      <button
        onClick={() => onChange('grid')}
        className={`p-2 flex items-center transition-colors ${
          mode === 'grid'
            ? 'bg-accent text-accent-text'
            : 'bg-transparent text-text-secondary hover:text-text-primary'
        }`}
        title="Grid view"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
        </svg>
      </button>
      <button
        onClick={() => onChange('list')}
        className={`p-2 flex items-center transition-colors ${
          mode === 'list'
            ? 'bg-accent text-accent-text'
            : 'bg-transparent text-text-secondary hover:text-text-primary'
        }`}
        title="List view"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="8" y1="6" x2="21" y2="6"></line>
          <line x1="8" y1="12" x2="21" y2="12"></line>
          <line x1="8" y1="18" x2="21" y2="18"></line>
          <line x1="3" y1="6" x2="3.01" y2="6"></line>
          <line x1="3" y1="12" x2="3.01" y2="12"></line>
          <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>
      </button>
    </div>
  );
}

import { useState, useEffect } from 'react';

export default function DurationSettingsModal({ channel, onSave, onClose }) {
  const [minMinutes, setMinMinutes] = useState(channel?.min_minutes || 0);
  const [maxMinutes, setMaxMinutes] = useState(channel?.max_minutes || 0);

  // Reset values when channel changes
  useEffect(() => {
    if (channel) {
      setMinMinutes(channel.min_minutes || 0);
      setMaxMinutes(channel.max_minutes || 0);
    }
  }, [channel]);

  if (!channel) return null;

  const handleSave = () => {
    onSave({
      ...channel,
      min_minutes: minMinutes,
      max_minutes: maxMinutes
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 sm:p-4"
      onClick={onClose}
    >
      {/* Desktop - Glass Modal */}
      <div
        className="hidden sm:block backdrop-blur-xl bg-dark-secondary border border-white/10 rounded-2xl max-w-sm w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-medium text-text-primary">Duration Settings</h3>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="text-text-muted text-sm mb-4">
            Filter videos by duration for "{channel.title}"
          </p>

          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="block text-xs text-text-muted mb-2">Min (minutes)</label>
              <input
                type="number"
                value={minMinutes}
                onChange={(e) => setMinMinutes(Number(e.target.value))}
                className="w-full bg-white/5 rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
                min="0"
                placeholder="0"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-text-muted mb-2">Max (minutes)</label>
              <input
                type="number"
                value={maxMinutes}
                onChange={(e) => setMaxMinutes(Number(e.target.value))}
                className="w-full bg-white/5 rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
                min="0"
                placeholder="0 (no limit)"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-2.5 rounded-xl bg-accent/90 hover:bg-accent text-dark-deepest text-sm font-medium transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Mobile - Bottom Sheet */}
      <div
        className="sm:hidden fixed inset-x-0 bottom-0 backdrop-blur-xl bg-dark-secondary rounded-t-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3" />
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-primary">Duration Settings</h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
            >
              <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="text-text-muted text-sm mb-4">
            Filter videos by duration
          </p>

          <div className="flex gap-3 mb-5">
            <div className="flex-1">
              <label className="block text-xs text-text-muted mb-2">Min (minutes)</label>
              <input
                type="number"
                value={minMinutes}
                onChange={(e) => setMinMinutes(Number(e.target.value))}
                className="w-full bg-white/5 rounded-xl px-4 py-3.5 text-base text-text-primary focus:outline-none border-2 border-transparent focus:border-accent"
                min="0"
                placeholder="0"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-text-muted mb-2">Max (minutes)</label>
              <input
                type="number"
                value={maxMinutes}
                onChange={(e) => setMaxMinutes(Number(e.target.value))}
                className="w-full bg-white/5 rounded-xl px-4 py-3.5 text-base text-text-primary focus:outline-none border-2 border-transparent focus:border-accent"
                min="0"
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 bg-white/5 rounded-xl text-text-secondary font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-3.5 bg-accent rounded-xl text-dark-deepest font-semibold"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

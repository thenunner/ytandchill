/**
 * Inline prompt card for MKV re-encoding decision.
 * Shows when MKV files are found during import and the user hasn't pre-configured the setting.
 */
export default function MkvPromptCard({
  mkvCount,
  onInclude,
  onSkip,
  rememberChoice,
  onRememberChange
}) {
  return (
    <div className="bg-dark-secondary border-l-4 border-l-accent border border-dark-border rounded-lg p-3 mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-text-primary">
            {mkvCount} MKV file{mkvCount !== 1 ? 's' : ''} need re-encoding
          </div>
          <div className="text-xs text-text-secondary">
            Must be converted to MP4 for browser playback.
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onInclude}
            className="btn btn-primary btn-sm"
          >
            Re-encode
          </button>
          <button
            onClick={onSkip}
            className="btn btn-secondary btn-sm"
          >
            Skip
          </button>
        </div>
      </div>

      {/* Remember checkbox */}
      <label className="inline-flex items-center gap-2 text-xs text-text-muted cursor-pointer hover:text-text-secondary transition-colors mt-2">
        <input
          type="checkbox"
          checked={rememberChoice}
          onChange={(e) => onRememberChange(e.target.checked)}
          className="w-3 h-3 rounded border-dark-border bg-dark-tertiary text-accent focus:ring-accent focus:ring-offset-0 cursor-pointer"
        />
        Remember my choice
      </label>
    </div>
  );
}

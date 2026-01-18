/**
 * Inline prompt card for MKV re-encoding decision.
 * Shows when MKV files are found during import and the user hasn't pre-configured the setting.
 */
export default function MkvPromptCard({
  mkvCount,
  onInclude,
  onSkip,
  rememberChoice,
  onRememberChange,
  mkvFiles = []
}) {
  return (
    <div className="bg-dark-secondary border-l-4 border-l-accent border border-dark-border rounded-lg p-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        {/* Film icon */}
        <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
            <line x1="7" y1="2" x2="7" y2="22"></line>
            <line x1="17" y1="2" x2="17" y2="22"></line>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <line x1="2" y1="7" x2="7" y2="7"></line>
            <line x1="2" y1="17" x2="7" y2="17"></line>
            <line x1="17" y1="7" x2="22" y2="7"></line>
            <line x1="17" y1="17" x2="22" y2="17"></line>
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-text-primary mb-1">
            {mkvCount} MKV file{mkvCount !== 1 ? 's' : ''} need re-encoding
          </div>
          <div className="text-sm text-text-secondary mb-3">
            MKV files must be converted to MP4 for browser playback.
            This may take several minutes per file.
          </div>

          {/* Show file names if provided */}
          {mkvFiles.length > 0 && (
            <div className="text-xs text-text-muted mb-4 truncate">
              {mkvFiles.slice(0, 3).map(f => f.name || f).join(', ')}
              {mkvFiles.length > 3 && ` +${mkvFiles.length - 3} more`}
            </div>
          )}

          {/* Action buttons - stack on mobile */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3">
            <button
              onClick={onInclude}
              className="btn btn-primary justify-center"
            >
              Include & Re-encode
            </button>
            <button
              onClick={onSkip}
              className="btn btn-secondary justify-center"
            >
              Skip MKVs
            </button>
          </div>

          {/* Remember checkbox */}
          <label className="inline-flex items-center gap-2 text-sm text-text-muted cursor-pointer hover:text-text-secondary transition-colors">
            <input
              type="checkbox"
              checked={rememberChoice}
              onChange={(e) => onRememberChange(e.target.checked)}
              className="w-4 h-4 rounded border-dark-border bg-dark-tertiary text-accent focus:ring-accent focus:ring-offset-0 cursor-pointer"
            />
            Remember my choice
          </label>
        </div>
      </div>
    </div>
  );
}

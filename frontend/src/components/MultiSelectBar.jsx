export default function MultiSelectBar({
  count,
  onAction,
  onSelectAll,
  onClear,
  showIgnore,
  showUnignore,
}) {
  return (
    <div className="sticky top-16 z-40 bg-blue-900 border border-blue-700 rounded-lg p-4 shadow-lg">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <span className="text-white font-medium">{count} selected</span>
          <div className="flex space-x-2">
            <button onClick={onSelectAll} className="text-blue-200 hover:text-white text-sm">
              Select All
            </button>
            <span className="text-blue-400">|</span>
            <button onClick={onClear} className="text-blue-200 hover:text-white text-sm">
              Clear
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!showUnignore && !showIgnore && (
            <>
              <button
                onClick={() => onAction('queue')}
                className="btn btn-primary btn-sm"
              >
                Add to Queue
              </button>
              <button
                onClick={() => onAction('watched')}
                className="btn btn-secondary btn-sm"
              >
                Mark Watched
              </button>
              <button
                onClick={() => onAction('unwatched')}
                className="btn btn-secondary btn-sm"
              >
                Mark Unwatched
              </button>
            </>
          )}

          {showIgnore && (
            <button
              onClick={() => onAction('ignore')}
              className="btn btn-secondary btn-sm"
            >
              Ignore Selected
            </button>
          )}

          {showUnignore && (
            <button
              onClick={() => onAction('unignore')}
              className="btn btn-primary btn-sm"
            >
              Unignore Selected
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

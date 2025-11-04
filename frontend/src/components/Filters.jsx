export default function Filters({
  status,
  watched,
  search,
  onFilter,
  hideStatusFilter,
  hideWatchedFilter,
}) {
  return (
    <div className="card p-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search */}
        <div>
          <label className="label">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => onFilter('search', e.target.value)}
            placeholder="Search videos..."
            className="input"
          />
        </div>

        {/* Status Filter */}
        {!hideStatusFilter && (
          <div>
            <label className="label">Status</label>
            <select
              value={status || ''}
              onChange={(e) => onFilter('status', e.target.value)}
              className="input"
            >
              <option value="">All</option>
              <option value="discovered">Discovered</option>
              <option value="downloading">Downloading</option>
              <option value="downloaded">Downloaded</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        )}

        {/* Watched Filter */}
        {!hideWatchedFilter && (
          <div>
            <label className="label">Watched</label>
            <select
              value={watched || ''}
              onChange={(e) => onFilter('watched', e.target.value)}
              className="input"
            >
              <option value="">All</option>
              <option value="true">Watched</option>
              <option value="false">Not Watched</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

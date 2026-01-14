export default function FiltersModal({ isOpen, onClose, filters, onFilterChange, hideVideosFilter, isPlaylistMode, isLibraryMode, isPlaylistView }) {
  if (!isOpen) return null;

  const filterOptions = {
    uploadDate: [
      { label: 'All Time', value: '' },
      { label: 'This Week', value: 'week' },
      { label: 'This Month', value: 'month' },
      { label: 'This Year', value: 'year' },
    ],
    videos: [
      { label: 'Active', value: 'active', description: 'Videos tracked and downloaded' },
      { label: 'Ignored', value: 'ignored', description: 'Videos that won\'t be downloaded' },
    ],
    duration: [
      { label: 'Any Duration', value: '' },
      { label: 'Under 5 minutes', value: 'under5' },
      { label: '5-30 minutes', value: '5-30' },
      { label: '30-60 minutes', value: '30-60' },
      { label: 'Over 60 minutes', value: 'over60' },
    ],
    sort: isPlaylistMode ? [
      { label: 'Most videos', value: 'videos-desc' },
      { label: 'Least videos', value: 'videos-asc' },
      { label: 'A-Z', value: 'title-asc' },
      { label: 'Z-A', value: 'title-desc' },
    ] : [
      { label: 'Newest', value: 'date-desc' },
      { label: 'Oldest', value: 'date-asc' },
      { label: 'A-Z', value: 'title-asc' },
      { label: 'Z-A', value: 'title-desc' },
      { label: 'Longest', value: 'duration-desc' },
      { label: 'Shortest', value: 'duration-asc' },
    ],
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`bg-dark-secondary rounded-xl border border-dark-border w-full max-w-[90vw] ${
          isPlaylistMode ? 'sm:max-w-[400px]' : 'sm:max-w-[920px]'
        } max-h-[85vh] overflow-y-auto animate-slide-up`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <h2 className="text-lg font-medium text-text-primary">Search filters</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                // Clear all filters
                onFilterChange('uploadDate', '');
                onFilterChange('videos', 'active');
                onFilterChange('duration', '');
                onFilterChange('sort', 'date-desc');
                // View is not cleared as it's a preference, not a filter
              }}
              className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-dark-hover rounded transition-colors"
            >
              Clear filters
            </button>
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-text-primary text-3xl leading-none transition-colors"
            >
              ×
            </button>
          </div>
        </div>

        {/* Filters Grid - Dynamic columns based on mode */}
        <div className="overflow-x-auto">
        <div className={`grid ${
          isPlaylistMode ? 'grid-cols-1' : // Playlists tab: sort only
          isLibraryMode && !isPlaylistView && hideVideosFilter ? 'grid-cols-4' : // Library with visibility: upload, duration, visibility, sort
          isLibraryMode && !isPlaylistView ? 'grid-cols-5' : // Library with visibility: upload, videos, duration, visibility, sort
          hideVideosFilter ? 'grid-cols-3' : // No visibility: upload, duration, sort
          'grid-cols-4' // No visibility: upload, videos, duration, sort
        } divide-x divide-dark-border`}>
          {/* Added to Library Column - Hidden in playlist mode */}
          {!isPlaylistMode && (
          <div className="p-2 sm:p-4">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 sm:mb-3">
              ADDED TO LIBRARY
            </h4>
            <div className="space-y-0.5 sm:space-y-1">
              {filterOptions.uploadDate.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onFilterChange('uploadDate', option.value)}
                  className={`filter-btn w-full justify-start ${
                    filters.uploadDate === option.value ? 'active' : ''
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Videos Column - Hidden for ChannelLibrary and playlist mode */}
          {!hideVideosFilter && !isPlaylistMode && (
            <div className="p-2 sm:p-4">
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 sm:mb-3">
                VIDEOS
              </h4>
              <div className="space-y-0.5 sm:space-y-1">
                {filterOptions.videos.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => onFilterChange('videos', option.value)}
                    className={`filter-btn w-full justify-start ${
                      filters.videos === option.value ? 'active' : ''
                    }`}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Duration Column - Hidden in playlist mode */}
          {!isPlaylistMode && (
          <div className="p-2 sm:p-4">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 sm:mb-3">
              DURATION
            </h4>
            <div className="space-y-0.5 sm:space-y-1">
              {filterOptions.duration.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onFilterChange('duration', option.value)}
                  className={`filter-btn w-full justify-start ${
                    filters.duration === option.value ? 'active' : ''
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Visibility Column - Only in library mode videos tab */}
          {isLibraryMode && !isPlaylistView && (
          <div className="p-2 sm:p-4">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 sm:mb-3">
              VISIBILITY
            </h4>
            <div className="space-y-0.5 sm:space-y-1">
              <button
                onClick={() => onFilterChange('hide_watched', filters.hideWatched ? '' : 'true')}
                className={`filter-btn w-full justify-start ${
                  filters.hideWatched ? 'active' : ''
                }`}
              >
                <span>Hide watched</span>
              </button>
              <button
                onClick={() => onFilterChange('hide_playlisted', filters.hidePlaylisted ? '' : 'true')}
                className={`filter-btn w-full justify-start ${
                  filters.hidePlaylisted ? 'active' : ''
                }`}
              >
                <span>Hide in playlist</span>
              </button>
            </div>
          </div>
          )}

          {/* Sort By Column - Always visible */}
          <div className="p-2 sm:p-4">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 sm:mb-3">
              SORT BY
            </h4>
            <div className="space-y-0.5 sm:space-y-1">
              {filterOptions.sort.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onFilterChange('sort', option.value)}
                  className={`filter-btn w-full justify-start ${
                    filters.sort === option.value ? 'active' : ''
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

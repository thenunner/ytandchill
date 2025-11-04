export default function SortBar({ sort, onSort }) {
  const sortOptions = [
    { value: 'date_desc', label: 'Newest First' },
    { value: 'date_asc', label: 'Oldest First' },
    { value: 'duration_desc', label: 'Longest First' },
    { value: 'duration_asc', label: 'Shortest First' },
    { value: 'title_asc', label: 'Title A-Z' },
    { value: 'title_desc', label: 'Title Z-A' },
  ];

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-gray-800 rounded-lg">
      <span className="text-sm text-gray-400">Sort by:</span>
      <div className="flex flex-wrap gap-2">
        {sortOptions.map(option => (
          <button
            key={option.value}
            onClick={() => onSort(option.value)}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              sort === option.value
                ? 'bg-red-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

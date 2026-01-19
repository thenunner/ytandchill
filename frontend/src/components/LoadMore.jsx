export default function LoadMore({
  currentCount,
  totalCount,
  onLoadMore,
  loading = false
}) {
  if (currentCount >= totalCount) return null;

  return (
    <div className="flex justify-center py-6">
      <button
        onClick={onLoadMore}
        disabled={loading}
        className="px-6 py-2 bg-dark-tertiary hover:bg-dark-hover border border-dark-border rounded-lg text-text-secondary transition-colors disabled:opacity-50"
      >
        {loading ? 'Loading...' : `Load More (${currentCount}/${totalCount})`}
      </button>
    </div>
  );
}

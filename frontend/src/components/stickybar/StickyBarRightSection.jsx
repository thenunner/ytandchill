import SortDropdown from './SortDropdown';
import Pagination from '../Pagination';

/**
 * StickyBarRightSection - Combined sort dropdown + pagination for sticky bars
 *
 * Handles responsive layout:
 * - Desktop: Shows both sort dropdown and pagination
 * - Mobile: Shows sort dropdown only (pagination uses LoadMore pattern)
 *
 * @param {string} sortValue - Current sort value
 * @param {Function} onSortChange - Callback when sort changes
 * @param {Array} sortOptions - Sort options array for SortDropdown
 * @param {string} durationValue - Current duration filter value (optional)
 * @param {Function} onDurationChange - Callback when duration changes (optional)
 * @param {Array} durationOptions - Duration options array (optional)
 * @param {number} currentPage - Current page number
 * @param {number} totalItems - Total number of items
 * @param {number} itemsPerPage - Items per page (default: 50)
 * @param {Function} onPageChange - Callback when page changes
 * @param {boolean} showMobileSort - Show sort on mobile (default: true)
 */
export default function StickyBarRightSection({
  sortValue,
  onSortChange,
  sortOptions,
  durationValue,
  onDurationChange,
  durationOptions,
  currentPage,
  totalItems,
  itemsPerPage = 50,
  onPageChange,
  showMobileSort = true,
}) {
  return (
    <>
      {/* Mobile: Sort dropdown only (shown in left section usually, but can be here) */}
      {showMobileSort && (
        <div className="sm:hidden">
          <SortDropdown
            value={sortValue}
            onChange={onSortChange}
            options={sortOptions}
            durationValue={durationValue}
            onDurationChange={onDurationChange}
            durationOptions={durationOptions}
          />
        </div>
      )}

      {/* Desktop: Sort + Pagination */}
      <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
        <SortDropdown
          value={sortValue}
          onChange={onSortChange}
          options={sortOptions}
          durationValue={durationValue}
          onDurationChange={onDurationChange}
          durationOptions={durationOptions}
        />
        <Pagination
          currentPage={currentPage}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={onPageChange}
        />
      </div>
    </>
  );
}

/**
 * Centralized sort and filter options for sticky bars
 */

export const SORT_OPTIONS = {
  // For video lists (ChannelLibrary, Library channels tab, Playlist)
  videos: [
    { value: 'date-desc', label: 'Newest' },
    { value: 'date-asc', label: 'Oldest' },
    { divider: true },
    { value: 'title-asc', label: 'A → Z' },
    { value: 'title-desc', label: 'Z → A' },
    { divider: true },
    { value: 'duration-desc', label: 'Longest' },
    { value: 'duration-asc', label: 'Shortest' },
  ],

  // For channel lists (Channels page)
  channels: [
    { value: 'title-asc', label: 'A → Z' },
    { value: 'title-desc', label: 'Z → A' },
    { divider: true },
    { value: 'scan-desc', label: 'Last Scanned (Newest)' },
    { value: 'scan-asc', label: 'Last Scanned (Oldest)' },
    { divider: true },
    { value: 'count-desc', label: 'Most Downloaded' },
    { value: 'count-asc', label: 'Least Downloaded' },
  ],

  // For library channels tab
  libraryChannels: [
    { value: 'title-asc', label: 'A → Z' },
    { value: 'title-desc', label: 'Z → A' },
    { divider: true },
    { value: 'count-desc', label: 'Most Videos' },
    { value: 'count-asc', label: 'Least Videos' },
    { divider: true },
    { value: 'date-desc', label: 'Newest' },
    { value: 'date-asc', label: 'Oldest' },
  ],

  // For playlist lists (Library playlists tab)
  playlists: [
    { value: 'title-asc', label: 'A → Z' },
    { value: 'title-desc', label: 'Z → A' },
    { divider: true },
    { value: 'count-desc', label: 'Most Videos' },
    { value: 'count-asc', label: 'Least Videos' },
  ],
};

export const DURATION_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: '0-30', label: '0-30 min' },
  { value: '30-60', label: '30-60 min' },
  { value: 'over60', label: 'Over 60 min' },
];
